import logging

from celery import Celery
from backend.config import get_settings

settings = get_settings()

# httpx INFO logi job yakunlanganda (telegram_notify.py) bot tokenini
# to'liq URL ichida oshkor qiladi -- worker'da ham WARNING'ga ko'taramiz.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

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
    # Worker OOM/SIGKILL bilan qulasa, xabar darhol reject bo'lsin — aks holda
    # visibility-timeout'gacha (soatlar) osilib qolardi (AUDIT_STABILITY.md §3 P2-5).
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,  # Bir vaqtda bitta vazifa
    # Har bir worker-bolasi 100 ta task bajarib bo'lgach tiklansin — uzoq
    # muddatli yashovchi jarayonlardagi yashirin memory leak/state bug'larini
    # tozalaydi (AUDIT_STABILITY.md §4 Shag 2c).
    worker_max_tasks_per_child=100,
    task_time_limit=8000,         # Max 8000 seconds execution time limit (8K)
    task_soft_time_limit=7800,    # Soft time limit to clean up gracefully
    # 2026-08-26 audit (GapirAI reliability): ilgari sozlanmagan edi --
    # Kombu/Redis'ning standart visibility_timeout'i (3600s) process_video'ning
    # o'z time_limit'iga (3600s) AYNAN teng edi: uzoq video uchun ikkalasi
    # bir vaqtda tugab, majburiy SIGKILL bilan broker'ning vazifani "yo'qolgan"
    # deb qayta yetkazishi bir zumda to'qnashardi. 4000s -- eng uzun vazifadan
    # (process_video, 3600s) sezilarli ko'proq, haddan tashqari uzun emas.
    broker_transport_options={"visibility_timeout": 4000},
    result_backend_transport_options={"visibility_timeout": 4000},
    # ─────────────────────────────────────────────────────────────────────
    # Queues — TTS va Media workers uchun alohida navbatlar.
    # DIQQAT: media_processing / tts_processing navbatlarini FAQAT Denis'ning
    # 3-worker docker-compose'i (worker-video / worker-tts / worker-media)
    # tinglaydi. Bitta worker bilan deploy qilinsa (`-Q video_processing_
    # priority,video_processing`), resolution + chunk vazifalari osilib qoladi
    # -- compose bosqichida hal qilinadi.
    # Har bir worker faqat o'z navbatini tinglaydi.
    # ─────────────────────────────────────────────────────────────────────
    task_queues={
        # Asosiy video processing (download, transcription, translation)
        "video_processing": {
            "exchange": "video_processing",
            "routing_key": "video_processing",
        },
        # TTS workers — faqat TTS sintez
        "tts_processing": {
            "exchange": "tts_processing",
            "routing_key": "tts_processing",
        },
        # Media workers — FFmpeg merge, HLS generation
        "media_processing": {
            "exchange": "media_processing",
            "routing_key": "media_processing",
        },
        # Priority queue (Pro/Premium users)
        "video_processing_priority": {
            "exchange": "video_processing_priority",
            "routing_key": "video_processing_priority",
        },
    },
    task_routes={
        # Asosiy video processing
        "backend.workers.tasks.process_video": {
            "queue": "video_processing",
            "rate_limit": "1/m",  # max 1 YouTube download per minute per worker
        },
        # TTS tasks
        "backend.workers.tasks.process_tts_chunk": {
            "queue": "tts_processing",
        },
        # Media tasks
        "backend.workers.tasks.process_media_chunk": {
            "queue": "media_processing",
        },
        # Progressive playback
        "backend.workers.tasks.publish_chunk": {
            "queue": "media_processing",
        },
        # Analysis tasks
        "backend.workers.analysis_tasks.analyze_video_task": {
            "queue": "video_processing",
            "rate_limit": "1/m",
        },
        # Resolution tasks
        "backend.workers.resolution_tasks.generate_resolution_variant_task": {
            "queue": "media_processing",
        },
    },
)
