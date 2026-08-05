"""
ElevenLabs TTS Provider.

Konfiguratsiya (.env orqali):
  ELEVENLABS_API_KEY            — API kalit
  ELEVENLABS_VOICE_ID_MALE      — erkak ovoz ID (default: Adam)
  ELEVENLABS_VOICE_ID_FEMALE    — ayol ovoz ID (default: Rachel)
  ELEVENLABS_MODEL              — model (default: eleven_multilingual_v2)
  ELEVENLABS_STABILITY          — 0.0–1.0 (default: 0.5)
  ELEVENLABS_SIMILARITY_BOOST   — 0.0–1.0 (default: 0.75)
  ELEVENLABS_STYLE              — 0.0–1.0 (default: 0.0)
  ELEVENLABS_SPEED              — 0.7–1.2 (default: 1.0)
  ELEVENLABS_FALLBACK_TO_EDGE   — xatolikda Edge TTS ga o'tish (default: True)
"""
import logging
import os
import subprocess
import tempfile
import time

from backend.services.tts.base import TTSProvider
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class ElevenLabsProvider(TTSProvider):
    """ElevenLabs Text-to-Speech provider (eleven_multilingual_v2)."""

    # Adam (male multilingual)
    DEFAULT_VOICE_ID_MALE = "pNInz6obpgDQGcFmaJgB"
    # Rachel (female multilingual)
    DEFAULT_VOICE_ID_FEMALE = "21m00Tcm4TlvDq8ikWAM"

    @property
    def name(self) -> str:
        return "elevenlabs"

    @property
    def cost_per_1k(self) -> float:
        # Pay-as-you-go: ~$0.30 per 1K chars (Creator tier average)
        return 0.30

    def _get_voice_id(self, voice_name: str | None) -> str:
        if self._is_female(voice_name):
            return settings.ELEVENLABS_VOICE_ID_FEMALE or self.DEFAULT_VOICE_ID_FEMALE
        return settings.ELEVENLABS_VOICE_ID_MALE or self.DEFAULT_VOICE_ID_MALE

    def synthesize(
        self,
        text: str,
        output_path: str,
        voice_name: str | None = None,
    ) -> bool:
        api_key = settings.ELEVENLABS_API_KEY or os.getenv("ELEVENLABS_API_KEY", "")
        if not api_key:
            logger.warning("ELEVENLABS_API_KEY topilmadi — ElevenLabs o'tkazib yuborildi.")
            return False

        import re
        clean_text = re.sub(r"<[^>]+>", "", text).strip()
        if not clean_text:
            return False

        voice_id = self._get_voice_id(voice_name)
        model_id = settings.ELEVENLABS_MODEL or "eleven_multilingual_v2"

        max_retries = 3
        for attempt in range(max_retries):
            try:
                from elevenlabs.client import ElevenLabs
                from elevenlabs.types import VoiceSettings

                client = ElevenLabs(api_key=api_key)

                audio_gen = client.text_to_speech.convert(
                    voice_id=voice_id,
                    text=clean_text,
                    model_id=model_id,
                    voice_settings=VoiceSettings(
                        stability=float(settings.ELEVENLABS_STABILITY or 0.5),
                        similarity_boost=float(settings.ELEVENLABS_SIMILARITY_BOOST or 0.75),
                        style=float(settings.ELEVENLABS_STYLE or 0.0),
                        use_speaker_boost=True,
                    ),
                    output_format="mp3_44100_128",
                )

                audio_bytes = b"".join(audio_gen)

                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                    tmp.write(audio_bytes)
                    tmp_mp3_path = tmp.name

                try:
                    if os.path.getsize(tmp_mp3_path) < 100:
                        raise ValueError("ElevenLabs: bo'sh audio qaytarildi")

                    subprocess.run(
                        [
                            "ffmpeg", "-y",
                            "-i", tmp_mp3_path,
                            "-acodec", "pcm_s16le",
                            "-ar", "24000",
                            "-ac", "1",
                            output_path,
                        ],
                        check=True,
                        capture_output=True,
                    )
                    logger.info(
                        f"ElevenLabs TTS: voice={voice_id}, model={model_id}, "
                        f"chars={len(clean_text)}, attempt={attempt+1}"
                    )
                    return True
                finally:
                    if os.path.exists(tmp_mp3_path):
                        try:
                            os.remove(tmp_mp3_path)
                        except Exception:
                            pass

            except Exception as exc:
                logger.warning(f"ElevenLabs urinish {attempt+1}/{max_retries} xato: {exc}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)

        return False
