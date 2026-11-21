"""GapirAI ommaviy API v1 -- dublaj va subtitr (2026-11-21).

Kirish: `Authorization: Bearer <API kalit>` (saytdagi /developers sahifasida yaratiladi;
sayt sessiya tokeni ham ishlaydi). Narx: saytdagi bilan bir xil -- video daqiqasi
foydalanuvchining daqiqa balansidan yechiladi.

Ichki /api/jobs endpointlari sayt bilan birga o'zgaradi; /v1 esa mijozlar uchun barqaror
shartnoma: o'zgarmas maydon nomlari, inglizcha xato kodlari ({"error": {"code", "message"}}),
Idempotency-Key va webhook. Ish mantig'i bitta joyda -- job_creation.create_dubbing_job va
routes.upload_job_file chaqiriladi.
"""
from __future__ import annotations

import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.database import ApiJobRequest, DubbingJob, User, get_db
from backend.services import api_v1
from backend.services.auth import get_current_user
from backend.services.rate_limiter import rate_limit

router = APIRouter(prefix="/v1", tags=["api-v1"])


class V1Error(Exception):
    def __init__(self, status: int, code: str, message: str, extra: dict | None = None, headers: dict | None = None):
        self.status, self.code, self.message, self.extra, self.headers = status, code, message, extra or {}, headers


async def v1_error_handler(_request: Request, exc: V1Error) -> JSONResponse:
    return JSONResponse(status_code=exc.status, headers=exc.headers,
                        content={"error": {"code": exc.code, "message": exc.message, **exc.extra}})


_OUTCOME_ERRORS = {
    "invalid_url": (400, "invalid_source_url", "Hozircha faqat YouTube havolasi qabul qilinadi."),
    "fetch_error": (400, "source_unavailable", "Video ma'lumotlarini olib bo'lmadi."),
    "bad_file": (400, "invalid_file", "Video faylini o'qib bo'lmadi."),
    "blocked": (403, "content_blocked", "Video kontent siyosatiga mos kelmadi."),
    "music_copyright": (400, "content_blocked", "Mualliflik huquqi bilan himoyalangan musiqani dublaj qilib bo'lmaydi."),
    "too_long": (400, "video_too_long", "Video juda uzun."),
    "insufficient_minutes": (402, "insufficient_minutes", "Daqiqa balansi yetarli emas."),
    "daily_limit": (429, "daily_limit", "Kunlik ishlar chegarasiga yetildi."),
    "active_limit": (429, "too_many_active_jobs", "Bir vaqtda ishlanayotgan videolar chegarasiga yetildi."),
    "queue_full": (503, "server_busy", "Server band. Birozdan so'ng qayta urinib ko'ring."),
}
_HTTP_CODES = {400: "invalid_request", 401: "unauthorized", 402: "insufficient_minutes", 403: "forbidden",
               404: "not_found", 411: "length_required", 413: "file_too_large", 415: "unsupported_media_type",
               429: "rate_limited", 503: "server_busy"}


def _raise_outcome(result) -> None:
    if result.outcome in ("queued", "ready"):
        return
    status, code, message = _OUTCOME_ERRORS.get(result.outcome, (500, "internal_error", "Kutilmagan holat."))
    extra = {}
    if result.outcome == "insufficient_minutes" and result.minutes_short is not None:
        extra["minutes_short"] = result.minutes_short
    if result.error_detail and result.outcome in ("fetch_error", "blocked", "music_copyright"):
        message = f"{message} {result.error_detail}"[:500]
    raise V1Error(status, code, message, extra, {"Retry-After": "300"} if status == 503 else None)


def _from_http(exc: HTTPException) -> V1Error:
    detail = exc.detail
    if isinstance(detail, dict):
        message = detail.get("message") or str(detail)
        extra = {"minutes_short": detail["minutes_short"]} if detail.get("minutes_short") is not None else {}
    else:
        message, extra = str(detail), {}
    return V1Error(exc.status_code, _HTTP_CODES.get(exc.status_code, "error"), message, extra, exc.headers)


