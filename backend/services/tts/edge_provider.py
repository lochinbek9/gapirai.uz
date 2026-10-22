"""Edge TTS Provider — bepul Microsoft Neural TTS (uz-UZ native ovozlar)."""
import asyncio
import logging
import os
import re
import subprocess
import tempfile

from backend.services.tts.base import TTSProvider
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _prosody_for_text(text: str, is_female: bool) -> tuple[str, str]:
    """Gap turiga (tinish belgisiga) qarab tezlik/ohang tanlaydi — savol,
    undov va oddiy gap tabiiy ravishda boshqacha talaffuz qilinadi.
    edge-tts butun matn uchun BITTA rate/pitch qabul qiladi (Azure'dagidek
    jumla ichida SSML bilan almashtirib bo'lmaydi), shuning uchun bu
    segment-guruhlash (har chaqiruv ~bitta tabiiy gap) bilan birga eng
    yaxshi natija beradi."""
    base_rate = -4 if is_female else -8
    stripped = text.rstrip()

    if stripped.endswith("?"):
        rate, pitch = base_rate + 2, ("+8Hz" if is_female else "+5Hz")
    elif stripped.endswith("!"):
        rate, pitch = base_rate + 4, ("+6Hz" if is_female else "+4Hz")
    elif stripped.endswith("..."):
        rate, pitch = base_rate - 4, "-2Hz"
    else:
        rate, pitch = base_rate, ("+2Hz" if is_female else "+0Hz")

    return f"{rate:+d}%", pitch


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
        is_female = self._is_female(voice_name)
        if voice_name and ("madina" in voice_name.lower() or "sardor" in voice_name.lower()):
            is_female = ("madina" in voice_name.lower())
            chosen_voice = self.DEFAULT_VOICE_FEMALE if is_female else self.DEFAULT_VOICE_MALE
        else:
            chosen_voice = self.DEFAULT_VOICE_FEMALE if is_female else self.DEFAULT_VOICE_MALE
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

            rate, pitch = _prosody_for_text(clean_text, is_female)

            proxy_url = getattr(settings, "YOUTUBE_PROXY_URL", None) or os.environ.get("YOUTUBE_PROXY_URL")

            async def _run():
                last_err = None
                for attempt in range(3):
                    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                        tmp_mp3 = tmp.name
                    try:
                        # 1-urinishda prosody bilan to'g'ridan-to'g'ri, keyingi urinishlarda toza standart va proxy orqali sinash
                        cur_rate = rate if attempt == 0 else "+0%"
                        cur_pitch = pitch if attempt == 0 else "+0Hz"
                        use_proxy = proxy_url if attempt > 0 else None
                        communicate = edge_tts.Communicate(
                            clean_text, chosen_voice,
                            rate=cur_rate, pitch=cur_pitch,
                            proxy=use_proxy,
                            connect_timeout=6, receive_timeout=20,
                        )
                        await communicate.save(tmp_mp3)

                        if os.path.exists(tmp_mp3) and os.path.getsize(tmp_mp3) > 100:
                            parent_dir = os.path.dirname(output_path)
                            if parent_dir:
                                os.makedirs(parent_dir, exist_ok=True)

                            res = subprocess.run(
                                [
                                    "ffmpeg", "-y", "-loglevel", "error", "-nostats",
                                    "-i", tmp_mp3,
                                    "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1",
                                    output_path,
                                ],
                                capture_output=True,
                            )
                            if res.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 100:
                                logger.info(f"Edge TTS: voice={chosen_voice}, chars={len(clean_text)}, attempt={attempt+1}")
                                return True
                            else:
                                err_msg = res.stderr.decode("utf-8", errors="replace") if res.stderr else "FFmpeg dekod xatosi"
                                raise RuntimeError(f"FFmpeg xatosi ({res.returncode}): {err_msg[:150]}")
                        raise RuntimeError(f"Edge TTS bo'sh fayl yaratdi: {tmp_mp3}")
                    except Exception as err:
                        last_err = err
                        logger.warning(f"Edge TTS urinish {attempt+1}/3 muvaffaqiyatsiz ({err})")
                        if attempt < 2:
                            await asyncio.sleep(0.4 * (attempt + 1))
                    finally:
                        if os.path.exists(tmp_mp3):
                            try:
                                os.remove(tmp_mp3)
                            except Exception:
                                pass

                raise last_err or RuntimeError("Edge TTS barcha urinishlarda muvaffaqiyatsiz bo'ldi")

            # Event loop boshqaruvi (thread-safe)
            try:
                loop = asyncio.get_event_loop()
            except RuntimeError:
                loop = None

            if loop is not None and loop.is_running():
                new_loop = asyncio.new_event_loop()
                try:
                    return new_loop.run_until_complete(_run())
                finally:
                    new_loop.close()
            else:
                return asyncio.run(_run())

        except Exception as exc:
            logger.error(f"Edge TTS xato: {exc}", exc_info=True)
            return False
