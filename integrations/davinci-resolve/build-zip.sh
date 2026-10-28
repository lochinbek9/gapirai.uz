#!/bin/bash
# Saytdagi yuklab olish arxivi: frontend/public/downloads/gapirai-resolve.zip
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../frontend/public/downloads/gapirai-resolve.zip"
TMP="$(mktemp -d)"
mkdir -p "$TMP/gapirai-resolve" "$(dirname "$OUT")"
cp "$HERE/GapirAI.lua" "$HERE/install-mac.command" "$HERE/install-windows.bat" "$HERE/README.md" "$TMP/gapirai-resolve/"
rm -f "$OUT"
(cd "$TMP" && zip -qrX "$OUT" gapirai-resolve)
rm -rf "$TMP"
echo "$OUT"
