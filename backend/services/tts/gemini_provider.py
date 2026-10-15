"""Gemini native TTS Provider (gemini-2.5-flash-preview-tts)."""
import logging
import os
import re
import threading
import time
import random
import wave
from pathlib import Path

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

        if settings.GEMINI_USE_VERTEX:
            # Vertex AI — service account orqali (AI Studio'ning kunlik
            # "preview" chegarasidan mustaqil, daqiqalik DSQ ishlatadi).
            if settings.GOOGLE_APPLICATION_CREDENTIALS and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
            _gemini_local.client = genai.Client(
                vertexai=True,
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_LOCATION,
            )
        else:
            _gemini_local.client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_local.client


def _config_for(voice: str):
    from google.genai import types
    return types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
            )
        ),
    )


def _generate_pcm_with_retry(contents: str, voice: str) -> bytes | None:
    """Bitta so'rovni yuboradi. Rate limit bo'lsa darhol fallbackga imkon berish
    uchun uzoq kutmasdan tezkor javob qaytaradi (job 60% da qotib qolmasligi uchun)."""
    config = _config_for(voice)
    max_attempts = 2
    for attempt in range(max_attempts):
        try:
            response = _get_client().models.generate_content(
                model=settings.GEMINI_TTS_MODEL,
                contents=contents,
                config=config,
            )
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    inline_data = getattr(part, "inline_data", None)
                    if inline_data and getattr(inline_data, "data", None):
                        raw_data = inline_data.data
                        if isinstance(raw_data, str):
                            import base64
                            raw_data = base64.b64decode(raw_data)
                        return raw_data
        except Exception as e:
            is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
            if attempt == max_attempts - 1 or not is_rate_limit:
                logger.warning(f"Gemini TTS xato: {e}")
                return None
            time.sleep(1.0)
    return None


def _write_wav(path: str, pcm_data: bytes) -> None:
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm_data)


# Bitta so'rovda nechta segmentgacha birlashtirilishi — kattaroq qiymat
# so'rovlar sonini (demak daqiqalik limitga tegishni) kamaytiradi, lekin
# xatolik holida ko'proq segment birga muvaffaqiyatsiz bo'ladi (fallback
# qoplaydi). 6 — sinovda tasdiqlangan, ishonchli muvozanat.
_BATCH_SIZE = 6
_MIN_SILENCE_MS = 1000
_SILENCE_THRESH_OFFSET = 16


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
        if not settings.GEMINI_API_KEY and not settings.GEMINI_USE_VERTEX:
            return False

        clean_text = re.sub(r"<[^>]+>", "", text).strip()
        if not clean_text:
            return False

        valid_gemini_voices = {"Autonoe", "Aoede", "Kore", "Charon", "Fenrir", "Puck"}
        if voice_name and voice_name in valid_gemini_voices:
            voice = voice_name
        else:
            voice = settings.GEMINI_FEMALE_VOICE if self._is_female(voice_name) else settings.GEMINI_MALE_VOICE

        try:
            pcm_data = _generate_pcm_with_retry(clean_text, voice)
            if not pcm_data:
                return False
            _write_wav(output_path, pcm_data)
            logger.info(f"Gemini TTS: voice={voice}, chars={len(clean_text)}")
            return True
        except Exception as exc:
            logger.warning(f"Gemini TTS xato: {exc}")

        return False

    def synthesize_batch(
        self,
        segments: list[dict],
        output_dir: str,
        voice_name: str | None = None,
    ) -> dict[int, str]:
        # Silence-based batching is not reliable for preview TTS models.
        # Returning {} delegates synthesis to the individual segment worker pool
        # which has live progress tracking and automatic fallback.
        return {}

        from concurrent.futures import ThreadPoolExecutor

        voice = settings.GEMINI_FEMALE_VOICE if self._is_female(voice_name) else settings.GEMINI_MALE_VOICE
        out_dir = Path(output_dir)
        results: dict[int, str] = {}

        usable = [s for s in segments if s.get("text", "").strip()]
        batches = [usable[i:i + _BATCH_SIZE] for i in range(0, len(usable), _BATCH_SIZE)]

        # Guruhlar (batch) o'zaro mustaqil so'rovlar — ThreadPoolExecutor bilan
        # PARALLEL yuboriladi, aks holda guruhlash orqali so'rov sonini
        # kamaytirishning foydasi ketma-ket (sequential) bajarilishda yo'qoladi
        # (individual segmentlar 5 ta parallel oqimda ketayotgan edi, guruhlar
        # ham xuddi shunday parallel ketishi kerak).
        with ThreadPoolExecutor(max_workers=5) as executor:
            batch_results = executor.map(lambda b: self._process_batch(b, voice, out_dir, voice_name), batches)
            for batch_dict in batch_results:
                results.update(batch_dict)

        return results

    def _process_batch(self, batch: list[dict], voice: str, out_dir: Path, voice_name: str | None) -> dict[int, str]:
        from pydub import AudioSegment
        from pydub.silence import detect_silence

        texts = [re.sub(r"<[^>]+>", "", s["text"]).strip() for s in batch]
        result: dict[int, str] = {}

        if len(batch) == 1:
            seg_file = out_dir / f"seg_{batch[0]['id']:04d}.wav"
            if self.synthesize(texts[0], str(seg_file), voice_name=voice_name):
                result[batch[0]["id"]] = str(seg_file)
            return result

        try:
            instruction = (
                "Read each of the following separate sentences aloud, "
                "with a clear pause of about one second between each sentence:\n\n"
            )
            combined = instruction + "\n".join(f"{n + 1}. {t}" for n, t in enumerate(texts))
            pcm_data = _generate_pcm_with_retry(combined, voice)
            if not pcm_data:
                raise ValueError("bo'sh javob")

            audio = AudioSegment(pcm_data, sample_width=2, frame_rate=24000, channels=1)
            silences = detect_silence(
                audio, min_silence_len=_MIN_SILENCE_MS, silence_thresh=audio.dBFS - _SILENCE_THRESH_OFFSET
            )
            if len(silences) != len(batch) - 1:
                raise ValueError(f"kutilmagan pauza soni: {len(silences)}, kerak {len(batch) - 1}")

            split_points = [0] + [(s + e) // 2 for s, e in silences] + [len(audio)]
            for n, seg in enumerate(batch):
                piece = audio[split_points[n]:split_points[n + 1]]
                seg_file = out_dir / f"seg_{seg['id']:04d}.wav"
                piece.export(str(seg_file), format="wav")
                result[seg["id"]] = str(seg_file)

            logger.info(f"Gemini TTS batch: {len(batch)} segment 1 so'rovda birlashtirildi")
        except Exception as exc:
            logger.warning(f"Gemini TTS batch muvaffaqiyatsiz ({exc}) — bitta-bittalab qaytariladi")
            for seg, t in zip(batch, texts):
                seg_file = out_dir / f"seg_{seg['id']:04d}.wav"
                if self.synthesize(t, str(seg_file), voice_name=voice_name):
                    result[seg["id"]] = str(seg_file)

        return result
