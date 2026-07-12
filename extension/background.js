const DOWNLOAD_MENU_ID = "airdrop-media-download";
const SCREENSHOT_MENU_ID = "airdrop-visible-tab-screenshot";
const HOST_NAME = "com.vibecoding.airdrop_media";

const pendingDownloads = new Map();
const pendingUrls = new Set();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: DOWNLOAD_MENU_ID,
      title: "下载并用 AirDrop 发送",
      contexts: ["image", "video", "audio", "link"]
    });

    chrome.contextMenus.create({
      id: SCREENSHOT_MENU_ID,
      title: "截图并用 AirDrop 发送",
      contexts: ["page", "image", "video", "audio", "link", "selection"]
    });
  });
});

chrome.action.onClicked.addListener((tab) => {
  selectAreaCaptureAndAirDrop(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SCREENSHOT_MENU_ID) {
    selectAreaCaptureAndAirDrop(tab);
    return;
  }

  if (info.menuItemId !== DOWNLOAD_MENU_ID) return;

  const url = info.srcUrl || info.linkUrl;
  if (!url) {
    notify("没有找到可下载的媒体地址。");
    return;
  }

  if (url.startsWith("blob:")) {
    notify("这个媒体是 blob 地址，浏览器扩展不能直接下载完整文件。");
    return;
  }

  if (pendingUrls.has(url)) {
    notify("这个文件正在下载，完成后会自动打开 AirDrop。");
    return;
  }

  openExistingDownloadOrStart(url);
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!pendingDownloads.has(delta.id) || !delta.state) return;

  const pending = pendingDownloads.get(delta.id);
  if (delta.state.current === "complete") {
    openDownloadedFileWithAirDrop(delta.id);
  } else if (delta.state.current === "interrupted") {
    pendingDownloads.delete(delta.id);
    if (pending?.url) pendingUrls.delete(pending.url);
    notify("下载中断，无法打开 AirDrop。");
  }
});

function openExistingDownloadOrStart(url) {
  chrome.downloads.search({
    url,
    state: "complete",
    orderBy: ["-startTime"],
    limit: 20
  }, (items) => {
    const existing = (items || []).find((item) => item.filename && item.exists !== false);

    if (existing) {
      openFileWithAirDrop(existing.filename);
      return;
    }

    startDownload(url);
  });
}

function startDownload(url) {
  pendingUrls.add(url);
  chrome.downloads.download({ url, saveAs: false }, (downloadId) => {
    if (chrome.runtime.lastError || !downloadId) {
      pendingUrls.delete(url);
      notify(`下载启动失败：${chrome.runtime.lastError?.message || "未知错误"}`);
      return;
    }

    pendingDownloads.set(downloadId, { url, startedAt: Date.now() });
  });
}

async function selectAreaCaptureAndAirDrop(tab) {
  if (!tab?.id || !tab?.windowId) {
    notify("没有找到可截图的标签页。");
    return;
  }

  const selection = await requestScreenshotSelection(tab.id);
  if (!selection || selection.cancelled) return;

  chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, async (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      notify(`截图失败：${chrome.runtime.lastError?.message || "未知错误"}`);
      return;
    }

    let croppedDataUrl;
    try {
      croppedDataUrl = await cropScreenshot(dataUrl, selection);
    } catch (error) {
      notify(`截图裁剪失败：${error.message || "未知错误"}`);
      return;
    }

    const timestamp = formatTimestamp(new Date());
    chrome.downloads.download({
      url: croppedDataUrl,
      filename: `AirDrop-Media/Screenshot-${timestamp}.png`,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError || !downloadId) {
        notify(`截图保存失败：${chrome.runtime.lastError?.message || "未知错误"}`);
        return;
      }

      pendingDownloads.set(downloadId, { type: "screenshot", startedAt: Date.now() });
      openIfDownloadAlreadyComplete(downloadId);
    });
  });
}

async function requestScreenshotSelection(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: runAreaSelectionOverlay
    });

    return results?.[0]?.result;
  } catch (error) {
    notify(`无法在当前页面启动框选截图：${error.message || "未知错误"}`);
    return null;
  }
}

