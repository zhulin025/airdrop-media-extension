#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_DIR="$ROOT_DIR/extension"
INSTALL_HOST="$ROOT_DIR/scripts/install_native_host.sh"

detect_extension_ids() {
  python3 - "$EXTENSION_DIR" <<'PY'
import glob
import json
import os
import sys
from pathlib import Path

extension_dir = Path(sys.argv[1]).resolve()
browsers = [
    ("Chrome", "~/Library/Application Support/Google/Chrome/*/Preferences"),
    ("Edge", "~/Library/Application Support/Microsoft Edge/*/Preferences"),
]

matches = []
for browser_name, pattern in browsers:
    for pref_path in glob.glob(os.path.expanduser(pattern)):
        try:
            data = json.loads(Path(pref_path).read_text())
        except Exception:
            continue

        settings = data.get("extensions", {}).get("settings", {})
        for extension_id, details in settings.items():
            path = details.get("path")
            if not path:
                continue
            try:
                if Path(path).resolve() == extension_dir:
                    matches.append((browser_name, extension_id))
            except Exception:
                pass

seen = set()
for browser_name, extension_id in matches:
    if extension_id in seen:
        continue
    seen.add(extension_id)
    print(extension_id)
PY
}

open_extension_pages() {
  if [[ -d "/Applications/Google Chrome.app" ]]; then
    open -a "Google Chrome" "chrome://extensions" || true
  fi

  if [[ -d "/Applications/Microsoft Edge.app" ]]; then
    open -a "Microsoft Edge" "edge://extensions" || true
  fi
}

echo
echo "AirDrop Media installer"
echo "======================="
echo
echo "This installer can install the macOS native host automatically."
echo "Chrome/Edge still require one manual confirmation: Load unpacked extension."
echo

EXTENSION_IDS=()
while IFS= read -r extension_id; do
  [[ -n "$extension_id" ]] && EXTENSION_IDS+=("$extension_id")
done < <(detect_extension_ids)

if [[ ${#EXTENSION_IDS[@]} -eq 0 ]]; then
  printf "%s" "$EXTENSION_DIR" | pbcopy
  echo "Extension folder copied to clipboard:"
  echo "$EXTENSION_DIR"
  echo
  echo "Browser steps:"
  echo "1. Enable Developer mode."
  echo "2. Click Load unpacked."
  echo "3. Paste/select the extension folder above."
  echo

  open_extension_pages
  read -r -p "After loading the extension, press Return to continue... " _
  EXTENSION_IDS=()
  while IFS= read -r extension_id; do
    [[ -n "$extension_id" ]] && EXTENSION_IDS+=("$extension_id")
  done < <(detect_extension_ids)
fi

if [[ ${#EXTENSION_IDS[@]} -eq 0 ]]; then
  echo
  read -r -p "Could not auto-detect the extension ID. Paste it here: " manual_id
  EXTENSION_IDS=("$manual_id")
fi

"$INSTALL_HOST" "${EXTENSION_IDS[@]}"

echo
echo "Done."
echo "Reload the extension in Chrome/Edge if it was already open."
echo
read -r -p "Press Return to close this window... " _
