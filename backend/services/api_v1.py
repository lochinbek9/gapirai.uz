"""Ommaviy API v1 uchun umumiy yordamchilar: dublaj obyektining JSON ko'rinishi,
webhook imzosi, webhook manzilini tekshirish va yetkazish (2026-11-21).

Webhook: job COMPLETED yoki FAILED bo'lganda (backend/workers/tasks.py) mijozning
`webhook_url` manziliga POST. Celery worker'ning 2 ta o'rni uzun videolar bilan band
bo'lishi mumkin, shuning uchun yetkazish alohida fon oqimida (thread) -- 3 urinish
(darhol, 30 s, 5 daqiqa). Holat api_job_requests'da; yetmasa mijoz
POST /v1/dubs/{id}/webhook/redeliver bilan qayta so'raydi yoki GET bilan holatni oladi.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import socket
import threading
import time
import uuid
from datetime import datetime
from urllib.parse import urlparse

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

WEBHOOK_TIMEOUT_S = 10
WEBHOOK_BACKOFF_S = (0, 30, 300)
SIGNATURE_HEADER = "GapirAI-Signature"
EVENT_HEADER = "GapirAI-Event"

_STATUS = {
    "PENDING": "queued", "AWAITING_PAYMENT": "queued",
    "DOWNLOADING": "processing", "TRANSCRIBING": "processing", "TRANSLATING": "processing",
    "SYNTHESIZING": "processing", "SYNCING": "processing", "MERGING": "processing",
    "COMPLETED": "completed", "FAILED": "failed",
}


def _raw_status(job) -> str:
    s = job.status
    return str(getattr(s, "value", s)).upper()


def public_status(job) -> str:
    return _STATUS.get(_raw_status(job), "processing")


def _iso(dt) -> str | None:
    return dt.replace(microsecond=0).isoformat() + "Z" if dt else None


def dub_to_dict(job, req=None) -> dict:
    """API v1 javobidagi dublaj obyekti. Fayl havolalari to'liq URL; ID (UUID4) kalit vazifasini
    bajaradi -- sayt va Chrome kengaytmasidagi /api/outputs/{id}/... bilan bir xil."""
    api = settings.PUBLIC_API_URL.rstrip("/")
    jid = str(job.id)
    status = public_status(job)
    mode = (req.mode if req is not None else None) or ("subtitles" if job.subtitle_only else "dub")
    outputs = None
    if status == "completed":
        outputs = {
            "srt_url": f"{api}/api/jobs/{jid}/subtitles.srt",
            "vtt_url": f"{api}/api/jobs/{jid}/subtitles.vtt?download=1",
            "text_url": f"{api}/api/jobs/{jid}/subtitles.txt",
        }
        if mode == "dub":
            outputs["video_url"] = f"{api}/api/outputs/{jid}/video"
            outputs["audio_url"] = f"{api}/api/outputs/{jid}/audio"
    out = {
        "id": jid,
        "object": "dub",
        "mode": mode,
        "status": status,
        "stage": _raw_status(job).lower(),
        "progress": round(float(job.progress or 0.0), 1),
        "title": job.video_title,
        "source_url": None if (job.youtube_url or "").startswith("upload://") else job.youtube_url,
        "duration_seconds": round(float(job.video_duration), 1) if job.video_duration else None,
        "voice_gender": job.voice_gender_setting or "auto",
        "created_at": _iso(job.created_at),
        "completed_at": _iso(getattr(job, "completed_at", None)) if status == "completed" else None,
        "outputs": outputs,
        "error": {"code": job.error_code or "PROCESSING_FAILED", "message": job.error_message or "Dublaj amalga oshmadi."}
        if status == "failed" else None,
    }
    if req is not None:
        out["webhook"] = {"url": req.webhook_url, "status": req.webhook_status,
                          "attempts": req.webhook_attempts} if req.webhook_url else None
    return out


# ---------- Webhook imzosi ----------

def webhook_secret(user_id) -> str:
    """Har foydalanuvchiga barqaror sir (bazada saqlanmaydi): SECRET_KEY'dan HMAC bilan hosil qilinadi."""
    digest = hmac.new(settings.SECRET_KEY.encode(), f"webhook:{user_id}".encode(), hashlib.sha256).hexdigest()
    return f"whsec_{digest[:48]}"


