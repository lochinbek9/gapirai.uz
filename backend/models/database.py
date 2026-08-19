from sqlalchemy import create_engine, Column, String, DateTime, Enum, Float, Integer, Text, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
import enum
from datetime import datetime
from backend.config import get_settings

settings = get_settings()

engine = create_engine(settings.DATABASE_URL, pool_size=3, max_overflow=2)
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
    # Google yoki telefon orqali ro'yxatdan o'tgan foydalanuvchida email
    # bo'lmasligi mumkin (telefon-only) yoki parol bo'lmasligi mumkin
    # (Google/telefon-only) — shuning uchun ikkalasi ham nullable.
    email = Column(String(255), unique=True, nullable=True, index=True)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=True)
    phone = Column(String(20), unique=True, nullable=True, index=True)
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    # Telegram bot orqali ulangan bo'lsa to'ldiriladi (backend/telegram_bot.py)
    # -- job yakunlanganda foydalanuvchiga shu chat'ga xabar yuborish uchun.
    # Bir xil telefon raqami web'da ham ishlatilgan bo'lsa, xuddi shu
    # hisobga bog'lanadi (auth_routes.py'dagi phone auth bilan bir xil
    # ustun) -- kvota/obuna ikkalasida ham baravar ishlaydi.
    telegram_chat_id = Column(String(50), unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True)
    # Uch xil auth usuli ham shu bitta flag orqali ishonch bildiradi — email
    # kodi, Google (email_verified=true bo'lsa avtomatik), yoki telefon kodi.
    is_verified = Column(Boolean, default=False, nullable=False)
    verification_code = Column(String(6))
    verification_code_expires_at = Column(DateTime)
    phone_verification_code = Column(String(6))
    phone_verification_code_expires_at = Column(DateTime)
    # Faqat ma'lumot uchun — hech qanday kod bu maydonga qarab tarmoqlanmaydi.
    auth_provider = Column(String(20), nullable=False, default="password")  # "password" | "google" | "phone"
    role = Column(String(20), nullable=False, default="user")  # "user" | "admin"
    created_at = Column(DateTime, default=datetime.utcnow)
    # 2026-08-19: bir martalik to'lov -- Ommaviy videolar (/library)
    # kutubxonasiga umrbod kirish, tarif kvotasidan mustaqil.
    library_access_purchased_at = Column(DateTime, nullable=True)

    jobs = relationship("DubbingJob", back_populates="user", lazy="dynamic")


class DubbingJob(Base):
    __tablename__ = "dubbing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    youtube_url = Column(String(500), nullable=False)
    youtube_video_id = Column(String(20), nullable=True, index=True)  # kesh qidiruvi uchun (backend/services/job_creation.py)
    source_job_id = Column(UUID(as_uuid=True), ForeignKey("dubbing_jobs.id"), nullable=True)  # kesh-hit -- asl job'ga ishora
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

    # Har bir TTS segmentining avtomatik QA natijasi (audio_qa.py):
    # {seg_id: {"score": float, "flags": [...], "attempts": int}}. Celery
    # qayta urinishida synthesize_segments() shu maydonga qarab faqat
    # muvaffaqiyatsiz/yo'q segmentlarnigina qayta sintez qiladi — butun TTS
    # bosqichini emas.
    segment_qa = Column(JSONB, nullable=True)

    original_video_path = Column(String(500))
    dubbed_audio_path = Column(String(500))
    output_video_path = Column(String(500))
    output_video_url = Column(String(500))

    error_message = Column(Text)
    error_code = Column(String(50), nullable=True)  # masalan: VIDEO_UNAVAILABLE, TRANSCRIBE_FAILED, TIMEOUT
    # 2026-08-19: shu job uchun tarif kvotasi sarflanganmi (consume_quota
    # chaqirilganmi) -- pipeline 5 marta urinib ham muvaffaqiyatsiz tugasa,
    # backend/workers/tasks.py shu bayroqqa qarab kvotani avtomatik qaytaradi.
    quota_consumed = Column(Boolean, default=False, nullable=False)
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

    @property
    def storage_id(self) -> str:
        """S3 kalitlari qaysi job ID ostida saqlanganini aniqlaydi -- kesh-hit
        joblar uchun bu ASL job'ning ID'si (source_job_id), oddiy joblar
        uchun o'zining ID'si. Barcha S3 kalit hisoblovchi kod (routes.py
        download endpointlari, resolution_variants.py) shu propertydan
        foydalanadi, job.id'dan emas."""
        return str(self.source_job_id or self.id)


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
    # True bo'lsa, bu yozuv TTSCache'dan qaytarilgan (haqiqiy sintez bo'lmagan,
    # estimated_cost=0) — xarajat hisobotida keshning ta'sirini ko'rish uchun.
    cache_hit = Column(Boolean, nullable=False, default=False)


