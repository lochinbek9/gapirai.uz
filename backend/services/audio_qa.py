"""Audio QA — sintez qilingan TTS audio'ni signal darajasida tekshiradi.

STT round-trip yondashuvi (Whisper orqali qayta transkripsiya qilib matn
mosligini solishtirish) real productionda ishonchli chiqmadi: OpenAI
Whisper API'ning "language" parametri "uz"ni rad etadi (400: "Language 'uz'
is not supported"), avtomatik til aniqlash esa qisqa (bir necha soniyalik)
dublyaj segmentlarida tez-tez boshqa tilga (turkcha/forscha/arabcha yozuvga)
chalkashib ketadi — ikkalasi ham 2026-08-12 productionda haqiqiy job orqali
tasdiqlangan. Natijada STT asosidagi QA hech qachon o'tmasdi, faqat har bir
segment uchun qo'shimcha Whisper chaqiruvi (xarajat) va foydasiz qayta
sintezga olib kelardi.

Shuning uchun QA transkripsiyaga muhtoj bo'lmasdan, to'g'ridan-to'g'ri audio
signalidan TTS'ning eng keng tarqalgan real nosozliklarini aniqlaydi: bo'sh/
sukut audio (sintez muvaffaqiyatsiz bo'lgan) va kutilganidan sezilarli
qisqaroq audio (kesilgan/to'xtab qolgan nutq).
"""
import logging

from pydub import AudioSegment
from pydub.silence import detect_nonsilent

logger = logging.getLogger(__name__)

_SILENCE_THRESH_DB = -40
_MIN_SILENCE_LEN_MS = 200
_MAX_SILENT_RATIO = 0.6  # audio'ning 60%+ jim bo'lsa -> "no_speech"
_MIN_DURATION_RATIO = 0.5  # audio kutilgan davomiylikning 50%idan kam bo'lsa -> "truncated"


def check_audio_quality(audio_path: str, expected_text: str) -> dict:
    """
    Sintez qilingan audioni signal darajasida tekshiradi.

    Returns:
        {
            "score": float,            # 0.0-1.0, yuqori = yaxshiroq
            "flags": list[str],        # "no_speech" | "truncated"
            "duration_seconds": float,
            "silent_ratio": float,     # audio ichidagi jim qismning ulushi
        }
    """
    if not (expected_text or "").strip():
        return {"score": 1.0, "flags": [], "duration_seconds": 0.0, "silent_ratio": 0.0}

    try:
        audio = AudioSegment.from_wav(audio_path)
    except Exception as exc:
        logger.warning(f"Audio QA: audio faylni o'qishda xatolik: {exc}")
        return {"score": 0.0, "flags": ["no_speech"], "duration_seconds": 0.0, "silent_ratio": 1.0}

    duration_seconds = len(audio) / 1000.0
    if duration_seconds <= 0:
        return {"score": 0.0, "flags": ["no_speech"], "duration_seconds": 0.0, "silent_ratio": 1.0}

    nonsilent_ranges = detect_nonsilent(
        audio, min_silence_len=_MIN_SILENCE_LEN_MS, silence_thresh=_SILENCE_THRESH_DB
    )
    nonsilent_ms = sum(end - start for start, end in nonsilent_ranges)
    silent_ratio = round(1.0 - (nonsilent_ms / len(audio)), 3)

    flags = []
    if silent_ratio > _MAX_SILENT_RATIO:
        flags.append("no_speech")

    from backend.services.translator import estimate_duration_seconds
    expected_duration = estimate_duration_seconds(expected_text)
    duration_ratio = duration_seconds / expected_duration if expected_duration > 0 else 1.0
    if duration_ratio < _MIN_DURATION_RATIO:
        flags.append("truncated")

    if "no_speech" in flags:
        score = 0.0
    elif "truncated" in flags:
        score = max(0.0, round(duration_ratio / _MIN_DURATION_RATIO * 0.5, 3))
    else:
        score = round(min(1.0, 1.0 - max(0.0, silent_ratio - 0.1)), 3)

    return {
        "score": score,
        "flags": flags,
        "duration_seconds": round(duration_seconds, 3),
        "silent_ratio": silent_ratio,
    }
