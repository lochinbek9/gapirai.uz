FROM python:3.12-slim-bookworm

# FFmpeg va tizim kutubxonalarini o'rnatish
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/

# Papkalarni yaratish
RUN mkdir -p /app/uploads /app/outputs
