import json
import os
import re
import subprocess
import tempfile
import time
import random
import threading
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI, RateLimitError
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY, max_retries=5) if settings.OPENAI_API_KEY else None
_CHUNK_DURATION_SECONDS = 8 * 60
_CHUNK_BITRATE = "64k"

# OpenAI'ning krediti tugaganda (insufficient_quota/credit_balance_exhausted)
# qayta urinish befoyda — darhol Gemini'ga (Vertex AI orqali) o'tish uchun
# aniqlanadi. Boshqa vaqtinchalik 429'lar odatdagidek qayta uriniladi.
_NO_RETRY_ERROR_MARKERS = ("insufficient_quota", "credit_balance_exhausted")

_gemini_local = threading.local()


def _get_gemini_transcribe_client():
    if not hasattr(_gemini_local, "client"):
        from google import genai

        if settings.GEMINI_USE_VERTEX:
            if settings.GOOGLE_APPLICATION_CREDENTIALS and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
            _gemini_local.client = genai.Client(
                vertexai=True,
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_LOCATION,
            )
        else:
            api_key = settings.GEMINI_API_KEY or getattr(settings, "GOOGLE_GENERATIVE_AI_API_KEY", "") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY yoki GOOGLE_GENERATIVE_AI_API_KEY sozlanmagan")
            _gemini_local.client = genai.Client(api_key=api_key)
    return _gemini_local.client

# Whisper faqat cholg'u ohangini "♪♪" yoki "[Music]"/"(applause)" kabi
# belgi bilan qaytarishi mumkin — bular haqiqiy nutq emas.
_NON_SPEECH_RE = re.compile(r"[♩-♯]|\[[^\]]*\]|\([^)]*\)")


def has_speech(segments: list[dict]) -> bool:
    """Segmentlar orasida kamida bitta haqiqiy nutq (so'z) bor-yo'qligini tekshiradi."""
    for seg in segments:
        if _NON_SPEECH_RE.sub("", seg.get("text", "")).strip():
            return True
    return False


def _get_client() -> OpenAI:
    if not client:
        raise RuntimeError("OPENAI_API_KEY not set")
    return client


def _chunk_audio(audio_path: str, chunk_dir: Path, chunk_seconds: int = _CHUNK_DURATION_SECONDS) -> list[Path]:
    output_pattern = chunk_dir / "chunk_%03d.mp3"
    proc = subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-y",
            "-i",
            audio_path,
            "-f",
            "segment",
            "-segment_time",
            str(chunk_seconds),
            "-reset_timestamps",
            "1",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            _CHUNK_BITRATE,
            str(output_pattern),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Audio bo'laklarga ajratishda xatolik: {proc.stderr[-500:]}")

    chunks = sorted(chunk_dir.glob("chunk_*.mp3"))
    if not chunks:
        raise RuntimeError("OpenAI transkripsiyasi uchun audio bo'laklari yaratilmadi.")
    return chunks


def _segment_to_dict(segment: object) -> dict:
    if hasattr(segment, "model_dump"):
        return segment.model_dump()
    if isinstance(segment, dict):
        return segment
    return {
        "start": getattr(segment, "start", None),
        "end": getattr(segment, "end", None),
        "text": getattr(segment, "text", ""),
    }


def _response_to_dict(response: object) -> dict:
    if hasattr(response, "model_dump"):
        return response.model_dump()
    if isinstance(response, dict):
        return response
    return {
        "text": getattr(response, "text", ""),
        "language": getattr(response, "language", ""),
        "segments": getattr(response, "segments", []),
    }


def call_openai_with_retry(api_func, *args, **kwargs):
    max_attempts = 7
    for attempt in range(max_attempts):
        try:
            return api_func(*args, **kwargs)
        except RateLimitError as e:
            if any(marker in str(e) for marker in _NO_RETRY_ERROR_MARKERS):
                raise e
            if attempt == max_attempts - 1:
                raise e

            retry_after = 5.0
            try:
                if hasattr(e, "response") and e.response is not None:
                    headers = e.response.headers
                    if "retry-after-ms" in headers:
                        retry_after = float(headers["retry-after-ms"]) / 1000.0
                    elif "retry-after" in headers:
                        retry_after = float(headers["retry-after"])
            except Exception:
                pass
            
            backoff = (2 ** attempt) + random.uniform(0.1, 1.0)
            sleep_time = max(retry_after, backoff)
            logger.warning(f"OpenAI RateLimit (429) hit. Qayta urinish {sleep_time:.2f} soniyadan so'ng (Urinish {attempt + 1}/{max_attempts}). Xato: {e}")
            time.sleep(sleep_time)


