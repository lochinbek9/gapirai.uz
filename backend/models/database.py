from sqlalchemy import create_engine, Column, String, DateTime, Enum, Float, Text, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
import enum
from datetime import datetime
from backend.config import get_settings

settings = get_settings()

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class JobStatus(str, enum.Enum):
    PENDING = "pending"
    AWAITING_PAYMENT = "awaiting_payment"
    DOWNLOADING = "downloading"
    TRANSCRIBING = "transcribing"
    TRANSLATING = "translating"
    SYNTHESIZING = "synthesizing"
    SYNCING = "syncing"
    MERGING = "merging"
    COMPLETED = "completed"
    FAILED = "failed"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    jobs = relationship("DubbingJob", back_populates="user", lazy="dynamic")


class DubbingJob(Base):
    __tablename__ = "dubbing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    youtube_url = Column(String(500), nullable=False)
    video_title = Column(String(500))
    video_duration = Column(Float)
    video_thumbnail = Column(String(500))
    speaker_gender = Column(String(10))       # GPT aniqlagan: male / female
    voice_gender_setting = Column(String(10), default="auto")  # foydalanuvchi tanlagan: auto/male/female
    status = Column(Enum(JobStatus), default=JobStatus.PENDING, nullable=False)
    progress = Column(Float, default=0.0)
    status_message = Column(String(255))

    transcript_text = Column(Text)
    translated_text = Column(Text)
    srt_content = Column(Text)
    uzbek_srt_content = Column(Text)   # O'zbekcha subtitrlar (WebVTT format)

    original_video_path = Column(String(500))
    dubbed_audio_path = Column(String(500))
    output_video_path = Column(String(500))
    output_video_url = Column(String(500))

    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime)

    user = relationship("User", back_populates="jobs")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from sqlalchemy import text
    try:
        connection = engine.connect()
        # Postgresql enum alter value
        connection.execute(text("ALTER TYPE jobstatus ADD VALUE 'awaiting_payment'"))
        connection.commit()
    except Exception:
        pass

    try:
        connection = engine.connect()
        connection.execute(text("ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL"))
        connection.commit()
    except Exception:
        pass
    Base.metadata.create_all(bind=engine)
