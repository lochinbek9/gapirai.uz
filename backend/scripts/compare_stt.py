"""NeuronAI STT sinovi: bitta video/audio'ning boshidagi N daqiqasini NeuronAI'da transkripsiya
qiladi va mavjud natija bilan solishtiradi (tezlik, narx, matn o'xshashligi). Prod oqimiga
tegmaydi -- NEURONAI_STT_ENABLED o'chiq bo'lsa ham ishlaydi, hech narsa bazaga yozilmaydi.

    # tayyor job (solishtirish = job'dagi mavjud transkript):
    docker compose exec -T worker python -m backend.scripts.compare_stt <JOB_ID>
    # YouTube havola yoki fayl (solishtirish = hozirgi STT zanjiri, NeuronAI'siz):
    docker compose exec -T worker python -m backend.scripts.compare_stt "https://youtu.be/..." --language en
    docker compose exec -T worker python -m backend.scripts.compare_stt /path/audio.mp3 --minutes 2 --language uz

To'liq matnlar /tmp/stt_compare_<nom>.txt ga yoziladi. Narx: 1 so'm/soniya (3 daqiqa = 180 so'm).
"""
import argparse
import difflib
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.config import get_settings
from backend.services import transcriber

settings = get_settings()


def _resolve_source(source: str, work: Path) -> tuple[Path, str | None, list[dict] | None]:
    """-> (media fayl, job tili yoki None, job'ning mavjud segmentlari yoki None)."""
    if Path(source).exists():
        return Path(source), None, None
    if source.startswith("http"):
        from backend.services import downloader
        return Path(downloader.download_audio(source, f"sttcmp_{uuid.uuid4().hex[:8]}")["audio_path"]), None, None

    from backend.models.database import DubbingJob, SessionLocal
    from backend.services.job_checkpoint import restore_checkpoint
    db = SessionLocal()
    try:
        job = db.get(DubbingJob, uuid.UUID(source))
        if not job:
            sys.exit(f"Job topilmadi: {source}")
        root = db.get(DubbingJob, job.storage_id) if job.storage_id else job
        segments = (root.transcript_segments if root else None) or job.transcript_segments
        lang = job.source_language
        if job.original_video_path and Path(job.original_video_path).exists():
            return Path(job.original_video_path), lang, segments
        ckpt = work / "video.mp4"
        if restore_checkpoint(str(job.storage_id), "video.mp4", str(ckpt)):
            return ckpt, lang, segments
        if job.youtube_url and job.youtube_url.startswith("http"):
            from backend.services import downloader
            return Path(downloader.download_audio(job.youtube_url, f"sttcmp_{job.id}")["audio_path"]), lang, segments
        sys.exit("Job'ning asl videosi topilmadi (diskda, checkpoint'da va YouTube havolasi yo'q).")
    finally:
        db.close()


def _cut(media: Path, minutes: float, out: Path) -> None:
    proc = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(media), "-t", str(int(minutes * 60)),
         "-vn", "-ac", "1", "-ar", "16000", "-codec:a", "libmp3lame", "-b:a", "64k", str(out)],
        capture_output=True, text=True, check=False,
    )
    if proc.returncode != 0 or not out.exists():
        sys.exit(f"ffmpeg xato: {proc.stderr[-300:]}")


def _words(segments: list[dict]) -> list[str]:
    return re.findall(r"\w+", " ".join(s.get("text", "") for s in segments).lower())


def _fmt(t: float) -> str:
    return f"{int(t // 60):02d}:{t % 60:04.1f}"


def main() -> int:
    p = argparse.ArgumentParser(description="NeuronAI STT ni mavjud transkripsiya bilan solishtirish")
    p.add_argument("source", help="job id, YouTube havola yoki fayl yo'li")
    p.add_argument("--minutes", type=float, default=3.0, help="boshidan necha daqiqa (standart 3)")
    p.add_argument("--language", default=None, help="nutq tili: en, uz, ru ... (standart: job tili yoki auto)")
    args = p.parse_args()

    if not settings.NEURONAI_API_KEY:
        sys.exit("NEURONAI_API_KEY .env da yo'q.")

    work = Path(tempfile.mkdtemp(prefix="sttcmp-"))
    try:
        media, job_lang, ref_segments = _resolve_source(args.source, work)
        language = args.language or job_lang
        clip = work / "clip.mp3"
        _cut(media, args.minutes, clip)
        limit = args.minutes * 60

        t0 = time.time()
        data = transcriber.neuronai_transcribe_file(clip, language)
        n_time = time.time() - t0
        n_segs = [s for s in data.get("segments") or [] if (s.get("text") or "").strip()]

        if ref_segments:
            ref_label, r_time = "job'dagi mavjud transkript", None
            ref = [s for s in ref_segments if float(s.get("start", 0)) < limit]
        else:
            ref_label = f"hozirgi STT zanjiri ({settings.STT_PROVIDER})"
            old = settings.NEURONAI_STT_ENABLED
            settings.NEURONAI_STT_ENABLED = False  # solishtirish NeuronAI'siz bo'lsin
            try:
                t0 = time.time()
                ref = transcriber.transcribe_audio(str(clip), language)["segments"]
                r_time = time.time() - t0
            except Exception as e:
                ref, r_time = [], None
                ref_label += f" -- XATO: {e}"
            finally:
                settings.NEURONAI_STT_ENABLED = old

        nw, rw = _words(n_segs), _words(ref)
        similarity = difflib.SequenceMatcher(None, nw, rw, autojunk=False).ratio() if nw and rw else 0.0

        print(f"\nManba: {args.source} | birinchi {args.minutes:g} daqiqa | til: {language or 'auto'}")
        print(f"NeuronAI : {n_time:5.1f} s | {len(n_segs)} segment | {len(nw)} so'z | til {data.get('language')} | "
              f"narx {data.get('cost')} so'm | balans {data.get('balance')} so'm")
        print(f"Solishtirish ({ref_label}): " + (f"{r_time:5.1f} s | " if r_time else "")
              + f"{len(ref)} segment | {len(rw)} so'z")
        print(f"So'zlar o'xshashligi: {similarity:.0%}\n")
        for label, segs in (("NEURONAI", n_segs), ("SOLISHTIRISH", ref)):
            print(f"--- {label} (birinchi 8 segment) ---")
            for s in segs[:8]:
                print(f"  [{_fmt(float(s['start']))}-{_fmt(float(s['end']))}] {s['text'].strip()[:110]}")

        name = re.sub(r"[^\w-]", "_", args.source)[-40:]
        out = Path(tempfile.gettempdir()) / f"stt_compare_{name}.txt"
        with out.open("w", encoding="utf-8") as f:
            for label, segs in (("NEURONAI", n_segs), ("SOLISHTIRISH: " + ref_label, ref)):
                f.write(f"===== {label}\n")
                for s in segs:
                    f.write(f"[{_fmt(float(s['start']))}-{_fmt(float(s['end']))}] {s['text'].strip()}\n")
                f.write("\n")
        print(f"\nTo'liq matnlar: {out}")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
