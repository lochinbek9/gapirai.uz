#!/bin/bash
# 2026-08-30: so'nggi himoya chizig'i -- broker_transport_options'dagi
# socket_timeout kombu/redis-py'ning "recv() cheksiz bloklanadi" xatosini
# (network uzilishidan keyin) allaqachon hal qiladi, lekin hech qanday
# sozlama 100% kafolat bermaydi. Bu skript worker'ning o'ziga (shu
# konteynerning o'z hostname'iga) ping yuborib, javob bo'lmasa avtomatik
# qayta ishga tushiradi. Cron orqali har 5 daqiqada ishga tushiriladi.
set -euo pipefail

LOG="/home/ubuntu/celery_watchdog.log"
CONTAINER="dubber_worker"
COMPOSE_DIR="/home/ubuntu/ai-dubber"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$LOG"; }

if ! docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
    log "konteyner ishlamayapti, o'tkazib yuborilmoqda (deploy jarayonidami?)"
    exit 0
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
