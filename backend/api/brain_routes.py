"""«Miyya»: egasining o'z tahlillaridagi fikrlar -> graph va kartochkalar.

Faqat BRAIN_OWNER_EMAILS'dagi admin uchun. Hech qanday ma'lumot generatsiya qilinmaydi:
fikrlar bazadagi key_points'dan, kanal ma'lumoti YouTube oEmbed'dan olinadi.
"""
import hashlib
import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.brain import BrainIdeaState, BrainVideoMeta
from backend.models.database import AnalysisStatus, SessionLocal, User, VideoAnalysis
from backend.services.auth import get_current_user
from backend.services.brain_tasks import claim_generation, run_generations
from backend.services.job_creation import extract_youtube_video_id
from backend.services.timezone_utils import to_tashkent_iso

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/brain", tags=["brain"])

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
# Bitta so'rovda YouTube'dan olinadigan kanal ma'lumotlari chegarasi (qolgani keyingi ochilishda)
_MAX_META_FETCH = 12


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_brain_owner(user: User) -> bool:
    owners = {e.strip().lower() for e in get_settings().BRAIN_OWNER_EMAILS.split(",") if e.strip()}
    return getattr(user, "role", None) == "admin" and (user.email or "").lower() in owners


def require_brain_owner(current_user: User = Depends(get_current_user)) -> User:
    if not is_brain_owner(current_user):
        raise HTTPException(status_code=404, detail="Not Found")
    return current_user


def idea_key(point: dict) -> str:
    """Fikrning barqaror kaliti: qayta tahlilda matni o'zgarsa, eski tanlov boshqa fikrga o'tib ketmaydi."""
    raw = f"{point.get('timestamp')}|{point.get('title')}"
    return hashlib.sha1(raw.encode()).hexdigest()[:16]


def _points(analysis: VideoAnalysis) -> list[dict]:
    return [p for p in (analysis.key_points or []) if isinstance(p, dict) and p.get("title")]


def _fetch_oembed(video_id: str) -> Optional[dict]:
    try:
        resp = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
        name = str(data.get("author_name") or "").strip()
        if not name:
            return None
        url = str(data.get("author_url") or "")
        return {"name": name[:255], "url": url[:500] if url.startswith("https://www.youtube.com/") else None}
    except Exception as e:
        logger.warning(f"[BRAIN] kanal ma'lumoti olinmadi ({video_id}): {e}")
        return None


def _channel_map(db: Session, video_ids: set[str]) -> dict[str, dict]:
    if not video_ids:
        return {}
    rows = db.query(BrainVideoMeta).filter(BrainVideoMeta.youtube_video_id.in_(video_ids)).all()
    result = {r.youtube_video_id: {"name": r.channel_name, "url": r.channel_url} for r in rows}
    missing = sorted(video_ids - result.keys())[:_MAX_META_FETCH]
    if missing:
        with ThreadPoolExecutor(max_workers=6) as pool:
            for video_id, meta in zip(missing, pool.map(_fetch_oembed, missing)):
                if meta:
                    db.merge(BrainVideoMeta(youtube_video_id=video_id, channel_name=meta["name"], channel_url=meta["url"]))
                    result[video_id] = meta
        try:
            db.commit()
        except Exception as e:  # parallel so'rov shu yozuvni qo'shib ulgurgan
            db.rollback()
            logger.warning(f"[BRAIN] kanal keshi saqlanmadi: {e}")
    return result


def _video_id(analysis: VideoAnalysis) -> Optional[str]:
    if analysis.source_type == "document":
        return None
    vid = analysis.youtube_video_id or extract_youtube_video_id(analysis.youtube_url or "")
    return vid if vid and _VIDEO_ID_RE.match(vid) else None


@router.get("/access")
def brain_access(current_user: User = Depends(get_current_user)) -> dict:
    return {"allowed": is_brain_owner(current_user)}


