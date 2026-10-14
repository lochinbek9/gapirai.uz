"""
Gemini Quota & Multi-Key Manager
- Bir nechta Gemini API kalitlarini avtomatik aniqlash va rotatsiya qilish.
- Har bir API kalit va har bir model uchun alohida quota va cooldown hisoblagich (Redis orqali).
- Quota (429 RESOURCE_EXHAUSTED) xatolarida berilgan tiklanish muddatini aniq hisoblab,
  o'sha vaqtga qadar avtomatik kutish rejimiga olish va muddati tugagach yana faollashtirish.
- Modellarni sifat bo'yicha tartiblash (yaxshisidan oddiysiga qarab: Pro -> Flash -> Flash-Lite).
- Admin uchun har bir kalit va modelning holati/qoldiq vaqtini ko'rsatish (API + CLI).
- OpenAI UMUMAN ishlatilmaydi.
"""
import hashlib
import json
import logging
import os
import re
import time
from typing import Optional, Tuple, List, Dict, Any
from redis import Redis

from backend.config import get_settings

logger = logging.getLogger(__name__)

# Sifat bo'yicha saralangan faol matn modellar ro'yxati (yaxshisidan oddiysiga qarab):
# 1. Pro / Advanced Reasoning (chuqur tahlil, yuqori aql)
# 2. Flash flagship (tezkor, yuqori sifat, muvozanatli)
# 3. Flash-Lite & Fallbacks (yuqori kvotali zaxira modellar)
GEMINI_TEXT_MODELS: List[str] = [
    # 1. Pro / Advanced Reasoning
    "gemini-pro-latest",
    "gemini-4-argon",
    "gemini-3.1-pro-preview",

    # 2. Flash Flagship Models
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-omni-1.1-flash",

    # 3. Flash-Lite & High-Throughput Fallbacks
    "gemini-flash-lite-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemma-4-26b-a4b-it",
]

_memory_cooldowns: Dict[str, float] = {}
_memory_stats: Dict[str, Dict[str, Any]] = {}


def _get_redis() -> Optional[Redis]:
    settings = get_settings()
    if not settings.REDIS_URL:
        return None
    try:
        return Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
    except Exception as e:
        logger.warning(f"Redis ulanishida xatolik: {e}")
        return None


def get_all_gemini_api_keys() -> List[str]:
    """
    Tizimda mavjud barcha faol Gemini API kalitlarini yig'adi va deduplikatsiya qiladi.
    1. settings.GEMINI_API_KEY va GOOGLE_GENERATIVE_AI_API_KEY
    2. os.environ: GEMINI_API_KEYS, GEMINI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
    3. .env va backend/.env fayllaridagi kalitlar
    """
    settings = get_settings()
    raw_keys: List[str] = []

    # 1. Settings va os.environ
    for env_val in [
        getattr(settings, "GEMINI_API_KEY", ""),
        getattr(settings, "GOOGLE_GENERATIVE_AI_API_KEY", ""),
        os.environ.get("GEMINI_API_KEYS", ""),
        os.environ.get("GEMINI_API_KEY", ""),
        os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", ""),
    ]:
        if env_val:
            for part in str(env_val).split(","):
                cleaned = part.strip().strip('"').strip("'")
                if cleaned and len(cleaned) >= 15:
                    raw_keys.append(cleaned)

    # 2. .env fayllaridan qidirish (ildiz va backend papkalaridan)
    potential_env_paths = [
        ".env",
        "backend/.env",
        "../.env",
        "/app/.env",
        "/app/backend/.env",
        "/home/gapirai/gapirai.uz/.env",
        "/home/gapirai/gapirai.uz/backend/.env",
    ]
    for env_path in potential_env_paths:
        if os.path.isfile(env_path):
            try:
                with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k in ("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEYS"):
                            for part in v.split(","):
                                cleaned = part.strip()
                                if cleaned and len(cleaned) >= 15:
                                    raw_keys.append(cleaned)
            except Exception:
                pass

    seen = set()
    unique_keys = []
    for k in raw_keys:
        if k not in seen:
            seen.add(k)
            unique_keys.append(k)

    return unique_keys


