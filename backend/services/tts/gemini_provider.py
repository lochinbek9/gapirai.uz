"""Gemini native TTS Provider (gemini-2.5-flash-preview-tts)."""
import logging
import re
import threading
import time
import random
import wave

from backend.services.tts.base import TTSProvider
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# google-genai'ning Client'i parallel oqimlar orasida ulashilganda javoblar
# aralashib qolishi tasdiqlangan (tarjima integratsiyasida topilgan bug) —
# shuning uchun har bir thread o'zining alohida clientiga ega bo'ladi.
_gemini_local = threading.local()


def _get_client():
    if not hasattr(_gemini_local, "client"):
        from google import genai
        _gemini_local.client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_local.client


class GeminiProvider(TTSProvider):
    """Gemini'ning tayyor ovozlari (Autonoe/Charon) — Starfish/HeyGen'da mavjud
    bo'lmagan, faqat Gemini API orqali ochiq bo'lgan ovozlar."""

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def cost_per_1k(self) -> float:
        # $10/1M audio token (standard tier), ~25 token/s, ~15 belgi/s o'rtacha nutq tezligi
        return 0.017

    def synthesize(
        self,
        text: str,
        output_path: str,
        voice_name: str | None = None,
    ) -> bool:
        if not settings.GEMINI_API_KEY:
            return False

        clean_text = re.sub(r"<[^>]+>", "", text).strip()
        if not clean_text:
            return False

        voice = settings.GEMINI_FEMALE_VOICE if self._is_female(voice_name) else settings.GEMINI_MALE_VOICE

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
                    )
                ),
            )

            max_attempts = 4
            for attempt in range(max_attempts):
                try:
                    response = _get_client().models.generate_content(
                        model=settings.GEMINI_TTS_MODEL,
                        contents=clean_text,
                        config=config,
                    )
                    part = response.candidates[0].content.parts[0]
                    pcm_data = part.inline_data.data
                    if not pcm_data:
                        return False

                    with wave.open(output_path, "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(24000)
                        wf.writeframes(pcm_data)

                    logger.info(f"Gemini TTS: voice={voice}, chars={len(clean_text)}")
                    return True
                except Exception as e:
                    is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
                    if attempt == max_attempts - 1 or not is_rate_limit:
                        raise
                    backoff = (2 ** attempt) + random.uniform(0.1, 1.0)
                    logger.warning(f"Gemini TTS RateLimit — qayta urinish {backoff:.2f}s ({attempt + 1}/{max_attempts})")
                    time.sleep(backoff)
        except Exception as exc:
            logger.warning(f"Gemini TTS xato: {exc}")

        return False
