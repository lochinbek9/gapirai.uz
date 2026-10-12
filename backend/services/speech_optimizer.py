"""
Speech Optimizer — translated Uzbek matnni Azure/Edge TTS uchun tayyorlaydi.

Ikki qatlam:
1. Qoidaviy (har doim, bepul): raqamlarni so'zga, qisqartmalarni og'zaki shaklga
   (PRONUNCIATION_DICT + PronunciationMemory) va URL'larni "havola"ga o'giradi.
2. LLM qatlami (OpenAI pullik rejimda YOKI Gemini kaliti mavjud bo'lsa --
   Gemini bepul tarifi bo'lgani uchun FREE_MODE'da ham ishlaydi): uzun
   gaplarni bo'ladi, kitobiy iboralarni og'zaki nutqqa moslaydi, tinish
   belgilarini tabiiy pauzalarga qarab qo'yadi. Qatlam-1 natijasidagi
   raqam/qisqartma o'zgartirishlariga tegmaydi.

Natija faqat TTS kirishi uchun ishlatiladi — subtitr matni (uzbek_srt_content)
o'zgarishsiz, asl tarjimadan olinadi.
"""
import json
import re
import logging
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI

from backend.config import get_settings
from backend.models.database import SessionLocal, PronunciationMemory
from backend.services.speech_normalizer import normalize_apostrophes, _make_normalizer

logger = logging.getLogger(__name__)
settings = get_settings()
_client = OpenAI(api_key=settings.OPENAI_API_KEY, max_retries=5) if settings.OPENAI_API_KEY else None


# ─────────────────────────────────────────────────────────────
# 1a. Talaffuz lug'ati (qisqartma/atama → og'zaki shakl)
# ─────────────────────────────────────────────────────────────
PRONUNCIATION_DICT: dict[str, str] = {
    "ChatGPT": "Chat Ji Pi Ti",
    "OpenAI": "Open Ey Ay",
    "PostgreSQL": "Postgres",
    "MongoDB": "Mongo Di Bi",
    "Next.js": "Nekst J S",
    "Node.js": "Nod J S",
    "GitHub": "GitHab",
    "HTTPS": "H T T P Es",
    "OAuth": "O Auth",
    "CI/CD": "Si Ay Si Di",
    "React": "Riakt",
    "Docker": "Dokker",
    "HTTP": "H T T P",
    "JSON": "Jeyson",
    "CRUD": "Krad",
    "HTML": "Eych Ti Em El",
    "REST": "Rest",
    "JWT": "Jey Vi Ti",
    "API": "Ey Pi Ay",
    "CSS": "Si Es Es",
    "SQL": "Es Kyu El",
    "XML": "Eks Em El",
    "Redis": "Redis",
    "Vue": "Vyu",
    "Git": "Git",
    "GPT": "Ji Pi Ti",
    "AI": "Ey Ay",
    "LLM": "El El Em",
    "CEO": "Si I Ou",
    "CTO": "Si Ti Ou",
    "URL": "Yu Ar El",
    "PDF": "Pi Di Ef",
    "USB": "Yu Es Bi",
    "VPN": "Vi Pi En",
}

# Uzunroq kalitlar avval tekshirilsin (masalan "GitHub" "Git"dan oldin).
_DICT_KEYS_BY_LENGTH = sorted(PRONUNCIATION_DICT.keys(), key=len, reverse=True)


def _load_memory_overrides() -> dict[str, str]:
    """PronunciationMemory jadvalidan o'rganilgan tuzatishlarni o'qiydi.

    Hozircha jadval bo'sh bo'ladi (yozish yo'li — round-trip QA — keyingi
    bosqichda qo'shiladi), lekin lookup boshidanoq mavjud bo'lishi kerak,
    shunda QA qatlami qo'shilganda optimizer interfeysi o'zgarmaydi.
    """
    db = SessionLocal()
    try:
        rows = db.query(PronunciationMemory).all()
        return {row.term: row.spoken_form for row in rows}
    except Exception as e:
        logger.warning(f"PronunciationMemory o'qishda xatolik (jadval hali yaratilmagan bo'lishi mumkin): {e}")
        return {}
    finally:
        db.close()


