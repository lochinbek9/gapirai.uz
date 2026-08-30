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
    worker_prefetch_multiplier=1, # Bir vaqtda bitta vazifa
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
    # 2026-08-30: worker'lar bir necha marta xuddi shu naqsh bilan jim qotib
    # qoldi -- tarmoqda bir lahzalik uzilish -> kombu'ning ulanish-xatolik
    # tozalash yo'lida (connection.collect() -> maybe_close_channel() ->
    # channel.close() -> _brpop_read()) socket.recv() CHEKSIZ bloklanadi,
    # chunki bu socket'ga hech qanday o'qish muddati (timeout) berilmagan
    # edi. SIGUSR1 stack dump orqali 4 ta serverda mustaqil ravishda
    # tasdiqlangan (kombu/celery/redis-py'ning rasmiy hujjatlashtirilgan
    # muammosi -- socket_timeout aynan shu holat uchun mo'ljallangan).
    broker_transport_options={
        "visibility_timeout": 4000,
        "socket_timeout": 30,          # hech qanday o'qish 30s dan uzoq bloklanmasin
        "socket_connect_timeout": 10,
        "socket_keepalive": True,      # OS darajasida "o'lik" ulanishni aniqlaydi
        "health_check_interval": 25,   # uzoq turgan ulanishni ishlatishdan oldin tekshiradi
        "retry_on_timeout": True,      # vaqtinchalik uzilishda avtomatik qayta urinadi
    },
    result_backend_transport_options={
        "visibility_timeout": 4000,
        "socket_timeout": 30,
        "socket_connect_timeout": 10,
    },
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