def mask_key(api_key: str) -> str:
    """Xavfsizlik: kalitning faqat boshi va oxirini ko'rsatadi."""
    if not api_key:
        return "none"
    if len(api_key) <= 8:
        return "***"
    return f"{api_key[:6]}...{api_key[-4:]}"


def _key_hash(api_key: str) -> str:
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]


def parse_retry_delay(error_str: str) -> float:
    """
    API 429 xatosidan tiklanish muddatini soniyalarda hisoblaydi.
    Misollar:
      - retryDelay: '53075s'
      - retry in 14h44m35s
      - retry in 30.5s
    """
    err_str = str(error_str)

    # 1. retryDelay: '123s' yoki "123"
    m_delay = re.search(r"retryDelay['\"]?:\s*['\"]?(\d+)s?", err_str, re.IGNORECASE)
    if m_delay:
        try:
            return float(m_delay.group(1))
        except ValueError:
            pass

    # 2. retry in 14h44m35s (soat, daqiqa, soniya)
    m_hms = re.search(r"retry in (?:(\d+)h)?(?:(\d+)m)?(?:([\d\.]+)s)?", err_str, re.IGNORECASE)
    if m_hms:
        hours = float(m_hms.group(1) or 0)
        minutes = float(m_hms.group(2) or 0)
        seconds = float(m_hms.group(3) or 0)
        total = hours * 3600 + minutes * 60 + seconds
        if total > 0:
            return total

    # 3. retry in 60s
    m_sec = re.search(r"retry in ([\d\.]+)s", err_str, re.IGNORECASE)
    if m_sec:
        try:
            return float(m_sec.group(1))
        except ValueError:
            pass

    # Standart zaxira kutish vaqti (30 daqiqa)
    return 1800.0


def is_model_available(api_key: str, model: str) -> Tuple[bool, float]:
    """
    Model va API kalit hozir so'rov qabul qila oladimi?
    Returns: (is_available, remaining_cooldown_seconds)
    """
    kh = _key_hash(api_key)
    redis_client = _get_redis()

    if redis_client:
        try:
            cooldown_key = f"gemini_cd:{kh}:{model}"
            ttl = redis_client.ttl(cooldown_key)
            if ttl is not None and ttl > 0:
                return False, float(ttl)
        except Exception as e:
            logger.warning(f"Redis TTL tekshirishda xato: {e}")

    # Xotira zaxirasi
    cd_key = f"{kh}:{model}"
    expire_at = _memory_cooldowns.get(cd_key, 0.0)
    now = time.time()
    if expire_at > now:
        return False, expire_at - now

    return True, 0.0


def mark_model_cooldown(api_key: str, model: str, duration_sec: float, reason: str = ""):
    """Model va API kalitni ma'lum muddatga (duration_sec) kutish rejimiga oladi."""
    kh = _key_hash(api_key)
    masked = mask_key(api_key)
    duration_sec = max(10.0, min(duration_sec, 86400.0 * 2))  # min 10s, max 48 soat
    expire_at = time.time() + duration_sec

    logger.warning(
        f"[Gemini Quota] Kalit {masked} | Model: {model} — {duration_sec:.1f}s "
        f"({duration_sec / 60:.1f} daqiqa) kutishga qo'yildi. Sabab: {reason[:100]}"
    )

    redis_client = _get_redis()
    if redis_client:
        try:
            cooldown_key = f"gemini_cd:{kh}:{model}"
            redis_client.set(cooldown_key, reason[:200], ex=int(duration_sec))

            stats_key = f"gemini_stats:{kh}:{model}"
            pipe = redis_client.pipeline()
            pipe.hincrby(stats_key, "total_429", 1)
            pipe.hset(stats_key, mapping={
                "last_429": time.time(),
                "cooldown_until": expire_at,
                "masked_key": masked,
                "last_reason": reason[:200],
            })
            pipe.execute()
        except Exception as e:
            logger.warning(f"Redisga cooldown yozishda xato: {e}")

    # Xotirada ham saqlash
    cd_key = f"{kh}:{model}"
    _memory_cooldowns[cd_key] = expire_at


