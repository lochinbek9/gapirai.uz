#!/bin/bash
# 2026-08-30: so'nggi himoya chizig'i -- broker_transport_options'dagi
# socket_timeout kombu/redis-py'ning "recv() cheksiz bloklanadi" xatosini
# (network uzilishidan keyin) allaqachon hal qiladi, lekin hech qanday
# sozlama 100% kafolat bermaydi. Bu skript worker'ning o'ziga (shu
# konteynerning o'z hostname'iga) ping yuborib, javob bo'lmasa avtomatik
# qayta ishga tushiradi. Cron orqali har 5 daqiqada ishga tushiriladi.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${COMPOSE_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
LOG="${LOG:-$HOME/celery_watchdog.log}"
CONTAINER="dubber_worker"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$LOG"; }

if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    log "konteyner ishlamayapti, o'tkazib yuborilmoqda (deploy jarayonidami?)"
    exit 0
fi

# Yaqinda ishga tushgan bo'lsa (masalan qo'lda deploy/restart qilingandan
# keyin), worker hali broker bilan to'liq mingle/ulanish jarayonida bo'lishi
# mumkin -- shu daqiqada o'ziga ping'ga javob bermasligi haqiqiy qotib
# qolish emas. 90 soniyalik imtiyoz muddati beriladi, aks holda har bir
# restart'dan keyin keraksiz qayta-restart tsikliga tushib qolishi mumkin
# (2026-08-30, deploy'dan keyingi darhol tekshiruvda amalda aniqlangan).
STARTED_AT=$(docker inspect "$CONTAINER" --format '{{.State.StartedAt}}' 2>/dev/null || echo "")
if [ -n "$STARTED_AT" ]; then
    STARTED_EPOCH=$(date -d "$STARTED_AT" +%s 2>/dev/null || echo 0)
    NOW_EPOCH=$(date -u +%s)
    if [ "$STARTED_EPOCH" -gt 0 ] && [ $((NOW_EPOCH - STARTED_EPOCH)) -lt 90 ]; then
        exit 0  # yaqinda ishga tushgan -- hali tekshirilmaydi
    fi
fi

HOSTNAME_IN_CONTAINER=$(docker exec "$CONTAINER" hostname 2>/dev/null || echo "")
if [ -z "$HOSTNAME_IN_CONTAINER" ]; then
    log "konteyner hostname'ini o'qib bo'lmadi, o'tkazib yuborilmoqda"
    exit 0
fi

if docker exec "$CONTAINER" celery -A backend.workers.celery_app inspect ping --timeout=10 -d "celery@${HOSTNAME_IN_CONTAINER}" 2>&1 | grep -q "OK"; then
    exit 0  # sog'lom -- muvaffaqiyatli holatda log'ga yozilmaydi
fi

log "worker o'ziga ping'ga javob bermayapti -- qayta ishga tushirilmoqda"
cd "$COMPOSE_DIR"
docker compose restart worker >> "$LOG" 2>&1
log "restart yuborildi"

# Adminlarga Telegram orqali ogohlantirish yuborish
sleep 3
docker exec "$CONTAINER" python -c "
try:
    from backend.services.telegram_notify import send_worker_restart_alert
    send_worker_restart_alert('$CONTAINER', 'Ping tekshiruviga javob bermadi (worker muzlab qolgan)')
except Exception as e:
    pass
" 2>/dev/null || true

