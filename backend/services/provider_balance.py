"""AI provayderlar balansini kuzatish -- balans tugashidan OLDIN adminlarga Telegram xabari (2026-11-21).

2026-11-21 hodisasi: NeuronAI balansi jimgina 0 ga tushdi, tarjima/xavfsizlik tekshiruvi sekin bepul
Gemini kalitlariga o'tib ketdi va saytdagi ishlar 2-6 daqiqa sekinlashdi -- buni foydalanuvchi aytguncha
hech kim bilmadi. Endi:
  * worker har job tugaganda `maybe_check_balances()` chaqiradi -- Redis orqali eng ko'pi bilan
    PROVIDER_BALANCE_CHECK_SECONDS da bir marta NeuronAI GET /balance so'raladi (Celery beat yo'q);
  * balans NEURONAI_BALANCE_ALERT_UZS dan past bo'lsa -- ogohlantirish (6 soatda 1 marta);
  * istalgan NeuronAI chaqiruvi 402 olsa `report_out_of_credits("neuronai")` -- darhol xabar (1 soatda 1).
Hech qachon xato ko'tarmaydi: monitoring ishni buzmasligi kerak.
"""
from __future__ import annotations

import logging

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_TOPUP_URL = "https://my.neuronai.uz"


def neuronai_balance() -> float | None:
    """NeuronAI qoldig'i (so'm = kredit) yoki None (kalit yo'q / so'rov o'xshamadi)."""
    if not settings.NEURONAI_API_KEY:
        return None
    try:
        import httpx
        r = httpx.get(f"{settings.NEURONAI_BASE_URL.rstrip('/')}/balance",
                      headers={"Authorization": f"Bearer {settings.NEURONAI_API_KEY}"}, timeout=10)
        if r.status_code != 200:
            logger.warning(f"[Balans] NeuronAI /balance {r.status_code}")
            return None
        return float(r.json()["data"]["balance"])
    except Exception as exc:
        logger.warning(f"[Balans] NeuronAI balansini olib bo'lmadi: {exc}")
        return None


def _claim(key: str, seconds: int) -> bool:
    """Redis SET NX EX -- shu oraliqda birinchi chaqiruvchi True oladi (bir nechta worker jarayoni uchun)."""
    try:
        from redis import Redis
        r = Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
        return bool(r.set(key, "1", ex=seconds, nx=True))
    except Exception:
        return False


def _alert(text: str, key: str, throttle: int) -> None:
    try:
        from backend.services.telegram_notify import send_alert_to_admins
        send_alert_to_admins(text, alert_key=key, throttle_seconds=throttle)
    except Exception as exc:
        logger.warning(f"[Balans] ogohlantirish yuborilmadi: {exc}")


def check_balances() -> float | None:
    bal = neuronai_balance()
    if bal is None:
        return None
    logger.info(f"[Balans] NeuronAI: {bal:.0f} so'm")
    threshold = settings.NEURONAI_BALANCE_ALERT_UZS
    if bal < threshold:
        _alert(
            f"⚠️ NeuronAI balansi kam qoldi: {bal:,.0f} so'm (chegara {threshold:,.0f}).\n"
            f"Tugasa STT/tarjima zaxira provayderlarga o'tadi va ishlar sekinlashadi.\n"
            f"To'ldirish: {_TOPUP_URL}",
            key="provider_balance_low:neuronai", throttle=6 * 3600,
        )
    return bal


def maybe_check_balances() -> None:
    """Worker har job oxirida chaqiradi; amalda PROVIDER_BALANCE_CHECK_SECONDS da 1 marta tekshiradi."""
    try:
        if settings.NEURONAI_BALANCE_ALERT_UZS <= 0 or not settings.NEURONAI_API_KEY:
            return
        if _claim("provider_balance:last_check", settings.PROVIDER_BALANCE_CHECK_SECONDS):
            check_balances()
    except Exception as exc:
        logger.warning(f"[Balans] tekshiruv xatosi: {exc}")


def report_out_of_credits(provider: str) -> None:
    """Provayder 402 (balans tugagan) qaytardi -- darhol, lekin soatiga bir martadan ko'p emas."""
    _alert(
        f"🔴 {provider} balansi TUGADI (402). Ishlar zaxira provayderlarda davom etmoqda, lekin sekinroq.\n"
        f"To'ldirish: {_TOPUP_URL if provider == 'neuronai' else provider}",
        key=f"provider_out_of_credits:{provider}", throttle=3600,
    )
