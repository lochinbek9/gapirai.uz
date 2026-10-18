"""
health_check.py — Deep system health check service.

Tekshiradi:
1. PostgreSQL ma'lumotlar bazasi (ulanish + latency)
2. Redis kesh va broker (ping + latency)
3. Disk xotirasi (OUTPUT_DIR bo'sh joy va foiz)
4. Celery worker holati (ping va faol workerlar soni)
5. YouTube cookies.txt holati (mavjudlik va amal qilish muddati)

Uptime monitorlar (/health) va Admin panel (/api/admin/system-health) uchun xizmat qiladi.
"""
from __future__ import annotations

import logging
import os
import shutil
import time
from typing import Any

from backend.config import get_settings

logger = logging.getLogger(__name__)


def check_db() -> dict[str, Any]:
    """PostgreSQL bazasiga ulanish va javob vaqtini tekshiradi."""
    t0 = time.monotonic()
    try:
        from backend.models.database import SessionLocal
        from sqlalchemy import text

        session = SessionLocal()
        try:
            session.execute(text("SELECT 1"))
            latency_ms = round((time.monotonic() - t0) * 1000, 2)
            return {"status": "healthy", "latency_ms": latency_ms}
        finally:
            session.close()
    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        logger.error(f"[HEALTH] Database xatoligi: {exc}")
        return {"status": "unhealthy", "latency_ms": latency_ms, "error": str(exc)[:200]}


def check_redis() -> dict[str, Any]:
    """Redis serveriga ping yuborish orqali aloqa va latency'ni tekshiradi."""
    settings = get_settings()
    t0 = time.monotonic()
    try:
        from redis import Redis

        r = Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
        if r.ping():
            latency_ms = round((time.monotonic() - t0) * 1000, 2)
            return {"status": "healthy", "latency_ms": latency_ms}
        raise RuntimeError("Redis ping muvaffaqiyatsiz bo'ldi")
    except Exception as exc:
        latency_ms = round((time.monotonic() - t0) * 1000, 2)
        logger.error(f"[HEALTH] Redis xatoligi: {exc}")
        return {"status": "unhealthy", "latency_ms": latency_ms, "error": str(exc)[:200]}


def check_disk(notify_if_low: bool = True) -> dict[str, Any]:
    """Diskdagi bo'sh joyni (OUTPUT_DIR joylashgan disk) tekshiradi."""
    settings = get_settings()
    target_dir = settings.OUTPUT_DIR if os.path.exists(settings.OUTPUT_DIR) else "."
    try:
        usage = shutil.disk_usage(target_dir)
        total_gb = round(usage.total / (1024 ** 3), 2)
        free_gb = round(usage.free / (1024 ** 3), 2)
        used_gb = round(usage.used / (1024 ** 3), 2)
        used_pct = round((usage.used / usage.total) * 100, 1)

        if free_gb < 3.0 or used_pct > 95.0:
            status = "critical"
        elif free_gb < 8.0 or used_pct > 88.0:
            status = "warning"
        else:
            status = "healthy"

        if notify_if_low and (free_gb < 5.0 or used_pct > 90.0):
            try:
                from backend.services.telegram_notify import send_disk_space_alert
                send_disk_space_alert(free_gb, total_gb, used_pct)
            except Exception as notify_err:
                logger.debug(f"[HEALTH] Disk alert yuborilmadi: {notify_err}")

        return {
            "status": status,
            "free_gb": free_gb,
            "total_gb": total_gb,
            "used_gb": used_gb,
            "used_percent": used_pct,
        }
    except Exception as exc:
        logger.error(f"[HEALTH] Disk tekshirishda xato: {exc}")
        return {"status": "unhealthy", "error": str(exc)[:200]}


def check_celery_workers() -> dict[str, Any]:
    """Celery workerlariga ping yuborib faol workerlarni aniqlaydi."""
    try:
        from backend.workers.celery_app import celery_app

        res = celery_app.control.ping(timeout=1.5)
        if res and isinstance(res, list):
            # res format: [{'celery@hostname': {'ok': 'pong'}}, ...]
            worker_names = [list(item.keys())[0] for item in res if isinstance(item, dict) and item]
            if worker_names:
                return {"status": "healthy", "worker_count": len(worker_names), "workers": worker_names}

        return {"status": "warning", "worker_count": 0, "message": "Faol Celery worker aniqlanmadi"}
    except Exception as exc:
        logger.debug(f"[HEALTH] Celery ping xatoligi: {exc}")
        return {"status": "warning", "worker_count": 0, "error": str(exc)[:200]}


