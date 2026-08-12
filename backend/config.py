from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    APP_NAME: str = "GapirAI.uz"
    DEBUG: bool = False
    FREE_MODE: bool = False

    # Database
    DATABASE_URL: str = "postgresql://dubber:dubber123@localhost:5432/dubber_db"
    ASYNC_DATABASE_URL: str = "postgresql+asyncpg://dubber:dubber123@localhost:5432/dubber_db"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # OpenAI
    OPENAI_API_KEY: str = ""
    # Tarjima uchun — gpt-4o-mini sifat jihatidan gpt-4o'ga deyarli teng
    # chiqdi (real taqqoslashda tasdiqlangan), narxi esa ~17x arzon.
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TRANSCRIPTION_MODEL: str = "whisper-1"
    # Nutq optimallashtirish (raqam/ohang moslashtirish) va jins aniqlash kabi
    # mexanik, sifatga unchalik sezgir bo'lmagan vazifalar uchun — OPENAI_MODEL
    # dan alohida saqlanadi, shunda kerak bo'lsa tarjima sifatini mustaqil
    # oshirish/pasaytirish mumkin, bu vazifalarga ta'sir qilmasdan.
    OPENAI_LIGHT_MODEL: str = "gpt-4o-mini"

    # Google AI Studio / Gemini API
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash"

    # Tarjima provayderi: "openai" | "gemini"
    TRANSLATE_PROVIDER: str = "openai"

    # Gemini native TTS (tayyor ovozlar: Autonoe, Charon va h.k.)
    GEMINI_TTS_MODEL: str = "gemini-2.5-flash-preview-tts"
    GEMINI_MALE_VOICE: str = "Charon"
    GEMINI_FEMALE_VOICE: str = "Autonoe"

    # Vertex AI orqali ulanish (AI Studio'ning "preview" modellar uchun qattiq
    # kunlik chegarasini chetlab o'tish uchun — Vertex AI daqiqalik Dynamic
    # Shared Quota ishlatadi, kunlik qattiq devor yo'q, va kerak bo'lsa
    # Google'dan rasman oshirtirish so'ralishi mumkin).
    GEMINI_USE_VERTEX: bool = False
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "us-central1"
    GOOGLE_APPLICATION_CREDENTIALS: str = ""

    # OpenAI (Whisper/GPT) krediti tugagan holatda transkripsiya va tarjima
    # uchun Vertex AI zaxirasi ishlatadigan matn modeli — GEMINI_MODEL'dan
    # alohida, chunki u AI Studio katalogiga mo'ljallangan va Vertex'da
    # mavjud bo'lmasligi mumkin (masalan "gemini-3.5-flash" Vertex'da 404).
    GEMINI_VERTEX_TEXT_MODEL: str = "gemini-2.5-flash"

    # Azure TTS
    AZURE_SPEECH_KEY: str = ""
    AZURE_SPEECH_REGION: str = "eastus"
    AZURE_VOICE_NAME: str = "uz-UZ-SardorNeural"  # O'zbek erkak ovozi

    # AWS S3
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_BUCKET_NAME: str = "hr-lodex-recordings"
    AWS_REGION: str = "eu-north-1"


    # Paths
    UPLOAD_DIR: str = "./uploads"
    OUTPUT_DIR: str = "./outputs"

    # TTS Provider abstraction
    # Qiymatlar: "elevenlabs" | "azure" | "edge" | "openai" | "gemini" | "uzbekvoice"
    TTS_PROVIDER: str = "edge"
    # Asosiy provider muvaqqat xatolik bilan (timeout/429/5xx) ishlamasa shu
    # providerga o'tiladi. Doimiy xatolikda (noto'g'ri kalit/kirish) fallback
    # ishlatilmaydi — backend/services/tts/base.py: PermanentTTSError.
    TTS_FALLBACK_PROVIDER: str = "edge"

    # UzbekVoiceAI TTS (https://uzbekvoice.ai/videos/api-docs/tts)
    UZBEKVOICE_API_KEY: str = ""
    UZBEKVOICE_BASE_URL: str = "https://uzbekvoice.ai/api/v1"
    UZBEKVOICE_DEFAULT_MODEL: str = "shoira"

    # ElevenLabs TTS
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID_MALE: str = "bIHbv24MWmeRgasZH58o"    # Will (Relaxed Optimist)
    ELEVENLABS_VOICE_ID_FEMALE: str = "EXAVITQu4vr4xnSDxMaL"  # Sarah (Mature, Reassuring)
    ELEVENLABS_MODEL: str = "eleven_multilingual_v2"
    ELEVENLABS_STABILITY: float = 0.45
    ELEVENLABS_SIMILARITY_BOOST: float = 0.80
    ELEVENLABS_STYLE: float = 0.20
    ELEVENLABS_SPEED: float = 1.0
    ELEVENLABS_FALLBACK_TO_EDGE: bool = True

    # Telegram Notification Bot
    TELEGRAM_BOT_TOKEN: str = "8931174655:AAGS1PQsYiazxd5HjDet_kt4Y8mUVLqhHtU"
    TELEGRAM_CHAT_ID: str = "-1004431243067"

    # Resend (email tasdiqlash kodlari uchun — gapirai.uz domenida SPF/DKIM tasdiqlangan)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "noreply@gapirai.uz"
    RESEND_FROM_NAME: str = "GapirAI.uz"

    # Admin panel — role='admin' bo'lsa ham, faqat shu ro'yxatdagi email
    # kira oladi (vergul bilan ajratilgan). Bo'sh bo'lsa, faqat role tekshiriladi.
    ADMIN_ALLOWED_EMAILS: str = "lochinbeksetor@gmail.com"

    # Click Payment
    CLICK_MERCHANT_ID: str = "56653"
    CLICK_SERVICE_ID: str = "108780"
    CLICK_SECRET_KEY: str = "Pbxfw7SaMso"
    CLICK_MERCHANT_USER_ID: str = "89102"
    FRONTEND_URL: str = "https://gapirai.uz"

    # yt-dlp orqali YouTube'dan yuklab olishda ishlatiladigan HTTP(S) proxy —
    # http://user:pass@host:port. AWS/GCP kabi datacenter IP'larni YouTube
    # ko'pincha bot deb belgilab, PO token/cookie holatidan qat'iy nazar
    # "Video unavailable" qaytaradi (2026-08-12 productionda tasdiqlangan);
    # bo'sh bo'lsa proxysiz ishlaydi (lokal/rezident IP uchun kerak emas).
    YOUTUBE_PROXY_URL: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
