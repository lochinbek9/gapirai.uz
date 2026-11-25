"""Kurs darslari subtitridan o'zbekcha dublaj (backend/models/database.py: CaptionDub).

Video yuklanmaydi va nutq matnga aylantirilmaydi -- kengaytma sahifadagi inglizcha subtitrni
yuboradi. Bosqichlar: tarjima (translator.translate_segments) -> ovoz (synthesizer.synthesize_segments,
tarifga qarab provayder; balans tugasa butun ovoz Edge'da) -> bitta WAV, video vaqtiga mos.
Xato bo'lsa yechilgan daqiqalar qaytariladi.
"""
import logging
import shutil
import uuid
from pathlib import Path
from types import SimpleNamespace

from backend.config import get_settings
from backend.models.database import CaptionDub, SessionLocal
from backend.services.tts.base import TTSOutOfCreditsError
from backend.workers.celery_app import celery_app
from backend.services import byok
from backend.workers.override_task import GeminiOverrideTask

logger = logging.getLogger(__name__)
settings = get_settings()

_EDGE_VOICES = {"female": "uz-UZ-MadinaNeural", "male": "uz-UZ-SardorNeural"}


def caption_dub_dir(dub_id) -> Path:
    return Path(settings.OUTPUT_DIR) / "caption_dubs" / str(dub_id)


def _set(db, dub: CaptionDub, status: str, progress: float) -> None:
    dub.status, dub.progress = status, progress
    db.commit()


def _resolve_gender(dub: CaptionDub) -> str:
    if dub.voice_gender in ("male", "female"):
        return dub.voice_gender
    from backend.workers.tasks import _detect_gender
    text = " ".join(c.get("text", "") for c in dub.cues[:200])
    return _detect_gender(text, dub.title or "")


@celery_app.task(name="backend.workers.caption_dub_tasks.process_caption_dub", bind=True,
                 base=GeminiOverrideTask, acks_late=True)
def process_caption_dub(self, dub_id: str):
    from backend.services import synthesizer, translator
    from backend.services.plans import get_tts_provider_for_job, refund_quota

    db = SessionLocal()
    try:
        dub = db.get(CaptionDub, uuid.UUID(dub_id))
        if not dub or dub.status == "completed":
            return
        try:
            _set(db, dub, "translating", 10.0)
            segments = [{"id": i + 1, "start": float(c["start"]), "end": float(c["end"]), "text": c["text"]}
                        for i, c in enumerate(dub.cues)]
            translated = translator.translate_segments(segments, is_paid=True)
            dub.translated = [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in translated]
            _set(db, dub, "synthesizing", 45.0)

            gender = _resolve_gender(dub)
            provider = get_tts_provider_for_job(db, SimpleNamespace(user_id=dub.user_id, tts_provider=None))
            if byok.active_keys("gapi"):  # egasining o'z kaliti (BYOK)
                provider = "gapi"
            voice = _EDGE_VOICES[gender]
            out_dir = caption_dub_dir(dub.id) / "tts"

            def synth(provider_name: str):
                return synthesizer.synthesize_segments(
                    translated, str(out_dir), voice_name=voice, video_id=str(dub.id),
                    user_id=str(dub.user_id), provider_name=provider_name, is_paid=True,
                )

            try:
                audio_path, _timings, _qa = synth(provider)
            except TTSOutOfCreditsError as exc:
                logger.error(f"[CAPTION {dub.id}] {exc} -- butun ovoz Edge'da qaytadan.")
                shutil.rmtree(out_dir, ignore_errors=True)
                provider = "edge"
                audio_path, _timings, _qa = synth(provider)

            final = caption_dub_dir(dub.id) / "dub.wav"
            shutil.move(audio_path, final)
            shutil.rmtree(out_dir, ignore_errors=True)
            dub.audio_path, dub.tts_provider = str(final), provider
            _set(db, dub, "completed", 100.0)
            logger.info(f"[CAPTION {dub.id}] tayyor: {len(translated)} segment, {provider}, {dub.duration_seconds:.0f} s")
        except Exception as exc:
            logger.exception(f"[CAPTION {dub_id}] xato: {exc}")
            db.rollback()
            dub = db.get(CaptionDub, uuid.UUID(dub_id))
            if dub.minutes_charged:
                refund_quota(db, dub.user_id, dub.minutes_charged)
                dub.minutes_charged = 0.0
            dub.status, dub.error_message = "failed", "Dublaj amalga oshmadi. Qayta urinib koʻring."
            db.commit()
    finally:
        db.close()
