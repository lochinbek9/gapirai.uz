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


class AnalysisStatus(str, enum.Enum):
    PENDING = "PENDING"
    DOWNLOADING = "DOWNLOADING"
    EXTRACTING_AUDIO = "EXTRACTING_AUDIO"
    TRANSCRIBING = "TRANSCRIBING"
    ANALYZING = "ANALYZING"
    GENERATING_RESULTS = "GENERATING_RESULTS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class VideoAnalysis(Base):
    """YouTube video -> transcript/summary/chapters/key-points/notes/quiz/Q&A.

    Bir marta transkripsiya va bazaviy tahlil qilinadi (transcript_segments,
    key_points, chapters); notes/quiz esa so'ralganda "lazy" generatsiya
    qilinib shu yerga keshlanadi — har safar qayta hisoblanmaydi
    (backend/api/video_analysis_routes.py).
    """
    __tablename__ = "video_analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    youtube_url = Column(String(500), nullable=False)
    video_title = Column(String(500))
    video_duration = Column(Float)
    video_thumbnail = Column(String(500))
    # "language" — foydalanuvchi so'ragan tahlil tili (uz/en/ru/tr/kk yoki "original").
    # "original" video transkripsiyadan keyin aniqlangan video_language'ga hal qilinadi
    # (backend/workers/analysis_tasks.py) va shu yerga qayta yoziladi — shundan keyin
    # quiz/notes/Q&A kabi "lazy" endpointlar uni qayta hal qilmasdan to'g'ridan-to'g'ri ishlatadi.
    language = Column(String(10), default="uz")
    video_language = Column(String(10), nullable=True)  # Whisper aniqlagan original til kodi

    status = Column(Enum(AnalysisStatus, values_callable=lambda obj: [e.value for e in obj]), default=AnalysisStatus.PENDING, nullable=False)
    progress = Column(Float, default=0.0)
    status_message = Column(String(255))

    # [{"start": float, "end": float, "text": str}, ...] — transcriber.py bilan bir xil shakl
    transcript_segments = Column(JSONB, nullable=True)

    summary = Column(JSONB, nullable=True)        # {"short": str, "medium": str, "detailed": str}
    key_points = Column(JSONB, nullable=True)      # [{"title","description","timestamp"}]
    chapters = Column(JSONB, nullable=True)        # [{"title","start","end"}]
    notes = Column(Text, nullable=True)
    quiz = Column(JSONB, nullable=True)            # [{"question","options","correct_answer","explanation","timestamp"}]
    qa_history = Column(JSONB, default=list)       # [{"question","answer","timestamps","asked_at"}]
    bilingual_segments = Column(JSONB, nullable=True)  # [{"start","end","original","translated"}] — lazy

    error_message = Column(Text, nullable=True)
    error_code = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User")


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


class TTSUsageLog(Base):
    """Har bir muvaffaqiyatli TTS sintez chaqiruvi uchun xarajat yozuvi.

    Maqsad: "1 daqiqa dublyaj qilingan video bizga qancha tushadi" savoliga
    provider bo'yicha aniq javob berish (backend/services/tts_cost.py).
    currency provider bo'yicha farqlanadi (uzbekvoice -> UZS, qolganlari -> USD)
    — sun'iy almashtirish kursi bilan bitta valyutaga majburan keltirilmaydi;
    agregatsiya (provider, currency) bo'yicha guruhlanadi.
    """
    __tablename__ = "tts_usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider = Column(String(30), nullable=False, index=True)
    characters = Column(Integer, nullable=False)
    duration_seconds = Column(Float, nullable=True)  # generatsiya qilingan audio uzunligi
    estimated_cost = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="USD")
    video_id = Column(String(64), nullable=True, index=True)  # DubbingJob yoki VideoAnalysis id (FK emas — ikkalasidan ham bo'lishi mumkin)
    user_id = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class PlanTier(str, enum.Enum):
    FREE = "free"
    STANDARD = "standard"
    PRO = "pro"


class Subscription(Base):
    """Foydalanuvchining oylik tarif obunasi. Har bir userda ko'pi bilan bitta
    qator bo'ladi (user_id unique) — tarif o'zgartirilganda shu qator yangilanadi,
    yangi qator ochilmaydi. Aniq tarif ta'riflari (narx/kvota) bazada emas,
    backend/services/plans.py'dagi PLANS lug'atida — bu jadval faqat "kim qaysi
    tarifda va qachongacha" holatini saqlaydi.

    Hech qanday qator yo'q foydalanuvchi = FREE tarifda (lazy — birinchi
    kvota tekshiruvida avtomatik yaratiladi, PronunciationMemory'dagi kabi).
    """
    __tablename__ = "subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, unique=True)
    plan = Column(Enum(PlanTier, values_callable=lambda obj: [e.value for e in obj]), default=PlanTier.FREE, nullable=False)
    expires_at = Column(DateTime, nullable=True)  # FREE uchun null (muddatsiz)
    period_started_at = Column(DateTime, default=datetime.utcnow)  # joriy davr kvotasi shu vaqtdan hisoblanadi
    videos_used_this_period = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")


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

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS video_language VARCHAR(10)"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS bilingual_segments JSONB"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan VARCHAR(20)"))
            connection.commit()
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)
