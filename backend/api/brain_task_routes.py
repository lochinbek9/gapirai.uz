"""«Miyya» vazifalari: AI takliflari va kanban doska. Barcha holat serverda saqlanadi."""
import uuid
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.api.brain_routes import get_db, require_brain_owner
from backend.models.brain import BrainColumn, BrainIdeaState, BrainTask, BrainTaskGeneration
from backend.models.database import User
from backend.services.brain_tasks import claim_generation, run_generations

router = APIRouter(prefix="/api/brain", tags=["brain"])

DEFAULT_COLUMNS = ("Rejada", "Jarayonda", "Bajarildi")


def _columns(db: Session, user_id: uuid.UUID) -> list[BrainColumn]:
    def load():
        return db.query(BrainColumn).filter(BrainColumn.user_id == user_id).order_by(BrainColumn.position).all()

    columns = load()
    if columns:
        return columns
    # Barqaror ID'lar: parallel ikki so'rov ustunlarni ikki marta yarata olmaydi
    for position, title in enumerate(DEFAULT_COLUMNS):
        db.add(BrainColumn(id=uuid.uuid5(user_id, f"brain-column-{position}"), user_id=user_id, title=title, position=position))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return load()


def _version(t: BrainTask) -> Optional[str]:
    """None -- tahrirlanmagan; aks holda hozir qaysi holat ko'rsatilayotgani."""
    if t.original_title is None:
        return None
    original = (t.title, t.description or "") == (t.original_title, t.original_description or "")
    return "original" if original else "edited"


def _task_dict(t: BrainTask) -> dict:
    return {
        "version": _version(t),
        "id": str(t.id), "analysis_id": str(t.analysis_id) if t.analysis_id else None, "idea_key": t.idea_key,
        "idea_title": t.idea_title, "analysis_title": t.analysis_title, "video_id": t.video_id,
        "timestamp": t.timestamp, "title": t.title, "description": t.description or "", "ai_model": t.ai_model,
        "column_id": str(t.column_id) if t.column_id else None, "position": t.position,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "duration_minutes": t.duration_minutes,
        "labels": t.labels or [], "checklist": t.checklist or [],
        "archived_at": t.archived_at.isoformat() if t.archived_at else None,
    }