def _apply_pronunciation_dict(text: str, overrides: dict[str, str]) -> str:
    # PronunciationMemory statik lug'atni ustidan yozadi.
    merged = {**PRONUNCIATION_DICT, **overrides}
    keys_by_length = sorted(merged.keys(), key=len, reverse=True)
    pattern = re.compile(
        r"\b(" + "|".join(re.escape(k) for k in keys_by_length) + r")\b"
    ) if merged else None
    if not pattern:
        return text
    return pattern.sub(lambda m: merged[m.group(1)], text)


# ─────────────────────────────────────────────────────────────
# 1b. Raqamlarni o'zbekcha so'zga o'girish
# ─────────────────────────────────────────────────────────────
_UNITS = ["", "bir", "ikki", "uch", "toʻrt", "besh", "olti", "yetti", "sakkiz", "toʻqqiz"]
_TENS = ["", "oʻn", "yigirma", "oʻttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "toʻqson"]
_SCALES = ["", " ming", " million", " milliard", " trillion"]


def _three_digits_to_words(n: int) -> str:
    """0–999 oralig'idagi sonni so'zga o'giradi ('bir' hech qachon 'yuz'/'ming' oldidan qo'shilmaydi)."""
    if n == 0:
        return ""
    hundreds, rem = divmod(n, 100)
    tens, units = divmod(rem, 10)
    parts = []
    if hundreds:
        parts.append("yuz" if hundreds == 1 else f"{_UNITS[hundreds]} yuz")
    if tens:
        parts.append(_TENS[tens])
    if units:
        parts.append(_UNITS[units])
    return " ".join(parts)


def number_to_uzbek_words(n: int) -> str:
    """Butun sonni (manfiy bo'lishi mumkin) o'zbekcha so'zlarga o'giradi."""
    if n == 0:
        return "nol"
    sign = "minus " if n < 0 else ""
    n = abs(n)

    groups = []
    while n > 0:
        n, rem = divmod(n, 1000)
        groups.append(rem)

    if len(groups) > len(_SCALES):
        # Juda katta son — so'zga o'girishga urinmaymiz, raqam holicha qoldiramiz.
        return f"{sign}{n}"

    parts = []
    for i in reversed(range(len(groups))):
        group = groups[i]
        if group == 0:
            continue
        words = _three_digits_to_words(group)
        if i == 1 and group == 1:
            # "bir ming" emas, "ming"
            parts.append("ming")
        else:
            parts.append(f"{words}{_SCALES[i]}")

    return sign + " ".join(parts)


# Sana/yil/valyuta normalizatsiyasi — number_to_uzbek_words'ni tashqaridan
# oladi (speech_normalizer.py bilan aylanma import bo'lmasligi uchun).
_normalize_dates_and_currency = _make_normalizer(number_to_uzbek_words)


_PERCENT_RE = re.compile(r"(-?\d+(?:[.,]\d+)?)\s?%")
_HALF_DECIMAL_RE = re.compile(r"(-?\d+)[.,]5\b")
_DECIMAL_RE = re.compile(r"(-?\d+)[.,](\d+)")
_INTEGER_RE = re.compile(r"-?\d+")

# "6.3 million" -> 6 300 000 -> "olti million uch yuz ming" (nuqta o'qish emas)
_SCALE_VALUES = {"ming": 1_000, "million": 1_000_000, "milliard": 1_000_000_000, "trillion": 1_000_000_000_000}
_DECIMAL_SCALE_RE = re.compile(
    r"(-?\d+)[.,](\d+)\s?(ming|million|milliard|trillion)\b", re.IGNORECASE
)


def _convert_number_match(int_str: str) -> str:
    try:
        return number_to_uzbek_words(int(int_str))
    except ValueError:
        return int_str


def convert_numbers_in_text(text: str) -> str:
    """Foiz, kasr va butun sonlarni o'zbekcha so'zga o'giradi.

    Tartib muhim: foiz va kasrlar ("3.5", "100%") butun son regexidan oldin
    ishlanishi kerak, aks holda "3" va "5" alohida-alohida o'girilib ketadi.
    """
    def _decimal_scale_sub(m: re.Match) -> str:
        whole_str, frac_str, scale_word = m.group(1), m.group(2), m.group(3).lower()
        scale = _SCALE_VALUES[scale_word]
        whole = int(whole_str)
        frac_value = round(int(frac_str) * scale / (10 ** len(frac_str)))
        sign = -1 if whole < 0 else 1
        total = sign * (abs(whole) * scale + frac_value)
        return number_to_uzbek_words(total)

    # "6.3 million" kabi o'nlik+shkala birikmasi — foiz/oddiy kasr
    # qoidalaridan OLDIN ishlanishi kerak, aks holda "6.3" alohida
    # "olti nuqta uch" deb o'qilib, "million" so'zi orqada qolib ketadi.
    text = _DECIMAL_SCALE_RE.sub(_decimal_scale_sub, text)

    def _percent_sub(m: re.Match) -> str:
        num = m.group(1).replace(",", ".")
        if "." in num:
            whole, frac = num.split(".")
            if frac == "5":
                return f"{number_to_uzbek_words(int(whole))} yarim foiz"
            return f"{_convert_number_match(whole)} nuqta {' '.join(_UNITS[int(d)] or 'nol' for d in frac)} foiz"
        return f"{number_to_uzbek_words(int(num))} foiz"

    text = _PERCENT_RE.sub(_percent_sub, text)

    def _half_sub(m: re.Match) -> str:
        return f"{number_to_uzbek_words(int(m.group(1)))} yarim"

    text = _HALF_DECIMAL_RE.sub(_half_sub, text)

    def _decimal_sub(m: re.Match) -> str:
        whole, frac = m.group(1), m.group(2)
        frac_words = " ".join(_UNITS[int(d)] or "nol" for d in frac)
        return f"{number_to_uzbek_words(int(whole))} nuqta {frac_words}"

    text = _DECIMAL_RE.sub(_decimal_sub, text)

    text = _INTEGER_RE.sub(lambda m: _convert_number_match(m.group(0)), text)
    return text


# ─────────────────────────────────────────────────────────────
# 1c. URL'larni "havola"ga almashtirish
# ─────────────────────────────────────────────────────────────
_URL_RE = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)


