"""Google Sign-In — frontend Google Identity Services token'ini tekshiradi.

Server-side auth-code almashinuvi ishlatilmaydi (shuning uchun
GOOGLE_CLIENT_SECRET kerak emas) — frontend Google Identity Services orqali
olingan ID token'ni backend shu funksiya orqali Google'ning ochiq kalitlariga
qarshi tekshiradi.
"""
import logging

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_request = google_requests.Request()


class GoogleTokenError(Exception):
    """Token yaroqsiz yoki tekshirib bo'lmadi."""


def verify_google_token(credential: str) -> dict:
    """ID token'ni tekshiradi, {sub, email, email_verified, name} qaytaradi.

    Yaroqsiz/eskirgan/soxta token bo'lsa GoogleTokenError ko'taradi.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleTokenError("GOOGLE_CLIENT_ID sozlanmagan.")

    try:
        payload = id_token.verify_oauth2_token(credential, _request, settings.GOOGLE_CLIENT_ID)
    except ValueError as exc:
        raise GoogleTokenError(f"Google token yaroqsiz: {exc}") from exc

    email = payload.get("email")
    if not email:
        raise GoogleTokenError("Google token'da email topilmadi.")

    return {
        "sub": payload["sub"],
        "email": email.lower().strip(),
        "email_verified": bool(payload.get("email_verified", False)),
        "name": payload.get("name") or email.split("@")[0],
    }
