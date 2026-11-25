#!/usr/bin/env bash
# Production deploy (CI: .github/workflows/ci-cd.yml; serverda qo'lda ham ishlaydi).
#   - frontend alohida papkada build qilinadi, sayt build paytida o'chmaydi, yiqilsa eskisi qaytadi
#   - backend faqat dublyaj ketmayotganda yangilanadi
#   - umumiy serverdagi boshqa loyihalarga va nginx'ga tegilmaydi
# DRY_RUN=1 -- faqat yuklab olish va frontend build; ishlab turgan hech narsa o'zgarmaydi.
set -euo pipefail

APP=${APP:-/home/gapirai/gapirai.uz}
BUILD=${BUILD:-$HOME/gapirai-build}
REPO_URL=${REPO_URL:-https://github.com/lochinbek9/gapirai.uz.git}
IDLE_WAIT_S=${IDLE_WAIT_S:-2400}
DRY_RUN=${DRY_RUN:-0}
SERVICES="backend worker flower telegram_bot"

log() { echo "[deploy $(date +%T)] $*"; }
healthy() { curl -fsS -o /dev/null --retry 30 --retry-delay 2 --retry-all-errors "$1"; }

mkdir -p "$BUILD"
exec 9>"$BUILD/deploy.lock"
flock -n 9 || { log "Boshqa deploy ketyapti."; exit 1; }

cd "$APP"
export GIT_TERMINAL_PROMPT=0
git fetch -q "$REPO_URL" main
new=$(git rev-parse FETCH_HEAD)
# oxirgi TO'LIQ muvaffaqiyatli deploy -- yarmida yiqilgan bo'lsa o'zgarishlar yo'qolmaydi
prev=$(cat "$BUILD/deployed-sha" 2>/dev/null || git rev-parse HEAD)
changed=$(git diff --name-only "$prev" "$new")
log "$(git log -1 --format='%h %s' "$new") | o'zgargan fayllar: $(grep -c . <<<"$changed" || true)"
has() { grep -qE "$1" <<<"$changed"; }

front=0; packages=0
if has '^frontend/' || [ ! -f frontend/.next/BUILD_ID ]; then
  front=1
  has '^frontend/package(-lock)?\.json$' && packages=1
  log "Frontend alohida papkada build qilinmoqda..."
  rm -rf "$BUILD/frontend"
  git archive "$new" frontend | tar -x -C "$BUILD"
  for f in frontend/.env*; do [ -f "$f" ] && cp -p "$f" "$BUILD/frontend/"; done
  if [ "$packages" = 1 ] || [ ! -d frontend/node_modules ]; then
    packages=1
    (cd "$BUILD/frontend" && npm ci --no-audit --no-fund)
  else
    cp -a frontend/node_modules "$BUILD/frontend/"
  fi
  (cd "$BUILD/frontend" &&
    NEXT_PUBLIC_API_URL=https://api.gapirai.uz NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=4096 \
      nice -n 10 npm run build)
fi

backend=0; image=0
has '^(backend/|docker-compose)' && backend=1
has '^(backend/(Dockerfile|requirements[^/]*\.txt)$|docker-compose)' && { backend=1; image=1; }

if [ "$DRY_RUN" = 1 ]; then
  log "DRY_RUN: frontend=$front backend=$backend image=$image. Hech narsa almashtirilmadi."
  exit 0
fi

busy() {
  local out try
  for try in 1 2 3; do
    out=$(docker exec -w /app -e PYTHONPATH=/app dubber_worker celery -A backend.workers.celery_app inspect active 2>&1) || true
    if grep -q "node online" <<<"$out"; then grep -q "'id':" <<<"$out"; return; fi
    sleep 10
  done
  log "Worker javob bermayapti -- band emas deb hisoblanadi."
  return 1
}

if [ "$backend" = 1 ]; then
  deadline=$((SECONDS + IDLE_WAIT_S))
  while busy; do
    [ "$SECONDS" -lt "$deadline" ] || { log "Dublyaj hali ketyapti -- hech narsa o'zgarmadi. Keyinroq qayta ishga tushiring."; exit 1; }
    log "Dublyaj ketyapti, kutilmoqda..."
    sleep 30
  done
fi

git checkout -q main
git merge -q --ff-only "$new"

if [ "$front" = 1 ]; then
  rm -rf "$BUILD/next.prev" "$BUILD/node_modules.prev"
  [ -d frontend/.next ] && mv frontend/.next "$BUILD/next.prev"
  mv "$BUILD/frontend/.next" frontend/.next
  if [ "$packages" = 1 ]; then
    [ -d frontend/node_modules ] && mv frontend/node_modules "$BUILD/node_modules.prev"
    mv "$BUILD/frontend/node_modules" frontend/node_modules
  fi
  sudo -n /usr/bin/systemctl restart gapirai-frontend
  if ! healthy http://127.0.0.1:3000; then
    log "Yangi frontend ishlamadi -- eskisi qaytarilmoqda."
    rm -rf frontend/.next && mv "$BUILD/next.prev" frontend/.next
    [ -d "$BUILD/node_modules.prev" ] && rm -rf frontend/node_modules && mv "$BUILD/node_modules.prev" frontend/node_modules
    sudo -n /usr/bin/systemctl restart gapirai-frontend
    exit 1
  fi
  log "Frontend yangilandi."
fi

if [ "$backend" = 1 ]; then
  if [ "$image" = 1 ]; then
    log "Docker image qayta build qilinmoqda..."
    docker compose build $SERVICES
    docker compose up -d --no-deps $SERVICES
  fi
  docker restart -t 15 dubber_backend dubber_worker dubber_telegram_bot >/dev/null
  if ! healthy http://127.0.0.1:8000/docs; then
    # yangi jadval qo'shilganda uvicorn jarayonlari bir marta to'qnashishi mumkin
    docker restart -t 15 dubber_backend >/dev/null
    healthy http://127.0.0.1:8000/docs
  fi
  log "Backend yangilandi."
fi

healthy http://127.0.0.1:3000
healthy http://127.0.0.1:8000/docs
echo "$new" > "$BUILD/deployed-sha"
log "Tayyor: $(git log -1 --format=%h)"