def _bucket_words_into_segments(words: list[dict], segments: list[dict]) -> None:
    """OpenAI so'z darajasidagi timestamp'lar javobning yuqori darajasida
    (segmentlar ichida emas) qaytariladi — har bir so'zni o'z vaqt oralig'iga
    to'g'ri keladigan segmentga joylashtiradi (in-place, segments["words"])."""
    if not words or not segments:
        return
    for seg in segments:
        seg["words"] = []
    idx = 0
    for word in words:
        w_start = word.get("start")
        if w_start is None:
            continue
        while idx + 1 < len(segments) and w_start >= segments[idx + 1]["start"]:
            idx += 1
        # So'z segment oralig'idan chetga chiqib ketishi mumkin (masalan
        # chunk chegarasida) — eng yaqin segmentga baribir biriktiriladi,
        # tashlab yuborilmaydi.
        segments[idx]["words"].append({
            "word": word.get("word", ""),
            "start": round(float(w_start), 3),
            "end": round(float(word.get("end", w_start)), 3),
        })


# OpenAI Whisper API `language` sifatida rad etadigan tillar (400: "Language 'uz' is not supported",
# 2026-08-12 productionda tasdiqlangan, commit 3759074).
_OPENAI_REJECTED_LANGUAGE_HINTS = frozenset({"uz"})
# Dekoderni o'zbek (lotin) yozuviga yo'naltiruvchi qisqa namuna matn.
_UZ_STT_PROMPT = (
    "Assalomu alaykum, aziz doʻstlar! Bugun oʻzbek tilida gaplashamiz: "
    "gʻoya, maʼlumot, oʻqish, toʻgʻri, yoʻq, boʻladi, koʻrsatish."
)


class WrongLanguageError(Exception):
    """STT natijasi kutilgan tilda emas: masalan o'zbekcha nutq o'rniga TURKCHA matn qaytdi
    (Whisper o'zbekchani tez-tez shunday adashtiradi). Bunday matn subtitr sifatida
    foydalanuvchiga BERILMAYDI -- keyingi provayder sinaladi yoki job aniq xato bilan tugaydi."""


_TURKISH_LETTERS = frozenset("çÇğĞıİöÖşŞüÜ")   # o'zbek (lotin/kirill) matnida deyarli uchramaydi


def looks_turkish(text: str | None) -> bool:
    """Matn turkchaga o'xshaydimi: turk alifbosiga xos harflar (ç ğ ı ö ş ü) ulushi >= 3%
    (haqiqiy turkcha matnda ~10-12%, o'zbekchada ~0%). Juda qisqa matn (<30 harf) uchun False."""
    letters = [c for c in (text or "") if c.isalpha()]
    if len(letters) < 30:
        return False
    return sum(c in _TURKISH_LETTERS for c in letters) / len(letters) >= 0.03