def _replace_urls(text: str) -> str:
    return _URL_RE.sub("havola", text)


def _rule_based_optimize(text: str, overrides: dict[str, str]) -> str:
    if not text or not text.strip():
        return text
    text = normalize_apostrophes(text)
    text = _replace_urls(text)
    text = _apply_pronunciation_dict(text, overrides)
    text = _normalize_dates_and_currency(text)
    text = convert_numbers_in_text(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ─────────────────────────────────────────────────────────────
# 2. LLM qatlami — tabiiy og'zaki nutqqa moslash (faqat pullik rejimda)
# ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """Siz nutq matnini Microsoft Azure Speech (TTS) uchun tayyorlovchi mutaxassissiz.
Vazifangiz TARJIMA QILISH EMAS — matn allaqachon o'zbek tiliga tarjima qilingan.

QOIDALAR:
1. Ma'noni hech qachon o'zgartirmang: ma'lumot qo'shmang, olib tashlamang, misol o'ylab topmang.
2. Yozma/kitobiy uslubni og'zaki, tabiiy nutqqa aylantiring (professional lekin jonli).
3. 15-20 so'zdan uzun gaplarni bir necha qisqa gapga bo'ling.
4. Vergul va nuqtalarni notiq tabiiy pauza qiladigan joylarga qo'ying.
5. QUYIDAGILARGA HECH QACHON TEGMANG (allaqachon optimallashtirilgan):
   - Katta harflar bilan yozilgan talaffuz shakllari (masalan "Jey Vi Ti", "Ey Pi Ay")
   - So'z bilan yozilgan sonlar (masalan "ikki ming yigirma olti")
   - "havola" so'zi (URL o'rnida)
   - Ism, kompaniya, mahsulot va freymvork nomlari (masalan React, Docker, Kubernetes)
   - Vaqt belgilari (00:15, 01:32:18)
   - Kod bloklari