Mode = Literal["dub", "subtitles"]


class CreateDubRequest(BaseModel):
    source_url: str = Field(min_length=8, max_length=500, description="YouTube havolasi")
    mode: Mode = "dub"
    voice_gender: Literal["auto", "male", "female"] = "auto"
    source_language: Literal["auto", "uz"] = "auto"
    webhook_url: Optional[str] = Field(default=None, max_length=1000)


def _check_webhook(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        return api_v1.validate_webhook_url(url)
    except api_v1.WebhookUrlError as e:
        raise V1Error(400, "invalid_webhook_url", str(e))


def _check_language(mode: str, source_language: str) -> Optional[str]:
    if source_language == "uz":
        if mode != "subtitles":
            raise V1Error(400, "invalid_request", "source_language=uz faqat mode=subtitles bilan ishlaydi.")
        return "uz"
    return None


def _check_idem(key: Optional[str]) -> Optional[str]:
    if key is None:
        return None
    key = key.strip()
    if not 1 <= len(key) <= 128:
        raise V1Error(400, "invalid_idempotency_key", "Idempotency-Key 1-128 belgidan iborat bo'lishi kerak.")
    return key


def _existing(db: Session, user: User, idem: Optional[str]) -> Optional[dict]:
    if not idem:
        return None
    req = db.query(ApiJobRequest).filter(ApiJobRequest.user_id == user.id, ApiJobRequest.idempotency_key == idem).first()
    if not req:
        return None
    job = db.get(DubbingJob, req.job_id)
    return api_v1.dub_to_dict(job, req) if job else None


def _api_key_uuid(user: User) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(getattr(user, "_api_key_id", None))) if getattr(user, "_api_key_id", None) else None
    except ValueError:
        return None


def _record(db: Session, user: User, job_id: str, mode: str, idem: Optional[str], webhook: Optional[str]) -> dict:
    req = ApiJobRequest(user_id=user.id, api_key_id=_api_key_uuid(user), job_id=uuid.UUID(job_id), mode=mode,
                        idempotency_key=idem, webhook_url=webhook, webhook_status="pending" if webhook else None)
    db.add(req)
    try:
        db.commit()
    except IntegrityError:  # parallel so'rov xuddi shu Idempotency-Key bilan -- birinchisi g'olib
        db.rollback()
        existing = _existing(db, user, idem)
        if existing:
            return existing
        raise
    job = db.get(DubbingJob, req.job_id)
    if webhook and api_v1.public_status(job) in ("completed", "failed"):
        api_v1.notify_api_job_finished(job.id)  # keshdan darhol tayyor
    return api_v1.dub_to_dict(job, req)


