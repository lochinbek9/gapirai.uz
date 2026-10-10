"""PWA Web Push obuna endpointlari (backend/services/push_service.py)."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from backend.models.database import get_db, User, PushSubscription
from backend.services.auth import get_current_user
from backend.services.push_service import push_enabled
from backend.config import get_settings

router = APIRouter(prefix="/api/push", tags=["push"])
settings = get_settings()


@router.get("/vapid-public-key")
def vapid_public_key() -> dict:
    """Frontend push obunasini yaratish uchun shu kalitni ishlatadi. Bo'sh
    bo'lsa frontend push tugmasini umuman ko'rsatmaydi."""
    return {"key": settings.VAPID_PUBLIC_KEY if push_enabled() else ""}


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}
    user_agent: str | None = None


@router.post("/subscribe")
def subscribe(
    req: SubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    p256dh = (req.keys or {}).get("p256dh")
    auth = (req.keys or {}).get("auth")
    if not (req.endpoint and p256dh and auth):
        return {"success": False, "detail": "endpoint/keys to'liq emas"}

    existing = db.query(PushSubscription).filter(PushSubscription.endpoint == req.endpoint).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = (req.user_agent or "")[:300] or existing.user_agent
        db.commit()
        return {"success": True}

    db.add(PushSubscription(
        user_id=current_user.id, endpoint=req.endpoint,
        p256dh=p256dh, auth=auth, user_agent=(req.user_agent or "")[:300] or None,
    ))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # race: boshqa so'rov shu endpoint'ni qo'shib ulgurdi
    return {"success": True}


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
def unsubscribe(
    req: UnsubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    db.query(PushSubscription).filter(
        PushSubscription.endpoint == req.endpoint,
        PushSubscription.user_id == current_user.id,
    ).delete()
    db.commit()
    return {"success": True}
