from pydantic_settings import BaseSettings
from pydantic import model_validator
from functools import lru_cache


class Settings(BaseSettings):
    @model_validator(mode="before")
    @classmethod
    def clean_quoted_strings(cls, values):
        if isinstance(values, dict):
            cleaned = {}
            for k, v in values.items():
                if isinstance(v, str) and len(v) >= 2 and (
                    (v.startswith('"') and v.endswith('"')) or
                    (v.startswith("'") and v.endswith("'"))
                ):
                    cleaned[k] = v[1:-1]
                else:
                    cleaned[k] = v
            return cleaned
        return values
    # App
    APP_NAME: str = "GapirAI.uz"
    DEBUG: bool = False
    FREE_MODE: bool = False

    # Dublyaj pipeline — segment darajasidagi avtomatik QA (audio_qa.py,
    # tasks.py'ning TTS bosqichiga ulangan). Har bir segment uchun qo'shimcha
    # Whisper chaqiruvi kerak bo'lgani uchun (haqiqiy, doimiy xarajat),
    # kerak bo'lsa kodga tegmasdan o'chirish mumkin.
    ENABLE_SEGMENT_QA: bool = True
    SEGMENT_QA_THRESHOLD: float = 0.75

    # Bir foydalanuvchi 24 soat ichida yaratishi mumkin bo'lgan dublyaj
    # joblari soni: 0 = cheksiz (faqat daqiqa kvotasi bilan cheklanadi).
    MAX_JOBS_PER_DAY: int = 0

    # Barcha yangi videolarga gapirai.uz watermark (logo + domen) qo'yish
    ENABLE_VIDEO_WATERMARK: bool = True

    # Veb orqali video fayl yuklash (POST /api/jobs/upload). Fayl host-1
    # diskiga tushadi (faqat shu host o'qiy oladi -- LOCAL_UPLOAD_QUEUE),
    # shuning uchun chegara ataylab past. nginx `client_max_body_size`
    # (deploy/nginx/sites-available/gapirai.uz) shundan biroz KATTA bo'lishi
    # kerak, frontend/lib/api.ts SUBTITLE_UPLOAD_MAX_BYTES esa aynan shunga teng.
    WEB_UPLOAD_MAX_MB: int = 1024
    # Yuklash boshlanishidan oldin diskda fayl hajmidan TASHQARI shuncha GB
    # bo'sh joy bo'lishi shart (disk to'lib qolib worker/DB yiqilmasin).
    UPLOAD_MIN_FREE_DISK_GB: float = 6.0

    # Navbat himoyasi (2026-09-19, backend/services/queue_load.py). Maqsad --
    # ko'p foydalanuvchi bir vaqtda yuborganda sayt qotmasin, ortiqcha yuk
    # esa tushunarli xabar bilan rad etilsin.
    # Bitta foydalanuvchining bir vaqtdagi FAOL (navbatda/ishlanayotgan)
    # joblari chegarasi -- bittasi butun navbatni egallab olmasligi uchun.
    # 0 = cheksiz.
    MAX_ACTIVE_JOBS_PER_USER: int = 3
    # Jami parallel ishlov beruvchi worker o'rinlari (WORKER_CONCURRENCY
    # yig'indisi: host-1 2 + worker-3 4 = 6). Faqat ETA/rad qilish taxmini
    # uchun -- worker qo'shilganda/olinganda shu yerni yangilang.
    QUEUE_WORKER_SLOTS: int = 6
    # Short track (<=10 daqiqa) o'rtacha ishlash vaqti — ETA taxmini uchun.
    QUEUE_AVG_JOB_MINUTES: float = 8.0
    # Long track (>10 daqiqa) o'rtacha ishlash vaqti — ETA taxmini uchun.
    QUEUE_LONG_AVG_JOB_MINUTES: float = 45.0
    # Short/Long track uchun max parallel worker slotlari (OOM xavfi nazorati).
    # Short: OOM xavfi past (kichik audio/video), ko'proq parallel mumkin.
    # Long: OOM xavfi bor (90+ daqiqalik video), kamroq parallel.
    QUEUE_SHORT_WORKER_SLOTS: int = 4
    QUEUE_LONG_WORKER_SLOTS: int = 2
    # Taxminiy kutish shu daqiqadan oshsa, yangi (ustuvor bo'lmagan) job'lar
    # "navbat to'la" deb rad etiladi. 0 = o'chirilgan.
    MAX_QUEUE_WAIT_MINUTES: int = 120

    # Disk auto-cleanup cron (backend/scripts/disk_cleanup.py) -- LOKAL disk
    # nusxalarini eskirgach o'chiradi. S3 nusxalari alohida, o'z lifecycle'i
    # bilan tozalanadi; bu esa outputs/ va uploads/ papkalarining cheksiz
    # o'sishini to'xtatadi. 0 = o'sha papkani umuman tozalamaslik.
    DISK_CLEANUP_OUTPUT_DAYS: int = 3
    DISK_CLEANUP_UPLOAD_HOURS: int = 48
    # Tarjima tayyor bo'lgach, taxminiy TTS davomiyligi original segment
    # uzunligidan shu nisbatdan ko'p oshsa, bitta cheklangan qisqartirish
    # bosqichi ishga tushadi (translator.py). Avval 1.15 edi — foydalanuvchi
    # aniq talab qildi: "Hello 1 sekundda aytilsa, o'zbekchasi 1.5 sekundda
    # chiqmasin" — original video ritmiga imkon boricha yaqinroq bo'lishi
    # kerak (2026-08-12). Qattiqroq chegara ko'proq segmentni original
    # davomiylikka moslab qisqartirishga majbur qiladi, TTS pleyback tezligini
    # sun'iy o'zgartirishga (notabiiy eshitiladi) tayanish o'rniga.
    # Yana ham qattiqlashtirildi (1.08->1.03) — foydalanuvchi keyingi
    # tinglovda segmentlar orasidagi siljish ("it's a problem" 2.57 o'rniga
    # 2.58-2.59da chiqishi) hali sezilarli ekanini aytdi. Qisqa segment
    # sekinlashtirish logikasi ham butunlay olib tashlandi (synthesizer.py)
    # — endi TTS deyarli har doim tabiiy tezlikda gapiradi, siljish faqat
    # tarjima bosqichida (matn qisqartirish orqali) oldini olinadi.
    DURATION_OVERAGE_TOLERANCE: float = 1.03

    # Dynamic audio ducking (merger.py) — original audio dub gapirayotganda
    # butunlay o'chirilmaydi, faqat pasaytiriladi (kino dublyajidagi kabi).
    # sidechaincompress dub trekini "trigger" sifatida ishlatadi — original
    # qanchalik baland/past bo'lishidan qat'i nazar, moslashuvchan pasayadi.
    # threshold: sidechain (dub) shu darajadan baland bo'lsa duck ishga tushadi.
    # ratio: qanchalik kuchli pasayish. attack: duck necha ms'da boshlanadi
    # (tez — dub boshlanishi bilan sezilarli bo'lishi uchun). release: necha
    # ms'da asl holatga qaytadi (sekinroq — "pumping" effektidan qochish uchun).
    # threshold/ratio dastlab 0.05/8.0 edi — real tinglovda original ovoz
    # dub ostida hali sezilib turdi ("bilinib qoladi"). Threshold pasaytirilib
    # (past darajadagi dub ham duck'ni ishga tushiradi) va ratio oshirilib
    # (2026-08-12) original deyarli to'liq bostirilishi ta'minlandi — bu
    # foydalanuvchining aniq talabi ("ustidan dublaj qilganda bilinmasin").
    # Foydalanuvchi yana ham kuchliroq farq so'radi (2026-08-12): "fondagi
    # ovozni gapirayotganda pastlatib, dublaj ovozini ko'tarib qo'y."
    # RATIO=20 — ffmpeg'ning sidechaincompress filtri qabul qiladigan ENG
    # YUQORI qiymat (allaqachon shu chegarada edi; 30 sinab ko'rilganda
    # ffmpeg xato berdi: "Value out of range [1 - 20]" — productionda
    # haqiqiy job orqali aniqlangan). Bitta 20:1 bosqich ham yetarli
    # bo'lmadi — foydalanuvchi haqiqiy production videosini tinglab, dub
    # ostida original hali ham eshitilib, dublyaj ovozi bosilib qolayotganini
    # xabar qildi (2026-08-14). Shuning uchun merger.py'da sidechaincompress
    # IKKI marta ketma-ket qo'llaniladi (har biri shu RATIO/THRESHOLD bilan) —
    # ffmpeg'ning bitta filtrdagi [1,20] chegarasini buzmasdan, effektiv
    # bosishni chuqurlashtiradi.
    ORIGINAL_AUDIO_VOLUME: float = 0.22  # Original fon ovozining bazaviy balandligi (dublyaj ostida shovqin qilmasligi uchun)
    DUCKING_THRESHOLD: float = 0.005
    DUCKING_RATIO: float = 20.0
    DUCKING_ATTACK_MS: int = 5
    DUCKING_RELEASE_MS: int = 350
    # Dub trekining o'zini ham baland qilish (fonni pasaytirish bilan bir
    # qatorda) — limiterdan OLDIN qo'llaniladi, shunda hosil bo'lgan
    # cho'qqilarni limiter xavfsiz ushlab qoladi (clipping bo'lmaydi).
    VOICE_GAIN_BOOST_DB: float = 5.0
    # Dub ovoz protsessing zanjiri (merger.py): xirillashni kesish, aniqlik
    # uchun subtle boost, dinamika siqish, "s"/"sh" tovushlarini yumshatish,
    # limiter — barchasi bitta filtergraph ichida, alohida ffmpeg pass emas.
    VOICE_HIGHPASS_HZ: int = 80
    VOICE_EQ_FREQ_HZ: int = 3000
    VOICE_EQ_GAIN_DB: float = 2.5
    VOICE_COMPRESSOR_RATIO: float = 3.0
    VOICE_LIMITER_LIMIT: float = 0.95
    # Yakuniy aralashma EBU R128 standartiga normallashtiriladi (I = integrated
    # loudness, TP = true peak, LRA = loudness range).
    FINAL_LOUDNORM_I: float = -16.0
    FINAL_LOUDNORM_TP: float = -1.5
    FINAL_LOUDNORM_LRA: float = 11.0

    # JWT imzolash kaliti — MAJBURIY .env orqali beriladi. Bo'sh bo'lsa
    # (yoki eski, kodda commit qilingan qiymat ishlatilsa) istalgan kishi
    # o'zi token yasab, istalgan foydalanuvchi (shu jumladan admin) nomidan
    # kira oladi — 2026-08-20 audit paytida topilgan va tuzatilgan (server
    # .env'ga haqiqiy tasodifiy qiymat qo'shildi).
    SECRET_KEY: str = ""

    # Database
    DATABASE_URL: str = "postgresql://dubber:dubber123@localhost:5432/dubber_db"
    ASYNC_DATABASE_URL: str = "postgresql+asyncpg://dubber:dubber123@localhost:5432/dubber_db"
    # SQLAlchemy ulanish hovuzi -- HAR jarayon (uvicorn worker / celery child)
    # uchun alohida. Postgres max_connections (standart 100) dan oshib
    # ketmasligi kerak: jami = jarayonlar soni x (POOL_SIZE + MAX_OVERFLOW).
    # Ilgari qat'iy 3+2 edi: bir jarayonda 5 tadan ko'p bir vaqtdagi so'rov
    # ulanish kutib turardi va butun sayt (login/dashboard ham) qotardi.
    DB_POOL_SIZE: int = 8
    DB_MAX_OVERFLOW: int = 4
    # Ulanish bo'sh bo'lmasa 30s emas, shuncha sekunddan keyin xato -- sayt
    # osilib qolmasdan tezroq "band" javobini beradi.
    DB_POOL_TIMEOUT: int = 10
    # bcrypt darvozasi (backend/services/auth.py) -- HAR uvicorn jarayoni uchun.
    # bcrypt ~230ms CPU oladi; cheklovsiz bo'lsa kirish to'lqini yuzlab
    # parallel xeshlash oqimi ochib, CPU'ni saytning qolgan so'rovlaridan
    # tortib oladi. Bir vaqtda ishlaydigan soni + navbatda kutuvchilar soni;
    # undan ortig'i darhol 503 (Retry-After) bilan rad etiladi -- kutuvchi
    # oqimlar threadpool'ni (jarayonda 40 ta) egallab, polling'ni ham
    # to'xtatib qo'ymasligi uchun kutish navbati ATAYLAB qisqa.
    BCRYPT_MAX_CONCURRENT: int = 1
    BCRYPT_MAX_WAITING: int = 5

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # OpenAI
    OPENAI_API_KEY: str = ""
    OPENAI_ENABLED: bool = False  # Balans 0 bo'lgani sababli vaqtinchalik nofaol (Gemini/Azure ishlatiladi)
    # Dublajdan oldingi kontent xavfsizligi tekshiruvi (Safety Gate) —
    # backend/services/content_safety.py. Diniy/terroristik/pornografik/
    # zo'ravonlik kontentini job yaratilishidan oldin (metadata) va
    # transkripsiyadan keyin (transkript) bloklaydi.
    CONTENT_SAFETY_ENABLED: bool = True

    # Telegram bot -- @BotFather'dan olingan token. Bo'sh bo'lsa bot
    # jarayoni ishga tushmaydi va bildirishnomalar jimgina o'tkazib
    # yuboriladi (backend/services/telegram_notify.py: fail-open).
    TELEGRAM_BOT_TOKEN: str = ""
    # Saytga Telegram orqali kirish (Login Widget) shu bot nomidan; BotFather'da
    # /setdomain -> gapirai.uz qilingan bo'lishi shart (aks holda "Bot domain invalid").
    TELEGRAM_BOT_USERNAME: str = "gapirai_uz_bot"

    # Self-hosted local Telegram Bot API server (docker-compose.yml:
    # telegram-bot-api, aiogram/telegram-bot-api image) -- rasmiy
    # api.telegram.org 20MB'dan katta faylni yuklab bo'lmaydi, bu esa to'liq
    # metrajli videolarni bot orqali qabul qilishga yetarli emas. Mahalliy
    # server bilan bu chegara 2000MB'ga ko'tariladi (2026-09-04). API_ID/
    # API_HASH https://my.telegram.org'dan -- shaxsiy hisob orqali, qo'lda,
    # bir martalik qadam (avtomatlashtirilmaydi). Uchalasi ham bo'sh bo'lsa
    # bot oddiy api.telegram.org'ga ulanadi va video-fayl qabul qilish
    # o'chiq qoladi (backend/telegram_bot.py: faqat YouTube havolasi
    # ishlaydi, xatosiz) -- mavjud YouTube-havola oqimiga hech qanday ta'sir
    # qilmaydi.
    TELEGRAM_API_ID: str = ""
    TELEGRAM_API_HASH: str = ""
    # telegram_bot konteyneridan telegram-bot-api konteyneriga ichki compose
    # tarmog'i orqali manzil, masalan "http://telegram-bot-api:8081".
    TELEGRAM_LOCAL_API_URL: str = ""
    ADMIN_TG_IDS: str = ""
    # Telegram Mini App manzili (bot menu tugmasi + /app buyrug'i shu yerni
    # ochadi). Bo'sh bo'lsa FRONTEND_URL + "/tma" ishlatiladi. Telegram faqat
    # HTTPS qabul qiladi -- HTTPS bo'lmasa menu tugmasi qo'yilmaydi.
    TELEGRAM_MINIAPP_URL: str = ""
    # Tarjima uchun — gpt-4o-mini sifat jihatidan gpt-4o'ga deyarli teng
    # chiqdi (real taqqoslashda tasdiqlangan), narxi esa ~17x arzon.
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_TRANSCRIPTION_MODEL: str = "whisper-1"
    # faster-whisper model (CPU): "tiny" | "small" | "medium" | "large-v3"
    # small = 500MB RAM, 100% accuracy, ~4s per 8s audio on CPU
    # medium = 1.5GB RAM, same accuracy, ~13s — too slow for production
    WHISPER_MODEL: str = "small"
    # STT (Speech-to-Text) provayderi: "gemini" | "neuronai" | "azure" | "openai".
    # Gemini (Google AI Studio) o'zbek tili va ko'p tilli audio transkripsiyasi uchun
    # asosiy provayder. Azure esa 2-o'rindagi zaxira (fallback) hisoblanadi.
    STT_PROVIDER: str = "gemini"
    STT_FALLBACK_PROVIDER: str = "azure"
    # O'zbekcha nutqni (subtitr rejimi, tarjimasiz) matnga aylantirishda AVVAL qaysi provayder
    # sinaladi: "gemini" (o'zbek matni ancha aniq, oʻ/gʻ to'g'ri; standart) yoki "azure".
    STT_UZ_PRIMARY: str = "gemini"
    # Nutq optimallashtirish (raqam/ohang moslashtirish), jins aniqlash,
    # xavfsizlik klassifikatori va Video tahlil (Learning Workspace) kabi
    # mexanik/tasniflash vazifalari uchun — OPENAI_MODEL (asosiy tarjima)
    # dan ATAYLAB alohida saqlanadi, shunda tarjima sifatini bulardan
    # mustaqil oshirish/pasaytirish mumkin. 2026-09-15: eng arzon
    # gpt-5-nano'ga o'tkazildi ($0.05/$0.40 1M token — gpt-4o-mini'dan
    # ~3x arzon; asosiy tarjima OPENAI_MODEL'da sifat uchun gpt-4o-mini'da
    # QOLDIRILDI). gpt-5 oilasi eski 'temperature'/'max_tokens'
    # parametrlarini qabul qilmaydi — barcha chaqiruvchilar
    # backend/services/openai_compat.py orqali mos parametr to'plamini oladi.
    OPENAI_LIGHT_MODEL: str = "gpt-5-nano"

    # Google AI Studio / Gemini API
    GEMINI_API_KEY: str = ""
    GEMINI_API_KEYS: str = ""
    GEMINI_PAID_API_KEY: str = ""
    GEMINI_PAID_API_KEYS: str = ""
    # True: BARCHA so'rovlar (bepul foydalanuvchilarniki ham) avval pullik kalit(lar)ni
    # ishlatadi, bepul kalitlar faqat zaxira. Bepul kalit limiti ~20 so'rov/kun --
    # ular bilan boshlash doimiy 429 + qayta urinishlarga olib kelardi (2026-10-23).
    GEMINI_PAID_KEYS_FIRST_FOR_ALL: bool = True
    GOOGLE_GENERATIVE_AI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_STT_MODEL: str = "gemini-3.8-flash"

    # NeuronAI (my.neuronai.uz) -- o'zbekcha STT/TTS/LLM, to'lov so'mda (1 kredit = 1 so'm).
    # STT 1 so'm/soniya. NEURONAI_STT_ENABLED=False bo'lsa provayderlar ro'yxatiga kirmaydi
    # (sinov: backend/scripts/compare_stt.py); STT_PROVIDER/STT_UZ_PRIMARY="neuronai" -- 1-o'rinda.
    NEURONAI_API_KEY: str = ""
    NEURONAI_BASE_URL: str = "https://my.neuronai.uz/api/v1"
    NEURONAI_STT_ENABLED: bool = False

    # Groq Cloud API (Ultra-Fast LPU Inference — Whisper STT & Fast LLM)
    GROQ_API_KEY: str = ""
    GROQ_API_KEYS: str = ""
    GROQ_STT_MODEL: str = "whisper-large-v3-turbo"
    GROQ_CHAT_MODEL: str = "qwen/qwen3.8-27b"

    # Tarjima provayderi: "openai" | "gemini". OpenAI krediti tugaganda
    # yoki Gemini'dan foydalanish kerak bo'lganda "gemini" qilib sozlanadi.
    TRANSLATE_PROVIDER: str = "gemini"

    # Gemini native TTS (tayyor ovozlar: Autonoe, Charon va h.k.)
    GEMINI_TTS_MODEL: str = "gemini-3.8-flash-tts"
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
    # uchun ishlatiladigan matn modeli — GEMINI_MODEL'dan alohida saqlanadi
    # (transcriber._transcribe_chunk_gemini buni Vertex/AI Studio ikkalasida
    # ham ishlatadi).
    GEMINI_VERTEX_TEXT_MODEL: str = "gemini-3.8-flash"

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
    # Barcha tariflar uchun asosiy TTS: "gemini"
    # Qiymatlar: "gemini" | "azure" | "edge" | "elevenlabs" | "openai" | "uzbekvoice"
    TTS_PROVIDER: str = "gemini"
    # Bo'sh bo'lmasa (masalan "azure"), BARCHA yangi job'lar shu TTS provayderida
    # ovozlanadi -- job/tarif tanlovi va FREE_MODE'ning majburiy Edge'idan ustun.
    # Gemini krediti tugaganda vaqtincha boshqa provayderga o'tish uchun (2026-10-27).
    TTS_PROVIDER_OVERRIDE: str = ""
    # Premium tarif (Pro / Pro Yearly) uchun yuqori sifatli ovoz provayderi:
    TTS_PREMIUM_PROVIDER: str = "gemini"
    # Asosiy provider muvaqqat xatolik bilan (timeout/429/5xx) ishlamasa shu
    # providerga o'tiladi (2-o'rinda Azure):
    TTS_FALLBACK_PROVIDER: str = "azure"

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

    # Telegram Notification Bot -- token .env orqali beriladi (yuqoridagi
    # TELEGRAM_BOT_TOKEN maydoni bilan bir xil; ilgari shu yerda ikkinchi
    # marta e'lon qilinib, haqiqiy tokenni kod ichida ochib qo'ygan edi).
    TELEGRAM_CHAT_ID: str = "-1004431243067"

    # Resend (email tasdiqlash kodlari uchun — gapirai.uz domenida SPF/DKIM tasdiqlangan)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "noreply@gapirai.uz"
    RESEND_FROM_NAME: str = "GapirAI.uz"
    # Avtomatik xatlar (backend/services/lifecycle_emails.py) uchun kunlik chegara.
    # Resend bepul tarifi: kuniga 100, oyiga 3000 ta (barcha xatlar, kirish kodlari ham).
    EMAIL_DAILY_LIMIT: int = 90

    # SMTP sozlamalari (Admin Gmail yoki maxsus SMTP server orqali xat jo'natish uchun)
    SMTP_ENABLED: bool = False
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "GapirAI.uz"
    SMTP_USE_TLS: bool = True

    # Web Push (PWA bildirishnomalari) — VAPID kalitlari. Bo'sh bo'lsa push
    # butunlay o'chiq (frontend tugmani ko'rsatmaydi, backend jimgina
    # o'tkazib yuboradi). Server'da generatsiya:
    #   python3 -c "from py_vapid import Vapid01; v=Vapid01(); v.generate_keys(); import base64; \
    #   print('PUB', base64.urlsafe_b64encode(v.public_key.public_bytes(...)))"
    # (aniq buyruq backend/services/push_service.py izohida)
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:contact@gapirai.uz"

    # Google bilan kirish — faqat CLIENT_ID kerak (frontend'dagi Google
    # Identity Services token beradi, backend uni shu ID orqali tekshiradi;
    # server-side auth-code almashinuvi ishlatilmagani uchun CLIENT_SECRET
    # kerak emas). Bo'sh bo'lsa, frontend tugmani ko'rsatmaydi.
    GOOGLE_CLIENT_ID: str = ""

    # Mobil ilova (mobile/) uchun ALOHIDA Android turidagi OAuth mijoz
    # (2026-08-22) — Google endi "Web application" mijozlar uchun custom-scheme
    # redirect_uri'ni (gapirai://) rad etadi ("doesn't comply with Google's
    # OAuth 2.0 policy"), shuning uchun mobil ilova o'zining Android mijozidan
    # foydalanadi. ID token'ning "aud" maydoni shu ID bo'ladi, GOOGLE_CLIENT_ID
    # (web) emas — backend/services/google_auth.py ikkalasini ham qabul qiladi.
    GOOGLE_ANDROID_CLIENT_ID: str = ""

    # Eskiz.uz SMS OTP (https://notify.eskiz.uz/api) — email+parol orqali
    # login qilib bearer token oladi (Redis'da keshlanadi, sms_service.py),
    # Resend'ning statik API key'idan farqli. Bo'sh bo'lsa, SMS yuborilmaydi
    # va foydalanuvchiga aniq xatolik qaytariladi.
    ESKIZ_EMAIL: str = ""
    ESKIZ_PASSWORD: str = ""
    ESKIZ_FROM: str = "4546"  # Eskiz sandbox/test sender nickname — productionda tasdiqlangan nom kerak

    # Modal (https://modal.com) — cloud GPU for heavy tasks (TTS, merge)
    # OFF by default. Enable after: pip install modal && modal token new
    MODAL_ENABLED: bool = False
    MODAL_API_KEY: str = ""

    # Admin panel — role='admin' bo'lsa ham, faqat shu ro'yxatdagi email
    # kira oladi (vergul bilan ajratilgan). Bo'sh bo'lsa, faqat role tekshiriladi.
    ADMIN_ALLOWED_EMAILS: str = "lochinbeksetor@gmail.com,den4ikorm@gmail.com"

    # Click Payment
    CLICK_MERCHANT_ID: str = "56653"
    CLICK_SERVICE_ID: str = "108780"
    CLICK_SECRET_KEY: str = ""
    CLICK_MERCHANT_USER_ID: str = "89102"

    # ---- Avtomatik to'lov (rekurrent) — backend/services/recurring.py ----
    # Karta tokeni API'lari merchant akkauntda ALOHIDA yoqilishi kerak
    # (Click: "card_token" imkoniyati; Payme: "Cards"/"Subscribe" API).
    # Yoqilmaguncha bu flaglar False qolsin — karta bog'lash UI'da yashiriladi,
    # auto-renew / auto top-up ishlamaydi, mavjud redirect-checkout esa
    # o'zgarishsiz ishlayveradi.
    CLICK_CARD_TOKEN_ENABLED: bool = False
    PAYME_CARD_TOKEN_ENABLED: bool = False
    # Click Card Token API bazasi (v2 merchant). Auth: generate_digest bilan
    # bir xil (sha1(timestamp + secret)). service_id odatda checkout bilan bir
    # xil, lekin Click alohida bersa CLICK_CARD_SERVICE_ID bilan almashtiriladi.
    CLICK_CARD_API_URL: str = "https://api.click.uz/v2/merchant"
    CLICK_CARD_SERVICE_ID: str = ""  # bo'sh -> CLICK_SERVICE_ID ishlatiladi
    # Payme Cards/Subscribe API. cards.* metodlari X-Auth: <merchant_id>,
    # receipts.* metodlari X-Auth: <merchant_id>:<key>. Sandbox rejimida
    # checkout.test.paycom.uz/api ishlatiladi (PAYME_SANDBOX_MODE).
    PAYME_CARD_API_URL: str = "https://checkout.paycom.uz/api"
    PAYME_CARD_API_URL_SANDBOX: str = "https://checkout.test.paycom.uz/api"
    # Bir foydalanuvchiga bir kunda ruxsat etilgan avtomatik daqiqa-to'ldirish
    # soni (runaway/abuse himoyasi). Job yaratishda tekshiriladi.
    AUTO_TOPUP_MAX_PER_DAY: int = 2
    # Obuna avtomatik uzaytirilishi muvaffaqiyatsiz bo'lsa, tarif imtiyozlari
    # shu kun davomida saqlanadi va har kuni qayta urinib ko'riladi; keyin FREE.
    AUTO_RENEW_GRACE_DAYS: int = 3

    # Payme (Paycom) Payment -- Merchant API (backend/api/payme_routes.py).
    # PAYME_KEY ishlab chiqarish (checkout.paycom.uz) uchun, PAYME_TEST_KEY
    # esa pesochnitsa (test.paycom.uz) uchun -- ikkalasi ham Basic Auth
    # orqali kiruvchi so'rovlarni tekshirishda ishlatiladi.
    PAYME_MERCHANT_ID: str = ""
    PAYME_KEY: str = ""
    PAYME_TEST_KEY: str = ""
    # Kassa Payme kabinetida hali production uchun faollashtirilmagan bo'lsa
    # True qoldiring -- checkout havolalari test.paycom.uz'ga yo'naltiriladi.
    # PAYME_KEY to'ldirilgan bo'lishi kassa faollashganini ANGLATMAYDI (haqiqiy
    # checkoutda "Поставщик не найден или заблокирован" xatosi orqali
    # 2026-08-19 aniqlangan) -- shuning uchun bu alohida, qo'lda boshqariladigan
    # flag. Payme kassani production uchun tasdiqlagach, False qiling.
    PAYME_SANDBOX_MODE: bool = True

    # Uzum Bank (Merchant webhook API). Uzum bizga POST /check, /create,
    # /confirm, /reverse, /status so'rovlarini shu login/parol bilan Basic
    # Auth orqali yuboradi -- Click/Payme'dan farqli, WEBHOOK_USERNAME/
    # PASSWORD'ni BIZ tanlaymiz va Uzum'ga beramiz (ular bizga bermaydi).
    # UZUM_SERVICE_ID esa 2026-09-10 servis faollashtirilganda Uzum tomonidan
    # berilgan production qiymat (test bosqichida boshqa ID ishlatilgan edi).
    # Foydalanuvchi to'lov formasini shu deeplink ochadi:
    #   https://uzumbank.uz/open-service?serviceId=<UZUM_SERVICE_ID>&account=<account>
    UZUM_WEBHOOK_USERNAME: str = ""
    UZUM_WEBHOOK_PASSWORD: str = ""
    UZUM_SERVICE_ID: int = 498658777

    # Paynet (UZPAYNET) Universal Web-Service (JSON-RPC 2.0, Basic Auth) --
    # backend/api/paynet_routes.py. Xuddi Uzum kabi, login/parol va
    # serviceId'ni BIZ tanlaymiz va Paynet'ga beramiz (ular bermaydi).
    PAYNET_USERNAME: str = ""
    PAYNET_PASSWORD: str = ""
    PAYNET_SERVICE_ID: int = 1

    FRONTEND_URL: str = "https://gapirai.uz"

    # yt-dlp orqali YouTube'dan yuklab olishda ishlatiladigan HTTP(S) proxy —
    # http://user:pass@host:port. Butunlay IXTIYORIY — AWS/GCP kabi datacenter
    # IP'larni YouTube ko'pincha bot deb belgilab, PO token/cookie holatidan
    # qat'iy nazar "Video unavailable" qaytaradi (2026-08-12 productionda
    # tasdiqlangan); bo'sh/false bo'lsa to'g'ridan-to'g'ri ulanishga tushadi
    # (lokal/rezident IP yoki PO token o'zi yetarli bo'lsa kerak emas).
    # Standart qiymat False — production o'z .env faylida buni aniq "true"
    # deb belgilaydi, shuning uchun bu yerdagi standart faqat local/dev uchun.
    # ENABLED alohida flag — provayderda muammo chiqsa (masalan 2026-08-22
    # Webshare balansi tugagan real hodisa), URL'ni o'chirmasdan tezda
    # proxysiz rejimga qaytarish uchun.
    YOUTUBE_PROXY_ENABLED: bool = False
    YOUTUBE_PROXY_URL: str = ""

    # Ikkinchi (zaxira) proksi — residential, YOUTUBE_PROXY_URL (datacenter,
    # tezkor) bot-check xatosiga uchraganda ishlatiladi. Datacenter proksi
    # tez lekin ko'proq bloklanadi; residential sekin (~1.9 Mbps, 2026-08-13
    # o'lchangan) lekin YouTube uni oddiy foydalanuvchi deb hisoblaydi.
    # Aksariyat so'rovlar datacenter orqali muvaffaqiyatli o'tadi — residential
    # faqat zaxira sifatida, cheklangan trafik hajmini tejash uchun.
    YOUTUBE_RESIDENTIAL_PROXY_URL: str = ""

    # ---- Proxy pool: rotation + health tracking (backend/services/proxy_manager.py) ----
    # 2026-09-04: replaces the single-URL model above with an N-proxy-per-tier
    # pool, so proxies can be added/removed/swapped in .env + `docker compose
    # up -d backend worker` -- no code change, no redeploy. The single-URL
    # vars above are NOT removed: if a *_PROXIES pool below is empty,
    # proxy_manager falls back to treating YOUTUBE_PROXY_URL /
    # YOUTUBE_RESIDENTIAL_PROXY_URL as a 1-proxy pool for that tier, so an
    # existing deployment keeps working unchanged until someone opts into
    # the pool form.
    #
    # Master switch. False (default): only the DIRECT attempt runs, exactly
    # like a fresh install with no proxy configured at all -- proxy pools
    # are simply not consulted, regardless of what's in *_PROXIES below.
    PROXY_ENABLED: bool = False
    # Try a direct (no-proxy) connection before any proxy tier. Cheap (one
    # fast attempt) and occasionally succeeds even when proxies are
    # configured, so it stays on by default; set False to skip straight to
    # the proxy chain (e.g. once direct is known to reliably fail).
    PROXY_DIRECT_FIRST: bool = True
    # Comma-separated http://user:pass@host:port list. 2026-08-27 audit
    # measured ZERO benefit over a direct connection for YouTube's bot-check
    # (0/4 either way, in an isolated 4-video-per-path experiment) -- kept
    # as a configurable, OFF-by-default rung rather than deleted, in case a
    # different provider or YouTube's own detection changes. Do not expect
    # this tier to help before re-testing it.
    DATACENTER_PROXIES: str = ""
    # Comma-separated http://user:pass@host:port list. The one tier proven
    # to help in the same experiment (2/4 first-attempt, 3/4 eventual).
    RESIDENTIAL_PROXIES: str = ""
    # Hard cap on distinct endpoints (direct + datacenter + residential
    # combined) tried per download call, regardless of how large the pools
    # are -- bounds worst-case latency on a video that fails everywhere.
    PROXY_MAX_RETRIES: int = 5
    PROXY_TIMEOUT: int = 30
    # How long a proxy that just failed is skipped in rotation. A proxy
    # that reports PROXY_BILLING_ERROR (account out of balance) gets a much
    # longer cooldown instead (see _BILLING_COOLDOWN_SECONDS in
    # proxy_manager.py) -- that class of failure does not self-resolve in
    # minutes.
    PROXY_COOLDOWN_SECONDS: int = 300

    # YouTube Data API v3 (https://console.cloud.google.com) -- video metadata
    # (sarlavha/davomiylik/thumbnail) olishda yt-dlp skrapping o'rniga rasman
    # API ishlatiladi, bot-check xavfisiz. Bo'sh bo'lsa, eski yt-dlp yo'liga
    # tushadi. Faqat METADATA uchun -- video faylining o'zini yuklab olish
    # (dublyaj uchun) hamon yt-dlp orqali, chunki Data API video oqimini
    # bermaydi (2026-08-20, rezident proksi balansi tugagach qo'shildi).
    YOUTUBE_DATA_API_KEY: str = ""
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_FEEDBACK_CHANNEL_ID: str = "-1004431243067"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def __init__(self, **values):
        super().__init__(**values)
        if not self.GEMINI_API_KEY and self.GOOGLE_GENERATIVE_AI_API_KEY:
            self.GEMINI_API_KEY = self.GOOGLE_GENERATIVE_AI_API_KEY
        elif not self.GOOGLE_GENERATIVE_AI_API_KEY and self.GEMINI_API_KEY:
            self.GOOGLE_GENERATIVE_AI_API_KEY = self.GEMINI_API_KEY


@lru_cache()
def get_settings() -> Settings:
    return Settings()


def telegram_api_base() -> str:
    """Telegram Bot API bazaviy manzili. Mahalliy server sozlangan bo'lsa
    (TELEGRAM_LOCAL_API_URL, docker-compose.yml: telegram-bot-api) -- o'sha,
    aks holda rasmiy bulut.

    Botning O'ZI (telegram_bot.py, long-polling) va undan MUSTAQIL chiquvchi
    xabarlar (telegram_notify.py -- "video tayyor", telegram_service.py --
    baho/fikr) IKKALASI HAM shu manzildan foydalanishi SHART: bot mahalliy
    serverga ko'chirilgach (bir martalik logOut), rasmiy bulut API o'sha
    token uchun 401 qaytaradi -- ya'ni to'g'ridan-to'g'ri api.telegram.org'ga
    yuborilgan har qanday sendMessage muvaffaqiyatsiz bo'ladi."""
    base = (get_settings().TELEGRAM_LOCAL_API_URL or "").rstrip("/")
    return base or "https://api.telegram.org"
