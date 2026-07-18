FROM python:3.12-slim-bookworm

# FFmpeg, Node.js va tizim kutubxonalarini o'rnatish
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright Chromium o'rnatish (YouTube cookie auto-refresh uchun)
RUN playwright install chromium && playwright install-deps chromium

COPY backend/ ./backend/

# Papkalarni yaratish
RUN mkdir -p /app/uploads /app/outputs