@router.post("/dubs", status_code=201, dependencies=[Depends(rate_limit("v1_create", 60, 600))])
async def create_dub(
    body: CreateDubRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """YouTube videosini o'zbekchaga dublaj (mode=dub) yoki subtitr (mode=subtitles) qilish."""
    from backend.services.job_creation import create_dubbing_job

    idem = _check_idem(idempotency_key)
    if (prev := _existing(db, user, idem)) is not None:
        return JSONResponse(status_code=200, content=prev)
    webhook = _check_webhook(body.webhook_url)
    lang = _check_language(body.mode, body.source_language)
    result = await create_dubbing_job(db, user, body.source_url.strip(), body.voice_gender,
                                      subtitle_only=body.mode == "subtitles", source_language=lang)
    _raise_outcome(result)
    return _record(db, user, result.job_id, body.mode, idem, webhook)


@router.post("/dubs/upload", status_code=201, dependencies=[Depends(rate_limit("v1_upload", 30, 600))])
async def upload_dub(
    request: Request,
    mode: Mode = Query("dub"),
    voice_gender: Literal["auto", "male", "female"] = Query("auto"),
    source_language: Literal["auto", "uz"] = Query("auto"),
    webhook_url: Optional[str] = Query(None, max_length=1000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
):
    """Video fayldan dublaj/subtitr. Tana -- xom fayl baytlari (multipart emas):
    `Content-Type: video/mp4`, `Content-Length`, ixtiyoriy `X-File-Name`."""
    from backend.api.routes import upload_job_file

    idem = _check_idem(idempotency_key)
    if (prev := _existing(db, user, idem)) is not None:
        return JSONResponse(status_code=200, content=prev)
    webhook = _check_webhook(webhook_url)
    _check_language(mode, source_language)
    user_id = user.id
    try:
        res = await upload_job_file(request, subtitle_only=mode == "subtitles", voice_gender=voice_gender,
                                    source_language=source_language, tts_provider=None, voice_name=None,
                                    db=db, current_user=user)
    except HTTPException as exc:
        raise _from_http(exc)
    # upload_job_file uzoq yuklash oldidan sessiyani yopadi -- yangisi bilan yozamiz
    from backend.models.database import SessionLocal
    db2 = SessionLocal()
    try:
        u = db2.get(User, user_id)
        u._api_key_id = getattr(user, "_api_key_id", None)
        return _record(db2, u, res["job_id"], mode, idem, webhook)
    finally:
        db2.close()


def _own_job(db: Session, user: User, dub_id: uuid.UUID) -> tuple[DubbingJob, Optional[ApiJobRequest]]:
    job = db.get(DubbingJob, dub_id)
    if not job or job.user_id != user.id:
        raise V1Error(404, "not_found", "Dublaj topilmadi.")
    req = db.query(ApiJobRequest).filter(ApiJobRequest.job_id == job.id).first()
    return job, req


@router.get("/dubs/{dub_id}", dependencies=[Depends(rate_limit("v1_get", 600, 60))])
def get_dub(dub_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job, req = _own_job(db, user, dub_id)
    return api_v1.dub_to_dict(job, req)


@router.get("/dubs", dependencies=[Depends(rate_limit("v1_list", 120, 60))])
def list_dubs(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
              db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """API orqali yaratilgan dublajlar, yangisi birinchi."""
    rows = (db.query(ApiJobRequest, DubbingJob)
            .join(DubbingJob, DubbingJob.id == ApiJobRequest.job_id)
            .filter(ApiJobRequest.user_id == user.id)
            .order_by(ApiJobRequest.created_at.desc())
            .offset(offset).limit(limit).all())
    return {"object": "list", "data": [api_v1.dub_to_dict(job, req) for req, job in rows],
            "limit": limit, "offset": offset}


@router.post("/dubs/{dub_id}/webhook/redeliver", status_code=202, dependencies=[Depends(rate_limit("v1_redeliver", 20, 600))])
def redeliver_webhook(dub_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    job, req = _own_job(db, user, dub_id)
    if not req or not req.webhook_url:
        raise V1Error(400, "no_webhook", "Bu dublaj uchun webhook_url berilmagan.")
    if api_v1.public_status(job) not in ("completed", "failed"):
        raise V1Error(409, "not_finished", "Dublaj hali tugamagan -- tugaganda webhook o'zi yuboriladi.")
    req.webhook_status = "pending"
    db.commit()
    api_v1.start_delivery(req.id)
    return {"status": "scheduled"}


@router.get("/balance")
def balance(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from backend.services.plans import get_minute_balance
    b = get_minute_balance(db, user.id)
    return {"object": "balance", "minutes_available": round(float(b.get("total_available", 0.0)), 2),
            "monthly_remaining": round(float(b.get("monthly_remaining", 0.0)), 2),
            "purchased_minutes": round(float(b.get("purchased", 0.0)), 2),
            "unlimited": bool(b.get("is_unlimited", False))}


@router.get("/webhook-secret")
def get_webhook_secret(user: User = Depends(get_current_user)):
    """Webhook imzosini tekshirish uchun sir (GapirAI-Signature: t=..,v1=HMAC_SHA256(sir, "t.body"))."""
    return {"secret": api_v1.webhook_secret(user.id)}
