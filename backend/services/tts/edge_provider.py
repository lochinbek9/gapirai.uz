"""Edge TTS Provider — bepul Microsoft Neural TTS (uz-UZ native ovozlar)."""
import asyncio
import logging
import os
import re
import subprocess
import tempfile

from backend.services.tts.base import TTSProvider

logger = logging.getLogger(__name__)


class EdgeProvider(TTSProvider):
    """Microsoft Edge Neural TTS — bepul, native Uzbek ovozlar."""

    DEFAULT_VOICE_MALE   = "uz-UZ-SardorNeural"
    DEFAULT_VOICE_FEMALE = "uz-UZ-MadinaNeural"

    @property
    def name(self) -> str:
        return "edge"

    @property
    def cost_per_1k(self) -> float:
        return 0.0  # bepul

    def synthesize(
        self,
        text: str,
        output_path: str,
        voice_name: str | None = None,
    ) -> bool:
        chosen_voice = (
            self.DEFAULT_VOICE_FEMALE if self._is_female(voice_name)
            else self.DEFAULT_VOICE_MALE
        )
        clean_text = re.sub(r"<[^>]+>", "", text)
        clean_text = (
            clean_text
            .replace("%", " foiz ")
            .replace("$", " dollar ")
            .replace("&", " va ")
            .replace("+", " plyus ")
            .replace("`", "'")
        )
        clean_text = re.sub(r"\s+", " ", clean_text).strip()

        if not clean_text or not re.search(
            r"[A-Za-z0-9\u0400-\u04FF\u0100-\u017F\u00C0-\u017F]", clean_text
        ):
            # Bo'sh segment — sukunat yaratish
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-f", "lavfi",
                        "-i", "anullsrc=r=24000:cl=mono",
                        "-t", "0.5", "-acodec", "pcm_s16le", output_path,
                    ],
                    check=True, capture_output=True,
                )
                return True
            except Exception:
                return False

        try:
            import edge_tts

            async def _run():
                communicate = edge_tts.Communicate(clean_text, chosen_voice, rate="-2%")
                with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                    tmp_mp3 = tmp.name
                try:
                    await communicate.save(tmp_mp3)
                    if os.path.exists(tmp_mp3) and os.path.getsize(tmp_mp3) > 100:
                        subprocess.run(
                            [
                                "ffmpeg", "-y", "-i", tmp_mp3,
                                "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1",
                                output_path,
                            ],
                            check=True, capture_output=True,
                        )
                        logger.info(f"Edge TTS: voice={chosen_voice}, chars={len(clean_text)}")
                        return True
                    return False
                finally:
                    if os.path.exists(tmp_mp3):
                        try:
                            os.remove(tmp_mp3)
                        except Exception:
                            pass

            # Event loop boshqaruvi
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

            if loop.is_running():
                new_loop = asyncio.new_event_loop()
                try:
                    return new_loop.run_until_complete(_run())
                finally:
                    new_loop.close()
            else:
                return loop.run_until_complete(_run())

        except Exception as exc:
            logger.warning(f"Edge TTS xato: {exc}")
            return False