def record_model_request(api_key: str, model: str):
    """Barcha so'rovlar hisoblagichini oshiradi."""
    kh = _key_hash(api_key)
    redis_client = _get_redis()
    if redis_client:
        try:
            stats_key = f"gemini_stats:{kh}:{model}"
            redis_client.hincrby(stats_key, "total_requests", 1)
        except Exception:
            pass


def record_model_success(api_key: str, model: str):
    """Muvaffaqiyatli so'rovni qayd qiladi."""
    kh = _key_hash(api_key)
    redis_client = _get_redis()
    if redis_client:
        try:
            stats_key = f"gemini_stats:{kh}:{model}"
            pipe = redis_client.pipeline()
            pipe.hincrby(stats_key, "total_success", 1)
            pipe.hset(stats_key, mapping={"last_success": time.time(), "masked_key": mask_key(api_key)})
            pipe.execute()
        except Exception:
            pass


def get_gemini_quota_status() -> Dict[str, Any]:
    """Admin interfeysi yoki API uchun barcha kalitlar va modellarning joriy kvota holatini qaytaradi."""
    keys = get_all_gemini_api_keys()
    redis_client = _get_redis()
    now = time.time()

    keys_overview = []
    total_active_models = 0
    total_cooldown_models = 0

    for key in keys:
        kh = _key_hash(key)
        masked = mask_key(key)
        models_info = []

        for model in GEMINI_TEXT_MODELS:
            avail, remaining_sec = is_model_available(key, model)
            stats = {}
            if redis_client:
                try:
                    stats = redis_client.hgetall(f"gemini_stats:{kh}:{model}") or {}
                except Exception:
                    pass

            total_reqs = int(stats.get("total_requests") or 0)
            success_count = int(stats.get("total_success") or 0)
            rate_limit_count = int(stats.get("total_429") or 0)

            if avail:
                total_active_models += 1
                status_str = "active"
                remaining_human = "Faol (so'rovga tayyor)"
            else:
                total_cooldown_models += 1
                status_str = "cooldown"
                m, s = divmod(int(remaining_sec), 60)
                h, m = divmod(m, 60)
                remaining_human = f"{h}s {m}d {s}s qoldi" if h else f"{m}d {s}s qoldi"

            models_info.append({
                "model": model,
                "status": status_str,
                "available": avail,
                "remaining_seconds": round(remaining_sec, 1),
                "remaining_human": remaining_human,
                "total_requests": total_reqs,
                "success_count": success_count,
                "rate_limit_count": rate_limit_count,
                "last_reason": stats.get("last_reason", ""),
            })

        keys_overview.append({
            "key_masked": masked,
            "models": models_info,
        })

    return {
        "timestamp": now,
        "total_keys": len(keys),
        "total_active_slots": total_active_models,
        "total_cooldown_slots": total_cooldown_models,
        "keys": keys_overview,
    }