async function cropScreenshot(dataUrl, selection) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const scaleX = bitmap.width / selection.viewportWidth;
  const scaleY = bitmap.height / selection.viewportHeight;
  const sourceX = Math.max(0, Math.round(selection.x * scaleX));
  const sourceY = Math.max(0, Math.round(selection.y * scaleY));
  const sourceWidth = Math.min(bitmap.width - sourceX, Math.max(1, Math.round(selection.width * scaleX)));
  const sourceHeight = Math.min(bitmap.height - sourceY, Math.max(1, Math.round(selection.height * scaleY)));

  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

  if (typeof bitmap.close === "function") {
    bitmap.close();
  }

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return await blobToDataUrl(croppedBlob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

function openIfDownloadAlreadyComplete(downloadId) {
  chrome.downloads.search({ id: downloadId }, (items) => {
    const item = items && items[0];
    if (item?.state === "complete" && pendingDownloads.has(downloadId)) {
      openDownloadedFileWithAirDrop(downloadId);
    }
  });
}

function openDownloadedFileWithAirDrop(downloadId) {
  chrome.downloads.search({ id: downloadId }, (items) => {
    const pending = pendingDownloads.get(downloadId);
    pendingDownloads.delete(downloadId);
    if (pending?.url) pendingUrls.delete(pending.url);

    const item = items && items[0];
    if (!item?.filename) {
      notify("下载完成，但没有拿到本地文件路径。");
      return;
    }

    openFileWithAirDrop(item.filename);
  });
}

function openFileWithAirDrop(path) {
  chrome.runtime.sendNativeMessage(HOST_NAME, { path }, (response) => {
    if (chrome.runtime.lastError) {
      notify(`AirDrop helper 未响应：${chrome.runtime.lastError.message}`);
      return;
    }

    if (!response?.ok) {
      notify(`AirDrop 打开失败：${response?.error || "未知错误"}`);
    }
  });
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon-128.png",
    title: "AirDrop Media",
    message
  });
}

function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function runAreaSelectionOverlay() {
  return new Promise((resolve) => {
    const existing = document.getElementById("airdrop-media-selection-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "airdrop-media-selection-overlay";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "cursor:crosshair",
      "background:rgba(15,23,42,0.18)",
      "user-select:none",
      "-webkit-user-select:none"
    ].join(";");

    const shade = document.createElement("div");
    shade.style.cssText = [
      "position:absolute",
      "inset:0",
      "background:rgba(15,23,42,0.28)"
    ].join(";");

    const box = document.createElement("div");
    box.style.cssText = [
      "position:absolute",
      "display:none",
      "box-sizing:border-box",
      "border:2px solid #ffffff",
      "outline:9999px solid rgba(15,23,42,0.42)",
      "box-shadow:0 0 0 1px rgba(15,23,42,0.65),0 10px 30px rgba(15,23,42,0.35)",
      "background:rgba(255,255,255,0.08)"
    ].join(";");

    const hint = document.createElement("div");
    hint.textContent = "拖拽框选截图区域，按 Esc 取消";
    hint.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:24px",
      "transform:translateX(-50%)",
      "padding:8px 12px",
      "border-radius:999px",
      "background:rgba(15,23,42,0.88)",
      "color:#fff",
      "font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
      "letter-spacing:0",
      "box-shadow:0 8px 24px rgba(15,23,42,0.22)",
      "pointer-events:none",
      "white-space:nowrap"
    ].join(";");

    overlay.append(shade, box, hint);
    document.documentElement.appendChild(overlay);

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    let startX = 0;
    let startY = 0;
    let currentRect = null;
    let dragging = false;
    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
      overlay.remove();
    };

    const finish = (result) => {
      cleanup();
      resolve(result);
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const updateBox = (clientX, clientY) => {
      const endX = clamp(clientX, 0, window.innerWidth);
      const endY = clamp(clientY, 0, window.innerHeight);
      const x = Math.min(startX, endX);
      const y = Math.min(startY, endY);
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);

      currentRect = { x, y, width, height };
      box.style.display = "block";
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish({ cancelled: true });
      }
    };

    overlay.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      startX = clamp(event.clientX, 0, window.innerWidth);
      startY = clamp(event.clientY, 0, window.innerHeight);
      updateBox(startX, startY);
    }, true);

    overlay.addEventListener("mousemove", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      updateBox(event.clientX, event.clientY);
    }, true);

    overlay.addEventListener("mouseup", (event) => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = false;
      updateBox(event.clientX, event.clientY);

      if (!currentRect || currentRect.width < 4 || currentRect.height < 4) {
        finish({ cancelled: true });
        return;
      }

      finish({
        ...currentRect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight
      });
    }, true);

    window.addEventListener("keydown", onKeyDown, true);
  });
}