JSON formatida qaytaring. Faqat "text" maydonini qayta yozing, "id"/"start"/"end"ni o'zgartirmang."""


def _get_client() -> OpenAI:
    if not _client:
        raise RuntimeError("OPENAI_API_KEY not set")
    return _client


def _reconcile(segments: list[dict], optimized) -> list[dict] | None:
    """LLM javobidagi 'segments' ro'yxatini original segmentlar bilan
    moslashtiradi. 'id'/'start'/'end' hech qachon modeldan ishonib
    olinmaydi (LLM ularni tashlab qoldirishi/o'zgartirishi mumkin — TTS
    bosqichida KeyError('id') bilan butun jobni qulatmasligi uchun),
    faqat 'text' olinadi. Javob shakli noto'g'ri bo'lsa None qaytadi."""
    if not (isinstance(optimized, list) and optimized and "text" in optimized[0]):
        return None
    if len(optimized) != len(segments):
        logger.warning(
            f"LLM optimize segment soni mos kelmadi (original={len(segments)}, "
            f"natija={len(optimized)}) — pozitsiya bo'yicha moslashtirilmoqda."
        )
    reconciled = []
    for i, orig in enumerate(segments):
        text = orig.get("text", "")
        if i < len(optimized) and isinstance(optimized[i], dict):
            candidate = optimized[i].get("text")
            if candidate:
                text = candidate
        reconciled.append({**orig, "text": text})
    return reconciled


def _optimize_instruction(segments: list[dict]) -> str:
    user_message = json.dumps(segments, ensure_ascii=True, indent=2)
    return (
        "Quyidagi segmentlarni Azure TTS uchun og'zaki nutqqa moslang.\n"
        "JAVOB FORMATI — faqat shu ko'rinishda:\n"
        '{"segments": [{"id": ..., "start": ..., "end": ..., "text": "OPTIMALLASHTIRILGAN MATN"}, ...]}\n\n'
        f"{user_message}"
    )


def _gemini_optimize_chunk(segments: list[dict]) -> list[dict]:
    """_llm_optimize_chunk bilan bir xil vazifa, Gemini orqali -- OpenAI
    krediti tugaganda yoki FREE_MODE'da ham ishlaydi (Gemini bepul tarifi
    bor), model ro'yxati asosida ketma-ket sinaydi."""
    from google.genai import types
    from backend.services.translator import _get_gemini_client, _gemini_text_model

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=0.3,
        response_mime_type="application/json",
    )
    candidate_models = [
        _gemini_text_model(),
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-flash-latest",
    ]
    seen = set()
    candidate_models = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

    instruction = _optimize_instruction(segments)
    for model_name in candidate_models:
        for attempt in range(2):
            try:
                response = _get_gemini_client().models.generate_content(
                    model=model_name, contents=instruction, config=config,
                )
                result = json.loads(response.text)
                reconciled = _reconcile(segments, result.get("segments") if isinstance(result, dict) else result)
                if reconciled is not None:
                    return reconciled
            except Exception as e:
                err_str = str(e)
                is_transient = "429" in err_str or "503" in err_str or "high demand" in err_str.lower()
                if not is_transient:
                    logger.debug(f"Gemini speech optimizer ({model_name}) error: {e}")
                    break
                time.sleep(1.0)
    return segments



