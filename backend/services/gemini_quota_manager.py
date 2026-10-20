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

GEMINI_TTS_MODELS: List[str] = [
    "gemini-3.8-flash-tts",
]

# Sifat va tezlik bo'yicha saralangan barqaror modellar ro'yxati:
# 1. Flash flagship (yuqori sifat, tezkor, tabiiy dublyaj, yuqori kvota)
# 2. Flash-Lite (yuqori kvotali zaxira modellar)
# 3. Pro (chuqur tahlil, past kvotali zaxira)
GEMINI_TEXT_MODELS: List[str] = [
    # 1. Flash Flagship Models (Asosiy va yuqori sifatli)
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-omni-1.1-flash",

    # 2. Flash-Lite Fallbacks (Zaxira - yuqori tezlik va kvota)
    "gemini-3.5-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",

    # 3. Pro Reasoning Models (Faqat barcha Flash modellar to'lganda)
    "gemini-pro-latest",
    "gemini-3.1-pro-preview",
]

GEMINI_ALL_MONITORED_MODELS: List[str] = GEMINI_TTS_MODELS + GEMINI_TEXT_MODELS

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
        getattr(settings, "GEMINI_PAID_API_KEY", ""),
        getattr(settings, "GEMINI_PAID_API_KEYS", ""),
        os.environ.get("GEMINI_API_KEYS", ""),
        os.environ.get("GEMINI_API_KEY", ""),
        os.environ.get("GEMINI_PAID_API_KEY", ""),
        os.environ.get("GEMINI_PAID_API_KEYS", ""),
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
                        if k in ("GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEYS", "GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS"):
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


def get_paid_gemini_api_keys() -> List[str]:
    """Pullik (balansli) Gemini API kalitlarini qaytaradi."""
    settings = get_settings()
    raw_keys: List[str] = []

    for env_val in [
        getattr(settings, "GEMINI_PAID_API_KEY", ""),
        getattr(settings, "GEMINI_PAID_API_KEYS", ""),
        os.environ.get("GEMINI_PAID_API_KEY", ""),
        os.environ.get("GEMINI_PAID_API_KEYS", ""),
    ]:
        if env_val:
            for part in str(env_val).split(","):
                cleaned = part.strip().strip('"').strip("'")
                if cleaned and len(cleaned) >= 15:
                    raw_keys.append(cleaned)

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
                        if k in ("GEMINI_PAID_API_KEY", "GEMINI_PAID_API_KEYS"):
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


def is_paid_gemini_key(api_key: str) -> bool:
    """Kalit pullik (balansli) toifaga tegishli ekanligini tekshiradi."""
    if not api_key:
        return False
    paid_set = set(get_paid_gemini_api_keys())
    return api_key.strip() in paid_set


def get_free_gemini_api_keys() -> List[str]:
    """Pullik bo'lmagan (bepul 30+ hovuzdagi) Gemini kalitlarini qaytaradi."""
    all_keys = get_all_gemini_api_keys()
    paid_set = set(get_paid_gemini_api_keys())
    free_list = [k for k in all_keys if k not in paid_set]
    return free_list if free_list else all_keys


def get_gemini_keys_for_request(is_paid: bool = False) -> List[str]:
    """
    So'rov turiga mos Gemini API kalitlarini saralab beradi:
    - is_paid=True (Pullik tarifdagilar / sotib olingan daqiqali dublyajlar):
      Birinchi o'rinda pullik (balansli) kalit(lar), favqulodda zaxira sifatida bepul kalitlar.
    - is_paid=False (Bepul foydalanuvchilar, 2-daqiqalik sinov dublyajlari, bepul tahlillar):
      FAQAT bepul kalitlar (pullik kalit balansi tegilmaydi).
    """
    paid_keys = get_paid_gemini_api_keys()
    free_keys = get_free_gemini_api_keys()

    if is_paid:
        combined = []
        seen = set()
        for k in paid_keys + free_keys:
            if k not in seen:
                seen.add(k)
                combined.append(k)
        return combined if combined else get_all_gemini_api_keys()
    else:
        # Bepul foydalanuvchilar faqat bepul hovuzdan foydalanadi
        return free_keys if free_keys else get_all_gemini_api_keys()


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

        for model in GEMINI_ALL_MONITORED_MODELS:
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
            "tier": "paid" if is_paid_gemini_key(key) else "free",
            "models": models_info,
        })

    return {
        "timestamp": now,
        "total_keys": len(keys),
        "total_paid_keys": len(get_paid_gemini_api_keys()),
        "total_free_keys": len(get_free_gemini_api_keys()),
        "total_active_slots": total_active_models,
        "total_cooldown_slots": total_cooldown_models,
        "keys": keys_overview,
    }


