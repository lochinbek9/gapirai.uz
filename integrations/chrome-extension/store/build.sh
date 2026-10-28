#!/bin/bash
# Chrome Web Store uchun arxiv: localhost ruxsatlari va dasturchi sozlamalarisiz.
#   integrations/chrome-extension/store/build.sh  ->  store/dist/gapirai-youtube-<versiya>.zip
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/store/dist"
TMP="$(mktemp -d)"
mkdir -p "$OUT"
cp -R "$HERE/manifest.json" "$HERE/icons" "$HERE/src" "$TMP/"

python3 - "$TMP" <<'PY'
import json, re, sys, pathlib
root = pathlib.Path(sys.argv[1])
m = json.loads((root / "manifest.json").read_text())
m["host_permissions"] = [h for h in m["host_permissions"] if "localhost" not in h]
(root / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n")
popup = root / "src" / "popup.html"
html = re.sub(r"\s*<!-- dev:start.*?<!-- dev:end -->", "", popup.read_text(), flags=re.S)
popup.write_text(html)
print("version", m["version"], "| hosts:", ", ".join(m["host_permissions"]))
PY

VER=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$TMP/manifest.json")
ZIP="$OUT/gapirai-youtube-$VER.zip"
rm -f "$ZIP"
(cd "$TMP" && zip -qrX "$ZIP" manifest.json icons src)
rm -rf "$TMP"
echo "$ZIP"
