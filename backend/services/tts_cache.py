"""Segment darajasidagi TTS audio keshi — bir xil matn+ovoz+provider
kombinatsiyasi qayta sintez qilinmasdan (haqiqiy pul to'lanmasdan) S3'dagi
mavjud audio qaytariladi (backend/models/database.py: TTSCache).

Nega S3, nega lokal disk emas — job tugagach mahalliy fayllar o'chiriladi
(backend/workers/tasks.py), shuning uchun kesh S3'da yashashi shart, aks
holda birinchi job tugashi bilan o'zining keshini o'chirib qo'yardi.

tts_cost.py'ning shakliga o'xshaydi — xatolik hech qachon dublyaj
pipeline'ini to'xtatmaydi, faqat log qilinadi va oddiy sintezga o'tiladi.
"""
import hashlib
import logging
import os
import tempfile

import hashlib
import logging
import os
import shutil
from pathlib import Path

from backend.models.database import SessionLocal, TTSCache
from backend.services.storage import upload_file_to_s3, download_file_from_s3

logger = logging.getLogger(__name__)

_CACHE_S3_PREFIX = "dubber-cache/tts"
_LOCAL_CACHE_DIR = Path("outputs/cache/tts")


def _cache_key(text: str, voice_name: str | None, provider: str) -> str:
    raw = f"{text}|{voice_name or ''}|{provider}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_cached(text: str, voice_name: str | None, provider: str, output_path: str) -> bool:
    """Kesh'da mavjud bo'lsa, audio'ni output_path'ga nusxalab, True qaytaradi.
    1-qatlam: Mahalliy disk keshi (outputs/cache/tts) — 0ms va mutlaqo bepul.
    2-qatlam: S3 / Cloud Storage — boshqa server/workerlar uchun."""
    key = _cache_key(text, voice_name, provider)

    # 1. Lokal disk keshi
    try:
        local_file = _LOCAL_CACHE_DIR / f"{key}.wav"
        if local_file.exists() and local_file.is_file() and local_file.stat().st_size > 100:
            os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
            shutil.copyfile(str(local_file), output_path)
            logger.info(f"TTS lokal disk keshidan olindi: {provider} • {voice_name}")
            return True
    except Exception as exc:
        logger.debug(f"Lokal kesh tekshirishda ogohlantirish: {exc}")

    # 2. S3 keshi
    db = SessionLocal()
    try:
        entry = db.query(TTSCache).filter(TTSCache.cache_key == key).first()
        if not entry:
            return False
        if not download_file_from_s3(entry.s3_key, output_path):
            return False
        entry.hit_count += 1
        db.commit()

        # S3 dan kelgan faylni lokal keshga ham saqlab qo'yamiz
        try:
            _LOCAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(output_path, str(_LOCAL_CACHE_DIR / f"{key}.wav"))
        except Exception:
            pass

        return True
    except Exception as exc:
        logger.warning(f"TTS keshni o'qishda xatolik (oddiy sintezga o'tiladi): {exc}")
        return False
    finally:
        db.close()


def store_cached(text: str, voice_name: str | None, provider: str, audio_path: str) -> None:
    """Yangi sintez qilingan audio'ni keshga (lokal disk va S3) yozadi."""
    if not os.path.exists(audio_path) or os.path.getsize(audio_path) < 100:
        return

    key = _cache_key(text, voice_name, provider)

    # 1. Lokal disk keshiga saqlash
    try:
        _LOCAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        local_target = _LOCAL_CACHE_DIR / f"{key}.wav"
        if not local_target.exists():
            shutil.copyfile(audio_path, str(local_target))
    except Exception as exc:
        logger.debug(f"Lokal TTS keshga yozishda ogohlantirish: {exc}")

    # 2. S3 keshiga saqlash
    s3_key = f"{_CACHE_S3_PREFIX}/{key}.wav"
    try:
        if not upload_file_to_s3(audio_path, s3_key):
            return

        db = SessionLocal()
        try:
            existing = db.query(TTSCache).filter(TTSCache.cache_key == key).first()
            if existing:
                return
            db.add(TTSCache(cache_key=key, provider=provider, s3_key=s3_key))
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"TTS S3 keshga yozishda xatolik: {exc}")
