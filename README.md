# AirDrop Media

AirDrop Media is a local Chrome/Edge extension for macOS. It lets you right-click an image, video, audio item, or direct media link on a web page, download it with the browser's normal download flow, and immediately open the macOS AirDrop panel for the downloaded file.

![AirDrop Media logo](assets/logo.svg)

## Features

- Adds a browser context menu item: `下载并用 AirDrop 发送`
- Downloads media to your browser's default downloads folder
- Opens the macOS AirDrop sharing panel after the download completes
- Reuses an existing completed download when the same URL has already been downloaded
- Avoids duplicate downloads while the same URL is still downloading
- Supports Chrome and Microsoft Edge on macOS

## How it works

Browser extensions cannot directly call macOS AirDrop from the page sandbox. This project uses two parts:

1. `extension/`: a Manifest V3 browser extension that adds the right-click menu, starts downloads, tracks completion, and sends the local file path to a native host.
2. `native-host/`: a small Swift native messaging host that receives the file path and opens the macOS AirDrop sharing service.

## Requirements

- macOS with AirDrop available
- Google Chrome or Microsoft Edge
- Xcode Command Line Tools, for compiling the Swift native host:

```bash
xcode-select --install
```

## Install

1. Open your browser's extension page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable developer mode.
3. Click `Load unpacked` and select the `extension/` folder in this project.
4. Copy the loaded extension ID.
5. Install the native messaging host:

```bash
./scripts/install_native_host.sh <extension_id>
```

6. Reload the extension from the browser extension page.

## Usage

1. Open a web page with an image, video, audio item, or direct media link.
2. Right-click the media.
3. Choose `下载并用 AirDrop 发送`.
4. Wait for the browser download to finish.
5. Select the receiving device in the macOS AirDrop panel.

If the same URL has already been downloaded and the file still exists locally, the extension skips the download and opens AirDrop directly.

## Limitations

- AirDrop still requires you to choose the receiving device in the macOS panel.
- `blob:` URLs cannot be downloaded directly by this extension.
- DRM-protected videos and segmented streaming formats such as HLS/DASH usually cannot be captured as one complete file.
- Some sites may block direct downloads through cookies, referrers, signed URLs, or other anti-hotlinking checks.
- The native host is installed locally and is not suitable for Chrome Web Store distribution without additional packaging and review work.

## Troubleshooting

### AirDrop does not open

Reinstall the native host with the exact extension ID shown on your browser extension page:

```bash
./scripts/install_native_host.sh <extension_id>
```

Then reload the browser extension.

### The AirDrop panel closes too quickly

Make sure you are using the latest compiled native host:

```bash
./scripts/install_native_host.sh <extension_id>
```

The native host keeps the process alive until AirDrop succeeds, fails, or times out after 180 seconds.

### The file downloads again

The extension checks the browser download history for the exact same source URL. It can reuse only completed downloads whose local files still exist.

### `blob:` media does not work

`blob:` URLs are page-local object URLs. The extension cannot resolve them into a complete original media file without site-specific extraction logic.

## Development

Validate the extension files:

```bash
node -c extension/background.js
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json', 'utf8')); console.log('manifest ok')"
```

Build the native host manually:

```bash
xcrun swiftc native-host/AirDropNativeHost.swift -o build/com.vibecoding.airdrop_media
```

Install or reinstall the native host:

```bash
./scripts/install_native_host.sh <extension_id>
```

## Project layout

```text
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

## License

MIT