def call_gemini_json_with_fallback(system_prompt: str, user_message: str, temperature: float = 0.4) -> dict:
    """
    Barcha berilgan Gemini API kalitlari va modellarini navbatma-navbat sinab ko'radi:
    - Yaxshi modeldan oddiysiga qarab yuradi (Pro -> Flash -> Flash-Lite).
    - 429 xatosi chiqqanda cooldown hisoblaydi va keyingi kalit/modelga o'tadi.
    - Cooldown'da turgan modellar uchun tarmoqqa ortiqcha so'rov yubormasdan sakrab o'tadi.
    - OpenAI UMUMAN chaqirilmaydi.
    """
    from google import genai
    from google.genai import types

    keys = get_all_gemini_api_keys()
    if not keys:
        raise RuntimeError("Hech qanday faol GEMINI API kaliti topilmadi!")

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=temperature,
        response_mime_type="application/json",
    )

    last_error = None
    min_cooldown_remaining = float("inf")

    # Sifat bo'yicha: Har bir model uchun barcha kalitlarni navbatma-navbat sinaymiz
    for model_name in GEMINI_TEXT_MODELS:
        for api_key in keys:
            avail, remaining_sec = is_model_available(api_key, model_name)
            if not avail:
                if remaining_sec < min_cooldown_remaining:
                    min_cooldown_remaining = remaining_sec
                continue

            record_model_request(api_key, model_name)
            try:
                client = genai.Client(api_key=api_key, http_options={"timeout": 20000})
            except Exception:
                client = genai.Client(api_key=api_key)

            for attempt in range(2):
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=user_message,
                        config=config,
                    )
                    text = response.text or ""
                    text_clean = text.strip()
                    if text_clean.startswith("```"):
                        lines = text_clean.split("\n")
                        if lines[0].startswith("```"):
                            lines = lines[1:]
                        if lines and lines[-1].startswith("```"):
                            lines = lines[:-1]
                        text_clean = "\n".join(lines).strip()

                    result = json.loads(text_clean)
                    record_model_success(api_key, model_name)
                    return result

                except Exception as exc:
                    last_error = exc
                    err_str = str(exc)
                    is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                    is_server_error = "503" in err_str or "UNAVAILABLE" in err_str or "500" in err_str
                    is_timeout = "timeout" in err_str.lower() or "deadline" in err_str.lower() or "timed out" in err_str.lower()
                    is_not_found = "404" in err_str or "NOT_FOUND" in err_str
                    is_bad_json = isinstance(exc, json.JSONDecodeError)

                    if is_rate_limit:
                        retry_delay = parse_retry_delay(err_str)
                        mark_model_cooldown(api_key, model_name, retry_delay, reason=err_str)
                        if retry_delay < min_cooldown_remaining:
                            min_cooldown_remaining = retry_delay
                        # Ushbu kalit/model uchun boshqa urinmaymiz, keyingisiga o'tamiz
                        break

                    if is_server_error or is_timeout:
                        logger.warning(f"Gemini {model_name} server band/timeout: {exc} — 2 daqiqaga kutishga qo'yildi.")
                        mark_model_cooldown(api_key, model_name, 120.0, reason=f"Server band/timeout: {exc}")
                        break

                    if is_bad_json:
                        logger.warning(f"Gemini {model_name} JSON parse xatosi (urinish {attempt + 1}/2): {exc}")
                        time.sleep(1.0)
                        continue

                    if is_not_found:
                        logger.warning(f"Gemini {model_name} mavjud emas (404): {exc} — o'chirilmoqda.")
                        mark_model_cooldown(api_key, model_name, 86400.0, reason=f"404 Not Found: {exc}")
                        break

                    # Boshqa noma'lum xatolar
                    logger.warning(f"Gemini {model_name} xatosi: {exc} — keyingi modelga o'tilmoqda.")
                    mark_model_cooldown(api_key, model_name, 3600.0, reason=f"Error: {exc}")
                    break

    wait_msg = f"{min_cooldown_remaining / 60:.1f} daqiqa" if min_cooldown_remaining < float("inf") else "noma'lum vaqt"
    raise RuntimeError(
        f"Barcha mavjud Gemini modellari va API kalitlari vaqtinchalik kvota chegarasiga yetgan. "
        f"Eng yaqin model taxminan {wait_msg}dan so'ng yana faollashadi. So'nggi xato: {last_error}"
    )
