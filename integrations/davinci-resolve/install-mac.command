#!/bin/bash
# GapirAI skriptini DaVinci Resolve'ga o'rnatish (macOS): Workspace > Scripts > GapirAI
set -e
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility"
mkdir -p "$DEST"
cp "$SRC/GapirAI.lua" "$DEST/GapirAI.lua"
echo "GapirAI o'rnatildi: $DEST/GapirAI.lua"
echo "DaVinci Resolve'ni qayta ishga tushiring va Workspace > Scripts > GapirAI ni oching."
