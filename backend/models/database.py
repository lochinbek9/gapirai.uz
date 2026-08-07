from sqlalchemy import create_engine, Column, String, DateTime, Enum, Float, Integer, Text, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
import enum
from datetime import datetime
from backend.config import get_settings

settings = get_settings()

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class JobStatus(str, enum.Enum):
    PENDING = "PENDING"
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    DOWNLOADING = "DOWNLOADING"
    TRANSCRIBING = "TRANSCRIBING"
    TRANSLATING = "TRANSLATING"
    SYNTHESIZING = "SYNTHESIZING"
    SYNCING = "SYNCING"
    MERGING = "MERGING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_code = Column(String(6))
    verification_code_expires_at = Column(DateTime)
    role = Column(String(20), nullable=False, default="user")  # "user" | "admin"
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
    status = Column(Enum(JobStatus, values_callable=lambda obj: [e.value for e in obj]), default=JobStatus.PENDING, nullable=False)
    progress = Column(Float, default=0.0)
    status_message = Column(String(255))

    transcript_text = Column(Text)
    translated_text = Column(Text)
    srt_content = Column(Text)
    uzbek_srt_content = Column(Text)   # O'zbekcha subtitrlar (WebVTT format)

    # Checkpoint uchun: har bosqichning xom (timestamp'li) segment ro'yxati.
    # Pipeline qayta ishga tushganda (crash/retry) shu maydonlar orqali
    # qaysi bosqichlar allaqachon bajarilganini bilib, ulardan o'tkazib
    # yuboriladi — qimmat/uzoq bosqichlar (transkripsiya, tarjima, LLM
    # nutq optimizatsiyasi) qayta bajarilmaydi.
    transcript_segments = Column(JSONB, nullable=True)
    translated_segments = Column(JSONB, nullable=True)
    speech_segments = Column(JSONB, nullable=True)

    original_video_path = Column(String(500))
    dubbed_audio_path = Column(String(500))
    output_video_path = Column(String(500))
    output_video_url = Column(String(500))

    error_message = Column(Text)
    error_code = Column(String(50), nullable=True)  # masalan: VIDEO_UNAVAILABLE, TRANSCRIBE_FAILED, TIMEOUT
    rating = Column(Integer, nullable=True)
    feedback_comment = Column(Text, nullable=True)
    feedback_created_at = Column(DateTime, nullable=True)
    feedback_voice_ok = Column(Boolean, nullable=True)
    feedback_translation_ok = Column(Boolean, nullable=True)
    feedback_speed_ok = Column(Boolean, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime)

    user = relationship("User", back_populates="jobs")


class PronunciationMemory(Base):
    """
    O'rganilgan talaffuz tuzatishlari: term -> Azure/Edge TTS uchun og'zaki shakl.
    Static PRONUNCIATION_DICT'ni ustidan yozadi (backend/services/speech_optimizer.py).
    Hozircha faqat o'qish uchun ishlatiladi; yozish yo'li (avtomatik yoki qo'lda
    talaffuz QA'sidan) keyingi bosqichda qo'shiladi.
    """
    __tablename__ = "pronunciation_memory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    term = Column(String(255), unique=True, nullable=False, index=True)
    spoken_form = Column(String(500), nullable=False)
    source = Column(String(20), default="manual")  # manual | qa_auto
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from sqlalchemy import text
    try:
        with engine.connect() as connection:
            for val in ['awaiting_payment', 'AWAITING_PAYMENT']:
                try:
                    connection.execute(text(f"ALTER TYPE jobstatus ADD VALUE '{val}'"))
                    connection.commit()
                except Exception:
                    pass
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE payments ALTER COLUMN user_id DROP NOT NULL"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE payments ALTER COLUMN click_prepare_id TYPE BIGINT"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS rating INT"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS feedback_comment TEXT"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS feedback_created_at TIMESTAMP"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS feedback_voice_ok BOOLEAN"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS feedback_translation_ok BOOLEAN"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS feedback_speed_ok BOOLEAN"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(6)"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_expires_at TIMESTAMP"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS transcript_segments JSONB"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS translated_segments JSONB"))
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS speech_segments JSONB"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS error_code VARCHAR(50)"))
            connection.commit()
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)
