"""«Miyya» (second brain) bo'limi jadvallari.

Fikrlarning o'zi VideoAnalysis.key_points'da qoladi (yagona manba) -- bu yerda faqat egasining
tanlovi/izohi/teglari va YouTube'dan olingan kanal ma'lumoti saqlanadi.
"""
from datetime import datetime

import uuid

from sqlalchemy import JSON, Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.models.database import Base


class BrainIdeaState(Base):
    __tablename__ = "brain_idea_states"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    analysis_id = Column(UUID(as_uuid=True), ForeignKey("video_analyses.id", ondelete="CASCADE"), primary_key=True)
    idea_key = Column(String(16), primary_key=True)
    selected = Column(Boolean, nullable=False, default=False)
    hidden = Column(Boolean, nullable=False, default=False)
    note = Column(Text, nullable=False, default="")
    tags = Column(JSON, nullable=False, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BrainVideoMeta(Base):
    __tablename__ = "brain_video_meta"

    youtube_video_id = Column(String(20), primary_key=True)
    channel_name = Column(String(255), nullable=False)
    channel_url = Column(String(500), nullable=True)
    fetched_at = Column(DateTime, default=datetime.utcnow)


class BrainTaskGeneration(Base):
    """Fikr uchun AI vazifa takliflari bir marta yaratilganini qayd etadi (o'chirilganlar qayta tug'ilmaydi)."""
    __tablename__ = "brain_task_generations"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    analysis_id = Column(UUID(as_uuid=True), primary_key=True)
    idea_key = Column(String(16), primary_key=True)
    status = Column(String(10), nullable=False, default="pending")  # pending | done | failed
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BrainColumn(Base):
    __tablename__ = "brain_columns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(80), nullable=False)
    position = Column(Integer, nullable=False, default=0)


class BrainTask(Base):
    """Vazifa. Hayot yo'li: faol -> arxiv (archived_at) -> axlat (deleted_at; egasiga ko'rinmaydi, bazada qoladi).

    analysis_id'da ataylab FK yo'q: tahlil o'chsa yoki qayta qilinsa ham vazifa qoladi;
    manba ma'lumoti shu yerga nusxalanadi."""
    __tablename__ = "brain_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    analysis_id = Column(UUID(as_uuid=True), nullable=True)
    idea_key = Column(String(16), nullable=True)
    idea_title = Column(String(500), nullable=True)
    analysis_title = Column(String(500), nullable=True)
    video_id = Column(String(20), nullable=True)
    timestamp = Column(Float, nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False, default="")
    ai_model = Column(String(60), nullable=True)  # None -- qo'lda yaratilgan
    # Birinchi tahrirda to'ldiriladi: asl matn va oxirgi tahrir; title/description -- hozir ko'rsatilayotgani
    original_title = Column(String(200), nullable=True)
    original_description = Column(Text, nullable=True)
    edited_title = Column(String(200), nullable=True)
    edited_description = Column(Text, nullable=True)
    column_id = Column(UUID(as_uuid=True), ForeignKey("brain_columns.id"), nullable=True)  # None -- taklif
    position = Column(Integer, nullable=False, default=0)
    due_date = Column(Date, nullable=True)
    duration_minutes = Column(Integer, nullable=True)  # bir marta bajarishga ketadigan vaqt
    labels = Column(JSON, nullable=False, default=list)
    checklist = Column(JSON, nullable=False, default=list)  # [{"text","done"}]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    archived_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)
