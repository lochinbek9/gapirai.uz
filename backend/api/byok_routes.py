"""BYOK sozlamalari -- faqat egasi (BRAIN_OWNER_EMAILS'dagi admin). Kalit qiymati hech qachon qaytarilmaydi."""
import re
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from backend.api.brain_routes import get_db, require_brain_owner
from backend.models.byok import ByokSetting
from backend.models.database import TTSUsageLog, User
from backend.services import byok, model_choice
from backend.services.gemini_quota_manager import GEMINI_TEXT_MODELS, get_paid_gemini_api_keys

router = APIRouter(prefix="/api/byok", tags=["byok"])

_CHECKS = {
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/models", lambda k: {"x-goog-api-key": k}),
    "groq": ("https://api.groq.com/openai/v1/models", lambda k: {"Authorization": f"Bearer {k}"}),
    "gapi": ("https://console.gapi.uz/v1/usage", lambda k: {"Authorization": f"Bearer {k}"}),
}


def check_key(provider: str, key: str) -> bool:
    url, headers = _CHECKS[provider]
    try:
        status = httpx.get(url, headers=headers(key), timeout=10.0).status_code
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Kalitni tekshirib bo'lmadi. Qayta urinib ko'ring.")
    return status in (200, 429)  # 429 -- kalit to'g'ri, faqat limit tugagan


def _view(row: Optional[ByokSetting]) -> dict:
    keys = {p: byok.decrypt(getattr(row, f"{p}_keys")) if row else [] for p in byok.PROVIDERS}
    paid = set(get_paid_gemini_api_keys())
    tiers = {p: {"free": sum(not (p == "gemini" and k in paid) for k in v),
                 "paid": sum(p == "gemini" and k in paid for k in v)} for p, v in keys.items()}
    return {"enabled": bool(row and row.enabled), "tiers": tiers, "models": GEMINI_TEXT_MODELS,
            "choices": model_choice.available(bool(keys["gapi"])),
            "providers": {p: [f"••••{k[-4:]}" for k in v] for p, v in keys.items()}}


def gapi_balance(key: str) -> Optional[float]:
    url, headers = _CHECKS["gapi"]
    try:
        return float(httpx.get(url, headers=headers(key), timeout=8.0).raise_for_status().json()["available_g"])
    except Exception:
        return None


def _gapi_spent(db: Session, user_id, since: datetime) -> dict:
    chars, cost, stt_g = (db.query(func.sum(TTSUsageLog.characters), func.sum(TTSUsageLog.estimated_cost),
                            func.sum(case((TTSUsageLog.provider == "gapi_stt", TTSUsageLog.estimated_cost), else_=0)))
                   .filter(TTSUsageLog.user_id == str(user_id), TTSUsageLog.provider.in_(("gapi", "gapi_stt")),
                           TTSUsageLog.cache_hit.is_(False), TTSUsageLog.created_at >= since).one())
    return {"chars": int(chars or 0), "g": round(float(cost or 0), 2), "stt_minutes": round(float(stt_g or 0), 1)}


@router.get("/usage")
def usage(db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    """Gemini/Groq: so'rovlar soni (bepul kalit -- narx 0). Gapi: sarflangan g va jonli qoldiq."""
    now = datetime.utcnow()
    today = (now + timedelta(hours=5)).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=5)
    keys = byok.decrypt(getattr(db.get(ByokSetting, user.id), "gapi_keys", None))
    result = {}
    for provider in ("gemini", "groq"):
        try:
            result[provider] = byok.request_counts(user.id, provider)
        except Exception:
            result[provider] = None
    balances = [b for b in (gapi_balance(k) for k in keys) if b is not None]
    result["gapi"] = {"today": _gapi_spent(db, user.id, today), "month": _gapi_spent(db, user.id, now - timedelta(days=30)),
                      "balance_g": round(sum(balances), 2) if balances else None}
    return result


class ByokUpdate(BaseModel):
    enabled: Optional[bool] = None
    gemini: Optional[str] = Field(default=None, max_length=4000)  # bo'sh satr -- o'chirish
    groq: Optional[str] = Field(default=None, max_length=4000)
    gapi: Optional[str] = Field(default=None, max_length=4000)


@router.get("")
def get_byok(db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    return _view(db.get(ByokSetting, user.id))


@router.put("")
def update_byok(body: ByokUpdate, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    changes = {}
    for provider in byok.PROVIDERS:
        raw = getattr(body, provider)
        if raw is None:
            continue
        keys = list(dict.fromkeys(k for k in re.split(r"[\s,]+", raw) if k))
        if len(keys) > 50 or any(not re.fullmatch(r"[A-Za-z0-9_\-.]{15,200}", k) for k in keys):
            raise HTTPException(status_code=422, detail="Kalit shakli noto'g'ri (ko'pi bilan 50 ta).")
        for key in keys:
            if not check_key(provider, key):
                raise HTTPException(status_code=422, detail=f"{provider.title()} kaliti ishlamadi (••••{key[-4:]}).")
        changes[provider] = keys
    row = db.get(ByokSetting, user.id)
    if row is None:
        row = ByokSetting(user_id=user.id, enabled=False)
        db.add(row)
    for provider, keys in changes.items():
        setattr(row, f"{provider}_keys", byok.encrypt(keys))
    has_keys = any(getattr(row, f"{p}_keys") for p in byok.PROVIDERS)
    if body.enabled and not has_keys:
        db.rollback()
        raise HTTPException(status_code=422, detail="Avval kamida bitta kalit saqlang.")
    if body.enabled is not None:
        row.enabled = body.enabled
    row.enabled = bool(row.enabled and has_keys)
    db.commit()
    return _view(row)
