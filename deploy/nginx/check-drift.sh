#!/usr/bin/env bash
# Repodagi nginx sozlamalari serverdagi joriy holatga mosligini tekshiradi.
# FAQAT o'qiydi, hech narsani o'zgartirmaydi. host-1'da:  ./deploy/nginx/check-drift.sh
# Chiqish kodi: 0 = hammasi mos, 1 = farq bor.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${NGINX_ROOT:-/etc/nginx}
rc=0
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

check() {  # $1 = repodagi fayl, $2 = serverdagi fayl
  if diff -u --label "server:$2" --label "repo:$1" "$2" "$1" >"$tmp" 2>&1; then
    echo "OK    $2"
  else
    echo "FARQ  $2  (- serverda, + repoda)"
    sed 's/^/      /' "$tmp"
    rc=1
  fi
}

check "$HERE/nginx.conf"                        "$ROOT/nginx.conf"
check "$HERE/sites-available/gapirai.uz"        "$ROOT/sites-available/gapirai.uz"
check "$HERE/sites-available/admin.gapirai.uz"  "$ROOT/sites-available/admin.gapirai.uz"
check "$HERE/conf.d/gapirai-cache.conf"         "$ROOT/conf.d/gapirai-cache.conf"

if [ "$rc" -eq 0 ]; then echo "Hammasi mos."; else echo "Farq bor: reponi yoki serverni yangilang (README.md)."; fi
exit "$rc"
