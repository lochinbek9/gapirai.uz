"""VoiceLab TTS Provider (https://docs.voicelab.uz/api/tts) -- Aisha bilan bir kompaniya.

API kontrakti (hujjat va prod sinovi, 2026-11-11):
    POST {VOICELAB_BASE_URL}/tts
    Headers: Authorization: Bearer <key>, Idempotency-Key (8-128 belgi: harf/raqam . _ -)
    Body:    {"text" (<=5000), "language": "uz", "voice_id": "voice_...", "model_id": "lison", "speed"?}
    Javob:   200 -> WAV (mono, 16-bit, 24 kHz);
             202 -> {"id", "status_url"} -- GET status_url (status: queued|processing|completed|failed),
                    completed bo'lsa audio_url (imzolangan, kalitsiz yuklanadi).
             402 insufficient_credits, 404 voice_unavailable, 429 rate_limited/overloaded (Retry-After),
             500/503 -- o'sha Idempotency-Key bilan qayta urinish mumkin.
    Narx: lison -- 1 kredit/belgi, lison-v2 -- 1,5 (taxminan 0,75-0,9 so'm/kredit, yillik tariflar).

O'zbekcha ovozlar ko'p (20+); standart erkak/ayol ovozi .env orqali (VOICELAB_TTS_MALE_VOICE /
VOICELAB_TTS_FEMALE_VOICE) tanlanadi, voice_name "voice_..." bo'lsa to'g'ridan-to'g'ri ishlatiladi.
"""
import hashlib
import logging
import os
import subprocess
import tempfile
import time

import httpx

from backend.config import get_settings
from backend.services.tts.base import PermanentTTSError, TTSOutOfCreditsError, TTSProvider

logger = logging.getLogger(__name__)
settings = get_settings()

_MAX_ATTEMPTS = 4
_POLL_TIMEOUT_S = 120.0


class VoiceLabProvider(TTSProvider):
    """VoiceLab (Lison) -- o'zbekcha TTS, ko'p ovoz."""

    @property
    def name(self) -> str:
        return "voicelab"

    @property
    def cost_per_1k(self) -> float:
        return 0.067  # USD: ~$0.0000667/kredit (Creator yillik), lison = 1 kredit/belgi

    def is_available(self) -> bool:
        return bool(settings.VOICELAB_API_KEY)

    def _voice_for(self, voice_name: str | None) -> str:
        if voice_name and voice_name.startswith("voice_"):
            return voice_name
        if self._is_female(voice_name):
            return settings.VOICELAB_TTS_FEMALE_VOICE
        return settings.VOICELAB_TTS_MALE_VOICE

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {settings.VOICELAB_API_KEY}"}

    def _post(self, body: dict, idem: str):
        resp = None
        for attempt in range(_MAX_ATTEMPTS):
            try:
                resp = httpx.post(
                    f"{settings.VOICELAB_BASE_URL.rstrip('/')}/tts",
                    headers={**self._headers(), "Idempotency-Key": idem},
                    json=body,
                    timeout=90.0,
                )
            except httpx.HTTPError as exc:
                logger.warning(f"VoiceLab TTS: ulanish xatosi: {exc}")
                return None
            retryable = resp.status_code in (429, 500, 503)
            if not retryable or attempt == _MAX_ATTEMPTS - 1:
                return resp
            try:
                wait = min(max(float(resp.headers.get("retry-after", "2")), 1.0), 10.0)
            except ValueError:
                wait = 2.0
            time.sleep(wait)
        return resp

    def _wait_for_job(self, status_url: str) -> bytes | None:
        """202 javobidan keyin generatsiya tugaguncha so'raydi va tayyor WAV baytlarini qaytaradi."""
        base = settings.VOICELAB_BASE_URL.rstrip("/")
        url = status_url if status_url.startswith("http") else base.rsplit("/v1", 1)[0] + status_url
        deadline = time.monotonic() + _POLL_TIMEOUT_S
        delay = 1.0
        while time.monotonic() < deadline:
            time.sleep(delay)
            delay = min(delay * 1.5, 5.0)
            try:
                job = httpx.get(url, headers=self._headers(), timeout=20.0).json()
            except Exception as exc:
                logger.debug(f"VoiceLab TTS: holat so'rovi xato: {exc}")
                continue
            status = job.get("status")
            if status == "completed" and job.get("audio_url"):
                audio = httpx.get(job["audio_url"], timeout=60.0)  # imzolangan URL -- kalitsiz
                return audio.content if audio.status_code == 200 else None
            if status == "failed":
                logger.warning(f"VoiceLab TTS: generatsiya muvaffaqiyatsiz: {job.get('error')}")
                return None
        logger.warning(f"VoiceLab TTS: {_POLL_TIMEOUT_S:.0f} s ichida tugamadi.")
        return None

    def synthesize(
        self,
        text: str,
        output_path: str,
        voice_name: str | None = None,
    ) -> bool:
        if not settings.VOICELAB_API_KEY:
            logger.warning("VOICELAB_API_KEY topilmadi — VoiceLab TTS o'tkazib yuborildi.")
            return False
        clean_text = (text or "").strip()
        if not clean_text:
            return False

        body = {
            "text": clean_text[:5000],
            "language": "uz",
            "voice_id": self._voice_for(voice_name),
            "model_id": settings.VOICELAB_TTS_MODEL,
        }
        # Bir xil matn+ovoz qayta so'ralsa (qayta urinish, QA retry) VoiceLab ikki marta kredit yechmaydi.
        idem = "gapirai-" + hashlib.sha256(repr(sorted(body.items())).encode()).hexdigest()

        resp = self._post(body, idem)
        if resp is None:
            return False
        if resp.status_code in (401, 403):
            raise PermanentTTSError(f"VoiceLab TTS: ruxsat xatosi ({resp.status_code}): {_error_code(resp)}")
        if resp.status_code == 202:
            try:
                status_url = resp.json()["status_url"]
            except Exception:
                logger.warning("VoiceLab TTS: 202 javobida status_url yo'q.")
                return False
            audio = self._wait_for_job(status_url)
        elif resp.status_code == 200:
            audio = resp.content
        elif resp.status_code == 402:
            raise TTSOutOfCreditsError(f"VoiceLab TTS: kredit tugadi ({_error_code(resp)})")
        else:
            # 404 (ovoz), 409, 422, 429/5xx -- job to'xtamasin, synthesizer zaxiraga o'tadi.
            logger.warning(f"VoiceLab TTS: {resp.status_code} {_error_code(resp)}")
            return False

        if not audio or len(audio) < 100 or audio[:4] != b"RIFF":
            logger.warning("VoiceLab TTS: bo'sh yoki WAV bo'lmagan audio.")
            return False

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(audio)
                tmp_path = tmp.name
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", output_path],
                check=True, capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            logger.warning(f"VoiceLab TTS: ffmpeg konvertatsiya xatosi: {exc.stderr[-300:] if exc.stderr else exc}")
            return False
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

        logger.info(
            f"VoiceLab TTS: voice={body['voice_id']}, model={body['model_id']}, "
            f"belgi={resp.headers.get('x-voicelab-characters-used', len(clean_text))}"
        )
        return True


def _error_code(resp) -> str:
    try:
        j = resp.json()
        err = j.get("error") or {}
        return f"{err.get('code', '')}: {(j.get('message') or '')[:150]}"
    except Exception:
        return resp.text[:150]
