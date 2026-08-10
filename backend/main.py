from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os

from backend.config import get_settings
from backend.models.database import create_tables
from backend.api.routes import router
from backend.api.auth_routes import router as auth_router
from backend.api.click_routes import router as click_router
from backend.api.admin_routes import router as admin_router
from backend.api.video_analysis_routes import router as video_analysis_router

settings = get_settings()


def recover_stuck_jobs():
    from backend.models.database import SessionLocal, DubbingJob, JobStatus
    from backend.workers.tasks import process_video
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
        stuck_jobs = db.query(DubbingJob).filter(DubbingJob.status.in_(active_statuses)).all()
        if stuck_jobs:
            for job in stuck_jobs:
                print(f"[RECOVERY] Re-enqueueing stuck job {job.id} with status {job.status}")
                job.status = JobStatus.PENDING
                job.status_message = "Tizim qayta ishga tushgandan so'ng jarayon qayta tiklandi."
                db.commit()
                process_video.apply_async(args=[str(job.id)], task_id=str(job.id))
    except Exception as e:
        print(f"[RECOVERY ERROR] Error during job recovery: {e}")
    finally:
        db.close()


def recover_stuck_analyses():
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
        stuck = db.query(VideoAnalysis).filter(VideoAnalysis.status.in_(active_statuses)).all()
        for analysis in stuck:
            print(f"[RECOVERY] Re-enqueueing stuck analysis {analysis.id} with status {analysis.status}")
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
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    create_tables()
    
    # Clear stale concurrent download locks
    try:
        from redis import Redis
        r = Redis.from_url(settings.REDIS_URL)
        r.delete("yt_dl:concurrent")
        print("[STARTUP] Cleared stale yt-dlp concurrency lock from Redis.")
    except Exception as e:
        print(f"[STARTUP ERROR] Could not clear Redis locks: {e}")

    recover_stuck_jobs()
    recover_stuck_analyses()
    yield
    # Shutdown (agar kerak bo'lsa)


app = FastAPI(
    title="GapirAI.uz API",
    description="YouTube videolarini sun'iy intellekt yordamida o'zbek tiliga dublyaj va tarjima qilish platformasi API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Next.js frontendi uchun
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        },
    )

# API routerlar
app.include_router(auth_router)
app.include_router(router)
app.include_router(click_router)
app.include_router(admin_router)
app.include_router(video_analysis_router)

# Tayyor videolarni statik fayl sifatida serve qilish
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "GapirAI.uz"}
