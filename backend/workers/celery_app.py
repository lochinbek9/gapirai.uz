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
    worker_max_tasks_per_child=2, # Har 2 ta taskdan keyin bolani yangilash (RAM tozalanishi uchun)
    task_time_limit=8000,         # Max 8000 seconds execution time limit (8K)
    task_soft_time_limit=7800,    # Soft time limit to clean up gracefully
    # 9000s (150 daqiqa) -- eng uzun vazifaning (process_video, 8000s / 133 daqiqa)
    # vaqtidan ko'proq bo'lishi shart, aks holda Redis 120 daqiqalik video
    # bajarilayotgan paytda xabarni boshqa worker'ga qayta yetkazib beradi.
    # 2026-08-30: worker'lar bir necha marta xuddi shu naqsh bilan jim qotib
    # qoldi -- tarmoqda bir lahzalik uzilish -> kombu'ning ulanish-xatolik
    # tozalash yo'lida (connection.collect() -> maybe_close_channel() ->
    # channel.close() -> _brpop_read()) socket.recv() CHEKSIZ bloklanadi,
    # chunki bu socket'ga hech qanday o'qish muddati (timeout) berilmagan
    # edi. SIGUSR1 stack dump orqali 4 ta serverda mustaqil ravishda
    # tasdiqlangan (kombu/celery/redis-py'ning rasmiy hujjatlashtirilgan
    # muammosi -- socket_timeout aynan shu holat uchun mo'ljallangan).
    broker_transport_options={
        "visibility_timeout": 9000,
        "socket_timeout": 30,          # hech qanday o'qish 30s dan uzoq bloklanmasin
        "socket_connect_timeout": 10,
        "socket_keepalive": True,      # OS darajasida "o'lik" ulanishni aniqlaydi
        "health_check_interval": 25,   # uzoq turgan ulanishni ishlatishdan oldin tekshiradi
        "retry_on_timeout": True,      # vaqtinchalik uzilishda avtomatik qayta urinadi
    },
    result_backend_transport_options={
        "visibility_timeout": 9000,
        "socket_timeout": 30,
        "socket_connect_timeout": 10,
    },
    task_routes={
        # process_video'da "queue" ATAYLAB yo'q — chaqiruv joylarida
        # (routes.py/click_routes.py/main.py) get_job_queue_v2() orqali
        # tarif + video davomiyligiga qarab to'g'ri navbat aniq ko'rsatiladi.
        # Bu yerda qattiq "queue" bo'lsa, o'sha yo'naltirishni bekor qilardi.
        "backend.workers.tasks.process_video": {
            "rate_limit": "1/m",  # max 1 YouTube download per minute per worker
        },
        "backend.workers.analysis_tasks.analyze_video_task": {
            # Ustuvorlik tizimiga kirmaydi — doim default short navbat
            "queue": "video_short_free",
            "rate_limit": "1/m",
        },
        "backend.workers.resolution_tasks.generate_resolution_variant_task": {
            # Resolution variant — qisqa, tez, default short navbatga
            "queue": "video_short_free",
        },
    },
)
