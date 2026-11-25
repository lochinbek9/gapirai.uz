"""BYOK: yoqilganda egasining ishlari shu provayder uchun FAQAT uning kalitlaridan foydalanadi.

Faol holat jarayon-global: Celery prefork'da bir jarayon bir vaqtda bitta vazifa bajaradi. API jarayonida
(ko'p oqimli) faollashtirilmaydi -- u yerda kalitlar aniq argument sifatida uzatiladi (load_keys).
"""
import base64
import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet, InvalidToken
from redis import Redis

from backend.config import get_settings
from backend.models.byok import ByokSetting
from backend.models.database import CaptionDub, DubbingJob, SessionLocal, TTSUsageLog, VideoAnalysis

logger = logging.getLogger(__name__)

PROVIDERS = ("gemini", "groq", "gapi")
_ACTIVE: dict[str, list[str]] = {}
_OWNER: str | None = None
_USAGE_TTL = 40 * 86400
_TZ = timezone(timedelta(hours=5))  # Toshkent -- gapi balansi ham shu vaqtda yangilanadi


def _redis():
    return Redis.from_url(get_settings().REDIS_URL, decode_responses=True, socket_timeout=2)


def _day(offset: int = 0) -> str:
    return (datetime.now(_TZ) - timedelta(days=offset)).strftime("%Y-%m-%d")


def count_request(provider: str, key: str, user_id=None) -> None:
    """Egasining kaliti bilan bajarilgan muvaffaqiyatli so'rovni sanaydi (xato pipeline'ni to'xtatmaydi)."""
    if user_id is None:
        if not _OWNER or key not in _ACTIVE.get(provider, []):
            return
        user_id = _OWNER
    try:
        client, name = _redis(), f"byok_req:{user_id}:{provider}:{_day()}"
        client.incr(name)
        client.expire(name, _USAGE_TTL)
    except Exception as e:
        logger.warning(f"[BYOK] hisoblagich: {type(e).__name__}")


def request_counts(user_id, provider: str) -> dict:
    """{"today": n, "month": oxirgi 30 kun}."""
    values = _redis().mget([f"byok_req:{user_id}:{provider}:{_day(i)}" for i in range(30)])
    return {"today": int(values[0] or 0), "month": sum(int(v or 0) for v in values)}


def _fernet() -> Fernet:
    digest = hashlib.sha256(f"byok:{get_settings().SECRET_KEY}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(keys: list[str]) -> str | None:
    return _fernet().encrypt("\n".join(keys).encode()).decode() if keys else None


def decrypt(token: str | None) -> list[str]:
    if not token:
        return []
    try:
        return _fernet().decrypt(token.encode()).decode().split("\n")
    except InvalidToken:  # SECRET_KEY almashgan -- kalitlarni qayta kiritish kerak
        logger.error("[BYOK] kalitni ochib bo'lmadi")
        return []


def load_keys(db, user_id: uuid.UUID) -> dict[str, list[str]]:
    """Yoqilgan bo'lsa {provayder: kalitlar} (faqat kaliti borlari), aks holda bo'sh."""
    row = db.get(ByokSetting, user_id)
    if not row or not row.enabled:
        return {}
    keys = {p: decrypt(getattr(row, f"{p}_keys")) for p in PROVIDERS}
    return {p: k for p, k in keys.items() if k}


def active_keys(provider: str) -> list[str] | None:
    keys = _ACTIVE.get(provider)
    return list(keys) if keys else None


def log_gapi_stt(seconds: float) -> None:
    """gapi nutqni tanish sarfini (1 daqiqa = 1 g) egasining hisobiga yozadi."""
    if not _OWNER:
        return
    try:
        db = SessionLocal()
        try:
            db.add(TTSUsageLog(provider="gapi_stt", characters=0, duration_seconds=seconds,
                               estimated_cost=seconds / 60.0, currency="G", user_id=_OWNER, cache_hit=False))
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"[BYOK] STT hisobi yozilmadi: {type(e).__name__}")


def activate_for_job(job_key: str | None) -> None:
    """Vazifa (dublyaj yoki tahlil) egasining BYOK'i yoqilgan bo'lsa faollashtiradi."""
    global _OWNER
    deactivate()
    try:
        job_id = uuid.UUID(str(job_key))
    except ValueError:
        return
    db = SessionLocal()
    try:
        item = db.get(DubbingJob, job_id) or db.get(VideoAnalysis, job_id) or db.get(CaptionDub, job_id)
        if item and item.user_id:
            _ACTIVE.update(load_keys(db, item.user_id))
            if _ACTIVE:
                _OWNER = str(item.user_id)
                logger.info(f"[BYOK] faol: {', '.join(_ACTIVE)}")
    except Exception as e:
        logger.error(f"[BYOK] sozlamani o'qib bo'lmadi: {type(e).__name__}")
    finally:
        db.close()


def deactivate() -> None:
    global _OWNER
    _OWNER = None
    _ACTIVE.clear()
