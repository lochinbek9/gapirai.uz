from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import datetime
import logging
import os
import uuid

# Root logger sozlanmagan bo'lsa, backend/services/**'dagi 25+ modulning
# logger.info/warning/error() chaqiruvlari jim yo'qolib ketadi (faqat
# WARNING+ logging.lastResort orqali stderr'ga chiqadi) -- worker
# konteyneridan farqli o'laroq (Celery o'zi logging'ni sozlaydi), FastAPI
# jarayoni buni hech qachon o'z-o'zidan sozlamagan. telegram_bot.py'dagi
# bilan bir xil format ishlatiladi (2026-08-20).
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# httpx'ning INFO "HTTP Request: POST https://api.telegram.org/bot<TOKEN>/..."
# logi job yakunlanganda (telegram_notify.py) bot tokenini oshkor qiladi.
for _noisy in ("httpx", "httpcore"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
logger = logging.getLogger(__name__)

from backend.config import get_settings
from backend.models.database import create_tables
from backend.services.auth import AuthBusyError
from backend.api.routes import router
from backend.api.auth_routes import router as auth_router
from backend.api.click_routes import router as click_router
from backend.api.payme_routes import router as payme_router
from backend.api.paynet_routes import router as paynet_router
from backend.api.uzum_routes import router as uzum_router
from backend.api.admin_routes import router as admin_router
from backend.api.video_analysis_routes import router as video_analysis_router
from backend.api.plans_routes import router as plans_router
from backend.api.learn_routes import router as learn_router
from backend.api.minutes_routes import router as minutes_router
from backend.api.push_routes import router as push_router
from backend.api.billing_routes import router as billing_router
from backend.api.tma_routes import router as tma_router
from backend.api.donate_routes import router as donate_router

settings = get_settings()

# 2026-08-26 audit: shu ko'p marta qayta tiklashning yuqori chegarasi --
# doimiy (transient bo'lmagan) sababdan muvaffaqiyatsiz job (masalan
# eskirgan cookie/proxy balansi) HAR safar backend qayta ishga tushganda
# retries=0 bilan qayta navbatga qo'yilaverib, HECH QACHON FAILED holatiga
# yetmasdi (job 044530c0 productionda kunlar davomida shu tarzda aylanib
# yurgani kuzatilgan). Endi shu chegaradan keyin to'g'ridan-to'g'ri FAILED
# deb belgilanadi -- mavjud upload-recovery UI (fallback_available) shu
# orqali foydalanuvchiga ko'rinadi, cheksiz sukut aylanish o'rniga.
RECOVERY_MAX_ATTEMPTS = 5


def recover_stuck_jobs(redis_conn=None):
    """Ishga tushganda (yoki worker yo'qolganda) "osilib qolgan" job'larni
    qayta tiklaydi -- lekin endi Redis SETNX emas, backend/services/job_claim.py
    dagi BIR XIL DB-darajasidagi atomik claim orqali (tasks.py:process_video
    o'zi ishlatadigan mexanizm bilan bir xil manba):

    1. Faqat HAQIQATAN hech kim faol claim'ga ega bo'lmagan job'lar ko'rib
       chiqiladi (processing_claim_token bo'sh YOKI lease muddati tugagan)
       -- hali ishlab turgan job noto'g'ri qayta navbatga qo'yilmaydi. Bu
       FAQAT o'qish uchun (WHERE filtri) -- recovery bu maydonlarga o'zi
       yozmaydi (pastdagi 2-bandga qarang, nega).
    2. Navbatga qo'yishning o'zi Redis SETNX orqali qisqa muddatli
       dedup qilinadi (job_claim.py'dagi DB-claim EMAS): birinchi jihatdan
       job_claim.py'ni bu yerda ham ishlatish tabiiy ko'rinardi, lekin bitta
       haqiqiy poyga sharoiti sinovda tutildi -- agar recovery o'zi
       claim OLIB, DARHOL BO'SHATSA (vazifa keyinroq o'zi claim qilishi
       uchun), ikkita bir vaqtdagi recovery chaqiruvi orasidagi shu qisqa
       "bo'shatilgan" oyna orqali IKKALASI HAM apply_async chaqirishi
       mumkin ekan (test_concurrent_backend_restarts_only_one_enqueues
       orqali aniqlangan). Shuning uchun: recovery'ning o'zi hech qachon
       job_claim.py orqali YOZMAYDI -- faqat o'qiydi (1-band) va alohida,
       oddiy Redis SETNX bilan o'zining navbatga-qo'yish harakatini
       ketma-ketlashtiradi (eski _redis_recovery_claim, pastda).
       Haqiqiy xavfsizlik (dublikat QAYTA ISHLASH'ning oldini olish)
       process_video/analyze_video_task'ning O'Z ICHIDAGI try_claim
       chaqiruviga tayanadi -- shu SABABLI recovery tomonidagi dedup
       "faqat gigiena" (keraksiz Celery xabarlari/recovery_attempt_count
       shishishini kamaytiradi), yagona xavfsizlik chizig'i emas.
    3. recovery_attempt_count RECOVERY_MAX_ATTEMPTS'dan oshsa, qayta
       navbatga qo'yish o'rniga to'g'ridan-to'g'ri FAILED.
    """
    from backend.models.database import SessionLocal, DubbingJob, JobStatus
    from backend.workers.tasks import process_video
    from backend.services.plans import get_job_queue
    db = SessionLocal()
    try:
        active_statuses = [
            JobStatus.PENDING,
            JobStatus.DOWNLOADING,
            JobStatus.TRANSCRIBING,
            JobStatus.TRANSLATING,
            JobStatus.SYNTHESIZING,
            JobStatus.SYNCING,
            JobStatus.MERGING
        ]
        now = datetime.utcnow()
        candidates = db.query(DubbingJob).filter(
            DubbingJob.status.in_(active_statuses),
            (DubbingJob.processing_claim_token.is_(None)) | (DubbingJob.processing_lease_expires_at < now),
        ).all()
        for job in candidates:
            if job.recovery_attempt_count >= RECOVERY_MAX_ATTEMPTS:
                job.status = JobStatus.FAILED
                job.status_message = "Jarayon bir necha marta qayta tiklanishga urinildi, lekin muvaffaqiyatsiz bo'ldi."
                job.error_code = job.error_code or "RECOVERY_EXHAUSTED"
                job.updated_at = now
                db.commit()
                print(f"[RECOVERY] Job {job.id} recovery_attempt_count={job.recovery_attempt_count} limitga yetdi -- FAILED deb belgilandi.")
                continue

            if not _redis_recovery_claim(redis_conn, f"recovery_claim:job:{job.id}"):
                print(f"[RECOVERY] Skipping job {job.id} -- another process already claimed it.")
                continue

            print(f"[RECOVERY] Re-enqueueing stuck job {job.id} with status {job.status} (attempt {job.recovery_attempt_count + 1}/{RECOVERY_MAX_ATTEMPTS})")
            job.recovery_attempt_count += 1
            job.status = JobStatus.PENDING
            job.status_message = "Tizim qayta ishga tushgandan so'ng jarayon qayta tiklandi."
            db.commit()
            process_video.apply_async(args=[str(job.id)], task_id=str(job.id), queue=get_job_queue(db, job.user_id))
    except Exception as e:
        print(f"[RECOVERY ERROR] Error during job recovery: {e}")
    finally:
        db.close()


def _redis_recovery_claim(redis_conn, key: str, ttl: int = 300) -> bool:
    """recover_stuck_jobs/recover_stuck_analyses/recover_stuck_resolution_variants
    HAR BIRIning o'zining navbatga-qo'yish harakatini (nafaqat qaysi
    job'lar "kandidat" ekanini aniqlashni -- bu DB-claim orqali o'qiladi,
    job_claim.py) qisqa muddatli dedup qilish uchun. Nega DB-claim EMAS:
    recover_stuck_jobs()'ning o'z docstringidagi 2-bandga qarang -- claim'ni
    olib darhol bo'shatish (vazifaning o'zi keyinroq claim qilishi uchun)
    ikkita bir vaqtdagi recovery chaqiruvi orasida haqiqiy poyga sharoiti
    yaratishi sinovda tutildi."""
    try:
        return bool(redis_conn.set(key, "1", nx=True, ex=ttl))
    except Exception as e:
        print(f"[RECOVERY] Redis claim check failed ({key}): {e} -- xavfsiz tomonga o'tib, baribir navbatga qo'yiladi.")
        return True


def recover_stuck_resolution_variants(redis_conn):
    """360p/1080p generatsiyasi ham xuddi shu muammoga duchor bo'lishi
    mumkin -- vazifa worker qayta ishga tushishi (deploy) yoki servis
    ishdan chiqishi paytida uzilib qolsa, status "processing"da abadiy
    qotib qoladi (request_resolution faqat status "processing" BO'LMASA
    yangi vazifa navbatga qo'yadi, shuning uchun o'zi hech qachon
    tuzalmaydi). 2026-08-21 aniqlangan -- ikkita haqiqiy job'da kunlar
    davomida qotib qolgan holat topilgan."""
    from backend.models.database import SessionLocal, ResolutionVariant
    from backend.workers.resolution_tasks import generate_resolution_variant_task
    db = SessionLocal()
    try:
        stuck = db.query(ResolutionVariant).filter(ResolutionVariant.status == "processing").all()
        for variant in stuck:
            if not _redis_recovery_claim(redis_conn, f"recovery_claim:resolution:{variant.id}"):
                print(f"[RECOVERY] Skipping resolution variant {variant.id} -- another process already claimed it.")
                continue
            print(f"[RECOVERY] Re-enqueueing stuck resolution variant {variant.job_id}/{variant.resolution}")
            # task_id endi variant.id'ga bog'langan -- ilgari umuman
            # berilmagan edi (har chaqiruvda tasodifiy ID), shuning uchun
            # Celery natija-bazasida bir xil vazifani kuzatib bo'lmasdi.
            generate_resolution_variant_task.apply_async(
                args=[str(variant.job_id), variant.resolution], task_id=str(variant.id)
            )
    except Exception as e:
        print(f"[RECOVERY ERROR] Error during resolution variant recovery: {e}")
    finally:
        db.close()




def recover_stuck_analyses(redis_conn=None):
    """recover_stuck_jobs() bilan bir xil naqsh -- qarang shu funksiyaning
    izohi (DB-claim faqat o'qish uchun, navbatga-qo'yish dedup'i Redis
    SETNX bilan)."""
    from backend.models.database import SessionLocal, VideoAnalysis, AnalysisStatus
    from backend.workers.analysis_tasks import analyze_video_task
    db = SessionLocal()
    try:
        active_statuses = [
            AnalysisStatus.PENDING,
            AnalysisStatus.DOWNLOADING,
            AnalysisStatus.EXTRACTING_AUDIO,
            AnalysisStatus.TRANSCRIBING,
            AnalysisStatus.ANALYZING,
            AnalysisStatus.GENERATING_RESULTS,
        ]
        now = datetime.utcnow()
        candidates = db.query(VideoAnalysis).filter(
            VideoAnalysis.status.in_(active_statuses),
            (VideoAnalysis.processing_claim_token.is_(None)) | (VideoAnalysis.processing_lease_expires_at < now),
        ).all()
        for analysis in candidates:
            if analysis.recovery_attempt_count >= RECOVERY_MAX_ATTEMPTS:
                analysis.status = AnalysisStatus.FAILED
                analysis.status_message = "Jarayon bir necha marta qayta tiklanishga urinildi, lekin muvaffaqiyatsiz bo'ldi."
                analysis.error_code = analysis.error_code or "RECOVERY_EXHAUSTED"
                analysis.updated_at = now
                db.commit()
                print(f"[RECOVERY] Analysis {analysis.id} recovery_attempt_count={analysis.recovery_attempt_count} limitga yetdi -- FAILED deb belgilandi.")
                continue

            if not _redis_recovery_claim(redis_conn, f"recovery_claim:analysis:{analysis.id}"):
                print(f"[RECOVERY] Skipping analysis {analysis.id} -- another process already claimed it.")
                continue

            print(f"[RECOVERY] Re-enqueueing stuck analysis {analysis.id} with status {analysis.status} (attempt {analysis.recovery_attempt_count + 1}/{RECOVERY_MAX_ATTEMPTS})")
            analysis.recovery_attempt_count += 1
            analysis.status = AnalysisStatus.PENDING
            analysis.status_message = "Tizim qayta ishga tushgandan so'ng jarayon qayta tiklandi."
            db.commit()
            analyze_video_task.apply_async(args=[str(analysis.id)], task_id=str(analysis.id))
    except Exception as e:
        print(f"[RECOVERY ERROR] Error during analysis recovery: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    # 2026-08-28 (GapirAI integratsiya): SECRET_KEY bo'sh bo'lsa istalgan kishi
    # o'zi JWT yasab, istalgan foydalanuvchi (admin ham) nomidan kira oladi.
    # Denis'ning client docs'i noto'g'ri "JWT_SECRET_KEY" nomini ko'rsatadi --
    # kod SECRET_KEY o'qiydi, shuning uchun docs bo'yicha deploy qilinsa bu
    # BO'SH qoladi. Production'da (DEBUG=False) darhol to'xtatamiz.
    _LEAKED_PLACEHOLDER = "ai-dubber-secret-key-2024-uzbek-platform"  # eski .env.example qiymati -- git tarixida
    if not settings.DEBUG and (
        not settings.SECRET_KEY
        or len(settings.SECRET_KEY) < 16
        or settings.SECRET_KEY == _LEAKED_PLACEHOLDER
    ):
        raise RuntimeError(
            "SECRET_KEY .env orqali HAQIQIY tasodifiy qiymat bilan berilishi SHART "
            "(kamida 16 belgi, eski placeholder EMAS). Docs'dagi 'JWT_SECRET_KEY' "
            "EMAS -- aynan 'SECRET_KEY'. Generatsiya: "
            "python -c \"import secrets; print(secrets.token_urlsafe(48))\""
        )
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    create_tables()
    
    from redis import Redis
    r = Redis.from_url(settings.REDIS_URL)

    # Clear stale concurrent download locks
    try:
        r.delete("yt_dl:concurrent")
        print("[STARTUP] Cleared stale yt-dlp concurrency lock from Redis.")
    except Exception as e:
        print(f"[STARTUP ERROR] Could not clear Redis locks: {e}")

    recover_stuck_jobs(r)
    recover_stuck_resolution_variants(r)
    recover_stuck_analyses(r)
    yield
    # Shutdown (agar kerak bo'lsa)


app = FastAPI(
    title="GapirAI.uz API",
    description="YouTube videolarini sun'iy intellekt yordamida o'zbek tiliga dublyaj va tarjima qilish platformasi API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Next.js frontendi uchun. Ilgari "*" (istalgan sayt) edi -- 2026-08-20
# audit paytida wildcard CORS aniqlanib, haqiqiy ruxsat etilgan originlar
# ro'yxatiga almashtirildi (www ham gapirai.uz bilan bir xil saytni
# ko'rsatadi -- nginx/DNS orqali tasdiqlangan, shuning uchun ro'yxatda).
_allowed_origins = [
    settings.FRONTEND_URL,
    "https://www.gapirai.uz",
    "https://admin.gapirai.uz",
    "http://localhost:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(_allowed_origins)),  # tartibni saqlab dublikatlarni olib tashlaydi
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(AuthBusyError)
async def auth_busy_handler(request: Request, exc: AuthBusyError):
    """bcrypt darvozasi to'la (backend/services/auth.py:BcryptGate) -- 500 emas,
    tushunarli 503. Bu handler Exception handler'dan aniqroq, shuning uchun
    birinchi tanlanadi; CORS sarlavhalarini middleware o'zi qo'shadi."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Hozir kirish urinishlari juda ko'p. Bir necha soniyadan keyin qayta urinib ko'ring."},
        headers={"Retry-After": "5"},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Barcha ushlanmagan xatoliklar shu yerga tushadi. Avval bu yerda
    xom `str(exc)` to'g'ridan-to'g'ri foydalanuvchiga qaytarilardi (ichki
    xato matnini, ba'zan fayl yo'llari yoki kutubxona ichki tafsilotlarini
    ochib qo'yardi) va hech qayerda log qilinmasdi. Endi: to'liq
    traceback serverda log qilinadi (qisqa xato ID bilan, docker compose
    logs orqali ko'rinadi), foydalanuvchiga esa faqat xavfsiz umumiy xabar
    + shu ID qaytariladi."""
    error_id = uuid.uuid4().hex[:8]
    logger.exception(f"[{error_id}] Ushlanmagan xatolik: {request.method} {request.url.path}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Kutilmagan xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring. (Xato ID: {error_id})"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        },
    )

# API routerlar
app.include_router(auth_router)
app.include_router(router)
app.include_router(click_router)
app.include_router(payme_router)
app.include_router(paynet_router)
app.include_router(uzum_router)
app.include_router(admin_router)
app.include_router(video_analysis_router)
app.include_router(plans_router)
app.include_router(learn_router)
app.include_router(minutes_router)
app.include_router(push_router)
app.include_router(billing_router)
app.include_router(tma_router)
app.include_router(donate_router)

# Tayyor videolarni statik fayl sifatida serve qilish
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "GapirAI.uz"}
