#!/usr/bin/env bash
# Bir martalik qo'llash (2026-11-18). FAQAT shu server'da, sudo bilan:
#   sudo ./deploy/nginx/apply-catchall-and-loopback.sh
#
# Nima qiladi (boshqa loyihalarga -- lodex-crm.uz, nodiygram.com -- tegmaydi):
#   1) nginx: conf.d/00-default-catchall.conf qo'shadi (noma'lum host/IP -> 444 / TLS rad), nginx -t, reload.
#      Oldin va keyin 6 ta domen tekshiriladi; farq chiqsa avtomatik qaytaradi.
#   2) systemd: gapirai-frontend uchun drop-in -- Next.js faqat 127.0.0.1:3000 da tinglaydi (nginx orqali kiriladi).
#      Sog'lomlik tekshiruvi o'tmasa drop-in o'chirilib, servis avvalgi holatda qayta ishga tushadi.
#
# Qo'lda qaytarish:
#   sudo rm /etc/nginx/conf.d/00-default-catchall.conf && sudo nginx -t && sudo systemctl reload nginx
#   sudo rm -r /etc/systemd/system/gapirai-frontend.service.d && sudo systemctl daemon-reload && sudo systemctl restart gapirai-frontend
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "sudo bilan ishga tushiring"; exit 1; }

HERE=$(cd "$(dirname "$0")" && pwd)
NGX_FILE=/etc/nginx/conf.d/00-default-catchall.conf
DROPIN_DIR=/etc/systemd/system/gapirai-frontend.service.d
BAK=/var/backups/gapirai-catchall-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BAK"; TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

HOSTS=(gapirai.uz www.gapirai.uz api.gapirai.uz admin.gapirai.uz lodex-crm.uz nodiygram.com)
probe() {  # $1 = chiqish fayli; har domen uchun HTTPS holat kodi + gapirai.uz HTTP yo'naltirishi
  : > "$1"
  for h in "${HOSTS[@]}"; do
    c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "$h:443:127.0.0.1" "https://$h/" || true)
    echo "https://$h $c" >> "$1"
  done
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 --resolve "gapirai.uz:80:127.0.0.1" "http://gapirai.uz/" || true)
  echo "http://gapirai.uz $c" >> "$1"
}

echo "== 1) nginx catch-all"
probe "$TMP/before.txt"
[ -e "$NGX_FILE" ] && cp -a "$NGX_FILE" "$BAK/"
install -m 644 "$HERE/conf.d/00-default-catchall.conf" "$NGX_FILE"

undo_nginx() {
  if [ -e "$BAK/00-default-catchall.conf" ]; then cp -a "$BAK/00-default-catchall.conf" "$NGX_FILE"; else rm -f "$NGX_FILE"; fi
  nginx -t && systemctl reload nginx && echo "nginx avvalgi holatga qaytarildi"
}
if ! nginx -t; then undo_nginx; echo "XATO: nginx -t o'tmadi, hech narsa o'zgarmadi"; exit 1; fi
systemctl reload nginx
sleep 2
probe "$TMP/after.txt"
if ! diff -u "$TMP/before.txt" "$TMP/after.txt"; then
  undo_nginx; echo "XATO: domenlar javobi o'zgardi, qaytarildi"; exit 1
fi
echo "domenlar javobi o'zgarmadi:"; sed 's/^/   /' "$TMP/after.txt"
echo "IP/noma'lum host: HTTP -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1/ || true) (000 = ulanish yopildi, to'g'ri)"
echo "                  HTTPS -> $(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 https://127.0.0.1/ || true) (000 = TLS rad etildi, to'g'ri)"

echo "== 2) frontend faqat 127.0.0.1 da"
mkdir -p "$DROPIN_DIR"
cat > "$DROPIN_DIR/loopback.conf" <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/npm start -- -H 127.0.0.1
EOF
systemctl daemon-reload
systemctl restart gapirai-frontend
ok=0
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/ || true)" = 200 ] && { ok=1; break; }
  sleep 1
done
if [ "$ok" -ne 1 ]; then
  echo "XATO: frontend 40 soniyada javob bermadi -- drop-in o'chirilmoqda"
  rm -rf "$DROPIN_DIR"; systemctl daemon-reload; systemctl restart gapirai-frontend
  exit 1
fi
echo "frontend tinglayapti:"; ss -tlnp | grep ':3000' | sed 's/^/   /'
PUB=$(hostname -I | awk '{print $1}')
echo "tashqaridan :3000 -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "http://$PUB:3000/" || true) (000 = yopiq, to'g'ri)"

echo "== yakuniy tekshiruv"
probe "$TMP/final.txt"; sed 's/^/   /' "$TMP/final.txt"
echo "Tayyor. Zaxira: $BAK"