@router.get("")
def get_brain(db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    analyses = (
        db.query(VideoAnalysis)
        .filter(VideoAnalysis.user_id == user.id, VideoAnalysis.status == AnalysisStatus.COMPLETED)
        .order_by(VideoAnalysis.created_at.desc())
        .all()
    )
    states = {
        (s.analysis_id, s.idea_key): s
        for s in db.query(BrainIdeaState).filter(BrainIdeaState.user_id == user.id).all()
    }
    # ORM obyektlaridan kerakli qiymatlar commit'dan (kanal keshi) oldin olinadi
    items = []
    for a in analyses:
        ideas = []
        seen: set[str] = set()
        for p in _points(a):
            key = idea_key(p)
            if key in seen:
                continue
            seen.add(key)
            state = states.get((a.id, key))
            ideas.append({
                "key": key,
                "title": p["title"],
                "description": p.get("description") or "",
                "timestamp": p.get("timestamp"),
                "selected": bool(state and state.selected),
                "hidden": bool(state and state.hidden),
                "note": state.note if state else "",
                "tags": list(state.tags or []) if state else [],
            })
        summary = a.summary if isinstance(a.summary, dict) else {}
        items.append({
            "analysis_id": str(a.id),
            "source_type": a.source_type,
            "video_id": _video_id(a),
            "url": a.youtube_url if a.source_type != "document" else None,
            "title": a.video_title or a.document_name,
            "thumbnail": a.video_thumbnail,
            "duration": a.video_duration,
            "pages": a.document_pages,
            "video_language": a.video_language,
            "language": a.language,
            "created_at": to_tashkent_iso(a.created_at) if a.created_at else None,
            "summary": summary.get("short") or "",
            "chapters_count": len(a.chapters or []),
            "ideas": ideas,
        })
    channels = _channel_map(db, {i["video_id"] for i in items if i["video_id"]})
    for item in items:
        item["channel"] = channels.get(item["video_id"])
    return {"analyses": items}


class IdeaUpdate(BaseModel):
    selected: Optional[bool] = None
    hidden: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=5000)
    tags: Optional[list[str]] = Field(default=None, max_length=12)


def _clean_tags(tags: list[str]) -> list[str]:
    cleaned: list[str] = []
    for tag in tags:
        t = tag.strip().lstrip("#").strip().lower()[:30]
        if t and t not in cleaned:
            cleaned.append(t)
    return cleaned


@router.post("/analyses/{analysis_id}/select-all")
def select_all_ideas(
    analysis_id: uuid.UUID,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_brain_owner),
) -> dict:
    """Tahlilning yashirilmagan barcha fikrlarini tanlaydi va vazifa takliflarini fonda boshlaydi."""
    analysis = db.query(VideoAnalysis).filter(
        VideoAnalysis.id == analysis_id, VideoAnalysis.user_id == user.id,
        VideoAnalysis.status == AnalysisStatus.COMPLETED,
    ).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Tahlil topilmadi.")
    states = {s.idea_key: s for s in db.query(BrainIdeaState).filter(
        BrainIdeaState.user_id == user.id, BrainIdeaState.analysis_id == analysis_id).all()}
    keys = []
    for key in dict.fromkeys(idea_key(p) for p in _points(analysis)):
        state = states.get(key)
        if state is None:
            state = BrainIdeaState(user_id=user.id, analysis_id=analysis_id, idea_key=key,
                                   selected=False, hidden=False, note="", tags=[])
            db.add(state)
        if not state.hidden:
            state.selected = True
            keys.append(key)
    db.commit()
    # Avval xato bo'lganlari qayta uriniladi; tayyorlari takrorlanmaydi
    started = [(analysis_id, k) for k in keys if claim_generation(db, user.id, analysis_id, k, retry=True)]
    if started:
        background.add_task(run_generations, user.id, started)
    return {"selected": keys, "started": len(started)}


@router.put("/ideas/{analysis_id}/{key}")
def update_idea(
    analysis_id: uuid.UUID,
    key: str,
    body: IdeaUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_brain_owner),
) -> dict:
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.id == analysis_id, VideoAnalysis.user_id == user.id).first()
    if not analysis or key not in {idea_key(p) for p in _points(analysis)}:
        raise HTTPException(status_code=404, detail="Fikr topilmadi.")
    state = db.get(BrainIdeaState, (user.id, analysis_id, key))
    if not state:
        state = BrainIdeaState(user_id=user.id, analysis_id=analysis_id, idea_key=key,
                               selected=False, hidden=False, note="", tags=[])
        db.add(state)
    if body.selected is not None:
        state.selected = body.selected
    if body.hidden is not None:
        state.hidden = body.hidden
    if body.note is not None:
        state.note = body.note.strip()
    if body.tags is not None:
        state.tags = _clean_tags(body.tags)
    db.commit()
    result = {"selected": state.selected, "hidden": state.hidden, "note": state.note, "tags": state.tags}
    # Tanlanganlarga qo'shildi -- vazifa takliflari fonda darhol tayyorlanadi (har fikrga bir marta)
    if body.selected and claim_generation(db, user.id, analysis_id, key):
        background.add_task(run_generations, user.id, [(analysis_id, key)])
    return result
