from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from backend.config import get_settings
from backend.models.database import create_tables
from backend.api.routes import router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    create_tables()
    yield
    # Shutdown (agar kerak bo'lsa)


app = FastAPI(
    title="AI Dubber API",
    description="YouTube videolarini o'zbek tiliga dublyaj qilish",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Next.js frontendi uchun
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routerlar
app.include_router(router)

# Tayyor videolarni statik fayl sifatida serve qilish
app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "AI Dubber"}
