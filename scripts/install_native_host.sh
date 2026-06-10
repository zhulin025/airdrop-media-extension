#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <chrome_or_edge_extension_id>" >&2
  exit 1
fi

EXTENSION_ID="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_NAME="com.vibecoding.airdrop_media"
BUILD_DIR="$ROOT_DIR/build"
HOST_BIN="$BUILD_DIR/$HOST_NAME"
TEMPLATE="$ROOT_DIR/native-host/$HOST_NAME.json.template"

mkdir -p "$BUILD_DIR"
xcrun swiftc "$ROOT_DIR/native-host/AirDropNativeHost.swift" -o "$HOST_BIN"
chmod +x "$HOST_BIN"

install_manifest() {
  local target_dir="$1"
  mkdir -p "$target_dir"
  sed \
    -e "s#__HOST_PATH__#$HOST_BIN#g" \
    -e "s#__EXTENSION_ID__#$EXTENSION_ID#g" \
    "$TEMPLATE" > "$target_dir/$HOST_NAME.json"
}

install_manifest "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
install_manifest "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"

echo "Installed native host for extension id: $EXTENSION_ID"
echo "Host binary: $HOST_BIN"
