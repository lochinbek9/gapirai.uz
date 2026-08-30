# 🎬 AI Dubber

**YouTube video dubbing platform** — translates and re-voices YouTube videos into Uzbek using AI.

## Features

- 🎙️ **Speech-to-Text** — faster-whisper (local, no API needed)
- 🌐 **Translation** — English → Uzbek (Gemini / MyMemory fallback)
- 🔊 **Text-to-Speech** — Edge TTS (free, Uzbek voices: Sardor, Madina)
- 🎬 **Video Merge** — ffmpeg with codec-copy optimization
- 📱 **Web UI** — Next.js dashboard with Google Sign-In
- 🤖 **Telegram Bot** — dub videos directly from Telegram

## Quick Start (macOS / Linux)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Docker Desktop | 4.x+ | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Node.js | 20+ | [nodejs.org](https://nodejs.org/) |
| Git | any | `brew install git` |

### 1. Clone & configure

```bash
git clone <REPO_URL> ai-dubber
cd ai-dubber
cp .env.example .env
mkdir -p ~/.secrets/gapirai
```

Edit `.env` — the only required change is adding a Gemini API key (optional, improves translation quality):

```bash
GEMINI_API_KEY="your-key-here"  # get from https://aistudio.google.com/apikey
```

### 2. Start backend (Docker)

```bash
docker compose up -d
```

This starts: PostgreSQL, Redis, Backend API, Workers (video/TTS/media), Telegram bot, Flower monitoring.

### 3. Start frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Open in browser

```
http://localhost:3000
```

## Architecture

```
Browser → Frontend (:3000) → Backend API (:8000) → Workers
                                                      │
                    ┌─────────────────────────────────┤
                    │                                 │
              PostgreSQL                         Redis
                    │                                 │
              ┌─────┴─────┐                    Celery Queues
              │           │                    ├─ video_processing
              │  Workers  │                    ├─ tts_processing
              │           │                    └─ media_processing
              └───────────┘

Pipeline:
  YouTube URL → Download → Transcribe → Translate → TTS → Merge → Done
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js web app |
| Backend API | 8000 | FastAPI REST API |
| Flower | 5555 | Celery monitoring |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Message broker |

## API Keys (what you need)

| Service | Required? | Free? | Get it |
|---------|-----------|-------|--------|
| **faster-whisper** | ✅ Auto | ✅ Yes | Built-in (runs locally in Docker) |
| **Edge TTS** | ✅ Auto | ✅ Yes | Built-in (Microsoft, no key needed) |
| **MyMemory** | ✅ Auto | ✅ Yes | Built-in (free translation API) |
| **Gemini** | ⚠️ Optional | ✅ 20/day | [aistudio.google.com](https://aistudio.google.com/apikey) |
| **OpenAI** | ❌ Optional | $5 credit | [platform.openai.com](https://platform.openai.com/) |

> **Minimum setup:** Works with zero API keys. All core features (transcription, translation, TTS) run locally or use free APIs.

## Management

```bash
# Status
docker compose ps

# Logs
docker compose logs -f worker        # video processing
docker compose logs -f worker-tts    # TTS synthesis
docker compose logs -f backend       # API requests

# Restart
docker compose restart

# Stop
docker compose down

# Update
git pull
docker compose build
docker compose up -d
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Docker not running | Open Docker Desktop, wait for green whale icon 🐳 |
| Port 8000 in use | `lsof -i :8000` → `kill -9 <PID>` |
| YouTube download fails | Check `docker compose logs worker` for details |
| Slow processing | Normal on Intel Macs. Apple Silicon (M1+) is faster. |
| No disk space | `docker system prune -a` |

## Tech Stack

- **Backend:** Python 3.12, FastAPI, Celery, SQLAlchemy
- **Frontend:** Next.js 15, React 19, Tailwind CSS
- **AI:** faster-whisper, Edge TTS, Gemini, MyMemory
- **Infra:** Docker, PostgreSQL 16, Redis 7
- **Video:** ffmpeg, yt-dlp

## License

Proprietary — GapirAI.uz
