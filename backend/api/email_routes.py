"""Avtomatik xatlar: obunadan chiqish havolasi va admin uchun yangiliklar/statistika
(backend/services/lifecycle_emails.py)."""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.database import EmailLog, EmailOptOut, SiteNews, User, get_db
from backend.services.auth import get_current_admin_user
from backend.services.lifecycle_emails import run as run_lifecycle, verify_unsubscribe
from backend.services.timezone_utils import to_tashkent_iso

router = APIRouter(prefix="/api/email", tags=["email"])

_PAGE = """<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GapirAI.uz</title></head><body style="margin:0;background:#F6F7F9;font-family:system-ui,-apple-system,sans-serif;">
<div style="max-width:440px;margin:15vh auto 0;padding:32px 24px;background:#fff;border:1px solid #E5E7EB;border-radius:16px;">
<p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#0B0D12;">{title}</p>
<p style="margin:0 0 20px;color:#585E6A;font-size:15px;line-height:1.6;">{text}</p>
<a href="https://gapirai.uz/" style="color:#204CD6;font-size:15px;">gapirai.uz ga qaytish</a></div></body></html>"""


def _opt_out(db: Session, u: str, t: str) -> bool:
    try:
        user_id = uuid.UUID(u)
    except ValueError:
        return False
    if not verify_unsubscribe(str(user_id), t):
        return False
    if not db.get(EmailOptOut, user_id) and db.get(User, user_id):
        db.add(EmailOptOut(user_id=user_id))
        db.commit()
    return True


@router.get("/unsubscribe", response_class=HTMLResponse)
def unsubscribe_page(u: str = Query(...), t: str = Query(...), db: Session = Depends(get_db)):
    if not _opt_out(db, u, t):
        return HTMLResponse(_PAGE.format(title="Havola yaroqsiz", text="Havola noto'g'ri yoki eskirgan."), status_code=400)
    return HTMLResponse(_PAGE.format(
        title="Obunadan chiqdingiz",
        text="Endi sizga avtomatik va ommaviy xatlar yuborilmaydi. Dublaj tayyor bo'lgani haqidagi xabarlar va kirish kodlari kelaveradi.",
    ))


@router.post("/unsubscribe")
def unsubscribe_one_click(u: str = Query(...), t: str = Query(...), db: Session = Depends(get_db)):
    """RFC 8058 -- pochta dasturidagi "Obunadan chiqish" tugmasi shu yerga POST yuboradi."""
    if not _opt_out(db, u, t):
        raise HTTPException(status_code=400, detail="Havola yaroqsiz.")
    return {"success": True}


# --- Admin --------------------------------------------------------------------

class NewsIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=3, max_length=2000)
    link_url: str | None = Field(default=None, max_length=500)
    link_text: str | None = Field(default=None, max_length=60)


def _news_dict(n: SiteNews) -> dict:
    return {"id": n.id, "title": n.title, "body": n.body, "link_url": n.link_url, "link_text": n.link_text,
            "created_at": to_tashkent_iso(n.created_at)}


@router.get("/admin/news")
def list_news(db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    return [_news_dict(n) for n in db.query(SiteNews).order_by(SiteNews.created_at.desc()).limit(50)]


@router.post("/admin/news")
def create_news(payload: NewsIn, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    if payload.link_url and not payload.link_url.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="Havola https:// bilan boshlanishi kerak.")
    n = SiteNews(**payload.model_dump())
    db.add(n)
    db.commit()
    db.refresh(n)
    return _news_dict(n)


@router.delete("/admin/news/{news_id}")
def delete_news(news_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    n = db.get(SiteNews, news_id)
    if not n:
        raise HTTPException(status_code=404, detail="Topilmadi.")
    db.delete(n)
    db.commit()
    return {"success": True}


@router.get("/admin/stats")
def email_stats(db: Session = Depends(get_db), _: User = Depends(get_current_admin_user)):
    """Oxirgi 7 kun: qaysi xat nechta ketdi / xato bo'ldi; obunadan chiqqanlar; navbatda nechta."""
    since = datetime.utcnow() - timedelta(days=7)
    group = func.split_part(EmailLog.kind, ":", 1)
    rows = (
        db.query(group, EmailLog.ok, func.count(EmailLog.id))
        .filter(EmailLog.sent_at > since)
        .group_by(group, EmailLog.ok)
        .all()
    )
    by_kind: dict = {}
    for kind, ok, n in rows:
        by_kind.setdefault(kind, {"sent": 0, "failed": 0})["sent" if ok else "failed"] += n
    plan = run_lifecycle(db, dry_run=True)
    return {
        "last_7_days": by_kind,
        "opt_outs": db.query(func.count(EmailOptOut.user_id)).scalar() or 0,
        "queued_now": plan.get("planned", 0),
        "note": plan.get("reason", ""),
    }
