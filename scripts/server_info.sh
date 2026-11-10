#!/bin/sh
# Server haqida umumiy ma'lumot (faqat o'qiydi; parol/kalit chiqarilmaydi).
# Ishga tushirish: ssh gapirai@173.212.220.188 'sh -s' < scripts/server_info.sh
echo "== OS"; . /etc/os-release; echo "$PRETTY_NAME, yadro $(uname -r)"
echo "== CPU / RAM / Disk"; echo "CPU: $(nproc) yadro"; free -h | sed -n 1,2p; df -h / | tail -1
echo "== Dasturlar"
for t in docker nginx node npm python3 git pm2 certbot; do
  printf "  %-8s " "$t"; if command -v "$t" >/dev/null 2>&1; then "$t" --version 2>&1 | head -1; else echo "o'rnatilmagan"; fi
done
printf "  compose  "; docker compose version 2>&1 | head -1
echo "== Band portlar (yangi loyiha bularni ishlatmasin)"; ss -tlnH | awk '{print "  " $4}' | sort -u
echo "== Docker konteynerlar"; docker ps --format '  {{.Names}}  {{.Ports}}'
echo "== Nginx saytlari"; ls /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/  /'
echo "== Firewall"; sudo -n ufw status 2>&1 | head -15
