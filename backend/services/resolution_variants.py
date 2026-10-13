"""Tarif bo'yicha yuklab olish sifati (360p/720p/1080p) uchun qo'shimcha
video versiyalarini yaratadi. 720p uchun bu modul chaqirilmaydi -- u
allaqachon master fayl (dubber/{job_id}/dubbed_final.mp4), chunki
downloader.py manba videoni shu chegarada yuklab oladi.

360p -- masterdan arzon KICHRAYTIRISH (audio qayta aralashtirilmaydi).
1080p -- masterda haqiqiy 1080p tafsilot yo'q (manba 720p da yuklab
olingan), shuning uchun YouTube manbasi qayta 1080p gacha yuklab olinadi va
merger.merge_video_audio() bilan qayta birlashtiriladi -- lekin dublyaj
audiosi ALLAQACHON S3'da saqlangan (transkripsiya/tarjima/TTS bosqichlari
QAYTA bajarilmaydi, faqat video yuklab olish + ffmpeg merge takrorlanadi).
"""
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from backend.config import get_settings
from backend.services import downloader, merger
from backend.services.storage import (
    upload_file_to_s3,
    download_file_from_s3,
    generate_presigned_download_url,
    s3_object_exists,
)

logger = logging.getLogger(__name__)
settings = get_settings()


