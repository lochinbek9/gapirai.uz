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
    OPENAI_MODEL: str = "gpt-4o"
    OPENAI_TRANSCRIPTION_MODEL: str = "whisper-1"

    # Google AI Studio / Gemini API
    GEMINI_API_KEY: str = ""

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
    # Qiymatlar: "elevenlabs" | "azure" | "edge" | "openai"
    TTS_PROVIDER: str = "elevenlabs"

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

    # Admin panel
    ADMIN_PASSWORD: str = ""

    # Click Payment
    CLICK_MERCHANT_ID: str = "56653"
    CLICK_SERVICE_ID: str = "108780"
    CLICK_SECRET_KEY: str = "Pbxfw7SaMso"
    CLICK_MERCHANT_USER_ID: str = "89102"
    FRONTEND_URL: str = "https://gapirai.uz"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