def _llm_optimize_chunk(segments: list[dict]) -> list[dict]:
    """TRANSLATE_PROVIDER='gemini' bo'lsa Gemini birinchi; aks holda OpenAI birinchi."""
    from backend.services.openai_compat import light_model_kwargs

    gemini_available = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    prefer_gemini = settings.TRANSLATE_PROVIDER == "gemini" or not settings.OPENAI_API_KEY

    if prefer_gemini and gemini_available:
        try:
            return _gemini_optimize_chunk(segments)
        except Exception as e:
            logger.warning(f"Gemini speech optimization xato ({e}) — OpenAI'ga o'tilmoqda.")
            if _client:
                try:
                    response = _get_client().chat.completions.create(
                        model=settings.OPENAI_LIGHT_MODEL,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": _optimize_instruction(segments)},
                        ],
                        response_format={"type": "json_object"},
                        **light_model_kwargs(temperature=0.3),
                    )
                    result = json.loads(response.choices[0].message.content)
                    reconciled = _reconcile(segments, result.get("segments") if isinstance(result, dict) else result)
                    if reconciled is not None:
                        return reconciled
                except Exception as e2:
                    logger.warning(f"OpenAI speech optimization ham xato: {e2}")
            return segments

    if not _client:
        return _gemini_optimize_chunk(segments) if gemini_available else segments
    try:
        response = _get_client().chat.completions.create(
            model=settings.OPENAI_LIGHT_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _optimize_instruction(segments)},
            ],
            response_format={"type": "json_object"},
            **light_model_kwargs(temperature=0.3),
        )
        result = json.loads(response.choices[0].message.content)
        reconciled = _reconcile(segments, result.get("segments") if isinstance(result, dict) else result)
        if reconciled is not None:
            return reconciled
    except Exception as e:
        if gemini_available:
            logger.warning(f"OpenAI speech optimization xato ({e}) — Gemini'ga o'tilmoqda.")
            return _gemini_optimize_chunk(segments)
        logger.warning(f"LLM speech optimization chunk failed, falling back to rule-based output only: {e}")
    return segments


def _chunked_optimize(segments: list[dict], chunk_fn) -> list[dict]:
    if not segments:
        return []
    chunk_size = 30
    chunks = [segments[i:i + chunk_size] for i in range(0, len(segments), chunk_size)]
    if len(chunks) == 1:
        return chunk_fn(chunks[0])
    with ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(chunk_fn, chunks))
    merged: list[dict] = []
    for r in results:
        merged.extend(r)
    return merged


# ─────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────
def optimize_segments(segments: list[dict], use_llm: bool = False) -> list[dict]:
    """
    Tarjima qilingan segmentlarni TTS uchun optimallashtiradi.
    Tezkor qoidaviy qatlam (lug'at, raqamlar, qisqartmalar) har doim ishlaydi (0 ms).
    use_llm=True bo'lgandagina qo'shimcha LLM chaqiruvi qilinadi.
    """
    if not segments:
        return []

    overrides = _load_memory_overrides()
    rule_based = [
        {**seg, "text": normalize_apostrophes(_rule_based_optimize(seg.get("text", ""), overrides))}
        for seg in segments
    ]

    if not use_llm:
        return rule_based

    gemini_available = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    use_openai = _client and not settings.FREE_MODE
    if not use_openai and not gemini_available:
        return rule_based

    logger.info(f"LLM speech optimization ishlamoqda ({'OpenAI' if use_openai else 'Gemini'})...")
    optimized = _chunked_optimize(rule_based, _llm_optimize_chunk if use_openai else _gemini_optimize_chunk)
    return [{**seg, "text": normalize_apostrophes(seg.get("text", ""))} for seg in optimized]