def call_gemini_json_with_fallback(system_prompt: str, user_message: str, temperature: float = 0.4, is_paid: bool = False) -> dict:
    """
    Barcha berilgan Gemini API kalitlari va modellarini navbatma-navbat sinab ko'radi:
    - is_paid=True bo'lsa: birinchi o'rinda pullik (balansli) kalit(lar), keyin bepul hovuz.
    - is_paid=False bo'lsa: FAQAT bepul kalitlar (pullik kalit balansi tegilmaydi).
    - Yaxshi modeldan oddiysiga qarab yuradi (Pro -> Flash -> Flash-Lite).
    - 429 xatosi chiqqanda cooldown hisoblaydi va keyingi kalit/modelga o'tadi.
    - Cooldown'da turgan modellar uchun tarmoqqa ortiqcha so'rov yubormasdan sakrab o'tadi.
    - OpenAI UMUMAN chaqirilmaydi.
    """
    from google import genai
    from google.genai import types

    keys = get_gemini_keys_for_request(is_paid=is_paid)
    if not keys:
        raise RuntimeError("Hech qanday faol GEMINI API kaliti topilmadi!")

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=temperature,
        response_mime_type="application/json",
    )

    last_error = None
    min_cooldown_remaining = float("inf")

    # Sifat bo'yicha: Har bir model uchun kalitlarni sinaymiz.
    # Agar model Google tomonida 503 (high demand) yoki timeout bersa,
    # 2 ta kalitdan so'ng darhol KEYINGI MODELGA o'tiladi (foydalanuvchi yarim soat kutmasligi uchun).
    for model_name in GEMINI_TEXT_MODELS:
        model_fail_count = 0
        for api_key in keys:
            avail, remaining_sec = is_model_available(api_key, model_name)
            if not avail:
                if remaining_sec < min_cooldown_remaining:
                    min_cooldown_remaining = remaining_sec
                continue

            record_model_request(api_key, model_name)
            try:
                client = genai.Client(api_key=api_key, http_options={"timeout": 12000})
            except Exception:
                client = genai.Client(api_key=api_key)

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
                is_server_error = "503" in err_str or "UNAVAILABLE" in err_str or "500" in err_str or "high demand" in err_str.lower()
                is_timeout = "timeout" in err_str.lower() or "deadline" in err_str.lower() or "timed out" in err_str.lower()
                is_not_found = "404" in err_str or "NOT_FOUND" in err_str
                is_bad_json = isinstance(exc, json.JSONDecodeError)

                if is_rate_limit:
                    retry_delay = parse_retry_delay(err_str)
                    mark_model_cooldown(api_key, model_name, retry_delay, reason=err_str)
                    if retry_delay < min_cooldown_remaining:
                        min_cooldown_remaining = retry_delay
                    continue

                is_auth_error = any(x in err_str for x in ["401", "UNAUTHENTICATED", "API key not valid", "ACCESS_TOKEN_TYPE_UNSUPPORTED"])
                if is_auth_error:
                    logger.warning(f"[Gemini Quota] Kalit {mask_key(api_key)} 401 yaroqsiz kalit — butunlay 30 kunga to'xtatildi: {exc}")
                    for m in GEMINI_ALL_MONITORED_MODELS:
                        mark_model_cooldown(api_key, m, 86400.0 * 30, reason=f"401: Yaroqsiz kalit")
                    continue

                if is_server_error or is_timeout:
                    logger.warning(f"Gemini {model_name} server band/timeout: {exc}")
                    mark_model_cooldown(api_key, model_name, 120.0, reason=f"Server band/timeout: {exc}")
                    model_fail_count += 1
                    if model_fail_count >= 2:
                        logger.warning(f"[Gemini Quota] Model {model_name} Google'da band (2 ta kalitda 503/timeout). Keyingi modelga zudlik bilan o'tilmoqda!")
                        break
                    continue

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


def get_admin_gemini_mode() -> str:
    """Admin foydalanuvchilar dublyaj/tahlil qilganda qaysi kalit ishlasin: 'free' (default) yoki 'paid'."""
    redis_client = _get_redis()
    if redis_client:
        try:
            val = redis_client.get("gemini:admin_mode")
            if val in ("free", "paid"):
                return val
        except Exception:
            pass
    return "free"