def _transcribe_chunk(chunk_path: Path, offset_seconds: float, language: str | None = None) -> tuple[list[dict], str, str]:
    # OpenAI'ning "language" parametri faqat cheklangan ISO-639-1 ro'yxatini
    # qabul qiladi — "uz" o'sha ro'yxatda YO'Q va 400 xato bilan rad etiladi
    # (2026-08-12 productionda tasdiqlangan). Shuning uchun qo'llab-
    # quvvatlanmagan/berilmagan til uchun bu parametr butunlay
    # yubormaydi — Whisper avtomatik aniqlaydi (Uzbek uchun ham ishlaydi,
    # faqat aniq "hint" sifatida berib bo'lmaydi).
    kwargs = {
        "file": None,
        "model": settings.OPENAI_TRANSCRIPTION_MODEL,
        "response_format": "verbose_json",
        "timestamp_granularities": ["segment", "word"],
    }
    # Yuqoridagi izoh talabi shu yerda BAJARILADI: OpenAI rad etadigan tillar ("uz") uchun
    # `language` yuborilmaydi (aks holda har chaqiruv 400 bilan yiqilib, zanjir doim
    # zaxiraga -- ko'pincha lokal kichik Whisper'ga -- tushardi, u esa o'zbekchani turkcha
    # yozadi). O'rniga o'zbekcha `prompt` beriladi: dekoderni o'zbek yozuviga (lotin, oʻ/gʻ)
    # yo'naltiradi. Til avtomatik aniqlanadi; turkcha chiqsa looks_turkish() ushlaydi.
    if language and language not in _OPENAI_REJECTED_LANGUAGE_HINTS:
        kwargs["language"] = language
    if language == "uz":
        kwargs["prompt"] = _UZ_STT_PROMPT

    with chunk_path.open("rb") as audio_file:
        kwargs["file"] = audio_file
        response = call_openai_with_retry(
            _get_client().audio.transcriptions.create,
            **kwargs,
        )

    response_data = _response_to_dict(response)
    segments = []
    for segment in response_data.get("segments", []):
        segment_data = _segment_to_dict(segment)
        text = (segment_data.get("text") or "").strip()
        start = segment_data.get("start")
        end = segment_data.get("end")
        if not text or start is None or end is None:
            continue
        segments.append(
            {
                "start": round(float(start) + offset_seconds, 3),
                "end": round(float(end) + offset_seconds, 3),
                "text": text,
            }
        )

    # "word" granularity so'ralganda javob top-level "words" ro'yxatini ham
    # qaytaradi (segmentlar ichida emas) — offset qo'shib, tegishli
    # segmentlarga taqsimlanadi.
    raw_words = response_data.get("words") or []
    if raw_words and segments:
        offset_words = []
        for w in raw_words:
            w_dict = w if isinstance(w, dict) else _segment_to_dict(w)
            offset_words.append({
                "word": w_dict.get("word", ""),
                "start": w_dict.get("start", 0) + offset_seconds,
                "end": w_dict.get("end", 0) + offset_seconds,
            })
        _bucket_words_into_segments(offset_words, segments)

    return (
        segments,
        (response_data.get("text") or "").strip(),
        response_data.get("language") or "en",
    )


_TRANSCRIBE_LANGUAGE_NAMES = {"en": "English", "uz": "Uzbek"}


def _get_gemini_candidate_models(primary: str) -> list[str]:
    order = [
        primary,
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-transcribe",
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash-lite",
    ]
    seen = set()
    return [m for m in order if m and not (m in seen or seen.add(m))]


def _get_gemini_stt_model_name() -> str:
    if settings.GEMINI_USE_VERTEX:
        return settings.GEMINI_VERTEX_TEXT_MODEL
    return getattr(settings, "GEMINI_STT_MODEL", None) or settings.GEMINI_MODEL or "gemini-3.8-flash"


def _build_transcribe_prompt(language: str | None) -> str:
    if language == "uz":
        lang_instruction = (
            "The audio language is Uzbek. Transcribe it verbatim in the official Uzbek Latin alphabet "
            "(the language is Uzbek, NOT Turkish; using oʻ and gʻ, do NOT use Turkish letters like ç, ğ, ı, ö, ş, ü). "
            "Do NOT translate into English, Turkish or Russian; write the exact Uzbek words spoken."
        )
    elif language:
        lang_name = _TRANSCRIBE_LANGUAGE_NAMES.get(language, language)
        lang_instruction = f"Transcribe the audio verbatim in {lang_name}, exactly as spoken."
    else:
        lang_instruction = (
            "Detect the spoken language and transcribe the audio verbatim, exactly as spoken in that language. "
            "CRITICAL: If the language spoken is Uzbek, write in official Uzbek Latin alphabet (with oʻ and gʻ). "
            "Never confuse Uzbek with Turkish. Do NOT translate into another language."
        )

    return (
        f"{lang_instruction}\n\n"
        "Instructions:\n"
        "1. Split the transcription into short natural subtitle-style segments (roughly one sentence or clause each, around 2-6 seconds each).\n"
        "2. For each segment, give its exact start and end time in seconds, measured from the start of THIS audio clip (0.0 = clip start).\n"
        "3. Exclude non-speech background music or noise. If the audio is silent or music-only, return an empty segments list.\n\n"
        'Respond with ONLY valid JSON in this exact shape, no other text:\n'
        '{"language": "uz", "segments": [{"start": 0.0, "end": 2.4, "text": "transcribed text..."}, ...]}'
    )


