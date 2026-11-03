"""Suv belgisi istisnolari (hamkorlar) -- boshqaruv va eski videolarni qayta yig'ish.

    # ro'yxat / qo'shish / olib tashlash
    docker compose exec -T worker python -m backend.scripts.watermark_exempt list
    docker compose exec -T worker python -m backend.scripts.watermark_exempt add EMAIL --note "hamkor"
    docker compose exec -T worker python -m backend.scripts.watermark_exempt remove EMAIL

    # eski tayyor videolarini belgisiz qayta yig'ish (sukut: faqat ko'rsatadi)
    docker compose exec -T worker python -m backend.scripts.watermark_exempt remerge EMAIL
    docker compose exec -T worker python -m backend.scripts.watermark_exempt remerge EMAIL --apply

Qayta yig'ish faqat oxirgi bosqich (ffmpeg): mavjud o'zbekcha ovoz + asl video (diskda yoki
checkpoint'da bo'lmasa YouTube'dan qayta yuklanadi). Daqiqa ham, AI ham sarflanmaydi.
Kesh nusxasi (source_job_id) bo'lgan job avval o'z fayllariga ajratiladi -- asl egasining
(belgili) videosiga tegilmaydi. Sifat variantlari (360/480/1080p) o'chiriladi -- birinchi
so'rovda yangi masterdan qayta tayyorlanadi.
Worker konteynerida ishga tushiring (ffmpeg, yt-dlp, cookies shu yerda).
"""
import argparse
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.config import get_settings
from backend.models.database import DubbingJob, JobStatus, ResolutionVariant, SessionLocal, User, WatermarkExemption

settings = get_settings()


def _user(db, email: str) -> User:
    user = db.query(User).filter(User.email.ilike(email.strip())).first()
    if not user:
        sys.exit(f"Foydalanuvchi topilmadi: {email}")
    return user


def _out(job_id) -> Path:
    return Path(settings.OUTPUT_DIR) / str(job_id)


def _find_audio(job: DubbingJob) -> Path | None:
    from backend.services.job_checkpoint import restore_checkpoint

    sid = job.storage_id
    for p in (job.dubbed_audio_path, _out(sid) / "audio" / "dubbed_audio.wav", _out(sid) / "audio" / "tts_segments" / "dubbed_audio.wav"):
        if p and Path(p).exists() and Path(p).stat().st_size > 0:
            return Path(p)
    target = _out(sid) / "audio" / "dubbed_audio.wav"
    if restore_checkpoint(str(sid), "dubbed_audio.wav", str(target)):
        return target
    return None


def _find_video(job: DubbingJob, work: Path) -> tuple[Path | None, str]:
    from backend.services.job_checkpoint import restore_checkpoint

    if job.original_video_path and Path(job.original_video_path).exists():
        return Path(job.original_video_path), "diskdan"
    ckpt = work / "video.mp4"
    if restore_checkpoint(str(job.storage_id), "video.mp4", str(ckpt)):
        return ckpt, "checkpoint"
    if job.youtube_url and job.youtube_url.startswith("http"):
        return None, "YouTube'dan yuklanadi"
    return None, "asl video yo'q (fayl yuklangan, saqlanmagan)"


def _detach_copy(db, job: DubbingJob, audio: Path) -> Path:
    """Kesh nusxasini o'z fayllariga ajratadi: ovoz job'ning o'z papkasiga ko'chiriladi."""
    own_audio = _out(job.id) / "audio" / "dubbed_audio.wav"
    own_audio.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(audio, own_audio)
    job.source_job_id = None
    job.dubbed_audio_path = str(own_audio)
    db.commit()
    return own_audio


def _drop_variants(db, job_id: str) -> None:
    for v in db.query(ResolutionVariant).filter(ResolutionVariant.job_id == job_id).all():
        local = _out(job_id) / "video" / f"dubbed_{v.resolution}.mp4"
        local.unlink(missing_ok=True)
        if v.s3_key and settings.AWS_BUCKET_NAME:
            try:
                from backend.services.storage import delete_file_from_s3
                delete_file_from_s3(v.s3_key)
            except Exception as e:
                print(f"    ogohlantirish: S3 variant o'chmadi ({v.s3_key}): {e}")
        db.delete(v)
    db.commit()