def check_youtube_cookies(notify_if_expiring: bool = True) -> dict[str, Any]:
    """YouTube cookies.txt faylining amal qilish holatini tekshiradi."""
    try:
        from backend.services.cookie_manager import check_cookie_health

        health = check_cookie_health(notify_on_alert=notify_if_expiring)
        if not health["exists"]:
            status = "warning"
            message = "Cookies.txt fayli topilmadi yoki bo'sh"
        elif health["days_remaining"] <= 3.0:
            status = "warning"
            message = f"Cookie muddati oz qoldi ({health['days_remaining']} kun)"
        else:
            status = "healthy"
            message = "Cookie yaroqli va yangi"

        return {
            "status": status,
            "exists": health["exists"],
            "days_remaining": health["days_remaining"],
            "is_fresh": health["is_fresh"],
            "message": message,
        }
    except Exception as exc:
        logger.debug(f"[HEALTH] Cookie tekshirishda xato: {exc}")
        return {"status": "warning", "error": str(exc)[:200]}


def check_ai_providers() -> dict[str, Any]:
    """Tizimda sozlangan AI provayderlar (Gemini, Azure, OpenAI, Edge) holatini tekshiradi."""
    settings = get_settings()
    gemini_key = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    azure_key = bool(settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_KEY not in ("", "your-azure-key"))
    openai_enabled = bool(getattr(settings, "OPENAI_ENABLED", True))
    openai_key = bool(settings.OPENAI_API_KEY)

    return {
        "gemini": {
            "status": "healthy" if gemini_key else "warning",
            "name": "Google Gemini",
            "enabled": True,
            "configured": gemini_key,
            "models": {
                "general": settings.GEMINI_MODEL,
                "stt": settings.GEMINI_STT_MODEL,
                "tts": settings.GEMINI_TTS_MODEL,
            },
            "note": "Asosiy AI dvigateli (STT, tarjima va TTS)",
        },
        "azure": {
            "status": "healthy" if azure_key else "warning",
            "name": "Microsoft Azure Speech",
            "enabled": True,
            "configured": azure_key,
            "region": settings.AZURE_SPEECH_REGION,
            "note": "Yuqori sifatli ovoz sintezi (TTS)",
        },
        "openai": {
            "status": "disabled" if not openai_enabled else ("healthy" if openai_key else "warning"),
            "name": "OpenAI (GPT-4o & Whisper)",
            "enabled": openai_enabled,
            "configured": openai_key,
            "note": "Vaqtinchalik nofaol (Balans 0). Zaxira Gemini/Azure ishlamoqda." if not openai_enabled else "Faol",
        },
        "edge_tts": {
            "status": "healthy",
            "name": "Edge TTS",
            "enabled": True,
            "configured": True,
            "note": "Bepul zaxira ovoz tizimi",
        },
    }


def check_celery_queues() -> dict[str, Any]:
    """Redis brokeridagi Celery navbatlar uzunligini tekshiradi."""
    settings = get_settings()
    try:
        from redis import Redis
        r = Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
        q_video = r.llen("video_processing")
        q_local = r.llen("local_upload")
        q_default = r.llen("celery")
        return {
            "status": "healthy",
            "video_processing": q_video,
            "local_upload": q_local,
            "celery": q_default,
            "total_queued": q_video + q_local + q_default,
        }
    except Exception as exc:
        return {
            "status": "warning",
            "video_processing": 0,
            "local_upload": 0,
            "celery": 0,
            "total_queued": 0,
            "error": str(exc)[:200],
        }


def check_system_health(detailed: bool = False, notify: bool = False) -> dict[str, Any]:
    """
    Tizim komponentlarining to'liq yoki tezkor salomatligini tekshiradi.
    `detailed=False`: faqat asosiy DB va Redis (tezkor monitoring so'rovlari uchun).
    `detailed=True`: DB, Redis, Disk, Celery, YouTube Cookies, AI Providers va Navbatlar to'liq tekshiriladi.
    `notify=False`: admin panel tekshiruvlarida telegramga ortiqcha ogohlantirish xabarlari yuborilmaydi.
    """
    db_res = check_db()
    redis_res = check_redis()

    components: dict[str, Any] = {
        "database": db_res,
        "redis": redis_res,
    }

    if detailed:
        components["disk"] = check_disk(notify_if_low=notify)
        components["celery"] = check_celery_workers()
        components["youtube_cookies"] = check_youtube_cookies(notify_if_expiring=notify)
        components["ai_providers"] = check_ai_providers()
        components["queues"] = check_celery_queues()

    # Umumiy holatni aniqlash
    # 1. Asosiy DB yoki Redis ishlamasa -> unhealthy
    if db_res["status"] == "unhealthy" or redis_res["status"] == "unhealthy":
        overall_status = "unhealthy"
    # 2. Disk critical bo'lsa -> degraded
    elif detailed and components.get("disk", {}).get("status") == "critical":
        overall_status = "degraded"
    # 3. Har qanday komponent warning bo'lsa -> degraded
    elif any(comp.get("status") == "warning" for comp in components.values()):
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return {
        "status": overall_status,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "service": "GapirAI.uz",
        "components": components,
    }

