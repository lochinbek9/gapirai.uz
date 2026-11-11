"""
Public API rate limiting — Redis fixed-window counter, keyed by client IP.

Bir xil naqsh backend/services/downloader.py (YoutubeRateLimiter) va
backend/services/tts/elevenlabs_provider.py (_ConcurrencyGate) da
ishlatilgan: yangi tashqi kutubxona qo'shmasdan, mavjud Redis orqali.

Maqsad: bitta odam (yoki bot) `/api/jobs`, `/auth/*` kabi ochiq
endpointlarni cheksiz urib, Celery navbatini yoki emailga kod yuborish
tizimini egallab olmasligi. Redis mavjud bo'lmasa yoki xato bersa,
so'rov TO'SILMAYDI — faqat log qilinadi (rate limiter ishlamasligi
saytni butunlay to'xtatib qo'ymasligi kerak).
"""
import logging
import time
from redis import Redis
from fastapi import Request, HTTPException

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_redis: Redis | None = None


def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _client_ip(request: Request) -> str:
    """Haqiqiy mijoz IP manzilini xavfsiz aniqlash.

    Nginx orqasida ishlaganda X-Real-IP to'g'ridan-to'g'ri $remote_addr bilan
    o'rnatiladi, mijoz uni soxtalashtira olmaydi. Agar u bo'lmasa,
    X-Forwarded-For ning eng oxirgi (ishonchli proksi qo'shgan) qismini olamiz.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        if parts:
            return parts[-1]
    return request.client.host if request.client else "unknown"


_ADMIN_CACHE_TTL = 300.0
_admin_cache: dict[str, tuple[bool, float]] = {}


def _lookup_admin(user_id) -> bool:
    """role='admin' VA ADMIN_ALLOWED_EMAILS ro'yxatida -- get_current_admin_user bilan bir xil qoida."""
    from backend.models.database import SessionLocal, User
    allowed = {e.strip().lower() for e in settings.ADMIN_ALLOWED_EMAILS.split(",") if e.strip()}
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        return bool(user and user.role == "admin" and (not allowed or (user.email or "").lower() in allowed))
    finally:
        db.close()


def _is_admin_request(request: Request) -> bool:
    """Admin (Bearer JWT) so'rovlari IP limitidan ozod -- sinov paytida ketma-ket dublyaj/tahlil
    yuborganda 429 olmasin. API kalit tokenlari (typ=api) ozod EMAS. Natija 5 daqiqa keshlanadi."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return False
    from backend.services.auth import _subject_id, decode_token
    payload = decode_token(auth[7:].strip())
    if not payload or payload.get("typ") == "api":
        return False
    user_id = _subject_id(payload)
    if not user_id:
        return False
    key = str(user_id)
    cached = _admin_cache.get(key)
    now = time.monotonic()
    if cached and cached[1] > now:
        return cached[0]
    result = _lookup_admin(user_id)
    _admin_cache[key] = (result, now + _ADMIN_CACHE_TTL)
    return result


def rate_limit(key_prefix: str, max_requests: int, window_seconds: int):
    """
    FastAPI dependency factory: `dependencies=[Depends(rate_limit("jobs", 8, 600))]`

    key_prefix ayni endpoint uchun; har bir IP mustaqil hisoblanadi.
    Belgilangan oyna (window_seconds) ichida max_requests dan oshsa 429
    qaytaradi.
    """
    def _dependency(request: Request) -> None:
        try:
            if _is_admin_request(request):
                return
        except Exception as exc:  # admin tekshiruvi buzilsa ham oddiy limit ishlayversin
            logger.warning(f"Rate limiter admin tekshiruvi ishlamadi ({key_prefix}): {exc}")
        ip = _client_ip(request)
        key = f"ratelimit:{key_prefix}:{ip}"
        try:
            r = _get_redis()
            current = r.incr(key)
            if current == 1:
                r.expire(key, window_seconds)
            if current > max_requests:
                ttl = r.ttl(key)
                wait_s = ttl if ttl and ttl > 0 else window_seconds
                raise HTTPException(
                    status_code=429,
                    detail=f"Juda ko'p so'rov yuborildi. {wait_s} soniyadan so'ng qayta urinib ko'ring.",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(f"Rate limiter ishlamadi ({key_prefix}): {exc}")

    return _dependency
