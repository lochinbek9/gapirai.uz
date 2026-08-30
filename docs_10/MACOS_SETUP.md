# 🍎 AI Dubber — Запуск на macOS (для клиента)

## Что нужно установить

| Программа | Зачем | Скачать |
|-----------|-------|---------|
| **Docker Desktop** | Backend (API, Workers, PostgreSQL, Redis) | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| **Node.js 20+** | Frontend (сайт) | [nodejs.org](https://nodejs.org/) (нажать «LTS») |
| **Git** | Скачать код | Уже есть на Mac или `brew install git` |

> **Важно:** Docker Desktop бесплатен для персонального использования.

---

## Шаг 1. Скачать проект

```bash
git clone <ССЫЛКА_НА_REPOSITORIЙ> ai-dubber
cd ai-dubber
```

## Шаг 2. Проверить .env

Убедитесь что в файле `.env` есть:
```
COMPOSE_HOST_IP=127.0.0.1
```

Если там стоит другой IP — замените на `127.0.0.1`.

## Шаг 3. Создать папку для secrets

```bash
mkdir -p ~/.secrets/gapirai
```

> Это нужно чтобы Docker не упал с ошибкой монтирования.

## Шаг 4. Запустить backend

```bash
docker compose up -d
```

Подождите 2-3 минуты — Docker скачает образы и поднимет все сервисы.

Проверить что всё запущено:
```bash
docker compose ps
```

Должны быть зелёными (running):
- dubber_postgres
- dubber_redis
- dubber_backend
- dubber_worker (видео)
- dubber_worker_tts (озвучка)
- dubber_worker_media (склейка)
- dubber_pot_provider (обход блокировок YouTube)
- dubber_telegram_bot
- dubber_flower

## Шаг 5. Запустить frontend

Откройте **новое окно терминала**:

```bash
cd ai-dubber/frontend
npm install    # первый раз
npm run dev
```

## Шаг 6. Открыть в браузере

```
http://localhost:3000
```

Готово! 🎉

---

## YouTube видео — cookies НЕ нужны

Проект использует **pot-provider** (Docker контейнер `brainicism/bgutil-ytdlp-pot-provider`), который автоматически генерирует PO-токены для обхода блокировок YouTube.

На домашнем Mac (резидентный IP) видео скачиваются **без cookies.txt**.

> ⚠️ Cookies.txt нужны только на серверах в дата-центрах (Azure, AWS и т.д.), где YouTube агрессивно блокирует скачивание.

---

## Управление

```bash
# Остановить всё
docker compose down

# Перезапустить
docker compose restart

# Посмотреть логи (ошибки)
docker compose logs -f worker        # логи обработки видео
docker compose logs -f worker-tts    # логи озвучки
docker compose logs -f backend       # логи API

# Пересобрать после обновления кода
git pull
docker compose build
docker compose up -d
```

---

## API ключи (что нужно, а что нет)

### ✅ Работает БЕЗ ключей:
| Сервис | Как |
|--------|-----|
| **Транскрипция** | faster-whisper (локально в Docker) |
| **Озвучка (TTS)** | Edge TTS (бесплатно) |
| **Перевод** | MyMemory API (бесплатно) |
| **YouTube** | pot-provider + iOS/Android клиент |

### ⚠️ Опционально (улучшает качество):
| Сервис | Зачем | Где взять |
|--------|-------|-----------|
| **Gemini API** | Лучший перевод (en→uz) | [aistudio.google.com](https://aistudio.google.com/) — бесплатно 20 запросов/день |
| **OpenAI API** | Быстрая транскрипция | [platform.openai.com](https://platform.openai.com/) — $5 кредит |

---

## Частые проблемы

### "Docker not running"
Откройте Docker Desktop → дождитесь пока в меню появится зелёная иконка whale 🐳.

### "Port 8000 already in use"
```bash
lsof -i :8000       # найти процесс
kill -9 <PID>       # убить
```

### Видео не скачивается (YouTube)
1. Убедитесь что `docker compose ps` показывает `dubber_pot_provider` как running
2. Проверьте логи: `docker compose logs worker | grep -i "youtube\|error\|UNPLAYABLE"`
3. Если YouTube требует "Sign in to confirm you're not a bot" — это нормально, pot-provider должен это решить

### Работает медленно
На MacBook Air/Pro (Intel) обработка видео может быть медленной. На Apple Silicon (M1/M2/M3) — быстрее.

### "No space left on device"
```bash
docker system prune -a
```

---

## Порты

| Сервис | Порт | URL |
|--------|------|-----|
| 🌐 **Frontend (сайт)** | 3000 | http://localhost:3000 |
| ⚙️ Backend API | 8000 | http://localhost:8000 |
| 📊 Flower (мониторинг) | 5555 | http://localhost:5555 |
| 🗄 PostgreSQL | 5432 | localhost:5432 |
| 📦 Redis | 6379 | localhost:6379 |

---

## Архитектура на macOS

```
        Браузер (Safari/Chrome)
              │
              ▼
    Frontend :3000 (Node.js)
              │  /api/* проксируется на :8000
              ▼
    ┌──── Docker Desktop ───────────┐
    │                               │
    │  Backend API :8000            │
    │       │                       │
    │       ├── PostgreSQL          │
    │       ├── Redis               │
    │       ├── pot-provider        │  ← PO-токены для YouTube
    │       ├── Worker (видео)      │  ← download + transcribe + translate
    │       ├── Worker (TTS)        │  ← Edge TTS (бесплатно)
    │       └── Worker (Media)      │  ← ffmpeg (склейка видео)
    │                               │
    └───────────────────────────────┘
```

Вся тяжёлая работа идёт внутри Docker-контейнера на Linux. Mac используется только как интерфейс.
