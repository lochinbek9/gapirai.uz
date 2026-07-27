FROM python:3.12-slim-bookworm

# FFmpeg, Node.js, git va tizim kutubxonalarini o'rnatish
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    curl \
    git \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# PO Token server — build bgutil scripts for yt-dlp plugin
RUN git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /tmp/bgutil \
    && cd /tmp/bgutil/server \
    && npm ci \
    && npx tsc \
    && mkdir -p /root/bgutil-ytdlp-pot-provider \
    && cp -r /tmp/bgutil/server /root/bgutil-ytdlp-pot-provider/server \
    && rm -rf /tmp/bgutil

COPY backend/ ./backend/

RUN mkdir -p /app/uploads /app/outputs
