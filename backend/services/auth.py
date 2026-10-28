import logging
import threading
import uuid
from datetime import datetime, timedelta
from typing import Optional
import bcrypt as _bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from backend.models.database import User, get_db
from backend.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

SECRET_KEY = settings.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 kun
API_KEY_EXPIRE_DAYS = 365

bearer_scheme = HTTPBearer(auto_error=False)


class AuthBusyError(Exception):
    """bcrypt darvozasi to'la -- kirish/ro'yxatdan o'tish urinishlari juda ko'p.
    main.py'dagi handler buni HTTP 503 + Retry-After'ga aylantiradi."""


class BcryptGate:
    """Jarayon ichida bir vaqtda ishlaydigan bcrypt sonini `active` bilan,
    ularni kutib turganlarni `waiting` bilan cheklaydi. Darvoza to'la bo'lsa
    kutmasdan AuthBusyError -- shu bilan bir jarayondagi 40 talik threadpool
    kutuvchi kirish so'rovlari bilan to'lib, polling/dashboard so'rovlarini
    ochlikda qoldirmaydi (kutish navbati `waiting * ~230ms` dan uzun emas)."""

    def __init__(self, active: int, waiting: int):
        active = max(1, active)
        self._active = threading.BoundedSemaphore(active)
        self._admission = threading.BoundedSemaphore(active + max(0, waiting))

    def run(self, fn, *args):
        if not self._admission.acquire(blocking=False):
            raise AuthBusyError()
        try:
            with self._active:
                return fn(*args)
        finally:
            self._admission.release()


_gate = BcryptGate(settings.BCRYPT_MAX_CONCURRENT, settings.BCRYPT_MAX_WAITING)


def hash_password(password: str) -> str:
    return _gate.run(lambda: _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode())


def verify_password(plain: str, hashed: str) -> bool:
    return _gate.run(lambda: _bcrypt.checkpw(plain.encode(), hashed.encode()))


def create_access_token(user_id: str | dict, email: str | None = None) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    if isinstance(user_id, dict):
        payload = dict(user_id)
        if "exp" not in payload:
            payload["exp"] = expire
        return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return jwt.encode(
        {"sub": str(user_id), "email": email or "", "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def create_api_key_token(user_id, key_id) -> str:
    """Shaxsiy API kalit: uzoq muddatli JWT. jti -> api_keys.id (bekor qilish uchun)."""
    expire = datetime.utcnow() + timedelta(days=API_KEY_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": str(user_id), "typ": "api", "jti": str(key_id), "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def _api_key_usable(db: Session, payload: dict) -> bool:
    """Oddiy token uchun doim True. API kalit uchun: yozuv mavjud, shu
    foydalanuvchiniki va bekor qilinmagan bo'lishi kerak."""
    if payload.get("typ") != "api":
        return True
    from backend.models.database import ApiKey
    try:
        key = db.query(ApiKey).filter(ApiKey.id == uuid.UUID(str(payload.get("jti")))).first()
    except (ValueError, TypeError):
        return False
    if not key or key.revoked_at is not None or str(key.user_id) != str(payload.get("sub")):
        return False
    now = datetime.utcnow()
    if not key.last_used_at or (now - key.last_used_at).total_seconds() > 600:
        key.last_used_at = now
        try:
            db.commit()
        except Exception:
            db.rollback()
    return True


def _subject_id(payload: dict) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError, TypeError):
        return None


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


def record_user_activity(db: Session, user: User) -> None:
    """Foydalanuvchining faolligini (kirishi / harakati) DB ga xavfsiz qayd qiladi.
    DB ga ortiqcha yuk tushmasligi uchun 10 daqiqada maksimum 1 marta yangilanadi."""
    now = datetime.utcnow()
    last_act = getattr(user, "last_active_at", None)
    if not last_act or (now - last_act).total_seconds() > 600:
        try:
            user.last_active_at = now
            today = now.date()
            from sqlalchemy import text
            db.execute(
                text("""
                    INSERT INTO user_daily_visits (user_id, visit_date, first_seen_at, last_seen_at, actions_count)
                    VALUES (:uid, :vdate, :now, :now, 1)
                    ON CONFLICT (user_id, visit_date)
                    DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, actions_count = user_daily_visits.actions_count + 1
                """),
                {"uid": str(user.id), "vdate": today, "now": now},
            )
            db.commit()
        except Exception as e:
            db.rollback()
            logger.debug(f"User activity recording ignored: {e}")


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Login qiling.")
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token yaroqsiz.")
    if not _api_key_usable(db, payload):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API kalit bekor qilingan yoki yaroqsiz.")
    user_id = _subject_id(payload)
    user = db.query(User).filter(User.id == user_id).first() if user_id else None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Foydalanuvchi topilmadi.")
    # API kalit bilan kelgan so'rovlar admin va kalit boshqaruviga kira olmaydi
    user._via_api_key = payload.get("typ") == "api"
    if getattr(user, "is_verified", True) is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hisob tasdiqlanmagan. Iltimos, emailingizni tasdiqlang.")
    record_user_activity(db, user)
    return user


def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Faqat role='admin' VA ADMIN_ALLOWED_EMAILS ro'yxatidagi hisobni
    o'tkazadi — ikki qavatli tekshiruv, kelajakda role tasodifan boshqa
    hisobga berilib qolsa ham, faqat ro'yxatdagi email kira oladi."""
    allowed_emails = {
        e.strip().lower() for e in settings.ADMIN_ALLOWED_EMAILS.split(",") if e.strip()
    }
    if getattr(current_user, "_via_api_key", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin bo'limiga API kalit bilan kirib bo'lmaydi.")
    user_email = (current_user.email or "").lower()
    if current_user.role != "admin" or (allowed_emails and user_email not in allowed_emails):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu bo'limga faqat administratorlar kira oladi.")
    return current_user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Token bo'lsa user qaytaradi, bo'lmasa None."""
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or not _api_key_usable(db, payload):
        return None
    user_id = _subject_id(payload)
    user = db.query(User).filter(User.id == user_id).first() if user_id else None
    if not user or not user.is_active or getattr(user, "is_verified", True) is False:
        return None
    user._via_api_key = payload.get("typ") == "api"
    return user


def get_optional_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[uuid.UUID]:
    """Token bo'lsa user id'ni bazaga TEGMASDAN qaytaradi, aks holda None.
    Faqat egalikni (job.user_id == id) solishtiradigan, User qatorining o'zi
    kerak bo'lmagan juda tez-tez chaqiriladigan endpointlar uchun (GET
    /jobs/{id} har foydalanuvchidan 1.5s sekinroq polling qilinadi) -- har
    so'rovda bitta User SELECT'ini tejaydi."""
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    try:
        return uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError):
        return None
