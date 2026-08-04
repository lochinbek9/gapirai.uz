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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    create_tables()
    recover_stuck_jobs()
    yield
    # Shutdown (agar kerak bo'lsa)


app = FastAPI(
    title="Xadichai.uz API",
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

# Tayyor videolarni statik fayl sifatida serve qilish
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Xadichai.uz"}