def set_admin_gemini_mode(mode: str) -> str:
    """Admin dublyaj rejimini sozlash ('free' yoki 'paid')."""
    clean_mode = "paid" if mode == "paid" else "free"
    redis_client = _get_redis()
    if redis_client:
        try:
            redis_client.set("gemini:admin_mode", clean_mode)
        except Exception as e:
            logger.warning(f"Admin rejimini saqlashda xato: {e}")
    return clean_mode


def get_paid_initial_balance() -> float:
    """Pullik kalit uchun kiritilgan boshlang'ich balans ($). Standart $30.00."""
    redis_client = _get_redis()
    if redis_client:
        try:
            val = redis_client.get("gemini:paid_initial_balance")
            if val is not None:
                return float(val)
        except Exception:
            pass
    return 30.00


def set_paid_initial_balance(amount: float) -> float:
    """Pullik kalit boshlang'ich balansini yangilash."""
    amount = max(0.0, float(amount))
    redis_client = _get_redis()
    if redis_client:
        try:
            redis_client.set("gemini:paid_initial_balance", str(round(amount, 4)))
        except Exception as e:
            logger.warning(f"Balansni saqlashda xato: {e}")
    return amount


def record_job_key_usage(api_key_or_masked: str, duration_sec: float, cost_usd: float, cost_uzs: int):
    """Har bir kalit bo'yicha muvaffaqiyatli video soni, davomiyligi va xarajatini Redisda saqlaydi."""
    if not api_key_or_masked or api_key_or_masked == "none":
        return
    redis_client = _get_redis()
    if not redis_client:
        return
    try:
        masked = mask_key(api_key_or_masked) if len(api_key_or_masked) > 20 else api_key_or_masked
        kh = hashlib.sha256(masked.encode("utf-8")).hexdigest()[:12]
        key_redis = f"gemini_kusage:{kh}"
        pipe = redis_client.pipeline()
        pipe.hincrby(key_redis, "jobs_count", 1)
        pipe.hincrbyfloat(key_redis, "duration_sec", float(duration_sec or 0))
        pipe.hincrbyfloat(key_redis, "cost_usd", float(cost_usd or 0))
        pipe.hincrby(key_redis, "cost_uzs", int(cost_uzs or 0))
        pipe.hset(key_redis, "masked_key", masked)
        pipe.hset(key_redis, "last_used", time.time())
        pipe.execute()
    except Exception as e:
        logger.warning(f"Kalit statistikasini yozishda xato: {e}")


def reset_gemini_key_cooldown(masked_key: str, model: Optional[str] = None) -> bool:
    """Admin tomonidan kalit yoki model cooldownini zudlik bilan tozalash."""
    all_keys = get_all_gemini_api_keys()
    target_key = None
    for k in all_keys:
        if mask_key(k) == masked_key or k == masked_key:
            target_key = k
            break
    if not target_key:
        return False

    kh = _key_hash(target_key)
    redis_client = _get_redis()
    models_to_reset = [model] if model else GEMINI_ALL_MONITORED_MODELS

    for m in models_to_reset:
        cd_key = f"{kh}:{m}"
        _memory_cooldowns.pop(cd_key, None)
        if redis_client:
            try:
                redis_client.delete(f"gemini_cd:{kh}:{m}")
            except Exception:
                pass
    return True


def format_duration_uz(seconds: float) -> str:
    """Soniyalarni chiroyli o'zbekcha formatga o'tkazadi (masalan: '12 daq 45 son')."""
    sec = int(round(seconds or 0))
    if sec <= 0:
        return "0 son"
    h = sec // 3600
    m = (sec % 3600) // 60
    s = sec % 60
    parts = []
    if h > 0:
        parts.append(f"{h} soat")
    if m > 0:
        parts.append(f"{m} daq")
    if s > 0 and h == 0:
        parts.append(f"{s} son")
    return " ".join(parts) if parts else "0 son"


