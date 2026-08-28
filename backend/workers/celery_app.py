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
    # 2026-08-26 audit: task_acks_late=True O'ZI YETARLI EMAS -- worker
    # bola-jarayoni to'satdan o'ldirilsa (OOM, deploy paytidagi SIGKILL),
    # Celery'ning standart xatti-harakati (bu sozlama o'chirilgan holda)
    # xabarni BARIBIR ACK qiladi va vazifa hech qanday iz qoldirmasdan
    # yo'qoladi -- productionda 5 marta haqiqiy OOM-kill kuzatilgan
    # (2026-08-14/15, kernel loglari), shundan keyin job DOWNLOADING
    # holatida abadiy qotib qolgan. True bilan: o'ldirilgan bola vazifasi
    # broker'ga QAYTA navbatga qo'yiladi -- boshqa (yoki shu) worker uni
    # tugatadi. Dublikat-ijro xavfi backend/services/job_claim.py'dagi DB
    # darajasidagi atomik claim bilan qoplangan (shu audit doirasida
    # qo'shilgan) -- shu himoyasiz bu sozlamani yoqish xavfli bo'lardi.
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,  # Bir vaqtda bitta vazifa
    # Har bir worker-bolasi 100 ta task bajarib bo'lgach tiklansin — uzoq
    # muddatli yashovchi jarayonlardagi yashirin memory leak/state bug'larini
    # tozalaydi (AUDIT_STABILITY.md §4 Shag 2c).
    worker_max_tasks_per_child=100,
    task_time_limit=8000,         # Max 8000 seconds execution time limit (8K)
    task_soft_time_limit=7800,    # Soft time limit to clean up gracefully
    # 2026-08-26 audit: ilgari sozlanmagan edi -- Kombu/Redis'ning
    # standart qiymati (3600s) process_video'ning o'z time_limit'iga
    # (3600s) AYNAN teng edi: uzoq video uchun bu ikkalasi bir vaqtda
    # tugab, vazifaning majburiy SIGKILL qilinishi bilan broker'ning uni
    # "yo'qolgan" deb hisoblab qayta yetkazib berishi bir zumda to'qnashishi
    # mumkin edi. 4000s -- eng uzun vazifaning (process_video, 3600s)
    # o'zidan sezilarli ko'proq, lekin haddan tashqari uzun ham emas (haqiqatan
    # qotib qolgan vazifa 66 daqiqadan ortiq kutmaydi).
    broker_transport_options={"visibility_timeout": 4000},
    result_backend_transport_options={"visibility_timeout": 4000},
    # ─────────────────────────────────────────────────────────────────────
    # Queues — TTS va Media workers uchun alohida navbatlar.
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
        # process_video'da "queue" ATAYLAB yo'q — chaqiruv joylarida
        # (routes.py/click_routes.py/main.py) get_job_queue() orqali
        # Pro/Premium uchun video_processing_priority yoki oddiylar uchun
        # video_processing aniq ko'rsatiladi (backend/services/plans.py).
        # Bu yerda qattiq "queue" bo'lsa, o'sha aniq yo'naltirishni bekor
        # qilib qo'yishi mumkin edi. 2026-08-28 GapirAI integratsiya: Denis'ning
        # forkida bu yerga "queue": "video_processing" qo'shilgan edi -- olib tashlandi.
        "backend.workers.tasks.process_video": {
            "rate_limit": "1/m",  # max 1 YouTube download per minute per worker
        },
        # ── FUTURE / INERT ROUTES ────────────────────────────────────────
        # Chunked pipeline vazifalari (Denis forkidan). Hozircha bu Celery
        # task'lari MAVJUD EMAS (backend.workers.tasks'da yo'q) VA
        # ENABLE_CHUNKED_PIPELINE=False -- shuning uchun hech qachon enqueue
        # qilinmaydi, production ijro yo'liga ta'sir qilmaydi. Chunked
        # pipeline yoqilganda kerakli routing'ni hujjatlashtirib turadi;
        # o'sha bosqichda tts_processing/media_processing worker'lari ham
        # docker-compose'ga qo'shilishi kerak.
        "backend.workers.tasks.process_tts_chunk": {
            "queue": "tts_processing",
        },
        "backend.workers.tasks.process_media_chunk": {
            "queue": "media_processing",
        },
        "backend.workers.tasks.publish_chunk": {
            "queue": "media_processing",
        },
        # ────────────────────────────────────────────────────────────────
        "backend.workers.analysis_tasks.analyze_video_task": {
            "queue": "video_processing",  # ustuvorlik tizimiga kirmaydi, doim standart navbat
            "rate_limit": "1/m",
        },
        "backend.workers.resolution_tasks.generate_resolution_variant_task": {
            # 2026-08-28 GapirAI integratsiya: Denis'ning forkida bu
            # "media_processing"ga o'zgartirilgan edi -- LEKIN hozirgi
            # docker-compose worker'i faqat "-Q video_processing_priority,
            # video_processing" tinglaydi VA resolution_variants.py:190 /
            # main.py:163 bu taskni "queue=" siz enqueue qiladi. media_processing'ga
            # qo'ysak, hech kim tinglamaydi -> abadiy osilib qoladi. Media
            # worker qo'shilgach o'zgartirish mumkin.
            "queue": "video_processing",
        },
    },
)