def generate_360p(job) -> str:
    job_id = job.storage_id
    master_key = f"dubber/{job_id}/dubbed_final.mp4"
    if settings.AWS_BUCKET_NAME:
        if not s3_object_exists(master_key):
            raise RuntimeError("Master video S3'da topilmadi (saqlash muddati tugagan bo'lishi mumkin).")
        master_url = generate_presigned_download_url(master_key)
        if not master_url:
            raise RuntimeError("Master video S3'da topilmadi.")
    else:
        master_url = job.output_video_path
        if not master_url or not os.path.exists(master_url):
            fallback_master = str(Path(settings.OUTPUT_DIR) / job_id / "video" / "dubbed_final.mp4")
            if os.path.exists(fallback_master):
                master_url = fallback_master
            else:
                raise RuntimeError("Master video lokal diskda topilmadi.")

    out_dir = Path(settings.OUTPUT_DIR) / job_id / "video"
    out_dir.mkdir(parents=True, exist_ok=True)
    local_out = str(out_dir / "dubbed_360p.mp4")

    cmd = [
        "ffmpeg", "-y",
        "-i", master_url,
        "-vf", "scale=-2:360",
        "-c:v", "libx264", "-crf", "23", "-preset", "fast",
        "-c:a", "copy",
        local_out,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(f"360p kichraytirishda ffmpeg xatoligi:\n{result.stderr[-1500:]}")

    s3_key = f"dubber/{job_id}/dubbed_360p.mp4"
    if settings.AWS_BUCKET_NAME:
        if not upload_file_to_s3(local_out, s3_key):
            raise RuntimeError("360p versiyani S3'ga yuklab bo'lmadi.")
        try:
            os.remove(local_out)
        except Exception:
            pass
        return s3_key
    else:
        return f"/outputs/{job_id}/video/dubbed_360p.mp4"


def generate_1080p(job) -> str:
    job_id = job.storage_id
    tmp_job_id = f"{job_id}_1080p"
    tmp_dir = Path(settings.UPLOAD_DIR) / tmp_job_id

    try:
        local_audio = None
        if settings.AWS_BUCKET_NAME:
            audio_s3_key = f"dubber/{job_id}/dubbed_audio.wav"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            cand_s3_audio = str(tmp_dir / "dubbed_audio.wav")
            if download_file_from_s3(audio_s3_key, cand_s3_audio):
                local_audio = cand_s3_audio

        if not local_audio or not os.path.exists(local_audio):
            candidate_paths = [
                getattr(job, "dubbed_audio_path", None),
                str(Path(settings.OUTPUT_DIR) / job_id / "audio" / "tts_segments" / "dubbed_audio.wav"),
                str(Path(settings.OUTPUT_DIR) / job_id / "audio" / "dubbed_audio.wav"),
            ]
            for p in candidate_paths:
                if p and os.path.exists(p):
                    local_audio = p
                    break

        # Fallback: extract dubbed audio from master video
        if not local_audio or not os.path.exists(local_audio):
            master_video = getattr(job, "output_video_path", None)
            if not master_video or not os.path.exists(master_video):
                cand_master = str(Path(settings.OUTPUT_DIR) / job_id / "video" / "dubbed_final.mp4")
                if os.path.exists(cand_master):
                    master_video = cand_master

            if master_video and os.path.exists(master_video):
                tmp_dir.mkdir(parents=True, exist_ok=True)
                extracted_audio = str(tmp_dir / "dubbed_audio.wav")
                cmd = ["ffmpeg", "-y", "-i", master_video, "-vn", "-c:a", "pcm_s16le", extracted_audio]
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                if res.returncode == 0 and os.path.exists(extracted_audio):
                    local_audio = extracted_audio

        if not local_audio or not os.path.exists(local_audio):
            raise RuntimeError("Dublyaj audiosi lokal diskda topilmadi.")

        if not getattr(job, "youtube_url", None):
            raise RuntimeError("1080p sifat faqat YouTube videolari uchun mavjud.")

        download_result = downloader.download_video(job.youtube_url, tmp_job_id, max_height=1080)
        video_path = download_result["video_path"]

        out_dir = Path(settings.OUTPUT_DIR) / job_id / "video"
        out_dir.mkdir(parents=True, exist_ok=True)
        local_out = str(out_dir / "dubbed_1080p.mp4")

        merger.merge_video_audio(
            video_path=video_path,
            dubbed_audio_path=local_audio,
            output_path=local_out,
        )

        s3_key = f"dubber/{job_id}/dubbed_1080p.mp4"
        if settings.AWS_BUCKET_NAME:
            if not upload_file_to_s3(local_out, s3_key):
                raise RuntimeError("1080p versiyani S3'ga yuklab bo'lmadi.")
            try:
                os.remove(local_out)
            except Exception:
                pass
            return s3_key
        else:
            return f"/outputs/{job_id}/video/dubbed_1080p.mp4"
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def generate_variant(job, resolution: str) -> str:
    if resolution == "360p":
        return generate_360p(job)
    if resolution == "1080p":
        return generate_1080p(job)
    raise ValueError(f"Qo'llab-quvvatlanmaydigan rezolyutsiya: {resolution}")


@dataclass
class ResolutionRequestResult:
    outcome: str  # "ready" | "processing" | "forbidden" | "invalid" | "expired"
    download_url: str | None = None


def request_resolution(db, job, resolution: str, max_resolution_override: str | None = None) -> ResolutionRequestResult:
    """Web (routes.py) va Telegram bot (telegram_bot.py) ikkalasi ham
    chaqiradigan yagona kirish nuqtasi -- tarif tekshiruvi, 720p uchun
    darhol javob, 360p/1080p uchun keshdan yoki Celery task orqali
    generatsiya faqat BITTA joyda yozilgan (job_creation.py bilan bir xil
    naqsh).

    max_resolution_override -- Ommaviy videolar kutubxonasida tomosha
    qilayotgan odam job egasi bo'lmasligi mumkin (2026-08-19); shu holatda
    routes.py TOMOSHABIN tarifini shu orqali uzatadi, aks holda odatdagidek
    job egasining tarifi tekshiriladi (get_max_resolution_for_job)."""
    from backend.models.database import ResolutionVariant
    from backend.services.plans import get_max_resolution_for_job, RESOLUTION_ORDER

    if resolution not in RESOLUTION_ORDER:
        return ResolutionRequestResult(outcome="invalid")

    max_res = max_resolution_override or get_max_resolution_for_job(db, job)
    if RESOLUTION_ORDER.index(resolution) > RESOLUTION_ORDER.index(max_res):
        return ResolutionRequestResult(outcome="forbidden")

    job_id = job.storage_id
    master_key = f"dubber/{job_id}/dubbed_final.mp4"

    # Barcha rezolyutsiyalar (720p ham, kesh'dagi tayyor variant ham) shu bitta
    # master fayl ustida qurilgan -- agar u S3 lifecycle (3 kun) bo'yicha
    # o'chirilgan bo'lsa, boshqa hech narsa ham ishlamaydi (2026-08-21: avval
    # bu tekshirilmasdan "ready" qaytarilardi, keyin yuklab olishda jim 404
    # bo'lardi yoki 360p generatsiyasi tushunarsiz ffmpeg xatosi bilan
    # yiqilardi).
    if settings.AWS_BUCKET_NAME and not s3_object_exists(master_key):
        return ResolutionRequestResult(outcome="expired")

    if resolution == "720p":
        if settings.AWS_BUCKET_NAME:
            presigned_url = generate_presigned_download_url(master_key)
            if presigned_url:
                return ResolutionRequestResult(outcome="ready", download_url=presigned_url)
        return ResolutionRequestResult(outcome="ready", download_url=f"/api/outputs/{job_id}/video")

    variant = (
        db.query(ResolutionVariant)
        .filter(ResolutionVariant.job_id == job.storage_id, ResolutionVariant.resolution == resolution)
        .first()
    )
    if variant is None:
        variant = ResolutionVariant(job_id=job.storage_id, resolution=resolution, status="pending")
        db.add(variant)
        db.commit()
        db.refresh(variant)

    if variant.status == "ready" and variant.s3_key:
        if settings.AWS_BUCKET_NAME:
            if s3_object_exists(variant.s3_key):
                presigned_url = generate_presigned_download_url(variant.s3_key)
                if presigned_url:
                    return ResolutionRequestResult(outcome="ready", download_url=presigned_url)
            variant.status = "pending"  # s3_key ishlamay qoldi -- qayta yaratamiz
        else:
            return ResolutionRequestResult(outcome="ready", download_url=variant.s3_key)

    if variant.status != "processing":
        variant.status = "processing"
        variant.error_message = None
        db.commit()
        from backend.workers.resolution_tasks import generate_resolution_variant_task
        generate_resolution_variant_task.apply_async(args=[job_id, resolution])

    return ResolutionRequestResult(outcome="processing")
