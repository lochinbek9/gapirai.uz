"""Shaxsiy API kalitlar (Premiere Pro plagini uchun, 2026-10-28).

Kalit faqat yaratilganda bir marta ko'rsatiladi; keyin faqat nomi va sanalari.
API kalit bilan kelgan so'rov yangi kalit yarata yoki boshqasini bekor qila olmaydi.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.models.database import ApiKey, User, get_db
from backend.services.auth import create_api_key_token, get_current_user
from backend.services.rate_limiter import rate_limit
from backend.services.timezone_utils import to_tashkent_iso

router = APIRouter(prefix="/api/api-keys", tags=["api-keys"])

MAX_ACTIVE_KEYS = 5


class CreateKeyRequest(BaseModel):
    name: str = Field(default="Premiere Pro", min_length=1, max_length=80)


def _human_only(user: User) -> User:
    if getattr(user, "_via_api_key", False):
        raise HTTPException(status_code=403, detail="API kalitlarni faqat saytga kirib boshqarish mumkin.")
    return user


def _row(key: ApiKey) -> dict:
    return {
        "id": str(key.id),
        "name": key.name,
        "created_at": to_tashkent_iso(key.created_at),
        "last_used_at": to_tashkent_iso(key.last_used_at) if key.last_used_at else None,
    }


@router.get("")
def list_api_keys(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _human_only(user)
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None))
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return {"keys": [_row(k) for k in keys]}


@router.post("", status_code=201, dependencies=[Depends(rate_limit("api_key_create", 10, 3600))])
def create_api_key(req: CreateKeyRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _human_only(user)
    active = db.query(ApiKey).filter(ApiKey.user_id == user.id, ApiKey.revoked_at.is_(None)).count()
    if active >= MAX_ACTIVE_KEYS:
        raise HTTPException(status_code=400, detail=f"Ko'pi bilan {MAX_ACTIVE_KEYS} ta faol kalit bo'lishi mumkin. Eskisini bekor qiling.")
    key = ApiKey(id=uuid.uuid4(), user_id=user.id, name=req.name.strip())
    db.add(key)
    db.commit()
    return {**_row(key), "token": create_api_key_token(user.id, key.id)}


@router.delete("/{key_id}", status_code=204)
def revoke_api_key(key_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _human_only(user)
    key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user.id).first()
    if not key:
        raise HTTPException(status_code=404, detail="Kalit topilmadi.")
    if key.revoked_at is None:
        key.revoked_at = datetime.utcnow()
        db.commit()
