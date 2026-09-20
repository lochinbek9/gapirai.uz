#!/usr/bin/env bash
# Repodagi nginx sozlamalarini serverga qo'llaydi:
#   zaxira -> nusxalash -> nginx -t -> reload;  nginx -t o'tmasa zaxiradan AVTOMATIK tiklaydi.
# FAQAT host-1'da, sudo bilan:  sudo ./deploy/nginx/apply.sh
# Avval ./check-drift.sh bilan repo va server farqini ko'rib oling: farq bo'lmasa bu skript amalda hech narsani o'zgartirmaydi.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "sudo bilan ishga tushiring"; exit 1; }

HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${NGINX_ROOT:-/etc/nginx}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups}
CACHE_DIR=${CACHE_DIR:-/var/cache/nginx/gapirai_jobs}
BAK=$BACKUP_ROOT/nginx-$(date +%Y%m%d-%H%M%S)

mkdir -p "$BAK/sites-available" "$BAK/conf.d"
cp -a "$ROOT/nginx.conf" "$BAK/"
cp -a "$ROOT/sites-available/gapirai.uz" "$ROOT/sites-available/admin.gapirai.uz" "$BAK/sites-available/"
cp -a "$ROOT/conf.d/." "$BAK/conf.d/"
echo "zaxira: $BAK"

restore() {
  echo "XATO -- zaxiradan tiklanmoqda"
  cp -a "$BAK/nginx.conf" "$ROOT/nginx.conf"
  cp -a "$BAK/sites-available/." "$ROOT/sites-available/"
  cp -a "$BAK/conf.d/." "$ROOT/conf.d/"
  # bu skript qo'shgan (zaxirada yo'q edi) fayl bo'lsa, uni ham olib tashlaymiz
  [ -e "$BAK/conf.d/gapirai-cache.conf" ] || rm -f "$ROOT/conf.d/gapirai-cache.conf"
  nginx -t && echo "eski holat tiklandi"
}

install -m 644 "$HERE/nginx.conf" "$ROOT/nginx.conf"
install -m 644 "$HERE/sites-available/gapirai.uz" "$HERE/sites-available/admin.gapirai.uz" "$ROOT/sites-available/"
install -m 644 "$HERE/conf.d/gapirai-cache.conf" "$ROOT/conf.d/gapirai-cache.conf"
ln -sfn "$ROOT/sites-available/gapirai.uz" "$ROOT/sites-enabled/gapirai.uz"
ln -sfn "$ROOT/sites-available/admin.gapirai.uz" "$ROOT/sites-enabled/admin.gapirai.uz"
mkdir -p "$CACHE_DIR" && chown www-data "$CACHE_DIR"

if nginx -t; then
  systemctl reload nginx && echo "OK: nginx qayta yuklandi (ulanishlar uzilmadi)"
else
  restore
  exit 1
fi
