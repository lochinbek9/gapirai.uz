"""
Groq Cloud Service — Multi-key rotation, Ultra-Fast Whisper STT & LLM Inference.
- Bepul Groq API kalitlari (Free Tier) rotatsiyasi
- Audio transkripsiya: whisper-large-v3-turbo (0% server RAM/CPU, yuqori tezlik)
- Matn tahlili va test yaratish: qwen/qwen3.8-27b
- Xarajat: $0.00 (0 UZS) bepul kvota
"""

import hashlib
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Optional, Tuple, List, Dict, Any
from openai import OpenAI
from redis import Redis

from backend.config import get_settings

logger = logging.getLogger(__name__)

DEFAULT_GROQ_STT_MODEL = "whisper-large-v3-turbo"
DEFAULT_GROQ_CHAT_MODEL = "qwen/qwen3.8-27b"

_memory_cooldowns: Dict[str, float] = {}
_memory_stats: Dict[str, Dict[str, Any]] = {}


def _get_redis() -> Optional[Redis]:
    settings = get_settings()
    if not settings.REDIS_URL:
        return None
    try:
        return Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
    except Exception as e:
        logger.warning(f"Groq: Redis ulanishida xatolik: {e}")
        return None


def mask_key(key: str) -> str:
    """API kalitni xavfsiz tarzda maskalash (masalan: gsk_KM8t...jtDH)."""
    if not key:
        return "none"
    clean = key.strip()
    if len(clean) <= 12:
        return clean[:3] + "..." + clean[-3:]
    return clean[:8] + "..." + clean[-4:]


def _key_hash(key: str) -> str:
    return hashlib.md5(key.strip().encode("utf-8")).hexdigest()[:12]


def get_all_groq_api_keys() -> List[str]:
    """
    Tizimda mavjud barcha faol Groq API kalitlarini yig'adi va deduplikatsiya qiladi.
    1. settings.GROQ_API_KEYS va GROQ_API_KEY
    2. os.environ: GROQ_API_KEYS, GROQ_API_KEY
    3. .env va backend/.env fayllaridagi kalitlar
    """
    settings = get_settings()
    raw_keys: List[str] = []

    # 1. Settings va os.environ
    for env_val in [
        getattr(settings, "GROQ_API_KEYS", ""),
        getattr(settings, "GROQ_API_KEY", ""),
        os.environ.get("GROQ_API_KEYS", ""),
        os.environ.get("GROQ_API_KEY", ""),
    ]:
        if env_val:
            for part in str(env_val).split(","):
                cleaned = part.strip().strip('"').strip("'")
                if cleaned and len(cleaned) >= 15 and cleaned.startswith("gsk_"):
                    raw_keys.append(cleaned)

    # 2. .env fayllaridan qidirish
    potential_env_paths = [
        ".env",
        "backend/.env",
        "/home/kai/projects/gapirai.uz/.env",
        "/home/kai/projects/gapirai.uz/backend/.env",
    ]

    for p in potential_env_paths:
        try:
            path = Path(p)
            if path.exists() and path.is_file():
                for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip()
                    if line.startswith("#") or "=" not in line:
                        continue
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip('"').strip("'")
                    if k in ("GROQ_API_KEYS", "GROQ_API_KEY") and v:
                        for part in v.split(","):
                            cleaned = part.strip().strip('"').strip("'")
                            if cleaned and len(cleaned) >= 15 and cleaned.startswith("gsk_"):
                                raw_keys.append(cleaned)
        except Exception:
            pass

    # Deduplikatsiya tartibni saqlagan holda
    seen = set()
    deduped = []
    for k in raw_keys:
        if k not in seen:
            seen.add(k)
            deduped.append(k)

    return deduped


def is_groq_available() -> bool:
    """Kamida bitta Groq API kaliti bormi?"""
    keys = get_all_groq_api_keys()
    return len(keys) > 0


def is_key_available(key: str) -> Tuple[bool, float]:
    """Kalit hozir faolmi yoki 429 cooldown'dami?"""
    kh = _key_hash(key)
    redis_client = _get_redis()
    if redis_client:
        try:
            ttl = redis_client.ttl(f"groq_cooldown:{kh}")
            if ttl and ttl > 0:
                return False, float(ttl)
            return True, 0.0
        except Exception:
            pass

    expire_at = _memory_cooldowns.get(kh, 0.0)
    now = time.time()
    if expire_at > now:
        return False, expire_at - now
    return True, 0.0


