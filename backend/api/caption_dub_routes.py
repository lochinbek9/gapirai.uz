"""Kurs darslari (Coursera, ...) subtitridan o'zbekcha dublaj -- Chrome kengaytmasi uchun.

Kengaytma sahifadagi inglizcha subtitrni (cue'lar) yuboradi; video serverga yuklanmaydi.
Ish Celery'da (backend/workers/caption_dub_tasks.py), bu yerda faqat navbatga qo'yish va holat.
Daqiqa narxi dublyaj bilan bir xil: birinchi cue boshidan oxirgi cue oxirigacha bo'lgan vaqt.
Natija faqat egasiga ko'rinadi (pullik kurs kontenti -- ommaviy kesh yo'q).
"""
import hashlib
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.models.database import CaptionDub, User, get_db
from backend.services.auth import get_current_user
from backend.services.rate_limiter import rate_limit

router = APIRouter(prefix="/api/caption-dubs", tags=["caption-dubs"])

PLATFORMS = {"coursera"}
MAX_CUES = 4000
MAX_TOTAL_CHARS = 250_000
MAX_DURATION_MINUTES = 180


class Cue(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(ge=0)
    text: str = Field(min_length=1, max_length=2000)


class CaptionDubCreate(BaseModel):
    platform: str
    page_key: str = Field(min_length=1, max_length=300)
    page_url: str | None = Field(default=None, max_length=1000)
    title: str | None = Field(default=None, max_length=500)
    voice_gender: str = "auto"
    cues: list[Cue] = Field(min_length=1, max_length=MAX_CUES)


def _clean_cues(cues: list[Cue]) -> list[dict]:
    out = []
    for c in sorted(cues, key=lambda c: c.start):
        text = " ".join(c.text.split())
        if text and c.end > c.start:
            out.append({"start": round(c.start, 3), "end": round(c.end, 3), "text": text})
    return out


_SENTENCE_END = (".", "?", "!", "…", ".\"", "?\"", "!\"")
MERGE_MAX_GAP_S = 1.0
MERGE_MAX_SECONDS = 14.0


def merge_into_sentences(cues: list[dict]) -> list[dict]:
    """Coursera subtitri ekran qatorlariga bo'lingan ("and gaining a" ham alohida cue) --
    bo'lakma-bo'lak tarjima/ovoz uzuq chiqadi. Ketma-ket cue'lar gap tugaguncha (., ?, !),
    pauza > 1 s yoki 14 s dan oshguncha bitta segmentga birlashtiriladi."""
    out: list[dict] = []
    cur = None
    for c in cues:
        if cur and (c["start"] - cur["end"] > MERGE_MAX_GAP_S or c["end"] - cur["start"] > MERGE_MAX_SECONDS
                    or cur["text"].endswith(_SENTENCE_END)):
            out.append(cur)
            cur = None
        if cur is None:
            cur = dict(c)
        else:
            cur["end"] = max(cur["end"], c["end"])
            cur["text"] = f"{cur['text']} {c['text']}"
    if cur:
        out.append(cur)
    return out


def _to_dict(d: CaptionDub, with_cues: bool = False) -> dict:
    out = {
        "id": str(d.id), "status": d.status, "progress": d.progress or 0.0, "platform": d.platform,
        "page_key": d.page_key, "title": d.title, "duration_seconds": d.duration_seconds,
        "minutes_charged": d.minutes_charged, "error_message": d.error_message,
        "audio_url": f"/api/caption-dubs/{d.id}/audio" if d.status == "completed" else None,
    }
    if with_cues and d.status == "completed":
        out["cues_uz"] = d.translated or []
    return out


def _own(db: Session, dub_id: uuid.UUID, user: User) -> CaptionDub:
    d = db.get(CaptionDub, dub_id)
    if not d or d.user_id != user.id:
        raise HTTPException(status_code=404, detail="Dublaj topilmadi.")
    return d


@router.post("", dependencies=[Depends(rate_limit("caption_dub_create", 10, 600))])
def create_caption_dub(req: CaptionDubCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    from backend.services.plans import check_and_consume_quota, get_job_queue_v2, is_user_admin, refund_quota
    from backend.workers.caption_dub_tasks import process_caption_dub

    if req.platform not in PLATFORMS:
        raise HTTPException(status_code=400, detail="Bu platforma hozircha qoʻllab-quvvatlanmaydi.")
    voice = req.voice_gender if req.voice_gender in ("male", "female") else "auto"
    cues = merge_into_sentences(_clean_cues(req.cues))
    if not cues:
        raise HTTPException(status_code=400, detail="Subtitr boʻsh.")
    if sum(len(c["text"]) for c in cues) > MAX_TOTAL_CHARS:
        raise HTTPException(status_code=413, detail="Dars juda uzun.")
    duration = cues[-1]["end"] - cues[0]["start"]
    minutes = round(duration / 60.0, 2)
    admin = is_user_admin(db, user.id)
    if minutes > MAX_DURATION_MINUTES and not admin:
        raise HTTPException(status_code=400, detail=f"Dars juda uzun ({minutes:.0f} daqiqa).")

    source_key = hashlib.sha256(json.dumps([req.platform, voice, cues], ensure_ascii=False).encode()).hexdigest()
    existing = (
        db.query(CaptionDub)
        .filter(CaptionDub.user_id == user.id, CaptionDub.source_key == source_key, CaptionDub.status != "failed")
        .order_by(CaptionDub.created_at.desc())
        .first()
    )
    if existing:
        return _to_dict(existing, with_cues=True)  # o'sha darsni qayta ochish -- daqiqa qayta yechilmaydi

    charged = 0.0
    if not admin:
        covered, short = check_and_consume_quota(db, user.id, minutes)
        if not covered:
            raise HTTPException(status_code=402, detail=f"Daqiqa yetarli emas: yana {short} daqiqa kerak.")
        charged = minutes

    dub = CaptionDub(
        user_id=user.id, platform=req.platform, page_key=req.page_key, page_url=req.page_url,
        title=req.title, source_key=source_key, voice_gender=voice, cues=cues,
        duration_seconds=duration, minutes_charged=charged,
    )
    db.add(dub)
    db.commit()
    try:
        process_caption_dub.apply_async(args=[str(dub.id)], task_id=str(dub.id),
                                        queue=get_job_queue_v2(db, user.id, minutes))
    except Exception:
        if charged:
            refund_quota(db, user.id, charged)
        dub.status, dub.minutes_charged, dub.error_message = "failed", 0.0, "Navbatga qoʻyib boʻlmadi."
        db.commit()
        raise HTTPException(status_code=503, detail="Server band. Birozdan soʻng qayta urinib koʻring.")
    return _to_dict(dub)


@router.get("/by-page")
def caption_dub_by_page(platform: str = Query(...), page_key: str = Query(...),
                        db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    d = (
        db.query(CaptionDub)
        .filter(CaptionDub.user_id == user.id, CaptionDub.platform == platform, CaptionDub.page_key == page_key)
        .order_by(CaptionDub.created_at.desc())
        .first()
    )
    return {"dub": _to_dict(d, with_cues=True) if d else None}


@router.get("/{dub_id}")
def get_caption_dub(dub_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _to_dict(_own(db, dub_id, user), with_cues=True)


@router.get("/{dub_id}/audio")
def caption_dub_audio(dub_id: uuid.UUID, db: Session = Depends(get_db)):
    """Audio teg sarlavha yubora olmaydi -- /api/outputs/{id}/audio kabi, ID (UUID4) kalit vazifasini bajaradi."""
    d = db.get(CaptionDub, dub_id)
    if not d or d.status != "completed" or not d.audio_path or not Path(d.audio_path).exists():
        raise HTTPException(status_code=404, detail="Audio topilmadi.")
    return FileResponse(d.audio_path, media_type="audio/wav")
