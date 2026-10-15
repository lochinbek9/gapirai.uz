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


def _get_client(api_key: str | None = None):
    from google import genai

    if settings.GEMINI_USE_VERTEX:
        if not hasattr(_gemini_local, "vertex_client"):
            if settings.GOOGLE_APPLICATION_CREDENTIALS and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
            _gemini_local.vertex_client = genai.Client(
                vertexai=True,
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_LOCATION,
            )
        return _gemini_local.vertex_client

    if not api_key:
        api_key = settings.GEMINI_API_KEY or getattr(settings, "GOOGLE_GENERATIVE_AI_API_KEY", "") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY sozlanmagan")

    clients = getattr(_gemini_local, "clients", None)
    if clients is None:
        clients = {}
        _gemini_local.clients = clients

    if api_key not in clients:
        clients[api_key] = genai.Client(api_key=api_key)
    return clients[api_key]


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
    """Bitta so'rovni yuboradi. Barcha mavjud Gemini API kalitlari bo'yicha rotatsiya qiladi.
    429/503 bo'lsa, tegishli kalit cooldown'ga olinib, darhol keyingi toza kalitga o'tiladi."""
    from backend.services.gemini_quota_manager import (
        get_all_gemini_api_keys,
        is_model_available,
        mark_model_cooldown,
        record_model_request,
        record_model_success,
        parse_retry_delay,
    )

    config = _config_for(voice)
    model_name = settings.GEMINI_TTS_MODEL or "gemini-3.8-flash-tts"

    if settings.GEMINI_USE_VERTEX:
        max_attempts = 3
        for attempt in range(max_attempts):
            try:
                response = _get_client().models.generate_content(
                    model=model_name,
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
                if attempt == max_attempts - 1:
                    logger.warning(f"Vertex Gemini TTS xato: {e}")
                    return None
                time.sleep(2.0 * (attempt + 1))
        return None

    api_keys = get_all_gemini_api_keys()
    if not api_keys:
        primary = settings.GEMINI_API_KEY or getattr(settings, "GOOGLE_GENERATIVE_AI_API_KEY", "") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
        if primary:
            api_keys = [primary]

    if not api_keys:
        logger.warning("Gemini TTS: Hech qanday API kalit topilmadi")
        return None

    # 1. Toza (cooldown'da bo'lmagan) kalitlar bo'yicha sinash
    for key in api_keys:
        avail, remaining = is_model_available(key, model_name)
        if not avail:
            logger.info(f"Gemini TTS ({key[:10]}...): model cooldown'da ({remaining:.1f}s qoldi) — keyingi kalitga o'tilmoqda.")
            continue

        record_model_request(key, model_name)
        try:
            client = _get_client(api_key=key)
            response = client.models.generate_content(
                model=model_name,
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
                        record_model_success(key, model_name)
                        return raw_data
        except Exception as e:
            err_str = str(e)
            is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
            is_503 = "503" in err_str or "UNAVAILABLE" in err_str
            is_unauth = "401" in err_str or "UNAUTHENTICATED" in err_str or "API key not valid" in err_str or "ACCESS_TOKEN_TYPE_UNSUPPORTED" in err_str

            if is_unauth:
                mark_model_cooldown(key, model_name, 86400.0 * 30, reason=f"401: yaroqsiz kalit")
                logger.warning(f"Gemini TTS [{key[:10]}...] 401 yaroqsiz kalit — o'chirildi.")
                continue

            if is_rate_limit:
                delay = parse_retry_delay(err_str)
                mark_model_cooldown(key, model_name, delay, reason=f"429: {err_str[:60]}")
                logger.warning(f"Gemini TTS [{key[:10]}...] 429 kvota limiti ({delay:.1f}s) — navbatdagi kalitga o'tilmoqda.")
                continue

            if is_503:
                mark_model_cooldown(key, model_name, 120.0, reason="503 server band")
                logger.warning(f"Gemini TTS [{key[:10]}...] 503 server band — navbatdagi kalitga o'tilmoqda.")
                continue

            logger.warning(f"Gemini TTS [{key[:10]}...] xato: {e}")

    # 2. Agar barcha kalitlar cooldown'da bo'lsa
    key_cooldowns = [is_model_available(k, model_name)[1] for k in api_keys]
    min_rem = min(key_cooldowns, default=99999.0)
    if min_rem > 15.0:
        logger.warning(f"Gemini TTS: Barcha kalitlar uzoq cooldown'da ({min_rem:.0f}s). Zaxira providerga o'tilmoqda.")
        return None

    # Faqat qisqa cooldown (<= 15 soniya) bo'lsa kutib eng yaxshi kalit bilan qayta urinish
    best_key = min(api_keys, key=lambda k: is_model_available(k, model_name)[1])
    wait_time = max(1.0, min(min_rem, 3.0))
    logger.info(f"Gemini TTS: Qisqa kutish ({wait_time:.1f}s) va qayta urinish...")
    time.sleep(wait_time)
    try:
        client = _get_client(api_key=best_key)
        response = client.models.generate_content(
            model=model_name,
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
                    record_model_success(best_key, model_name)
                    return raw_data
    except Exception as e:
        logger.error(f"Gemini TTS oxirgi urinish ham xato berdi: {e}")

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
    """Gemini'ning tayyor ovozlari (Autonoe/Aoede/Charon/Fenrir/Puck)."""

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

        valid_gemini_voices = {"Autonoe", "Aoede", "Charon", "Fenrir", "Puck"}
        if voice_name and voice_name in valid_gemini_voices:
            voice = voice_name
        elif voice_name and voice_name.lower() in ("kore", "aoede"):
            voice = "Aoede"
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
