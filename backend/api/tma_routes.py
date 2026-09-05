"""Telegram Mini App auth -- `initData`ni tekshirib, mavjud tizim JWT'sini
qaytaradi. Shundan keyin Mini App barcha `/api/*` endpointlarni oddiy
`Authorization: Bearer <token>` bilan chaqiradi (get_current_user
o'zgarishsiz ishlaydi) -- alohida TMA-only endpoint kerak emas.
"""
import logging

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import User, get_db
from backend.services.auth import create_access_token
from backend.services.tma_auth import verify_init_data, InitDataError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tma", tags=["telegram-mini-app"])


class TmaAuthRequest(BaseModel):
    init_data: str


@router.post("/auth")
def tma_auth(body: TmaAuthRequest, db: Session = Depends(get_db)) -> dict:
    """`window.Telegram.WebApp.initData`ni tekshiradi. Muvaffaqiyatli bo'lsa
    -- shu Telegram hisobiga bog'langan User'ni topadi yoki yaratadi va
    tizim JWT'sini qaytaradi (web bilan bir xil token)."""
    try:
        data = verify_init_data(body.init_data)
    except InitDataError as e:
        raise HTTPException(status_code=401, detail=f"Telegram initData yaroqsiz: {e}")

    tg_user = data.get("user") or {}
    tg_id = tg_user.get("id")
    if not tg_id:
        raise HTTPException(status_code=401, detail="Telegram foydalanuvchi ID'si yo'q.")

    chat_id = str(tg_id)
    # Bot private chat'da telegram_chat_id'ni aynan user id'ga o'rnatadi
    # (backend/telegram_bot.py: handle_contact) -- shuning uchun botni
    # ilgari ishlatgan foydalanuvchi bu yerda o'sha hisobiga tushadi.
    user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
    if not user:
        name = (tg_user.get("first_name") or "").strip()
        if tg_user.get("last_name"):
            name = f"{name} {tg_user['last_name']}".strip()
        user = User(
            name=name or f"Telegram {tg_id}",
            telegram_chat_id=chat_id,
            auth_provider="telegram",
            is_verified=True,  # bot tokeni bilan imzolangan initData -- ishonch tasdiqlangan
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"TMA: yangi foydalanuvchi yaratildi tg_id={tg_id}")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hisob faol emas.")

    token = create_access_token(str(user.id), user.email or "")
    return {
        "token": token,
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "phone": user.phone,
            "has_phone": bool(user.phone),
        },
    }
