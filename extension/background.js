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
  captureVisibleTabAndAirDrop(tab?.windowId);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SCREENSHOT_MENU_ID) {
    captureVisibleTabAndAirDrop(tab?.windowId);
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

function captureVisibleTabAndAirDrop(windowId) {
  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      notify(`截图失败：${chrome.runtime.lastError?.message || "未知错误"}`);
      return;
    }

    const timestamp = formatTimestamp(new Date());
    chrome.downloads.download({
      url: dataUrl,
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