def _own_task(db: Session, user: User, task_id: uuid.UUID) -> BrainTask:
    task = db.query(BrainTask).filter(BrainTask.id == task_id, BrainTask.user_id == user.id,
                                      BrainTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Vazifa topilmadi.")
    return task


def _own_column(db: Session, user: User, column_id: uuid.UUID) -> BrainColumn:
    column = db.query(BrainColumn).filter(BrainColumn.id == column_id, BrainColumn.user_id == user.id).first()
    if not column:
        raise HTTPException(status_code=404, detail="Ustun topilmadi.")
    return column


def _column_tasks(db: Session, user_id, column_id) -> list[BrainTask]:
    return (db.query(BrainTask)
            .filter(BrainTask.user_id == user_id, BrainTask.column_id == column_id, BrainTask.deleted_at.is_(None),
                    BrainTask.archived_at.is_(None))
            .order_by(BrainTask.position, BrainTask.created_at).all())


@router.get("/tasks")
def list_tasks(background: BackgroundTasks, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    columns = [{"id": str(c.id), "title": c.title} for c in _columns(db, user.id)]
    # Tanlangan, lekin takliflari hali yo'q (yoki osilib qolgan) fikrlar uchun generatsiya boshlanadi
    selected = [(s.analysis_id, s.idea_key) for s in db.query(BrainIdeaState)
                .filter(BrainIdeaState.user_id == user.id, BrainIdeaState.selected.is_(True)).all()]
    pending = [(a, k) for a, k in selected if claim_generation(db, user.id, a, k)]
    if pending:
        background.add_task(run_generations, user.id, pending)
    tasks = (db.query(BrainTask).filter(BrainTask.user_id == user.id, BrainTask.deleted_at.is_(None))
             .order_by(BrainTask.position, BrainTask.created_at).all())
    generations = db.query(BrainTaskGeneration).filter(BrainTaskGeneration.user_id == user.id).all()
    return {
        "columns": columns,
        "tasks": [_task_dict(t) for t in tasks],
        "generations": [{"analysis_id": str(g.analysis_id), "idea_key": g.idea_key, "status": g.status} for g in generations],
    }


@router.post("/ideas/{analysis_id}/{key}/generate")
def retry_generation(analysis_id: uuid.UUID, key: str, background: BackgroundTasks,
                     db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    if not db.get(BrainTaskGeneration, (user.id, analysis_id, key)):
        raise HTTPException(status_code=404, detail="Fikr topilmadi.")
    started = claim_generation(db, user.id, analysis_id, key, retry=True)
    if started:
        background.add_task(run_generations, user.id, [(analysis_id, key)])
    return {"started": started}


class ChecklistItem(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    done: bool = False


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    column_id: uuid.UUID


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    due_date: Optional[date] = None
    duration_minutes: Optional[int] = Field(default=None, ge=1, le=10080)
    labels: Optional[list[str]] = Field(default=None, max_length=10)
    checklist: Optional[list[ChecklistItem]] = Field(default=None, max_length=50)


class TaskMove(BaseModel):
    column_id: Optional[uuid.UUID] = None  # None -- takliflarga qaytarish
    index: Optional[int] = Field(default=None, ge=0)  # None -- ustun oxiriga


@router.post("/tasks")
def create_task(body: TaskCreate, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    _own_column(db, user, body.column_id)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="Sarlavha bo'sh.")
    task = BrainTask(user_id=user.id, title=title, column_id=body.column_id, description="", labels=[], checklist=[],
                     position=len(_column_tasks(db, user.id, body.column_id)))
    db.add(task)
    db.commit()
    return _task_dict(task)


@router.patch("/tasks/{task_id}")
def update_task(task_id: uuid.UUID, body: TaskUpdate, db: Session = Depends(get_db),
                user: User = Depends(require_brain_owner)) -> dict:
    task = _own_task(db, user, task_id)
    fields = body.model_fields_set
    before = (task.title, task.description or "")
    title = body.title.strip() if body.title and body.title.strip() else before[0]
    description = before[1] if body.description is None else body.description.strip()
    if (title, description) != before:
        if task.original_title is None:
            task.original_title, task.original_description = before
        task.title, task.description = title, description
        if (title, description) != (task.original_title, task.original_description or ""):
            task.edited_title, task.edited_description = title, description
    if "due_date" in fields:  # null -- muddatni olib tashlash
        task.due_date = body.due_date
    if "duration_minutes" in fields:  # null -- davomiylikni olib tashlash
        task.duration_minutes = body.duration_minutes
    if body.labels is not None:
        task.labels = list(dict.fromkeys(x.strip()[:30] for x in body.labels if x.strip()))
    if body.checklist is not None:
        task.checklist = [item.model_dump() for item in body.checklist]
    db.commit()
    return _task_dict(task)


class TaskVersion(BaseModel):
    version: Literal["original", "edited"]


@router.post("/tasks/{task_id}/version")
def switch_version(task_id: uuid.UUID, body: TaskVersion, db: Session = Depends(get_db),
                   user: User = Depends(require_brain_owner)) -> dict:
    """Asl va tahrirlangan matn orasida almashish -- ikkalasi ham saqlanib qoladi."""
    task = _own_task(db, user, task_id)
    title = task.original_title if body.version == "original" else task.edited_title
    if title is None:
        raise HTTPException(status_code=400, detail="Bu vazifa tahrirlanmagan.")
    task.title = title
    task.description = (task.original_description if body.version == "original" else task.edited_description) or ""
    db.commit()
    return _task_dict(task)


@router.post("/tasks/{task_id}/move")
def move_task(task_id: uuid.UUID, body: TaskMove, db: Session = Depends(get_db),
              user: User = Depends(require_brain_owner)) -> dict:
    task = _own_task(db, user, task_id)
    if task.archived_at:
        raise HTTPException(status_code=400, detail="Arxivdagi vazifani avval tiklang.")
    if body.column_id is not None:
        _own_column(db, user, body.column_id)
        others = [t for t in _column_tasks(db, user.id, body.column_id) if t.id != task.id]
        index = len(others) if body.index is None else min(body.index, len(others))
        others.insert(index, task)
        for position, item in enumerate(others):
            item.position = position
    task.column_id = body.column_id
    db.commit()
    return _task_dict(task)


@router.post("/tasks/{task_id}/archive")
def archive_task(task_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    task = _own_task(db, user, task_id)
    task.archived_at = task.archived_at or datetime.utcnow()
    db.commit()
    return _task_dict(task)


@router.post("/tasks/{task_id}/restore")
def restore_task(task_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    """Arxivdan oldingi joyiga: ustun oxiriga yoki takliflarga."""
    task = _own_task(db, user, task_id)
    if task.archived_at:
        if task.column_id:
            task.position = max((t.position for t in _column_tasks(db, user.id, task.column_id)), default=-1) + 1
        task.archived_at = None
        db.commit()
    return _task_dict(task)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    """Faqat arxivdan: yozuv bazada qoladi, egasiga boshqa ko'rinmaydi. Ikki bosqich -- tasodifan yo'qolmasin."""
    task = _own_task(db, user, task_id)
    if not task.archived_at:
        raise HTTPException(status_code=400, detail="Avval arxivga o'tkazing.")
    task.deleted_at = datetime.utcnow()
    db.commit()
    return {"deleted": True}


class ColumnBody(BaseModel):
    title: Optional[str] = Field(default=None, max_length=80)
    index: Optional[int] = Field(default=None, ge=0)


@router.post("/columns")
def create_column(body: ColumnBody, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    title = (body.title or "").strip()
    columns = _columns(db, user.id)
    if not title or len(columns) >= 12:
        raise HTTPException(status_code=422, detail="Ustun nomi bo'sh yoki ustunlar soni chegarada.")
    column = BrainColumn(user_id=user.id, title=title, position=len(columns))
    db.add(column)
    db.commit()
    return {"id": str(column.id), "title": column.title}


@router.patch("/columns/{column_id}")
def update_column(column_id: uuid.UUID, body: ColumnBody, db: Session = Depends(get_db),
                  user: User = Depends(require_brain_owner)) -> dict:
    column = _own_column(db, user, column_id)
    if body.title and body.title.strip():
        column.title = body.title.strip()
    if body.index is not None:
        others = [c for c in _columns(db, user.id) if c.id != column.id]
        others.insert(min(body.index, len(others)), column)
        for position, item in enumerate(others):
            item.position = position
    db.commit()
    return {"id": str(column.id), "title": column.title}


@router.delete("/columns/{column_id}")
def delete_column(column_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require_brain_owner)) -> dict:
    """Ustundagi vazifalar o'chmaydi -- qolgan birinchi ustunga ko'chadi."""
    column = _own_column(db, user, column_id)
    others = [c for c in _columns(db, user.id) if c.id != column.id]
    if not others:
        raise HTTPException(status_code=400, detail="Oxirgi ustunni o'chirib bo'lmaydi.")
    target = others[0]
    offset = len(_column_tasks(db, user.id, target.id))
    # o'chirilgan (deleted_at) vazifalar ham FK sababli ko'chiriladi
    for i, task in enumerate(db.query(BrainTask).filter(BrainTask.column_id == column.id).order_by(BrainTask.position).all()):
        task.column_id, task.position = target.id, offset + i
    db.flush()
    db.delete(column)
    for position, item in enumerate(others):
        item.position = position
    db.commit()
    return {"deleted": True}
