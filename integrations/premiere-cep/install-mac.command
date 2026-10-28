#!/bin/bash
# GapirAI plaginini Premiere Pro'ga o'rnatish (macOS).
# Imzolanmagan CEP panel uchun PlayerDebugMode yoqiladi va panel
# ~/Library/Application Support/Adobe/CEP/extensions ga nusxalanadi.
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/uz.gapirai.premiere"

for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1
done

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/CSXS" "$SRC/jsx" "$SRC/js" "$SRC/css" "$SRC/index.html" "$SRC/.debug" "$DEST/"

echo "GapirAI o'rnatildi: $DEST"
echo "Premiere Pro'ni qayta ishga tushiring va Window > Extensions > GapirAI ni oching."