class TTSCache(Base):
    """Segment darajasidagi TTS audio keshi — bir xil matn+ovoz+provider
    kombinatsiyasi qayta sintez qilinmasdan S3'dagi mavjud audio qaytariladi
    (backend/services/tts_cache.py). Lokal diskda emas — job tugagach mahalliy
    fayllar o'chiriladi (tasks.py), shuning uchun kesh S3'da yashashi shart.
    """
    __tablename__ = "tts_cache"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cache_key = Column(String(64), unique=True, nullable=False, index=True)  # sha256(text+voice+provider)
    provider = Column(String(30), nullable=False)
    s3_key = Column(String(500), nullable=False)
    hit_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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


class ResolutionVariant(Base):
    """Video ma'lumot bazasida rezolyutsiya kesimidagi versiyalar --
    360p/1080p bosqichma-bosqich, faqat haqiqatan so'ralganda yaratiladi
    (backend/services/resolution_variants.py). 720p uchun qator yaratilmaydi
    -- u allaqachon master fayl (dubber/{job_id}/dubbed_final.mp4)."""
    __tablename__ = "resolution_variants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("dubbing_jobs.id"), nullable=False, index=True)
    resolution = Column(String(10), nullable=False)  # "360p" | "1080p"
    status = Column(String(20), default="pending")   # pending|processing|ready|failed
    s3_key = Column(String(500), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("job_id", "resolution"),)


class ContentViolation(Base):
    """Safety Gate tomonidan bloklangan har bir urinish shu yerda saqlanadi
    (backend/services/content_safety.py). Ikki bosqichdan biri belgilaydi:
    "metadata" (job yaratilishidan oldin, sarlavha/tavsif asosida) yoki
    "transcript" (transkripsiyadan keyin, videoning haqiqiy nutqi asosida).
    Admin panelda foydalanuvchi bo'yicha guruhlab ko'rsatiladi -- "bloklangan
    akkauntlar soni va kimligi" talabiga javob beradi."""
    __tablename__ = "content_violations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    youtube_url = Column(String(500), nullable=False)
    video_title = Column(String(500))
    stage = Column(String(20), nullable=False)  # "metadata" | "transcript"
    category = Column(String(50), nullable=False)
    reason = Column(Text)
    blocked = Column(Boolean, default=True, nullable=False)  # False = faqat ogohlantirish, video bloklanmadi (2026-08-16)
    created_at = Column(DateTime, default=datetime.utcnow)

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

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE users ALTER COLUMN email DROP NOT NULL"))
            connection.execute(text("ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_code VARCHAR(6)"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verification_code_expires_at TIMESTAMP"))
            connection.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) NOT NULL DEFAULT 'password'"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_phone ON users (phone)"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id)"))
            connection.commit()
    except Exception:
        pass

    try:
        with engine.connect() as connection:
            connection.execute(text("ALTER TABLE dubbing_jobs ADD COLUMN IF NOT EXISTS segment_qa JSONB"))
            connection.execute(text("ALTER TABLE tts_usage_logs ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT false"))
            connection.commit()
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)
