from celery import Celery
from backend.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ai_dubber",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["backend.workers.tasks", "backend.workers.analysis_tasks"],
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
    task_time_limit=8000,         # Max 8000 seconds execution time limit (8K)
    task_soft_time_limit=7800,    # Soft time limit to clean up gracefully
    task_routes={
        "backend.workers.tasks.process_video": {
            "queue": "video_processing",
            "rate_limit": "1/m",  # max 1 YouTube download per minute per worker
        },
        "backend.workers.analysis_tasks.analyze_video_task": {
            "queue": "video_processing",  # dublyaj bilan bir xil worker havzasi/navbat
            "rate_limit": "1/m",
        },
    },
)
