"""Audio QA — TTS chiqishini STT orqali qayta tekshiradi (round-trip QA).

Yondashuv (spec §8'dagi ogohlantirishga ko'ra): o'zbek tili agglyutinativ
bo'lgani uchun butun matnga oddiy CER/WER (belgi-belgi solishtirish) shovqinli
va noaniq natija beradi. Buning o'rniga so'z-mavjudligi evristikasidan
foydalaniladi: kutilgan matndagi so'zlar tan olingan matnda bormi (tartibdan
qat'iy nazar — TTS ba'zan qo'shimchani biroz boshqacha talaffuz qiladi, lekin
so'z o'zagi STT'da baribir tanilishi kerak).

Faqat benchmark_tts.py'dan (--qa) chaqiriladi — ishlab chiqarish pipeline'iga
hali ulanmagan (har bir segmentga qo'shimcha Whisper chaqiruvi = qo'shimcha
xarajat va kechikish; bu keyingi bosqich, natijalar tasdiqlangandan keyin).
"""
import logging
import re

from backend.services.transcriber import transcribe_audio

logger = logging.getLogger(__name__)

_WORD_RE = re.compile(r"[a-zA-Zʻʼ'А-Яа-яЎўҚқҒғҲҳ]+", re.UNICODE)
_MISSING_WORDS_THRESHOLD = 0.15  # 15% dan ko'p so'z yo'qolsa -> flag
_TRUNCATED_RATIO_THRESHOLD = 0.6  # tan olingan so'z soni kutilganning 60%idan kam bo'lsa -> flag
_REPEAT_RUN_THRESHOLD = 3  # bir xil so'z ketma-ket 3+ marta -> flag


def _normalize_words(text: str) -> list[str]:
    return [w.lower() for w in _WORD_RE.findall(text or "")]


def _has_consecutive_repeat(words: list[str], run_len: int = _REPEAT_RUN_THRESHOLD) -> bool:
    if len(words) < run_len:
        return False
    for i in range(len(words) - run_len + 1):
        if len(set(words[i:i + run_len])) == 1:
            return True
    return False


def check_audio_quality(audio_path: str, expected_text: str, language: str | None = None) -> dict:
    """
    Generatsiya qilingan audioni STT orqali qayta tekshiradi.

    language: audio'da qaysi til gapirilishi kutilmoqda. Standart None —
    OpenAI Whisper API'ning "language" parametri cheklangan ISO-639-1
    ro'yxatini qabul qiladi va "uz" o'sha ro'yxatda YO'Q (2026-08-12
    productionda tasdiqlangan: "Language 'uz' is not supported" — 400 xato).
    Shuning uchun bu yerda hint berilmaydi, Whisper avtomatik aniqlaydi (bu
    o'zbekcha nutq uchun ham to'g'ri ishlaydi). Oldinroq "en" berilganda esa
    Whisper o'zbekcha nutqni inglizchaga zo'rlab talqin qilib, butun
    tekshiruvni yaroqsiz qilgan edi ("missing_words" bilan har bir segment
    muvaffaqiyatsiz bo'lgan haqiqiy productiondagi xato).

    Returns:
        {
            "score": float,          # 0.0-1.0, yuqori = yaxshiroq
            "flags": list[str],      # "no_speech" | "missing_words" | "repeated_words" | "truncated"
            "recognized_text": str,
            "missing_word_ratio": float,
        }
    """
    expected_words = _normalize_words(expected_text)
    if not expected_words:
        return {"score": 1.0, "flags": [], "recognized_text": "", "missing_word_ratio": 0.0}

    try:
        transcript = transcribe_audio(audio_path, language=language)
        recognized_text = transcript.get("text", "") or ""
    except Exception as exc:
        logger.warning(f"Audio QA: STT round-trip xatosi: {exc}")
        return {"score": 0.0, "flags": ["no_speech"], "recognized_text": "", "missing_word_ratio": 1.0}

    recognized_words = _normalize_words(recognized_text)
    if not recognized_words:
        return {"score": 0.0, "flags": ["no_speech"], "recognized_text": recognized_text, "missing_word_ratio": 1.0}

    recognized_set = set(recognized_words)
    missing = [w for w in expected_words if w not in recognized_set]
    missing_ratio = len(missing) / len(expected_words)

    flags = []
    if missing_ratio > _MISSING_WORDS_THRESHOLD:
        flags.append("missing_words")
    if _has_consecutive_repeat(recognized_words):
        flags.append("repeated_words")
    if len(recognized_words) / len(expected_words) < _TRUNCATED_RATIO_THRESHOLD:
        flags.append("truncated")

    score = max(0.0, 1.0 - missing_ratio - 0.15 * (len(flags) - (1 if "missing_words" in flags else 0)))

    return {
        "score": round(score, 3),
        "flags": flags,
        "recognized_text": recognized_text,
        "missing_word_ratio": round(missing_ratio, 3),
    }