def mark_groq_cooldown(key: str, cooldown_seconds: float = 60.0, reason: str = ""):
    """Kalitni belgilangan muddatga cooldown ga olish."""
    kh = _key_hash(key)
    redis_client = _get_redis()
    dur = max(10, int(cooldown_seconds))

    if redis_client:
        try:
            redis_client.setex(f"groq_cooldown:{kh}", dur, "1")
            redis_client.hincrby(f"groq_stats:{kh}", "total_429", 1)
            if reason:
                redis_client.hset(f"groq_stats:{kh}", "last_reason", reason[:200])
            redis_client.hset(f"groq_stats:{kh}", "last_used", int(time.time()))
        except Exception as e:
            logger.warning(f"Groq: Redis cooldown yozishda xato: {e}")

    _memory_cooldowns[kh] = time.time() + dur
    st = _memory_stats.setdefault(kh, {"total_requests": 0, "total_success": 0, "total_429": 0})
    st["total_429"] += 1
    if reason:
        st["last_reason"] = reason[:200]
    st["last_used"] = time.time()


def record_groq_request(key: str):
    kh = _key_hash(key)
    redis_client = _get_redis()
    if redis_client:
        try:
            redis_client.hincrby(f"groq_stats:{kh}", "total_requests", 1)
            redis_client.hset(f"groq_stats:{kh}", "last_used", int(time.time()))
        except Exception:
            pass
    st = _memory_stats.setdefault(kh, {"total_requests": 0, "total_success": 0, "total_429": 0})
    st["total_requests"] += 1
    st["last_used"] = time.time()


def record_groq_success(key: str):
    kh = _key_hash(key)
    redis_client = _get_redis()
    if redis_client:
        try:
            redis_client.hincrby(f"groq_stats:{kh}", "total_success", 1)
        except Exception:
            pass
    st = _memory_stats.setdefault(kh, {"total_requests": 0, "total_success": 0, "total_429": 0})
    st["total_success"] += 1


def record_groq_job(key: str, duration_sec: float = 0.0):
    """Bajarilgan jobni qayd qilish ($0.00 / 0 UZS xarajat bilan)."""
    kh = _key_hash(key)
    redis_client = _get_redis()
    if redis_client:
        try:
            redis_client.hincrby(f"groq_jobs:{kh}", "jobs_count", 1)
            redis_client.hincrbyfloat(f"groq_jobs:{kh}", "duration_sec", duration_sec)
            redis_client.hset(f"groq_jobs:{kh}", "cost_usd", "0.0")
            redis_client.hset(f"groq_jobs:{kh}", "cost_uzs", "0")
        except Exception:
            pass


def reset_groq_key_cooldown(masked_key: str) -> bool:
    """Admin tomonidan Groq kalit cooldownini qo'lda tozalash."""
    keys = get_all_groq_api_keys()
    target_key = None
    for k in keys:
        if mask_key(k) == masked_key:
            target_key = k
            break

    if not target_key:
        return False

    kh = _key_hash(target_key)
    redis_client = _get_redis()
    if redis_client:
        try:
            redis_client.delete(f"groq_cooldown:{kh}")
        except Exception:
            pass
    _memory_cooldowns.pop(kh, None)
    return True


def get_available_groq_key() -> Tuple[Optional[str], float]:
    """Hozir foydalanish uchun eng munosib Groq kalitini tanlaydi."""
    keys = get_all_groq_api_keys()
    if not keys:
        return None, 0.0

    min_cooldown = float("inf")
    for k in keys:
        avail, rem = is_key_available(k)
        if avail:
            return k, 0.0
        if rem < min_cooldown:
            min_cooldown = rem

    return None, min_cooldown if min_cooldown != float("inf") else 30.0


def _get_client_for_key(api_key: str) -> OpenAI:
    return OpenAI(base_url="https://api.groq.com/openai/v1", api_key=api_key, max_retries=1)


