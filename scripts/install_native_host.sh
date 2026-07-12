#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <chrome_or_edge_extension_id> [more_extension_ids...]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_NAME="com.vibecoding.airdrop_media"
BUILD_DIR="$ROOT_DIR/build"
HOST_BIN="$BUILD_DIR/$HOST_NAME"
TEMPLATE="$ROOT_DIR/native-host/$HOST_NAME.json.template"

for extension_id in "$@"; do
  if [[ ! "$extension_id" =~ ^[a-p]{32}$ ]]; then
    echo "Invalid Chrome/Edge extension id: $extension_id" >&2
    exit 1
  fi
done

mkdir -p "$BUILD_DIR"
xcrun swiftc "$ROOT_DIR/native-host/AirDropNativeHost.swift" -o "$HOST_BIN"
chmod +x "$HOST_BIN"

install_manifest() {
  local target_dir="$1"
  shift
  mkdir -p "$target_dir"
  python3 - "$TEMPLATE" "$HOST_BIN" "$target_dir/$HOST_NAME.json" "$@" <<'PY'
import json
import sys
from pathlib import Path

template_path, host_path, output_path, *extension_ids = sys.argv[1:]
allowed_origins = [f"chrome-extension://{extension_id}/" for extension_id in extension_ids]

content = Path(template_path).read_text()
content = content.replace("__HOST_PATH__", host_path.replace("\\", "\\\\").replace('"', '\\"'))
content = content.replace("__ALLOWED_ORIGINS__", json.dumps(allowed_origins, indent=4))

json.loads(content)
Path(output_path).write_text(content)
PY
}

install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" "$@"
install_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts" "$@"

echo "Installed native host for extension id(s): $*"
echo "Host binary: $HOST_BIN"
