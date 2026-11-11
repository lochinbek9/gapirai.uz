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


def _get_gemini_transcribe_client(api_key: str | None = None):
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
        raise RuntimeError("GEMINI_API_KEY yoki GOOGLE_GENERATIVE_AI_API_KEY sozlanmagan")

    clients = getattr(_gemini_local, "clients", None)
    if clients is None:
        clients = {}
        _gemini_local.clients = clients

    if api_key not in clients:
        clients[api_key] = genai.Client(api_key=api_key)
    return clients[api_key]

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
        "gemini-3.5-flash-lite",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-3.1-flash-lite",
        "gemini-3.1-flash-lite-preview",
    ]
    seen = set()
    return [m for m in order if m and not (m in seen or seen.add(m))]


def _get_gemini_stt_model_name() -> str:
    if settings.GEMINI_USE_VERTEX:
        return settings.GEMINI_VERTEX_TEXT_MODEL
    return getattr(settings, "GEMINI_STT_MODEL", None) or settings.GEMINI_MODEL or "gemini-3.8-flash"


def _gemini_time_to_seconds(value) -> float:
    """Gemini segment vaqtini soniyaga aylantiradi: son (75.4) yoki matn
    ("1:15.4", "01:15", "0:01:15") ko'rinishida kelishi mumkin."""
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", ".")
    if ":" in text:
        total = 0.0
        for part in text.split(":"):
            total = total * 60 + float(part)
        return total
    return float(text)