def groq_transcribe_audio(audio_path: str, language: Optional[str] = None) -> Tuple[List[dict], str, str, str]:
    """
    Groq Whisper Large v3 Turbo orqali audio faylni transkripsiya qilish.
    Qaytaradi: (segments, full_text, detected_lang, masked_key)
    Har bir segment: {"start": float, "end": float, "text": str}
    """
    keys = get_all_groq_api_keys()
    if not keys:
        raise RuntimeError("Hech qanday Groq API kaliti topilmadi")

    settings = get_settings()
    model = getattr(settings, "GROQ_STT_MODEL", DEFAULT_GROQ_STT_MODEL) or DEFAULT_GROQ_STT_MODEL

    last_error = None
    for key in keys:
        avail, rem = is_key_available(key)
        if not avail:
            logger.info(f"Groq kalit {mask_key(key)} cooldown'da ({rem:.1f}s qoldi), keyingisiga o'tilmoqda")
            continue

        record_groq_request(key)
        client = _get_client_for_key(key)

        try:
            with open(audio_path, "rb") as f:
                params: Dict[str, Any] = {
                    "model": model,
                    "file": f,
                    "response_format": "verbose_json",
                    "temperature": 0.0,
                }
                if language:
                    params["language"] = language

                start_t = time.monotonic()
                transcription = client.audio.transcriptions.create(**params)
                latency = time.monotonic() - start_t
                logger.info(f"Groq STT muvaffaqiyatli ({mask_key(key)}, {model}) — {latency:.2f}s")

            record_groq_success(key)

            # Segments parsing
            raw_segments = getattr(transcription, "segments", []) or []
            segments: List[dict] = []
            text_parts: List[str] = []

            for s in raw_segments:
                seg_dict = s if isinstance(s, dict) else s.__dict__
                txt = (seg_dict.get("text") or "").strip()
                st = seg_dict.get("start", 0.0)
                en = seg_dict.get("end", 0.0)
                if txt:
                    text_parts.append(txt)
                    segments.append({
                        "start": round(float(st), 3),
                        "end": round(float(en), 3),
                        "text": txt,
                    })

            full_text = getattr(transcription, "text", "") or " ".join(text_parts)
            detected_lang = getattr(transcription, "language", language or "uz")

            return segments, full_text.strip(), detected_lang, mask_key(key)

        except Exception as e:
            err_str = str(e)
            logger.warning(f"Groq STT xatolik ({mask_key(key)}): {err_str}")
            last_error = e
            if "429" in err_str or "rate_limit" in err_str.lower() or "quota" in err_str.lower():
                mark_groq_cooldown(key, cooldown_seconds=60.0, reason=err_str)
            continue

    raise last_error or RuntimeError("Barcha Groq API kalitlari band yoki javob bermadi")


def groq_chat_completion(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    json_mode: bool = False,
    temperature: float = 0.4,
    max_tokens: int = 4096,
) -> Tuple[str, str]:
    """
    Groq orqali ultra-tez chat completion / JSON generation.
    Qaytaradi: (content_string, masked_key)
    """
    keys = get_all_groq_api_keys()
    if not keys:
        raise RuntimeError("Hech qanday Groq API kaliti topilmadi")

    settings = get_settings()
    model_name = model or getattr(settings, "GROQ_CHAT_MODEL", DEFAULT_GROQ_CHAT_MODEL) or DEFAULT_GROQ_CHAT_MODEL

    last_error = None
    for key in keys:
        avail, rem = is_key_available(key)
        if not avail:
            continue

        record_groq_request(key)
        client = _get_client_for_key(key)

        try:
            params: Dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if json_mode:
                params["response_format"] = {"type": "json_object"}

            start_t = time.monotonic()
            response = client.chat.completions.create(**params)
            latency = time.monotonic() - start_t
            logger.info(f"Groq Chat muvaffaqiyatli ({mask_key(key)}, {model_name}) — {latency:.2f}s")

            record_groq_success(key)
            content = response.choices[0].message.content or ""
            return content.strip(), mask_key(key)

        except Exception as e:
            err_str = str(e)
            logger.warning(f"Groq Chat xatolik ({mask_key(key)}): {err_str}")
            last_error = e
            if "429" in err_str or "rate_limit" in err_str.lower() or "quota" in err_str.lower():
                mark_groq_cooldown(key, cooldown_seconds=60.0, reason=err_str)
            continue

    raise last_error or RuntimeError("Barcha Groq API kalitlari band yoki javob bermadi")


