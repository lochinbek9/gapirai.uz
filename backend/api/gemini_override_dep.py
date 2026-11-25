"""FastAPI dependency: faqat ADMIN uchun `X-Gemini-Tier` / `X-Gemini-Model` sarlavhalarini qabul qiladi.

Natija so'rov kontekstiga (REQUEST_OVERRIDE) yoziladi; ish navbatga qo'yilganda GeminiOverrideTask uni job ID bo'yicha saqlaydi.
async bo'lishi shart: oddiy `def` dependency alohida oqimda ishlab, ContextVar qiymati endpoint'ga yetmaydi.
Admin bo'lmagan foydalanuvchi sarlavhalari e'tiborsiz qoldiriladi (xatosiz).
"""
from fastapi import Depends, Request

from backend.models.database import User
from backend.services.auth import get_current_user
from backend.services.gemini_quota_manager import REQUEST_OVERRIDE, sanitize_override


async def capture_gemini_override(request: Request, current_user: User = Depends(get_current_user)) -> None:
    if getattr(current_user, "role", None) != "admin":
        return None
    ov = sanitize_override(
        (request.headers.get("x-gemini-tier") or "").strip().lower() or None,
        (request.headers.get("x-gemini-model") or "").strip() or None,
        *((request.headers.get(f"x-{stage}-choice") or "").strip().lower() or None for stage in ("tts", "stt", "llm", "female", "male", "quality", "mix", "voices")),
    )
    REQUEST_OVERRIDE.set(ov)
    return None
