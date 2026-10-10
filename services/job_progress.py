"""Jonli (bosqich ichidagi) progress — DubbingJob.progress qo'pol sakraydi
(5 -> 20 -> 40 -> 60 -> 85 -> 100), shuning uchun uzun videoda progress bar
daqiqalab qotib turadi. Bu yerda yt-dlp yuklab olish hook'i va TTS segment
sanoqchisi Redis'ga (Postgres'ni har callback'da urmasdan) "sub-progress"
yozadi; GET /api/jobs/{id} (routes.py:_job_to_response) uni o'qib, faol
bosqichda `progress`ga aralashtiradi.

Kosmetik — har qanday Redis xatosi jimgina yutiladi (progress bar biroz
qo'polroq bo'ladi, xolos). Kalitning TTL'i bor: job osilib qolsa yoki
worker o'lsa, kalit o'zi tugab, progress qo'pol `job.progress`ga qaytadi.
"""
from __future__ import annotations

import time

from redis import Redis

from backend.config import get_settings

_settings = get_settings()
_redis: Redis | None = None

_KEY = "jobprogress:{job_id}"
_TTL_SECONDS = 900  # 15 daqiqa — bosqich bundan uzoq cho'zilsa qo'pol progress'ga qaytadi

# Har job uchun oxirgi yozuv: {job_id: (monotonic_ts, value)} — Postgres emas,
# hatto Redis'ni ham keraksiz tez-tez urmaslik uchun (yt-dlp hook'i sekundiga
# bir necha marta chaqiriladi).
_last_write: dict[str, tuple[float, float]] = {}
_MIN_INTERVAL_S = 1.0
_MIN_DELTA = 1.5


def _conn() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(_settings.REDIS_URL, decode_responses=True)
    return _redis


def set_subprogress(job_id: str, value: float) -> None:
    """Bosqich ichidagi progress'ni (0..100) yozadi — vaqt/qiymat bo'yicha
    cheklanadi, shuning uchun uni to'g'ridan-to'g'ri yt-dlp progress hook'idan
    yoki har TTS segmentidan keyin chaqirish xavfsiz."""
    try:
        value = max(0.0, min(100.0, float(value)))
        now = time.monotonic()
        prev = _last_write.get(job_id)
        if prev is not None:
            prev_ts, prev_val = prev
            if now - prev_ts < _MIN_INTERVAL_S and abs(value - prev_val) < _MIN_DELTA:
                return
        _last_write[job_id] = (now, value)
        _conn().set(_KEY.format(job_id=job_id), f"{value:.1f}", ex=_TTL_SECONDS)
    except Exception:
        pass


def get_subprogress(job_id: str) -> float | None:
    try:
        raw = _conn().get(_KEY.format(job_id=job_id))
        return float(raw) if raw is not None else None
    except Exception:
        return None


def clear_subprogress(job_id: str) -> None:
    _last_write.pop(job_id, None)
    try:
        _conn().delete(_KEY.format(job_id=job_id))
    except Exception:
        pass