def _transcribe_chunk_gemini(chunk_path: Path, offset_seconds: float, language: str | None = None) -> tuple[list[dict], str, str]:
    """Google AI Studio / Vertex AI orqali Gemini bilan audio STT transkripsiya.
    Model ro'yxati (3.8 Flash High -> soddaroq modellar) asosida ketma-ket sinaydi."""
    from google.genai import types

    audio_bytes = chunk_path.read_bytes()
    config = types.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="application/json",
    )
    contents = [
        types.Part.from_bytes(data=audio_bytes, mime_type="audio/mpeg"),
        _build_transcribe_prompt(language),
    ]

    candidate_models = _get_gemini_candidate_models(_get_gemini_stt_model_name())
    last_error = None

    for model_name in candidate_models:
        for attempt in range(3):
            try:
                response = _get_gemini_transcribe_client().models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )
                raw_text = (response.text or "").strip()
                if raw_text.startswith("```"):
                    raw_text = re.sub(r"^```[a-zA-Z]*\s*", "", raw_text)
                    raw_text = re.sub(r"\s*```$", "", raw_text)
                raw_text = raw_text.strip()
                result = json.loads(raw_text)

                detected_lang = language
                if isinstance(result, dict):
                    raw_segments = result.get("segments") or result.get("subtitles") or []
                    detected_lang = result.get("language") or language or "uz"
                elif isinstance(result, list):
                    raw_segments = result
                else:
                    raw_segments = []

                segments = []
                text_parts = []
                for seg in raw_segments or []:
                    text = (seg.get("text") or "").strip()
                    start = seg.get("start")
                    end = seg.get("end")
                    if not text or start is None or end is None:
                        continue
                    text_parts.append(text)
                    segments.append({
                        "start": round(float(start) + offset_seconds, 3),
                        "end": round(float(end) + offset_seconds, 3),
                        "text": text,
                    })
                return segments, " ".join(text_parts), detected_lang or "uz"
            except Exception as e:
                last_error = e
                err_str = str(e)
                is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                is_server_error = "503" in err_str or "UNAVAILABLE" in err_str or "500" in err_str or "high demand" in err_str.lower()
                is_bad_json = isinstance(e, json.JSONDecodeError)
                if not (is_rate_limit or is_server_error or is_bad_json):
                    logger.warning(f"Gemini STT ({model_name}) doimiy xato: {e} — keyingi modelga o'tilmoqda.")
                    break

                if is_rate_limit:
                    m = re.search(r"retry in ([\d\.]+)s", err_str) or re.search(r"retryDelay['\"]:\s*['\"](\d+)s", err_str)
                    delay = float(m.group(1)) if m else 30.0
                    if delay > 20.0:
                        logger.warning(f"Gemini STT ({model_name}) kvotasi uzoq muddatga band ({delay:.1f}s) — darhol keyingi soddaroq modelga o'tilmoqda.")
                        break
                    logger.warning(f"Gemini STT ({model_name}) qisqa 429 kutish — {delay + 1.0:.1f}s ({attempt + 1}/3)")
                    time.sleep(delay + 1.0)
                elif is_server_error:
                    logger.warning(f"Gemini STT ({model_name}) server band (503) — keyingi soddaroq modelga o'tilmoqda: {e}")
                    break
                else:
                    backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                    logger.warning(f"Gemini STT ({model_name}) JSON/qayta urinish {backoff:.2f}s ({attempt + 1}/3): {e}")
                    time.sleep(backoff)

    raise last_error or RuntimeError("Barcha Gemini STT modellari muvaffaqiyatsiz bo'ldi")