def remerge_job(db, job: DubbingJob) -> str:
    from backend.services import downloader, merger
    from backend.services.job_checkpoint import save_checkpoint

    audio = _find_audio(job)
    if not audio:
        return "o'tkazildi: o'zbekcha ovoz fayli topilmadi"
    work = Path(settings.UPLOAD_DIR) / f"{job.id}_remerge"
    work.mkdir(parents=True, exist_ok=True)
    try:
        video, how = _find_video(job, work)
        if video is None:
            if not (job.youtube_url and job.youtube_url.startswith("http")):
                return f"o'tkazildi: {how}"
            video = Path(downloader.download_video(job.youtube_url, f"{job.id}_remerge")["video_path"])

        if job.source_job_id:
            audio = _detach_copy(db, job, audio)

        final_dir = _out(job.id) / "video"
        final_dir.mkdir(parents=True, exist_ok=True)
        tmp_out = final_dir / "dubbed_final.nowm.mp4"
        merger.merge_video_audio(
            video_path=str(video),
            dubbed_audio_path=str(audio),
            output_path=str(tmp_out),
            max_duration=120.0 if job.is_preview else None,
            audio_mix_mode=getattr(job, "audio_mix_mode", None),
            watermark=False,
        )
        if not tmp_out.exists() or tmp_out.stat().st_size == 0:
            return "XATO: ffmpeg natija bermadi"
        final = final_dir / "dubbed_final.mp4"
        tmp_out.replace(final)

        job.output_video_path = str(final)
        job.output_video_url = f"/outputs/{job.id}/video/dubbed_final.mp4"
        db.commit()
        save_checkpoint(str(job.id), "dubbed_final.mp4", str(final))
        if settings.AWS_BUCKET_NAME:
            from backend.services.storage import upload_file_to_s3
            upload_file_to_s3(str(final), f"dubber/{job.id}/dubbed_final.mp4")
        _drop_variants(db, str(job.id))
        return f"tayyor (video {how})"
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(Path(settings.UPLOAD_DIR) / f"{job.id}_remerge", ignore_errors=True)


def main() -> int:
    p = argparse.ArgumentParser(description="Suv belgisi istisnolari (hamkorlar)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    a = sub.add_parser("add"); a.add_argument("email"); a.add_argument("--note", default="hamkor")
    r = sub.add_parser("remove"); r.add_argument("email")
    m = sub.add_parser("remerge"); m.add_argument("email"); m.add_argument("--apply", action="store_true")
    args = p.parse_args()

    db = SessionLocal()
    try:
        if args.cmd == "list":
            rows = db.query(WatermarkExemption, User).join(User, User.id == WatermarkExemption.user_id).all()
            for ex, u in rows:
                print(f"{u.email}  ({ex.note or '-'}, {ex.created_at:%Y-%m-%d})")
            print(f"Jami: {len(rows)}")
        elif args.cmd == "add":
            u = _user(db, args.email)
            if db.get(WatermarkExemption, u.id):
                print(f"Allaqachon ro'yxatda: {u.email}")
            else:
                db.add(WatermarkExemption(user_id=u.id, note=args.note))
                db.commit()
                print(f"Qo'shildi: {u.email} -- yangi dublajlari suv belgisiz bo'ladi.")
        elif args.cmd == "remove":
            u = _user(db, args.email)
            ex = db.get(WatermarkExemption, u.id)
            if ex:
                db.delete(ex)
                db.commit()
            print(f"Olib tashlandi: {u.email}")
        else:
            u = _user(db, args.email)
            if not db.get(WatermarkExemption, u.id):
                sys.exit(f"Avval istisnoga qo'shing: ... watermark_exempt add {u.email}")
            jobs = (
                db.query(DubbingJob)
                .filter(DubbingJob.user_id == u.id, DubbingJob.status == JobStatus.COMPLETED, DubbingJob.subtitle_only.is_(False))
                .order_by(DubbingJob.created_at)
                .all()
            )
            print(f"{u.email}: {len(jobs)} ta tayyor dublaj")
            for j in jobs:
                label = f"  {str(j.id)[:8]}  {(j.video_title or '')[:50]:<50}"
                if not args.apply:
                    audio = "ovoz bor" if _find_audio(j) else "OVOZ YO'Q"
                    _, how = _find_video(j, Path("/tmp"))
                    kind = "kesh nusxasi -> ajratiladi" if j.source_job_id else "o'zi"
                    print(f"{label}  {kind}; {audio}; video: {how}")
                    continue
                try:
                    print(f"{label}  {remerge_job(db, j)}", flush=True)
                except Exception as e:
                    db.rollback()
                    print(f"{label}  XATO: {e}", flush=True)
            if not args.apply:
                print("\nHech narsa o'zgarmadi. Qayta yig'ish uchun --apply qo'shing.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