def get_groq_keys_detailed_stats(db=None) -> Dict[str, Any]:
    """
    Admin paneldagi alohida Groq Kalitlari ko'rinishi uchun to'liq ma'lumot.
    Foydalanuvchi talabi: Gemini kalitlari bilan aralashtirib yubormagan holda,
    xarajati $0.00 (0 UZS) bepul tier sifatida ko'rsatiladi.
    """
    keys = get_all_groq_api_keys()
    redis_client = _get_redis()

    key_items = []
    total_active = 0
    total_cooldown = 0
    total_requests_all = 0
    total_jobs_all = 0

    for key in keys:
        masked = mask_key(key)
        kh = _key_hash(key)

        avail, remaining_sec = is_key_available(key)
        status_str = "active" if avail else "cooldown"
        if avail:
            total_active += 1
            remaining_human = "Faol (so'rovga tayyor)"
        else:
            total_cooldown += 1
            m, s = divmod(int(remaining_sec), 60)
            remaining_human = f"{m}d {s}s qoldi" if m else f"{s}s qoldi"

        req_count = 0
        succ_count = 0
        err_429 = 0
        cooldown_reason = ""
        jobs_count = 0
        duration_sec = 0.0

        if redis_client:
            try:
                st = redis_client.hgetall(f"groq_stats:{kh}") or {}
                req_count = int(st.get("total_requests") or 0)
                succ_count = int(st.get("total_success") or 0)
                err_429 = int(st.get("total_429") or 0)
                cooldown_reason = st.get("last_reason") or ""

                jb = redis_client.hgetall(f"groq_jobs:{kh}") or {}
                jobs_count = int(jb.get("jobs_count") or 0)
                duration_sec = float(jb.get("duration_sec") or 0.0)
            except Exception:
                pass
        else:
            mst = _memory_stats.get(kh, {})
            req_count = mst.get("total_requests", 0)
            succ_count = mst.get("total_success", 0)
            err_429 = mst.get("total_429", 0)
            cooldown_reason = mst.get("last_reason", "")

        total_requests_all += req_count
        total_jobs_all += jobs_count

        key_items.append({
            "key_masked": masked,
            "tier": "free",
            "tier_label": "⚡ Bepul Cloud Tier (0 xarajat)",
            "status": status_str,
            "remaining_seconds": round(remaining_sec, 1),
            "remaining_human": remaining_human,
            "cooldown_reason": cooldown_reason[:150] if cooldown_reason else "",
            "models": [
                f"{DEFAULT_GROQ_STT_MODEL} (Audio STT)",
                f"{DEFAULT_GROQ_CHAT_MODEL} (Tezkor matn/test)",
            ],
            "limits": {
                "rpm": 30,
                "rpd": 14400,
                "tpm": "500,000",
                "label": "30 RPM • 14,400 RPD • 0 UZS (Groq Free Tier)",
            },
            "total_jobs": jobs_count,
            "total_duration_sec": round(duration_sec, 1),
            "total_cost_usd": 0.0,
            "total_cost_uzs": 0,
            "total_requests": req_count,
            "success_count": succ_count,
            "rate_limit_count": err_429,
        })

    return {
        "summary": {
            "provider": "Groq Cloud LPU",
            "tier": "Free Tier ($0.00)",
            "total_keys": len(keys),
            "total_active_keys": total_active,
            "total_cooldown_keys": total_cooldown,
            "total_jobs_all": total_jobs_all,
            "total_requests_all": total_requests_all,
            "total_cost_all_usd": 0.0,
            "total_cost_all_uzs": 0,
            "cost_status_label": "0.00 UZS (Mutlaqo Bepul)",
            "description": (
                "Groq Cloud tezkor LPU chipi orqali ishlaydi. "
                "Audio transkripsiya (Whisper Large v3 Turbo) va matn tahlili (Qwen 27B) "
                "bepul kvota doirasida 0 xarajat bilan bajariladi. Server protsessori va xotirasiga nol yuk tushadi."
            ),
        },
        "keys": key_items,
    }