def transcribe_audio(audio_path: str, language: str | None = None, primary: str | None = None) -> dict:
    """
    Audio faylni matnga aylantirish (STT).

    language: audio'da qaysi til gapirilishi kutilmoqda ("en" — original
    video, dublyaj pipeline'ining standart holati; "uz" — o'zbekcha subtitr
    yoki dublyaj qilingan audio'ni QA orqali qayta tekshirish).
    primary: "gemini" (Google AI Studio) yoki "openai" (Whisper). Standart
    holatda settings.STT_PROVIDER ("gemini") ishlatiladi.
    Returns:
        dict: {
            "text": str,           # To'liq matn
            "segments": list,      # Vaqt belgilangan segmentlar
            "srt": str,            # SRT format subtitles
            "language": str,       # Aniqlangan til
        }
    """
    if primary is None:
        primary = settings.STT_UZ_PRIMARY if language == "uz" else settings.STT_PROVIDER

    if settings.FREE_MODE and language != "uz":
        result = _transcribe_local_whisper(audio_path, language)
        if result is not None:
            return result
        logger.error("Falling back to OpenAI...")

    try:
        return _transcribe_via_api(audio_path, language, primary)
    except WrongLanguageError:
        raise   # boshqa tildagi matnni "oxirgi chora" bilan yashirmaymiz
    except Exception as e:
        if language == "uz":
            # Lokal "small" Whisper o'zbekchani turkcha/axlat matnga aylantiradi -- foydalanuvchiga
            # yaroqsiz subtitr berishdan ko'ra aniq xato bilan tugash yaxshi.
            logger.error(f"O'zbekcha transkripsiya API orqali bajarilmadi ({e}); lokal Whisper o'zbekcha uchun ishlatilmaydi.")
            raise
        # 2026-09-12: OpenAI (kredit tugagan) va Gemini (kuniga-20 bepul
        # tarif devori) BIR VAQTDA ishlamay qolgan haqiqiy production
        # hodisasi -- FREE_MODE=False bo'lganda (hozirgi holat) bu yerda
        # hech qanday zaxira yo'q edi, video butunlay muvaffaqiyatsiz
        # bo'lardi. Lokal faster-whisper hech qanday API kreditiga bog'liq
        # emas -- shuning uchun FREE_MODE yoqilganmi yo'qmi qat'i nazar,
        # OXIRGI CHORA sifatida shu yerda ham sinab ko'riladi (tarjimadagi
        # _translate_chunk_free_mt bilan bir xil mulohaza).
        logger.error(f"OpenAI/Gemini transkripsiya ikkalasi ham ishlamadi ({e}) — oxirgi chora sifatida lokal Whisper'ga o'tilmoqda.")
        result = _transcribe_local_whisper(audio_path, language)
        if result is not None:
            return result
        raise


_local_whisper_model = None
_whisper_lock = threading.Lock()


def _get_local_whisper_model():
    global _local_whisper_model
    if _local_whisper_model is None:
        with _whisper_lock:
            if _local_whisper_model is None:
                from faster_whisper import WhisperModel
                logger.info(f"Loading local faster-whisper model ({settings.WHISPER_MODEL}) into CPU memory...")
                _local_whisper_model = WhisperModel(settings.WHISPER_MODEL, device="cpu", compute_type="int8")
    return _local_whisper_model


def _transcribe_local_whisper(audio_path: str, language: str | None) -> dict | None:
    """Lokal faster-whisper (CPU, hech qanday API/kredit shart emas).
    Muvaffaqiyatsiz bo'lsa None qaytaradi (xato logga yoziladi) -- xato
    ko'tarilmaydi, chunki chaqiruvchi ikkala holatda ham (FREE_MODE'ning
    o'zi, yoki OpenAI+Gemini ikkalasi ham ishlamagandagi oxirgi chora)
    keyingi qadamga (OpenAI yoki `raise`) o'zi qaror qiladi."""
    try:
        model = _get_local_whisper_model()
        logger.info("Running local faster-whisper transcription (cached model on CPU)...")
        segments, info = model.transcribe(audio_path, beam_size=5, language=language)

        segments_list = []
        full_text_parts = []
        for i, segment in enumerate(segments, start=1):
            text = segment.text.strip()
            if not text:
                continue
            full_text_parts.append(text)
            segments_list.append({
                "id": i,
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text
            })

        srt_lines = []
        for seg in segments_list:
            srt_lines.append(str(seg["id"]))
            srt_lines.append(f"{_format_time(seg['start'])} --> {_format_time(seg['end'])}")
            srt_lines.append(seg["text"])
            srt_lines.append("")

        return {
            "text": " ".join(full_text_parts),
            "segments": segments_list,
            "srt": "\n".join(srt_lines),
            "language": info.language,
        }
    except Exception as e:
        logger.error(f"Local faster-whisper transcription failed: {e}.")
        return None


