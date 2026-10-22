"""
backend/services/cancel_policy.py

Dublyaj jarayonini bekor qilish va kvotani qaytarish siyosati:
1. Bekor qilishda limitni qaytarish oynasi maksimal 30 soniya.
2. Qaysi bosqichdan boshlasa o'sha boshlang'ich bosqich uchun 30 soniya vaqt beriladi.
3. Tayyor bosqichlar (kesh/donor) skip qilinadi. Haqiqiy ish boshlangan birinchi faol
   bosqich (masalan TRANSCRIBE yoki TTS) boshlang'ich bosqich deb olinadi.
4. Agar 1-bosqich ishlab, 2-bosqichga o'tsa (hatto 30 soniya ichida bo'lsa ham), bekor qilishda
   limit QAYTARILMAYDI (balansdan yechiladi).
5. Boshlang'ich bosqich boshlanganiga 30 soniyadan oshsa ham limit QAYTARILMAYDI.
"""

from __future__ import annotations

import time
import logging
from datetime import datetime
from typing import Optional, Tuple
from redis import Redis

from backend.config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()
_redis: Optional[Redis] = None

CANCEL_MAX_SECONDS = 30.0
_KEY_INITIAL_STAGE = "job_initial_stage:{job_id}"
_KEY_INITIAL_STAGE_START = "job_initial_stage_start:{job_id}"
_KEY_CURRENT_STAGE = "job_current_stage:{job_id}"
_KEY_STAGE_COUNT = "job_stage_count:{job_id}"
_KEY_TTL = 3600 * 4  # 4 soat


def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(_settings.REDIS_URL, decode_responses=True)
    return _redis


def record_stage_transition(job_id: str, stage: str, is_skipped: bool = False) -> None:
    """
    Worker har bir bosqichga kirganda chaqiriladi.
    Agar bosqich skipped bo'lsa (tayyor kesh/donor), uni boshlang'ich faol bosqich sifatida belgilamaymiz.
    Haqiqiy ish boshlangan birinchi faol bosqichni initial_stage sifatida belgilaymiz.
    """
    if not job_id:
        return
    try:
        r = _get_redis()
        stage_upper = stage.upper()

        if is_skipped:
            logger.debug(f"[CANCEL_POLICY] Job {job_id}: stage {stage_upper} skipped (cached/donor).")
            return

        now_ts = time.time()
        was_set = r.set(_KEY_INITIAL_STAGE.format(job_id=job_id), stage_upper, nx=True, ex=_KEY_TTL)
        if was_set:
            r.set(_KEY_INITIAL_STAGE_START.format(job_id=job_id), str(now_ts), ex=_KEY_TTL)
            r.set(_KEY_STAGE_COUNT.format(job_id=job_id), "1", ex=_KEY_TTL)
            logger.info(f"[CANCEL_POLICY] Job {job_id}: initial active stage registered as {stage_upper} at {now_ts}")
        else:
            prev_stage = r.get(_KEY_CURRENT_STAGE.format(job_id=job_id))
            if prev_stage and prev_stage != stage_upper:
                r.incr(_KEY_STAGE_COUNT.format(job_id=job_id))
                logger.info(f"[CANCEL_POLICY] Job {job_id}: stage changed from {prev_stage} to {stage_upper}")

        r.set(_KEY_CURRENT_STAGE.format(job_id=job_id), stage_upper, ex=_KEY_TTL)
    except Exception as e:
        logger.warning(f"[CANCEL_POLICY] record_stage_transition error for job {job_id}: {e}")


