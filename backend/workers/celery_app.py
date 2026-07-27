from celery import Celery
from backend.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ai_dubber",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["backend.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Tashkent",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,          # Xatolik bo'lsa qayta urinish
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1, # Bir vaqtda bitta vazifa
    task_routes={
        "backend.workers.tasks.process_video": {"queue": "video_processing"},
    },
)