def _transcribe_provider_order(primary: str) -> list[str]:
    """API provayderlar tartibi: primary='gemini' yoki TRANSLATE_PROVIDER='gemini' bo'lsa
    Gemini birinchi bo'ladi. OpenAI krediti yo'q bo'lganda faqat Gemini ishlatiladi."""
    gemini_ok = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    prefer_gemini = primary == "gemini" or settings.TRANSLATE_PROVIDER == "gemini" or not settings.OPENAI_API_KEY
    if prefer_gemini and gemini_ok:
        return ["gemini"]
    order = ["openai", "gemini"]
    return [name for name in order if (name == "gemini" and gemini_ok) or (name == "openai" and bool(settings.OPENAI_API_KEY))]


def _transcribe_via_api(audio_path: str, language: str | None, primary: str = "openai") -> dict:
    """STT API (Gemini / OpenAI Whisper) orqali audio'ni bo'lak-bo'lak
    transkripsiya qiladi. Gemini (Google AI Studio) asosiy provayder sifatida
    o'zbek tili va xalqaro videolarda yuqori sifatli subtitr beradi."""
    segments_list = []
    full_text_parts = []
    detected_language = language

    def _transcribe_chunk_with_fallback(cpath: Path, offset: float) -> tuple[list[dict], str, str]:
        last_error: Exception | None = None
        for name in _transcribe_provider_order(primary):
            fn = _transcribe_chunk_gemini if name == "gemini" else _transcribe_chunk
            try:
                segs, text, lang = fn(cpath, offset_seconds=offset, language=language)
                if language == "uz" and looks_turkish(text):
                    raise WrongLanguageError(f"{name}: o'zbekcha nutq o'rniga turkcha matn qaytardi")
                return segs, text, lang
            except Exception as e:
                last_error = e
                logger.warning(f"{name} transkripsiya muvaffaqiyatsiz ({e}) — keyingi provayderga o'tilmoqda.")
        raise last_error  # type: ignore[misc]  (order har doim kamida bitta provayderni o'z ichiga oladi)

    # Gemini uchun 3 daqiqa (180s) optimal -- token chegarasidan oshmaydi va aniq vaqt beradi
    chunk_seconds = 180 if primary == "gemini" else _CHUNK_DURATION_SECONDS
    with tempfile.TemporaryDirectory(prefix="stt-") as temp_dir:
        chunk_paths = _chunk_audio(audio_path, Path(temp_dir), chunk_seconds=chunk_seconds)

        if len(chunk_paths) == 1:
            chunk_results = [
                (0, _transcribe_chunk_with_fallback(chunk_paths[0], 0))
            ]
        else:
            def _process_chunk(args):
                idx, cpath = args
                return idx, _transcribe_chunk_with_fallback(cpath, idx * chunk_seconds)

            max_workers = 2 if primary == "gemini" else min(len(chunk_paths), 4)
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                chunk_results = list(executor.map(_process_chunk, enumerate(chunk_paths)))

        chunk_results.sort(key=lambda x: x[0])
        for _, (chunk_segments, chunk_text, chunk_language) in chunk_results:
            if chunk_text:
                full_text_parts.append(chunk_text)
            if chunk_segments:
                segments_list.extend(chunk_segments)
            if chunk_language:
                detected_language = chunk_language

    srt_lines = []
    for i, seg in enumerate(segments_list, start=1):
        seg["id"] = i

        # SRT format
        srt_lines.append(str(i))
        srt_lines.append(f"{_format_time(seg['start'])} --> {_format_time(seg['end'])}")
        srt_lines.append(seg["text"])
        srt_lines.append("")

    return {
        "text": " ".join(full_text_parts),
        "segments": segments_list,
        "srt": "\n".join(srt_lines),
        "language": detected_language,
    }


def _format_time(seconds: float) -> str:
    """Sekundni SRT vaqt formatiga aylantirish: 00:01:23,456"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