def get_gemini_keys_detailed_stats(db=None) -> Dict[str, Any]:
    """Admin paneldagi Gemini Kalitlar va Kvota boshqaruvi uchun to'liq tahliliy ma'lumot."""
    all_keys = get_all_gemini_api_keys()
    paid_keys = get_paid_gemini_api_keys()
    paid_set = set(paid_keys)
    redis_client = _get_redis()
    admin_mode = get_admin_gemini_mode()
    initial_balance = get_paid_initial_balance()

    db_stats_by_key = {}
    paid_jobs_totals = {"jobs_count": 0, "duration_sec": 0.0, "cost_usd": 0.0, "cost_uzs": 0}

    if db:
        try:
            from backend.models.database import DubbingJob, JobStatus, VideoAnalysis, AnalysisStatus
            from sqlalchemy import func

            # 1. Dubbing Jobs
            rows = db.query(
                DubbingJob.gemini_key_used,
                func.count(DubbingJob.id).label("job_count"),
                func.sum(DubbingJob.video_duration).label("duration_sum"),
            ).filter(
                DubbingJob.status == JobStatus.COMPLETED,
                DubbingJob.gemini_key_used.isnot(None)
            ).group_by(DubbingJob.gemini_key_used).all()

            for r in rows:
                if r[0]:
                    dur = float(r[2] or 0)
                    cost_u = round(dur * (0.002 / 60.0), 4)
                    cost_z = int(cost_u * 12850)
                    db_stats_by_key[r[0]] = {
                        "job_count": int(r[1] or 0),
                        "duration_sec": dur,
                        "cost_usd": cost_u,
                        "cost_uzs": cost_z,
                    }

            # 2. Video Analysis
            va_rows = db.query(
                VideoAnalysis.gemini_key_used,
                func.count(VideoAnalysis.id).label("job_count"),
                func.sum(VideoAnalysis.video_duration).label("duration_sum"),
            ).filter(
                VideoAnalysis.status == AnalysisStatus.COMPLETED,
                VideoAnalysis.gemini_key_used.isnot(None)
            ).group_by(VideoAnalysis.gemini_key_used).all()

            for r in va_rows:
                if r[0]:
                    k = r[0]
                    dur = float(r[2] or 0)
                    cost_u = round(dur * (0.002 / 60.0), 4)
                    cost_z = int(cost_u * 12850)
                    if k in db_stats_by_key:
                        db_stats_by_key[k]["job_count"] += int(r[1] or 0)
                        db_stats_by_key[k]["duration_sec"] += dur
                        db_stats_by_key[k]["cost_usd"] += cost_u
                        db_stats_by_key[k]["cost_uzs"] += cost_z
                    else:
                        db_stats_by_key[k] = {
                            "job_count": int(r[1] or 0),
                            "duration_sec": dur,
                            "cost_usd": cost_u,
                            "cost_uzs": cost_z,
                        }

            # Pullik kalit umumiy xarajatlari (Dubbing + Video Analysis)
            p_jobs = db.query(
                func.count(DubbingJob.id),
                func.sum(DubbingJob.video_duration),
            ).filter(
                DubbingJob.status == JobStatus.COMPLETED,
                DubbingJob.gemini_key_tier == "paid"
            ).first()

            p_va = db.query(
                func.count(VideoAnalysis.id),
                func.sum(VideoAnalysis.video_duration),
            ).filter(
                VideoAnalysis.status == AnalysisStatus.COMPLETED,
                VideoAnalysis.gemini_key_tier == "paid"
            ).first()

            total_p_cnt = (int(p_jobs[0]) if p_jobs and p_jobs[0] else 0) + (int(p_va[0]) if p_va and p_va[0] else 0)
            total_p_dur = (float(p_jobs[1]) if p_jobs and p_jobs[1] else 0.0) + (float(p_va[1]) if p_va and p_va[1] else 0.0)
            total_p_cost_usd = round(total_p_dur * (0.002 / 60.0), 4)
            total_p_cost_uzs = int(total_p_cost_usd * 12850)

            paid_jobs_totals = {
                "jobs_count": total_p_cnt,
                "duration_sec": total_p_dur,
                "cost_usd": total_p_cost_usd,
                "cost_uzs": total_p_cost_uzs,
            }
        except Exception as e:
            logger.warning(f"DB key stats yig'ishda xato: {e}")

    paid_key_item = None
    free_keys_list = []

    total_active = 0
    total_cooldown = 0
    grand_total_jobs = 0
    grand_total_cost_usd = 0.0

    for key in all_keys:
        is_paid = key in paid_set
        masked = mask_key(key)
        kh = _key_hash(key)

        in_cooldown = False
        max_remaining_sec = 0.0
        cooldown_reason = ""
        total_key_requests = 0
        total_key_success = 0
        total_key_429 = 0

        for model in GEMINI_ALL_MONITORED_MODELS:
            avail, rem = is_model_available(key, model)
            if not avail and rem > max_remaining_sec:
                in_cooldown = True
                max_remaining_sec = rem

            if redis_client:
                try:
                    st = redis_client.hgetall(f"gemini_stats:{kh}:{model}") or {}
                    total_key_requests += int(st.get("total_requests") or 0)
                    total_key_success += int(st.get("total_success") or 0)
                    total_key_429 += int(st.get("total_429") or 0)
                    if not cooldown_reason and st.get("last_reason"):
                        cooldown_reason = st.get("last_reason")
                except Exception:
                    pass

        redis_usage = {}
        if redis_client:
            try:
                redis_usage = redis_client.hgetall(f"gemini_kusage:{kh}") or {}
            except Exception:
                pass

        db_stat = db_stats_by_key.get(masked, {})
        jobs_count = max(int(db_stat.get("job_count", 0)), int(redis_usage.get("jobs_count", 0)))
        duration_sec = max(float(db_stat.get("duration_sec", 0.0)), float(redis_usage.get("duration_sec", 0.0)))
        cost_usd = max(float(db_stat.get("cost_usd", 0.0)), float(redis_usage.get("cost_usd", 0.0)))
        cost_uzs = max(int(db_stat.get("cost_uzs", 0)), int(float(redis_usage.get("cost_uzs", 0))))

        if is_paid:
            jobs_count = max(jobs_count, paid_jobs_totals["jobs_count"])
            duration_sec = max(duration_sec, paid_jobs_totals["duration_sec"])
            cost_usd = max(cost_usd, paid_jobs_totals["cost_usd"])
            cost_uzs = max(cost_uzs, paid_jobs_totals["cost_uzs"])

        grand_total_jobs += jobs_count
        grand_total_cost_usd += cost_usd

        status_str = "cooldown" if (in_cooldown and max_remaining_sec > 5) else "active"
        if status_str == "active":
            total_active += 1
            remaining_human = "Faol (so'rovga tayyor)"
        else:
            total_cooldown += 1
            m, s = divmod(int(max_remaining_sec), 60)
            h, m = divmod(m, 60)
            remaining_human = f"{h}s {m}d {s}s qoldi" if h else f"{m}d {s}s qoldi"

        item = {
            "key_masked": masked,
            "tier": "paid" if is_paid else "free",
            "status": status_str,
            "remaining_seconds": round(max_remaining_sec, 1),
            "remaining_human": remaining_human,
            "cooldown_reason": cooldown_reason[:150] if cooldown_reason else "",
            "limits": {
                "rpm": 1000 if is_paid else 15,
                "rpd": "Cheksiz" if is_paid else 1500,
                "tpm": "4,000,000" if is_paid else "1,000,000",
                "label": "1,000+ RPM • Cheksiz RPD (Pay-as-you-go)" if is_paid else "15 RPM • 1,500 RPD • 1M TPM (Bepul)",
            },
            "total_jobs": jobs_count,
            "total_duration_sec": round(duration_sec, 1),
            "total_duration_formatted": format_duration_uz(duration_sec),
            "total_cost_usd": round(cost_usd, 4),
            "total_cost_uzs": cost_uzs,
            "total_requests": total_key_requests,
            "success_count": total_key_success,
            "rate_limit_count": total_key_429,
        }

        if is_paid:
            remaining_bal = max(0.0, round(initial_balance - cost_usd, 2))
            item.update({
                "initial_balance_usd": initial_balance,
                "remaining_balance_usd": remaining_bal,
                "remaining_balance_uzs": int(remaining_bal * 12850),
                "google_balance_note": (
                    "Google AI Studio va Gemini API arxitekturasi bo'yicha API kalit faqat model so'rovlari (AI inference) uchun mo'ljallangan "
                    "bo'lib, billing/balansni ko'rsatuvchi ochiq API endpoint mavjud emas. Google xavfsizlik qoidalariga ko'ra, "
                    "billing va bank kartasi ma'lumotlari API kalitlar orqali berilmaydi. "
                    "Shuning uchun GapirAI tizimi Google'ning rasmiy narxlari (input/output tokenlar, audio daqiqalar) asosida har bir so'rovni 1 cent "
                    "aniqlikda hisoblab, qoldiqni Google Cloud Console dagi haqiqiy summa bilan bir xil ko'rsatadi."
                ),
            })
            paid_key_item = item
        else:
            free_keys_list.append(item)

    free_keys_list.sort(key=lambda x: (x["total_jobs"], x["total_cost_usd"]), reverse=True)

    return {
        "admin_mode": admin_mode,
        "paid_key_initial_balance": initial_balance,
        "paid_key": paid_key_item,
        "free_keys": free_keys_list,
        "summary": {
            "total_keys": len(all_keys),
            "total_paid_keys": len(paid_keys),
            "total_free_keys": len(free_keys_list),
            "total_active_keys": total_active,
            "total_cooldown_keys": total_cooldown,
            "total_jobs_all": grand_total_jobs,
            "total_cost_all_usd": round(grand_total_cost_usd, 4),
        }
    }

