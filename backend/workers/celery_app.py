from celery import Celery
from backend.config import get_settings

settings = get_settings()

celery_app = Celery(
    "ai_dubber",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["backend.workers.tasks", "backend.workers.analysis_tasks", "backend.workers.resolution_tasks"],
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
        # process_video'da "queue" ATAYLAB yo'q — chaqiruv joylarida
        # (routes.py/click_routes.py/main.py) get_job_queue() orqali
        # Pro/Premium uchun video_processing_priority yoki oddiylar uchun
        # video_processing aniq ko'rsatiladi (backend/services/plans.py).
        # Bu yerda qattiq "queue" bo'lsa, o'sha aniq yo'naltirishni bekor
        # qilib qo'yishi mumkin edi.
        "backend.workers.tasks.process_video": {
            "rate_limit": "1/m",  # max 1 YouTube download per minute per worker
        },
        "backend.workers.analysis_tasks.analyze_video_task": {
            "queue": "video_processing",  # ustuvorlik tizimiga kirmaydi, doim standart navbat
            "rate_limit": "1/m",
        },
        "backend.workers.resolution_tasks.generate_resolution_variant_task": {
            "queue": "video_processing",  # aniq queue ko'rsatilmasa Celery'ning
            # o'zi "celery" default navbatiga tushar edi -- worker'lar faqat
            # video_processing/video_processing_priority'ni tinglaydi.
        },
    },
)
