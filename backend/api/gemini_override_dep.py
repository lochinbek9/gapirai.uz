"""FastAPI dependency: faqat ADMIN uchun `X-Gemini-Tier` / `X-Gemini-Model` sarlavhalarini qabul qiladi.

Natija so'rov kontekstiga (REQUEST_OVERRIDE) yoziladi; ish navbatga qo'yilganda GeminiOverrideTask uni job ID bo'yicha saqlaydi.
Admin bo'lmagan foydalanuvchi sarlavhalari e'tiborsiz qoldiriladi (xatosiz).
"""
from fastapi import Depends, Request

from backend.models.database import User
from backend.services.auth import get_current_user
from backend.services.gemini_quota_manager import REQUEST_OVERRIDE, sanitize_override


def capture_gemini_override(request: Request, current_user: User = Depends(get_current_user)) -> None:
    if getattr(current_user, "role", None) != "admin":
        return None
    ov = sanitize_override(
        (request.headers.get("x-gemini-tier") or "").strip().lower() or None,
        (request.headers.get("x-gemini-model") or "").strip() or None,
    )
    REQUEST_OVERRIDE.set(ov)
    return None
