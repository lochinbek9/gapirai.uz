"""NeuronAI TTS Provider (https://my.neuronai.uz/docs/api/text-to-speech).

API kontrakti (OpenAPI /docs/api.json, 2026-11-11):
    POST {NEURONAI_BASE_URL}/tts/synthesize
    Headers: Authorization: Bearer nai_..., Idempotency-Key (ixtiyoriy, <=191 belgi)
    Body:    {"text", "voice_id", "language": "uz", "quality": "fast"|"standard"|"high", "speed": 0.5-2}
    Javob:   200 -> WAV baytlari; narx/balans X-Cost / X-Balance sarlavhalarida.
             402 balans tugagan, 429 limit (Retry-After), 5xx -- hech narsa yechilmaydi.
    Narxi: 0,3 so'm / belgi (standart ovoz), 1 kredit = 1 so'm.

O'zbekcha standart ovozlar: kamron, muhriddin (erkak); madina, saodat, kamola (ayol).
API jinsni qaytarmaydi -- ismlar bo'yicha belgilangan. Natija pipeline kutayotgan
24kHz mono PCM WAV'ga ffmpeg orqali keltiriladi (uzbekvoice_provider bilan bir xil).
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

_VOICES = [
    {"id": "kamron", "gender": "male", "language": "uz"},
    {"id": "muhriddin", "gender": "male", "language": "uz"},
    {"id": "madina", "gender": "female", "language": "uz"},
    {"id": "saodat", "gender": "female", "language": "uz"},
    {"id": "kamola", "gender": "female", "language": "uz"},
]
_VOICE_IDS = {v["id"] for v in _VOICES}
_MAX_ATTEMPTS = 4


class NeuronAIProvider(TTSProvider):
    """NeuronAI -- native o'zbek TTS, to'lov so'mda."""

    @property
    def name(self) -> str:
        return "neuronai"

    @property
    def cost_per_1k(self) -> float:
        return 300.0  # 0,3 so'm / belgi -- UZS (tts_cost._UZS_PROVIDERS)

    def get_voices(self) -> list[dict]:
        return list(_VOICES)

    def is_available(self) -> bool:
        return bool(settings.NEURONAI_API_KEY)

    def _voice_for(self, voice_name: str | None) -> str:
        if voice_name and voice_name.lower() in _VOICE_IDS:
            return voice_name.lower()
        if self._is_female(voice_name):
            return settings.NEURONAI_TTS_FEMALE_VOICE
        return settings.NEURONAI_TTS_MALE_VOICE

    def synthesize(
        self,
        text: str,
        output_path: str,
        voice_name: str | None = None,
    ) -> bool:
        if not settings.NEURONAI_API_KEY:
            logger.warning("NEURONAI_API_KEY topilmadi — NeuronAI TTS o'tkazib yuborildi.")
            return False
        clean_text = (text or "").strip()
        if not clean_text:
            return False

        body = {
            "text": clean_text,
            "voice_id": self._voice_for(voice_name),
            "language": "uz",
            "quality": settings.NEURONAI_TTS_QUALITY,
        }
        # Bir xil matn+ovoz qayta so'ralsa (Celery qayta urinishi, QA retry) NeuronAI ikki marta pul yechmaydi.
        idem = "tts-" + hashlib.sha256(repr(sorted(body.items())).encode()).hexdigest()

        resp = None
        for attempt in range(_MAX_ATTEMPTS):
            try:
                resp = httpx.post(
                    f"{settings.NEURONAI_BASE_URL.rstrip('/')}/tts/synthesize",
                    headers={"Authorization": f"Bearer {settings.NEURONAI_API_KEY}", "Idempotency-Key": idem},
                    json=body,
                    timeout=90.0,
                )
            except httpx.HTTPError as exc:
                logger.warning(f"NeuronAI TTS: ulanish xatosi: {exc}")
                return False
            if resp.status_code != 429 or attempt == _MAX_ATTEMPTS - 1:
                break
            try:
                wait = min(max(float(resp.headers.get("retry-after", "2")), 1.0), 10.0)
            except ValueError:
                wait = 2.0
            time.sleep(wait)

        if resp.status_code in (401, 403):
            raise PermanentTTSError(f"NeuronAI TTS: ruxsat xatosi ({resp.status_code}): {_error_code(resp)}")
        if resp.status_code == 402:
            raise TTSOutOfCreditsError(f"NeuronAI TTS: balans tugadi ({_error_code(resp)})")
        if resp.status_code != 200:
            # 409, 422, 429, 5xx -- job to'xtamasin, synthesizer zaxiraga o'tadi.
            logger.warning(f"NeuronAI TTS: {resp.status_code} {_error_code(resp)}")
            return False
        if len(resp.content) < 100:
            logger.warning("NeuronAI TTS: bo'sh yoki juda kichik audio.")
            return False

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(resp.content)
                tmp_path = tmp.name
            subprocess.run(
                ["ffmpeg", "-y", "-i", tmp_path, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", output_path],
                check=True, capture_output=True,
            )
        except subprocess.CalledProcessError as exc:
            logger.warning(f"NeuronAI TTS: ffmpeg konvertatsiya xatosi: {exc.stderr[-300:] if exc.stderr else exc}")
            return False
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)

        logger.info(
            f"NeuronAI TTS: voice={body['voice_id']}, chars={resp.headers.get('x-character-count', len(clean_text))}, "
            f"narx {resp.headers.get('x-cost')} so'm, balans {resp.headers.get('x-balance')} so'm"
        )
        return True


def _error_code(resp) -> str:
    try:
        err = resp.json().get("error", {})
        return f"{err.get('code', '')}: {(err.get('message') or '')[:150]}"
    except Exception:
        return resp.text[:150]
