from datetime import datetime
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
import httpx
from sqlalchemy.orm import Session

from backend.config import get_settings, telegram_api_base
from backend.models.database import get_db, SessionLocal, User
from backend.services.auth import decode_token, bearer_scheme
from fastapi.security import HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/feedback", tags=["feedback"])


class FeedbackRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    contact: Optional[str] = Field(None, max_length=100)
    comment: str = Field(..., min_length=3, max_length=3000)
    rating: Optional[int] = Field(None, ge=1, le=5)
    page_url: Optional[str] = Field(None, max_length=300)


def _get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload:
        return None
    return db.query(User).filter(User.id == payload.get("sub")).first()


@router.post("")
async def submit_feedback(
    req: FeedbackRequest,
    request: Request,
    user: Optional[User] = Depends(_get_optional_user),
):
    """Foydalanuvchi fikr-mulohazasi va takliflarini qabul qilib,
    Telegram kanaliga avtomatik yuboradi."""
    bot_token = settings.TELEGRAM_BOT_TOKEN
    channel_id = settings.TELEGRAM_FEEDBACK_CHANNEL_ID or settings.TELEGRAM_CHAT_ID or "-1004431243067"

    if not bot_token or not channel_id:
        logger.error("Telegram bot token yoki feedback channel ID sozlanmagan")
        raise HTTPException(status_code=500, detail="Fikr yuborish tizimi vaqtincha sozlanmagan.")

    import html

    # Ma'lumotlarni to'ldirish
    sender_name = req.name or (user.name if user and user.name else "Anonim foydalanuvchi")
    if req.contact and req.contact.strip():
        sender_contact = req.contact.strip()
    elif user:
        sender_contact = getattr(user, "phone", None) or getattr(user, "email", None) or "Mavjud emas"
    else:
        sender_contact = "Ko'rsatilmagan (ixtiyoriy)"

    rating_str = ""
    if req.rating:
        stars = "⭐" * req.rating + "☆" * (5 - req.rating)
        rating_str = f"⭐ <b>Baho:</b> {stars} ({req.rating}/5)\n"

    now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M (UTC)")
    page_str = f"🌐 <b>Sahifa:</b> {html.escape(req.page_url)}\n" if req.page_url else ""

    # Telegram xabar matni (HTML formati)
    message_text = (
        f"💬 <b>Yangi Fikr-Mulohaza / Taklif:</b>\n\n"
        f"{rating_str}"
        f"👤 <b>Ism:</b> {html.escape(sender_name)}\n"
        f"📞 <b>Aloqa:</b> {html.escape(sender_contact)}\n"
        f"{page_str}"
        f"🕒 <b>Sana:</b> {now_str}\n\n"
        f"📝 <b>Fikr / Taklif:</b>\n"
        f"<i>{html.escape(req.comment.strip())}</i>"
    )

    api_base = telegram_api_base()
    send_url = f"{api_base}/bot{bot_token}/sendMessage"
    fallback_chat = "-1003827197120"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                send_url,
                json={
                    "chat_id": channel_id,
                    "text": message_text,
                    "parse_mode": "HTML",
                },
            )
            data = resp.json()
            if not data.get("ok"):
                logger.warning(f"Telegramga feedback yuborishda xatolik: {data}. Fallback chatga yuborilmoqda...")
                fb_resp = await client.post(
                    send_url,
                    json={
                        "chat_id": fallback_chat,
                        "text": message_text,
                        "parse_mode": "HTML",
                    },
                )
                if not fb_resp.json().get("ok"):
                    logger.error(f"Fallback chatga ham feedback yuborilmadi: {fb_resp.text}")
                    raise HTTPException(status_code=500, detail="Telegramga xabar yetkazilmadi.")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Feedback yuborishda kutilmagan xatolik: {e}")
        raise HTTPException(status_code=500, detail="Fikr yuborishda xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.")

    return {
        "success": True,
        "message": "Fikringiz uchun katta rahmat! Taklifingiz qabul qilindi.",
    }