def _mmss_digits_to_seconds(value: float) -> float:
    """101.5 -> 61.5: "1:01.5" raqamlari soniya deb yozilgan holatni tiklaydi."""
    minutes = int(value // 100)
    return minutes * 60 + (value - minutes * 100)


def _has_contiguous_minute_crossing(segments: list[dict]) -> bool:
    """MM:SS raqamlarida nutq daqiqa chegarasidan uzilmasdan o'tadi: "0:58" ->
    "1:01" (58 -> 101). Soniyaga aylantirilganda chegaradagi qadam kichik
    (<= 8s) bo'ladi. Haqiqiy soniyalarda 60..99 bo'sh qolgan bo'lsa (masalan
    55..105s musiqa), aylantirilgan qadam katta qoladi -- bu belgi yo'q."""
    points = []
    for s in sorted(segments, key=lambda x: x["start"]):
        points.extend((s["start"], s["end"]))
    for a, b in zip(points, points[1:]):
        blocks = int(b // 100) - int(a // 100)
        if blocks >= 1 and 0 <= (b - a) - 40 * blocks <= 8.0:
            return True
    return False


def _fix_gemini_mmss_timestamps(segments: list[dict], clip_duration: float | None) -> list[dict]:
    """Gemini audio vaqtini ichida MM:SS bilan hisoblaydi va soniya so'ralsa ham
    ba'zan "1:01"ni 101 deb qaytaradi (2026-10 productionda: har daqiqadan keyin
    +40s siljish, 3 daqiqalik nutq ~5 daqiqaga cho'zilib, videodan oshgan qismi
    -- videoning OXIRI -- dublyajsiz qolardi). segments -- shu bo'lakka nisbatan
    (offset qo'shilmagan) vaqtlar.

    MM:SS raqamlari belgisi: 60..99 oralig'ida birorta qiymat bo'lmaydi (bunday
    "soniya" MM:SS'da yo'q), haqiqiy soniyalarda esa nutq 100s dan oshsa bu
    oraliq doim to'ladi. Yoki vaqtlar bo'lak uzunligidan oshib ketadi."""
    if not segments:
        return segments
    values = [v for s in segments for v in (s["start"], s["end"])]
    max_end = max(s["end"] for s in segments)
    tolerance = 2.0
    exceeds_clip = bool(clip_duration) and max_end > clip_duration + tolerance
    looks_mmss = (
        max_end >= 100
        and not any(60 <= v < 100 for v in values)
        and all((v - int(v // 100) * 100) < 60 for v in values)
        and _has_contiguous_minute_crossing(segments)
    )

    if looks_mmss or exceeds_clip:
        if all((v - int(v // 100) * 100) < 60 for v in values):
            converted = [
                {**s, "start": round(_mmss_digits_to_seconds(s["start"]), 3),
                 "end": round(_mmss_digits_to_seconds(s["end"]), 3)}
                for s in segments
            ]
            new_max = max(s["end"] for s in converted)
            if not clip_duration or new_max <= clip_duration + tolerance:
                logger.warning(
                    f"Gemini STT vaqtlari MM:SS raqamlari ko'rinishida keldi (max {max_end:.1f}s -> "
                    f"{new_max:.1f}s, bo'lak {clip_duration or 0:.1f}s) -- soniyaga aylantirildi."
                )
                return converted

    if exceeds_clip:
        # Aylantirib ham tushuntirib bo'lmadi -- bo'lakdan tashqaridagi
        # segmentlarni kesamiz (aks holda keyingi bo'lak bilan ustma-ust tushadi).
        kept = [
            {**s, "end": min(s["end"], clip_duration)}
            for s in segments if s["start"] < clip_duration
        ]
        logger.warning(
            f"Gemini STT vaqtlari bo'lak uzunligidan oshdi (max {max_end:.1f}s > {clip_duration:.1f}s) -- "
            f"{len(segments) - len(kept)} ta segment tashlandi, qolganlari kesildi."
        )
        return kept

    return segments


def _probe_audio_duration(path: Path) -> float | None:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        return float(out.stdout.strip())
    except Exception:
        return None


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
        "   Write times as plain decimal seconds: 1 minute 15.4 seconds is 75.4, 2 minutes 3 seconds is 123.0. "
        "NEVER write minutes and seconds as digits (do NOT write 115.4 for 1:15.4) and never use the MM:SS format.\n"
        "3. Exclude non-speech background music or noise. If the audio is silent or music-only, return an empty segments list.\n\n"
        'Respond with ONLY valid JSON in this exact shape, no other text:\n'
        '{"language": "uz", "segments": [{"start": 0.0, "end": 2.4, "text": "transcribed text..."}, ...]}'
    )


def _transcribe_chunk_gemini(chunk_path: Path, offset_seconds: float, language: str | None = None, is_paid: bool = False) -> tuple[list[dict], str, str, str, str]:
    """Google AI Studio / Vertex AI orqali Gemini bilan audio STT transkripsiya.
    Model ro'yxati va bir nechta API kalitlar asosida navbatma-navbat sinaydi."""
    from google.genai import types
    from backend.services.gemini_quota_manager import (
        get_all_gemini_api_keys,
        get_gemini_keys_for_request,
        is_paid_gemini_key,
        mask_key,
        is_model_available,
        mark_model_cooldown,
        record_model_request,
        record_model_success,
        parse_retry_delay,
    )

    audio_bytes = chunk_path.read_bytes()
    clip_duration = _probe_audio_duration(chunk_path)
    config = types.GenerateContentConfig(
        temperature=0.0,
        response_mime_type="application/json",
    )
    contents = [
        types.Part.from_bytes(data=audio_bytes, mime_type="audio/mpeg"),
        _build_transcribe_prompt(language),
    ]

    candidate_models = _get_gemini_candidate_models(_get_gemini_stt_model_name())
    api_keys = get_gemini_keys_for_request(is_paid=is_paid)
    if not api_keys:
        primary_k = settings.GEMINI_API_KEY or getattr(settings, "GOOGLE_GENERATIVE_AI_API_KEY", "") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
        if primary_k:
            api_keys = [primary_k]

    last_error = None

    for model_name in candidate_models:
        for api_key in (api_keys or [None]):
            if api_key:
                avail, remaining = is_model_available(api_key, model_name)
                if not avail:
                    logger.info(f"Gemini STT ({model_name}) kalit cooldown'da ({remaining:.1f}s qoldi) — keyingi kalitga o'tilmoqda.")
                    continue
                record_model_request(api_key, model_name)

            client = _get_gemini_transcribe_client(api_key=api_key)

            for attempt in range(2):
                try:
                    response = client.models.generate_content(
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

                    rel_segments = []
                    for seg in raw_segments or []:
                        text = (seg.get("text") or "").strip()
                        start = seg.get("start")
                        end = seg.get("end")
                        if not text or start is None or end is None:
                            continue
                        rel_segments.append({
                            "start": _gemini_time_to_seconds(start),
                            "end": _gemini_time_to_seconds(end),
                            "text": text,
                        })
                    rel_segments = _fix_gemini_mmss_timestamps(rel_segments, clip_duration)

                    text_parts = [s["text"] for s in rel_segments]
                    segments = [
                        {
                            "start": round(s["start"] + offset_seconds, 3),
                            "end": round(s["end"] + offset_seconds, 3),
                            "text": s["text"],
                        }
                        for s in rel_segments
                    ]

                    tier = "paid" if is_paid_gemini_key(api_key) else "free"
                    masked_k = mask_key(api_key) if api_key else "none"
                    if api_key:
                        record_model_success(api_key, model_name)

                    return segments, " ".join(text_parts), detected_lang or "uz", tier, masked_k
                except Exception as e:
                    last_error = e
                    err_str = str(e)
                    is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                    is_server_error = "503" in err_str or "UNAVAILABLE" in err_str or "500" in err_str or "high demand" in err_str.lower()
                    is_not_found = "404" in err_str or "NOT_FOUND" in err_str
                    is_bad_json = isinstance(e, json.JSONDecodeError)
                    is_auth_error = "401" in err_str or "UNAUTHENTICATED" in err_str or "API key not valid" in err_str

                    if is_auth_error:
                        logger.warning(f"Gemini STT ({model_name}) autentifikatsiya xatosi (401): {e} — kalit cooldown'ga olinmoqda.")
                        if api_key:
                            mark_model_cooldown(api_key, model_name, 86400.0, reason=f"401: {e}")
                        break

                    if is_not_found:
                        logger.warning(f"Gemini STT ({model_name}) mavjud emas (404): {e} — tashlab ketilmoqda.")
                        if api_key:
                            mark_model_cooldown(api_key, model_name, 86400.0, reason=f"404: {e}")
                        break

                    if is_rate_limit:
                        delay = parse_retry_delay(err_str)
                        if api_key:
                            mark_model_cooldown(api_key, model_name, delay, reason=err_str)
                        logger.warning(f"Gemini STT ({model_name}) 429 kvota limiti ({delay:.1f}s) — keyingi kalit/modelga o'tilmoqda.")
                        break

                    if is_server_error:
                        if api_key:
                            mark_model_cooldown(api_key, model_name, 120.0, reason=f"Server band (503): {e}")
                        logger.warning(f"Gemini STT ({model_name}) server band (503) — keyingi kalit/modelga o'tilmoqda: {e}")
                        break

                    if is_bad_json:
                        backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                        logger.warning(f"Gemini STT ({model_name}) JSON qayta urinish {backoff:.2f}s ({attempt + 1}/2): {e}")
                        time.sleep(backoff)
                        continue

                    logger.warning(f"Gemini STT ({model_name}) kutilmagan xato: {e} — keyingi kalit/modelga o'tilmoqda.")
                    break

    raise last_error or RuntimeError("Barcha Gemini STT modellari va API kalitlari muvaffaqiyatsiz bo'ldi")


def transcribe_audio(audio_path: str, language: str | None = None, primary: str | None = None, is_paid: bool = False) -> dict:
    """
    Audio faylni matnga aylantirish (STT).

    language: audio'da qaysi til gapirilishi kutilmoqda ("en" — original
    video, dublyaj pipeline'ining standart holati; "uz" — o'zbekcha subtitr
    yoki dublyaj qilingan audio'ni QA orqali qayta tekshirish).
    primary: "gemini" (Google AI Studio) yoki "openai" (Whisper). Standart
    holatda settings.STT_PROVIDER ("gemini") ishlatiladi.
    is_paid: True bo'lsa pullik (balansli) Gemini kalitiga ustunlik beradi.
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

    # FREE_MODE: lokal Whisper birinchi -- NeuronAI tanlangan bo'lsa (STT_PROVIDER=neuronai) API birinchi,
    # lokal Whisper faqat u ham ishlamasa (pastdagi oxirgi chora).
    neuronai_first = primary == "neuronai" and is_neuronai_stt_available()
    if neuronai_first and not language:
        # NeuronAI "auto" rejimida adashadi (inglizcha video -> arabcha matn, 2026-11-11) --
        # til lokal Whisper bilan aniqlanib aniq beriladi; ishonchsiz yoki qo'llanmaydigan til -> NeuronAI'siz.
        detected, prob = detect_language_local(audio_path)
        if detected in _NEURONAI_STT_LANGUAGES and prob >= settings.NEURONAI_LANG_MIN_PROB:
            logger.info(f"STT tili lokal aniqlandi: {detected} ({prob:.2f}) -- NeuronAI'ga beriladi.")
            language = detected
        else:
            logger.warning(f"STT tili: {detected} ({prob:.2f}) -- NeuronAI uchun yaroqsiz, avvalgi zanjir ishlatiladi.")
            neuronai_first = False
            primary = "gemini"
    if settings.FREE_MODE and language != "uz" and not neuronai_first:
        result = _transcribe_local_whisper(audio_path, language)
        if result is not None:
            return result
        logger.error("Falling back to OpenAI...")

    try:
        return _transcribe_via_api(audio_path, language, primary, is_paid=is_paid)
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


def detect_language_local(audio_path: str, offset_seconds: int = 20, clip_seconds: int = 30) -> tuple[str | None, float]:
    """Lokal faster-whisper bilan nutq tilini aniqlaydi (boshidagi musiqa/kirishni chetlab, 20-50 s
    oralig'idan; audio qisqa bo'lsa boshidan). Xato bo'lsa (None, 0.0) -- chaqiruvchi NeuronAI'ni chetlab o'tadi."""
    try:
        with tempfile.TemporaryDirectory(prefix="lang-") as tmp:
            clip = Path(tmp) / "clip.wav"
            for ss in (offset_seconds, 0):
                subprocess.run(
                    ["ffmpeg", "-loglevel", "error", "-y", "-ss", str(ss), "-i", audio_path, "-t", str(clip_seconds),
                     "-vn", "-ac", "1", "-ar", "16000", str(clip)],
                    capture_output=True, check=False,
                )
                if clip.exists() and clip.stat().st_size > 32_000:  # ~1 s dan ko'p audio
                    break
            else:
                return None, 0.0
            _, info = _get_local_whisper_model().transcribe(str(clip), beam_size=1, language=None)
            return info.language, float(info.language_probability)
    except Exception as e:
        logger.warning(f"Lokal til aniqlash ishlamadi: {e}")
        return None, 0.0


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


def _transcribe_chunk_azure(chunk_path: Path, offset_seconds: float, language: str | None = None) -> tuple[list[dict], str, str]:
    """Azure Speech-to-Text (Cognitive Services) orqali audio bo'lakni transkripsiya qilish (2-o'rindagi zaxira)."""
    import azure.cognitiveservices.speech as speechsdk

    key = settings.AZURE_SPEECH_KEY
    if not key or key in ("", "your-azure-key"):
        raise RuntimeError("AZURE_SPEECH_KEY sozlanmagan")

    region = settings.AZURE_SPEECH_REGION or "eastus"

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_wav:
        wav_file = tmp_wav.name

    try:
        conv_res = subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y", "-i", str(chunk_path),
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav_file,
            ],
            capture_output=True, text=True, check=False,
        )
        if conv_res.returncode != 0:
            raise RuntimeError(f"Audio konvertatsiyasida xatolik: {conv_res.stderr[-300:]}")

        speech_config = speechsdk.SpeechConfig(subscription=key, region=region)
        speech_config.request_word_level_timestamps()
        speech_config.output_format = speechsdk.OutputFormat.Detailed

        audio_config = speechsdk.audio.AudioConfig(filename=wav_file)

        lang_map = {
            "uz": "uz-UZ",
            "en": "en-US",
            "ru": "ru-RU",
            "tr": "tr-TR",
        }
        target_lang = lang_map.get(language, language) if language else None

        if target_lang:
            speech_config.speech_recognition_language = target_lang
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, audio_config=audio_config
            )
        else:
            auto_detect_config = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
                languages=["uz-UZ", "en-US", "ru-RU", "tr-TR"]
            )
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                auto_detect_source_language_config=auto_detect_config,
                audio_config=audio_config,
            )

        done = threading.Event()
        segments = []
        text_parts = []
        detected_lang = language or "uz"
        errors = []

        def on_recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                text = (evt.result.text or "").strip()
                if text:
                    start_sec = (evt.result.offset / 10_000_000.0) + offset_seconds
                    end_sec = start_sec + (evt.result.duration / 10_000_000.0)
                    segments.append({
                        "start": round(start_sec, 3),
                        "end": round(end_sec, 3),
                        "text": text,
                    })
                    text_parts.append(text)

                    try:
                        auto_lang = speechsdk.AutoDetectSourceLanguageResult(evt.result)
                        if auto_lang and getattr(auto_lang, "language", None):
                            nonlocal detected_lang
                            detected_lang = auto_lang.language.split("-")[0]
                    except Exception:
                        pass

        def on_canceled(evt):
            cd = getattr(evt, "cancellation_details", None)
            if cd and cd.reason == speechsdk.CancellationReason.Error:
                errors.append(f"Azure STT xatosi: {cd.error_code} - {cd.error_details}")
            done.set()

        def on_session_stopped(evt):
            done.set()

        recognizer.recognized.connect(on_recognized)
        recognizer.canceled.connect(on_canceled)
        recognizer.session_stopped.connect(on_session_stopped)

        recognizer.start_continuous_recognition()
        done.wait(timeout=240)
        recognizer.stop_continuous_recognition()

        if errors and not segments:
            raise RuntimeError(errors[0])

        logger.info(f"Azure STT: {len(segments)} segment, {len(' '.join(text_parts))} belgi")
        return segments, " ".join(text_parts), detected_lang

    finally:
        if os.path.exists(wav_file):
            try:
                os.remove(wav_file)
            except Exception:
                pass


def _transcribe_chunk_groq(chunk_path: Path, offset_seconds: float, language: str | None = None) -> tuple[list[dict], str, str, str, str]:
    """Groq Cloud API (Whisper Large v3 Turbo) orqali ultra-tezkor va 0 xarajatli audio transkripsiya."""
    from backend.services.groq_service import groq_transcribe_audio, record_groq_job
    segs, text, lang, masked_k = groq_transcribe_audio(str(chunk_path), language=language)
    adjusted_segs = []
    for s in segs:
        adjusted_segs.append({
            "start": round(s["start"] + offset_seconds, 3),
            "end": round(s["end"] + offset_seconds, 3),
            "text": s["text"],
        })
    dur = (adjusted_segs[-1]["end"] - adjusted_segs[0]["start"]) if adjusted_segs else 0.0
    record_groq_job(masked_k, duration_sec=dur)
    return adjusted_segs, text, lang, "free", f"groq:{masked_k}"


# NeuronAI qabul qiladigan til kodlari (OpenAPI: /v1/stt/transcribe); boshqasi -> "auto".
_NEURONAI_STT_LANGUAGES = {"uz", "kaa", "ru", "en", "kk", "tk", "tg", "tr", "az", "ja", "de", "ko"}


def is_neuronai_stt_available() -> bool:
    return bool(settings.NEURONAI_STT_ENABLED and settings.NEURONAI_API_KEY)


def neuronai_transcribe_file(path: Path, language: str | None = None, timeout: float = 300.0) -> dict:
    """NeuronAI STT: bitta fayl (<=25 MB) -> {"text", "language", "duration_seconds", "segments", "cost", "balance"}.
    Idempotency-Key = fayl mazmuni + til xeshi: Celery qayta urinishida xuddi shu bo'lak ikki marta to'lanmaydi."""
    import hashlib
    import httpx

    if not settings.NEURONAI_API_KEY:
        raise RuntimeError("NEURONAI_API_KEY sozlanmagan")
    lang = language if language in _NEURONAI_STT_LANGUAGES else "auto"
    data = path.read_bytes()
    idem = "stt-" + hashlib.sha256(data + lang.encode()).hexdigest()
    for attempt in range(4):
        resp = httpx.post(
            f"{settings.NEURONAI_BASE_URL.rstrip('/')}/stt/transcribe",
            headers={"Authorization": f"Bearer {settings.NEURONAI_API_KEY}", "Idempotency-Key": idem},
            files={"file": (path.name, data, "audio/mpeg")},
            data={"language": lang},
            timeout=timeout,
        )
        if resp.status_code != 429 or attempt == 3:
            break
        try:  # minutlik limit yoki bir vaqtdagi so'rovlar chegarasi -- kutib qayta (kalit tufayli qayta to'lanmaydi)
            wait = min(max(float(resp.headers.get("retry-after", "2")), 1.0), 10.0)
        except ValueError:
            wait = 2.0
        time.sleep(wait)
    if resp.status_code != 200:
        try:
            err = resp.json().get("error", {})
        except Exception:
            err = {}
        raise RuntimeError(f"NeuronAI STT {resp.status_code} {err.get('code', '')}: {(err.get('message') or resp.text)[:200]}")
    return resp.json()["data"]


# NeuronAI o'zbekchani turk lotin harflarida yozadi (yönalişlardan, töğrisida) -- izchil,
# shuning uchun rasmiy o'zbek lotin yozuviga bir xil almashtirish yetadi (2026-11-11 sinovi).
_UZ_LATIN_FIX = {
    "ş": "sh", "Ş": "Sh", "ç": "ch", "Ç": "Ch", "ö": "oʻ", "Ö": "Oʻ",
    "ğ": "gʻ", "Ğ": "Gʻ", "ı": "i", "İ": "I", "ü": "u", "Ü": "U",
}
_UZ_LATIN_FIX_RE = re.compile("[" + "".join(_UZ_LATIN_FIX) + "]")


def normalize_uz_latin(text: str) -> str:
    """Turk lotin harflarini rasmiy o'zbek lotin yozuviga: ş->sh, ç->ch, ö->oʻ, ğ->gʻ."""
    return _UZ_LATIN_FIX_RE.sub(lambda m: _UZ_LATIN_FIX[m.group()], text)


_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+")
_CLAUSE_SPLIT_RE = re.compile(r"(?<=[,;:])\s+")
MAX_SEGMENT_SECONDS = 7.0


def split_long_segment(seg: dict, max_seconds: float = MAX_SEGMENT_SECONDS) -> list[dict]:
    """NeuronAI 20-30 soniyalik segment qaytaradi -- dublaj/subtitr uchun ~2-7 soniya kerak.
    Matn gaplarga (kerak bo'lsa vergul/so'zlarga) bo'linadi, qisqa gaplar birlashtiriladi;
    vaqt har bo'lakka matn uzunligiga mutanosib taqsimlanadi (taxminiy, so'z vaqtlari yo'q)."""
    start, end, text = float(seg["start"]), float(seg["end"]), seg["text"].strip()
    duration = end - start
    if duration <= max_seconds or not text:
        return [seg]
    max_chars = max(20, int(len(text) / duration * max_seconds))

    units: list[str] = []
    for sentence in filter(None, (x.strip() for x in _SENTENCE_SPLIT_RE.split(text))):
        if len(sentence) <= max_chars:
            units.append(sentence)
            continue
        for clause in filter(None, (x.strip() for x in _CLAUSE_SPLIT_RE.split(sentence))):
            if len(clause) <= max_chars:
                units.append(clause)
                continue
            words, cur = clause.split(), ""
            for w in words:
                if cur and len(cur) + 1 + len(w) > max_chars:
                    units.append(cur)
                    cur = w
                else:
                    cur = f"{cur} {w}".strip()
            if cur:
                units.append(cur)

    groups: list[str] = []
    cur = ""
    for u in units:
        if cur and len(cur) + 1 + len(u) > max_chars:
            groups.append(cur)
            cur = u
        else:
            cur = f"{cur} {u}".strip()
    if cur:
        groups.append(cur)
    if len(groups) < 2:
        return [seg]

    total = sum(len(g) for g in groups)
    out, t = [], start
    for i, g in enumerate(groups):
        e = end if i == len(groups) - 1 else t + duration * len(g) / total
        out.append({"start": round(t, 3), "end": round(e, 3), "text": g})
        t = e
    return out


def _transcribe_chunk_neuronai(chunk_path: Path, offset_seconds: float, language: str | None = None) -> tuple[list[dict], str, str]:
    """NeuronAI orqali bitta audio bo'lak (8 daqiqalik 64k mp3 ~4 MB -- 25 MB chegarasidan ancha past).
    O'zbekcha matn rasmiy lotin yozuviga keltiriladi (aks holda looks_turkish() uni rad etardi),
    uzun segmentlar gaplarga bo'linadi."""
    data = neuronai_transcribe_file(chunk_path, language)
    lang = data.get("language") or language or ""
    fix = normalize_uz_latin if "uz" in (lang, language) else (lambda x: x)
    segments = []
    for s in data.get("segments") or []:
        text = fix((s.get("text") or "").strip())
        if not text:
            continue
        segments.extend(split_long_segment({
            "start": round(float(s["start"]) + offset_seconds, 3),
            "end": round(float(s["end"]) + offset_seconds, 3),
            "text": text,
        }))
    logger.info(
        f"NeuronAI STT: {len(segments)} segment, {data.get('duration_seconds')} s, "
        f"narx {data.get('cost')} so'm, balans {data.get('balance')} so'm"
    )
    return segments, fix((data.get("text") or "").strip()), lang


def _transcribe_provider_order(primary: str = "groq") -> list[str]:
    """API provayderlar tartibi:
    1-o'rin: Groq Whisper (ultra-tez LPU, 0 CPU/RAM, bepul kvota)
    2-o'rin: NeuronAI STT (faqat NEURONAI_STT_ENABLED=True bo'lsa)
    3-o'rin: Gemini STT (Google AI Studio / Vertex AI)
    4-o'rin: Azure STT (Cognitive Services)
    5-o'rin: OpenAI Whisper
    """
    from backend.services.groq_service import is_groq_available
    groq_ok = is_groq_available()
    neuronai_ok = is_neuronai_stt_available()
    gemini_ok = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    azure_ok = bool(settings.AZURE_SPEECH_KEY and settings.AZURE_SPEECH_KEY not in ("", "your-azure-key"))
    openai_ok = bool(settings.OPENAI_API_KEY and getattr(settings, "OPENAI_ENABLED", True))

    active = []
    if groq_ok:
        active.append("groq")
    if neuronai_ok:
        active.append("neuronai")
    if gemini_ok:
        active.append("gemini")
    if azure_ok:
        active.append("azure")
    if openai_ok:
        active.append("openai")

    if primary in active:
        order = [primary] + [p for p in active if p != primary]
    else:
        if getattr(settings, "OPENAI_ENABLED", True) and "openai" in active:
            order = ["openai"] + [p for p in active if p != "openai"]
        else:
            order = active

    return order or ["gemini"]


def _transcribe_via_api(audio_path: str, language: str | None, primary: str = "gemini", is_paid: bool = False) -> dict:
    """STT API (Groq / NeuronAI / Gemini / Azure / OpenAI Whisper) orqali audio'ni bo'lak-bo'lak
    transkripsiya qiladi. Groq 1-o'rinda (0 xarajat, ultra-tez), Gemini 2-o'rindagi ishonchli zaxira."""
    segments_list = []
    full_text_parts = []
    detected_language = language
    used_tier = "free"
    used_key = None

    def _transcribe_chunk_with_fallback(cpath: Path, offset: float) -> tuple[list[dict], str, str, str, str]:
        last_error: Exception | None = None
        for name in _transcribe_provider_order(primary):
            if name == "groq":
                fn = _transcribe_chunk_groq
            elif name == "gemini":
                fn = _transcribe_chunk_gemini
            elif name == "azure":
                fn = _transcribe_chunk_azure
            elif name == "neuronai":
                fn = _transcribe_chunk_neuronai
            else:
                fn = _transcribe_chunk
            try:
                if name == "gemini":
                    try:
                        res = fn(cpath, offset_seconds=offset, language=language, is_paid=is_paid)
                    except TypeError:
                        res = fn(cpath, offset_seconds=offset, language=language)
                    if isinstance(res, (tuple, list)) and len(res) >= 5:
                        segs, text, lang, tier, k_used = res[:5]
                    else:
                        segs, text, lang = res[0], res[1], res[2]
                        tier, k_used = "free", name
                elif name == "groq":
                    segs, text, lang, tier, k_used = fn(cpath, offset_seconds=offset, language=language)
                else:
                    segs, text, lang = fn(cpath, offset_seconds=offset, language=language)
                    tier, k_used = "free", name
                if language == "uz" and looks_turkish(text):
                    raise WrongLanguageError(f"{name}: o'zbekcha nutq o'rniga turkcha matn qaytardi")
                return segs, text, lang, tier, k_used
            except Exception as e:
                last_error = e
                logger.warning(f"{name} transkripsiya muvaffaqiyatsiz ({e}) — keyingi provayderga o'tilmoqda.")
        raise last_error  # type: ignore[misc]

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
        for _, (chunk_segments, chunk_text, chunk_language, chunk_tier, chunk_key) in chunk_results:
            if chunk_text:
                full_text_parts.append(chunk_text)
            if chunk_segments:
                segments_list.extend(chunk_segments)
            if chunk_language:
                detected_language = chunk_language
            if chunk_tier == "paid":
                used_tier = "paid"
            if chunk_key and not used_key:
                used_key = chunk_key

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
        "gemini_key_tier": used_tier,
        "gemini_key_used": used_key,
    }


def _format_time(seconds: float) -> str:
    """Sekundni SRT vaqt formatiga aylantirish: 00:01:23,456"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
