#!/bin/bash
# Saytdagi yuklab olish arxivini qayta yig'adi: frontend/public/downloads/gapirai-premiere.zip
# Plagin fayllari o'zgarganda ishga tushiring va arxivni ham commit qiling.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../frontend/public/downloads/gapirai-premiere.zip"
TMP="$(mktemp -d)"
mkdir -p "$TMP/gapirai-premiere" "$(dirname "$OUT")"
cp -R "$HERE/CSXS" "$HERE/jsx" "$HERE/js" "$HERE/css" "$HERE/index.html" "$HERE/.debug" \
      "$HERE/install-mac.command" "$HERE/install-windows.bat" "$HERE/README.md" "$TMP/gapirai-premiere/"
rm -f "$OUT"
(cd "$TMP" && zip -qrX "$OUT" gapirai-premiere)
rm -rf "$TMP"
echo "$OUT"