def check_cancel_refund_eligibility(
    job_id: str,
    job_status_str: str,
    created_at: Optional[datetime] = None,
) -> Tuple[bool, float, str, Optional[str], Optional[str]]:
    """
    Bekor qilishda limit qaytariladimi-yo'qligini tekshiradi.
    Qaytaradi: (can_refund, seconds_left, reason, initial_stage, current_stage)
    """
    now_utc = datetime.utcnow()
    created = created_at or now_utc
    overall_elapsed = (now_utc - created).total_seconds()

    try:
        r = _get_redis()
        initial_stage = r.get(_KEY_INITIAL_STAGE.format(job_id=job_id))
        initial_start_raw = r.get(_KEY_INITIAL_STAGE_START.format(job_id=job_id))
        current_stage = r.get(_KEY_CURRENT_STAGE.format(job_id=job_id))
        stage_count_raw = r.get(_KEY_STAGE_COUNT.format(job_id=job_id))
        stage_count = int(stage_count_raw) if stage_count_raw else 1

        # Case 1: Hali worker faol bosqichni boshlamagan (PENDING yoki dastlabki yuklanish)
        if not initial_stage or not initial_start_raw:
            seconds_left = max(0.0, CANCEL_MAX_SECONDS - overall_elapsed)
            if overall_elapsed <= CANCEL_MAX_SECONDS:
                return (
                    True,
                    round(seconds_left, 1),
                    f"Jarayon hali navbatda/boshlanish arafasida ({round(overall_elapsed, 1)}s <= 30s). Limit to'liq qaytariladi.",
                    initial_stage or "PENDING",
                    current_stage or "PENDING",
                )
            else:
                return (
                    False,
                    0.0,
                    f"Navbatda kutish vaqti 30 soniyadan oshdi ({round(overall_elapsed, 1)}s > 30s). Limit qaytarilmaydi.",
                    initial_stage or "PENDING",
                    current_stage or "PENDING",
                )

        # Case 2: Worker faol bosqichni boshlagan
        initial_start_ts = float(initial_start_raw)
        elapsed_in_initial_stage = max(0.0, time.time() - initial_start_ts)
        seconds_left = max(0.0, CANCEL_MAX_SECONDS - elapsed_in_initial_stage)

        # Qoida A: Agar 1-bosqich ishlab, 2-bosqichga o'tgan bo'lsa -> LIMIT QAYTARILMAYDI!
        if stage_count > 1 or (current_stage and current_stage != initial_stage):
            return (
                False,
                0.0,
                f"Jarayon birinchi faol bosqichdan ({initial_stage}) keyingi bosqichga ({current_stage}) o'tib bo'ldi. "
                f"Resurslar sarflangani sababli limit hisobingizdan yechiladi va qaytarilmaydi.",
                initial_stage,
                current_stage,
            )

        # Qoida B: Agar hali boshlang'ich bosqichda bo'lsa, lekin 30 soniyadan oshgan bo'lsa -> LIMIT QAYTARILMAYDI!
        if elapsed_in_initial_stage > CANCEL_MAX_SECONDS:
            return (
                False,
                0.0,
                f"Boshlang'ich bosqich ({initial_stage}) boshlanganiga 30 soniyadan oshdi ({round(elapsed_in_initial_stage, 1)}s > 30s). "
                f"Vaqt chegarasi tugagani sababli limit qaytarilmaydi.",
                initial_stage,
                current_stage,
            )

        # Qoida C: Hali boshlang'ich bosqichda VA 30 soniya ichida -> LIMIT QAYTARILADI!
        return (
            True,
            round(seconds_left, 1),
            f"Boshlang'ich bosqich ({initial_stage}) davom etmoqda ({round(elapsed_in_initial_stage, 1)}s <= 30s). "
            f"Limit hisobingizga to'liq qaytariladi.",
            initial_stage,
            current_stage,
        )

    except Exception as e:
        logger.warning(f"[CANCEL_POLICY] Error in check_cancel_refund_eligibility for {job_id}: {e}")
        seconds_left = max(0.0, CANCEL_MAX_SECONDS - overall_elapsed)
        can_ref = overall_elapsed <= CANCEL_MAX_SECONDS
        return (
            can_ref,
            round(seconds_left, 1) if can_ref else 0.0,
            "Fallback hisob-kitob bo'yicha aniqlandi.",
            None,
            None,
        )
