# AirDrop Media

AirDrop Media 是一个 macOS 上的 Chrome/Edge 浏览器扩展。它可以让你在网页上右键图片、视频、音频或直接媒体链接，先用浏览器正常下载文件，然后自动打开 macOS AirDrop 隔空投送面板。它也支持截取当前标签页可见区域，并直接通过 AirDrop 发送。

![AirDrop Media logo](assets/logo.svg)

## 功能

- 在浏览器右键菜单中增加：`下载并用 AirDrop 发送`
- 使用浏览器默认下载流程，把媒体保存到默认下载目录
- 下载完成后自动打开 macOS AirDrop 面板
- 点击扩展图标或右键页面，可以截图当前标签页可见区域并 AirDrop
- 如果同一个 URL 已经下载过，并且本地文件还存在，会直接打开 AirDrop，不重复下载
- 如果同一个 URL 正在下载，会等待下载完成后再打开 AirDrop
- 支持 macOS 上的 Google Chrome 和 Microsoft Edge

## 工作原理

浏览器扩展不能直接从网页沙盒里调用 macOS AirDrop，所以这个项目分成两部分：

1. `extension/`：Manifest V3 浏览器扩展，负责右键菜单、截图、下载文件、监听下载完成，并把本地文件路径发给 native host。
2. `native-host/`：一个 Swift 写的本机程序，通过 Chrome/Edge Native Messaging 接收文件路径，然后调用 macOS 的 AirDrop 分享服务。

## 系统要求

- macOS，并且 AirDrop 可用
- Google Chrome 或 Microsoft Edge
- Xcode Command Line Tools，用来编译 Swift native host：

```bash
xcode-select --install
```

## 快速安装

把下面这行复制到 Terminal 里运行：

```bash
git clone https://github.com/zhulin025/airdrop-media-extension.git "$HOME/Applications/AirDropMedia" && cd "$HOME/Applications/AirDropMedia" && ./install.command
```

如果你已经下载了这个项目：

1. 打开 Terminal，进入项目目录。
2. 运行：

```bash
./install.command
```

3. 安装器会把扩展目录复制到剪贴板，并打开浏览器扩展管理页面。
4. 在 Chrome 或 Edge 里开启开发者模式，点击 `Load unpacked` / `加载已解压的扩展程序`，选择项目里的 `extension/` 文件夹。
5. 回到安装器窗口，按回车。安装器会自动识别扩展 ID，并安装 native host。
6. 如果扩展页面已经打开，重新加载一次这个扩展。

浏览器出于安全限制，不允许普通本地脚本静默安装未打包扩展。所以 Chrome/Edge 里的 `Load unpacked` 这一步仍然需要你手动确认一次。

如果你是下载 zip 文件得到这个项目，macOS 可能会阻止双击 `install.command`，提示无法验证安全性。这是因为脚本没有 Apple Developer ID 签名。建议直接用 Terminal 运行 `./install.command`，这样不会触发双击脚本的 Gatekeeper 提示。

如果你一定要双击运行，可以先在项目目录执行：

```bash
xattr -dr com.apple.quarantine .
chmod +x install.command scripts/install_native_host.sh
```

执行后再双击 `install.command`。只对你信任来源的代码这样做。

## 手动安装

1. 打开浏览器扩展管理页面：
   - Chrome：`chrome://extensions`
   - Edge：`edge://extensions`
2. 开启开发者模式。
3. 点击 `Load unpacked` / `加载已解压的扩展程序`，选择项目里的 `extension/` 文件夹。
4. 复制加载后的扩展 ID。
5. 安装 native host：

```bash
./scripts/install_native_host.sh <extension_id>
```

6. 回到浏览器扩展页面，重新加载这个扩展。

## 使用方式

### 发送网页媒体

1. 打开包含图片、视频、音频或直接媒体链接的网页。
2. 右键目标媒体。
3. 点击 `下载并用 AirDrop 发送`。
4. 等待浏览器下载完成。
5. 在 macOS AirDrop 面板里选择接收设备。

如果同一个 URL 已经下载过，并且本地文件还存在，扩展会跳过下载，直接打开 AirDrop。

### 截图并发送

有两种方式：

1. 点击浏览器工具栏里的 AirDrop Media 扩展图标。
2. 或者在网页上右键，点击 `截图并用 AirDrop 发送`。

扩展会截取当前标签页的可见区域，保存到默认下载目录里的 `AirDrop-Media/` 文件夹，然后自动打开 AirDrop 面板。

## 限制

- AirDrop 面板打开后，仍然需要你手动选择接收设备。
- 截图功能截取的是当前标签页可见区域，不是整页长截图，也不会监听 macOS 系统截图快捷键。
- `blob:` URL 不能被这个扩展直接下载。
- DRM 视频、HLS/DASH 这类分片流媒体，通常无法被扩展直接保存成一个完整文件。
- 一些网站可能会通过 cookie、referrer、签名 URL 或防盗链策略阻止直接下载。
- native host 是本地安装的程序。如果要上 Chrome Web Store，还需要额外的打包、签名和审核流程。

## 常见问题

### macOS 提示 `install.command` 无法打开

这是因为项目从互联网下载后带有 quarantine 隔离标记。推荐用 Terminal 安装：

```bash
./install.command
```

也可以在项目目录移除隔离标记：

```bash
xattr -dr com.apple.quarantine .
```

### AirDrop 没有打开

用浏览器扩展页面上显示的真实扩展 ID 重新安装 native host：

```bash
./scripts/install_native_host.sh <extension_id>
```

然后重新加载浏览器扩展。

### AirDrop 面板很快消失

确认 native host 是最新版本：

```bash
./scripts/install_native_host.sh <extension_id>
```

native host 会保持进程存活，直到 AirDrop 成功、失败，或 180 秒超时。

### 文件又被重复下载了

扩展会按“完全相同的源 URL”检查浏览器下载历史。只有下载状态完成，并且本地文件仍然存在时，才会复用旧文件。

### `blob:` 媒体不能用

`blob:` URL 是网页内部生成的临时对象地址。扩展无法直接从它还原出完整原始媒体文件，除非为特定网站写额外提取逻辑。

## 开发

校验扩展文件：

```bash
node -c extension/background.js
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json', 'utf8')); console.log('manifest ok')"
```

手动编译 native host：

```bash
xcrun swiftc native-host/AirDropNativeHost.swift -o build/com.vibecoding.airdrop_media
```

安装或重新安装 native host：

```bash
./scripts/install_native_host.sh <extension_id>
```

## 项目结构

```text
install.command
assets/
  logo.svg
extension/
  background.js
  icon-16.png
  icon-32.png
  icon-48.png
  icon-128.png
  manifest.json
native-host/
  AirDropNativeHost.swift
  com.vibecoding.airdrop_media.json.template
scripts/
  install_native_host.sh
```

## 许可证

MIT