def sign_payload(secret: str, body: bytes, ts: int | None = None) -> str:
    ts = int(ts if ts is not None else time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


# ---------- Webhook manzilini tekshirish (SSRF) ----------

class WebhookUrlError(ValueError):
    pass


def validate_webhook_url(url: str, resolve: bool = True) -> str:
    """Faqat https va ommaviy IP: server ichki xizmatlariga (localhost, 172.18.x Docker,
    boshqa loyihalar portlari) so'rov yuborib bo'lmasin."""
    url = (url or "").strip()
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname:
        raise WebhookUrlError("webhook_url https:// bilan boshlanishi kerak.")
    if p.username or p.password:
        raise WebhookUrlError("webhook_url ichida login/parol bo'lmasligi kerak.")
    if len(url) > 1000:
        raise WebhookUrlError("webhook_url juda uzun.")
    if resolve:
        try:
            infos = socket.getaddrinfo(p.hostname, p.port or 443, proto=socket.IPPROTO_TCP)
        except socket.gaierror:
            raise WebhookUrlError("webhook_url domeni topilmadi.")
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if not ip.is_global:
                raise WebhookUrlError("webhook_url ichki (xususiy) manzilga ishora qilmasligi kerak.")
    return url


# ---------- Yetkazish ----------

def _deliver_once(req_id: uuid.UUID) -> bool:
    import httpx
    from backend.models.database import ApiJobRequest, DubbingJob, SessionLocal

    db = SessionLocal()
    try:
        req = db.get(ApiJobRequest, req_id)
        job = db.get(DubbingJob, req.job_id) if req else None
        if not req or not job or not req.webhook_url or req.webhook_status == "delivered":
            return True
        status = public_status(job)
        if status not in ("completed", "failed"):
            return True
        event = f"dub.{status}"
        body = json.dumps({"id": f"evt_{uuid.uuid4().hex}", "event": event,
                           "created_at": _iso(datetime.utcnow()), "data": dub_to_dict(job, req)},
                          ensure_ascii=False).encode()
        req.webhook_attempts = (req.webhook_attempts or 0) + 1
        error = None
        try:
            validate_webhook_url(req.webhook_url)
            r = httpx.post(req.webhook_url, content=body, timeout=WEBHOOK_TIMEOUT_S, follow_redirects=False,
                           headers={"Content-Type": "application/json", "User-Agent": "GapirAI-Webhook/1",
                                    EVENT_HEADER: event,
                                    SIGNATURE_HEADER: sign_payload(webhook_secret(req.user_id), body)})
            if not 200 <= r.status_code < 300:
                error = f"HTTP {r.status_code}"
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"[:300]
        if error is None:
            req.webhook_status, req.webhook_last_error, req.webhook_delivered_at = "delivered", None, datetime.utcnow()
        else:
            req.webhook_status, req.webhook_last_error = "failed", error
        db.commit()
        logger.info(f"[API webhook] job={job.id} {event} urinish={req.webhook_attempts} -> {error or 'OK'}")
        return error is None
    finally:
        db.close()


def _deliver_with_retries(req_id: uuid.UUID) -> None:
    for delay in WEBHOOK_BACKOFF_S:
        if delay:
            time.sleep(delay)
        try:
            if _deliver_once(req_id):
                return
        except Exception as exc:
            logger.warning(f"[API webhook] {req_id} yetkazishda kutilmagan xato: {exc}")


def start_delivery(req_id: uuid.UUID) -> None:
    threading.Thread(target=_deliver_with_retries, args=(req_id,), daemon=True, name=f"webhook-{req_id}").start()


def notify_api_job_finished(job_ids) -> None:
    """tasks.py job COMPLETED/FAILED bo'lganda chaqiradi. API orqali yaratilmagan job uchun
    bitta indeksli SELECT, xolos. Hech qachon xato ko'tarmaydi -- pipeline'ni buzmasin."""
    try:
        from backend.models.database import ApiJobRequest, SessionLocal
        ids = [uuid.UUID(str(j)) for j in (job_ids if isinstance(job_ids, (list, tuple, set)) else [job_ids])]
        if not ids:
            return
        db = SessionLocal()
        try:
            reqs = (db.query(ApiJobRequest.id)
                    .filter(ApiJobRequest.job_id.in_(ids), ApiJobRequest.webhook_url.isnot(None),
                            ApiJobRequest.webhook_status != "delivered")
                    .all())
        finally:
            db.close()
        for (rid,) in reqs:
            start_delivery(rid)
    except Exception as exc:
        logger.warning(f"[API webhook] notify xatosi ({job_ids}): {exc}")
