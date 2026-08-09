import json
import re
import time
import random
import logging
import threading
import httpx
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI, RateLimitError
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY, max_retries=5) if settings.OPENAI_API_KEY else None

# google-genai'ning Client'i parallel oqimlar orasida ulashilganda javoblar
# aralashib, JSON kesilib qolishiga sabab bo'ladi (thread-safe emas) —
# shuning uchun har bir thread o'zining alohida clientiga ega bo'ladi.
_gemini_local = threading.local()


def _get_gemini_client():
    if not settings.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set")
    if not hasattr(_gemini_local, "client"):
        from google import genai
        _gemini_local.client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _gemini_local.client


def translate_free_google(text: str, target_lang: str = "uz") -> str:
    url = "https://translate.googleapis.com/translate_a/single"
    params = {
        "client": "gtx",
        "sl": "auto",
        "tl": target_lang,
        "dt": "t",
        "q": text
    }
    try:
        response = httpx.get(url, params=params, timeout=10.0)
        if response.status_code == 200:
            data = response.json()
            parts = [item[0] for item in data[0] if item and item[0]]
            return "".join(parts)
    except Exception as e:
        logger.error(f"Free Google Translate API request failed: {e}")
    return text


def _translate_segment_free(segment: dict) -> dict:
    original_text = segment.get("text", "")
    if not original_text:
        return segment
    translated_text = translate_free_google(original_text, target_lang="uz")
    return {**segment, "text": translated_text}

SYSTEM_PROMPT = """Siz mahoratli va tajribali o'zbek dublyaj akterisiz hamda professional dublyaj rejissyorisiz.
Vazifangiz: Inglizcha videolarni sof, jonli, o'ta tabiiy va ta'sirli O'ZBEKCHA dublyaj matniga o'girish.

━━━ ENG MUHIM QOIDA: SEGMENTLAR — BITTA UZLUKSIZ NUTQ ━━━
Sizga JSON massiv ko'rinishida ketma-ket subtitr segmentlari beriladi. Bu segmentlar
bir-biridan ajralgan alohida gap emas — BITTA UZLUKSIZ NUTQNING bo'laklari. Ularni
tabiiy ravishda bir-biriga ulanib ketadigan, xuddi bitta odam gapirayotgandek qilib
tarjima qiling.

━━━ ANIQ MISOLLAR (bunga qat'iy amal qiling) ━━━
✗ "here we are in front of the X"        -> "mana biz X ning oldidamiz" (NOTO'G'RI, rasmiy)
✓ "here we are in front of the X"        -> "mana X oldida turibmiz" / "ana X, ko'rib turibsiz"

✗ "they have really long trunks"          -> "ular uzun xartumlarga ega" (NOTO'G'RI, kitobiy)
✓ "they have really long trunks"          -> "ularning xartumi juda uzun"

✗ "the cool thing about X is that Y"      -> "X ning qiziq joyi shundaki Y" (NOTO'G'RI)
✓ "the cool thing about X is that Y"      -> "X haqida eng qizig'i — Y"

✗ "amalga oshirish mumkin"  → ✓ "qilsa bo'ladi" / "iloji bor"
✗ "ushbu video haqida"      → ✓ "bu video haqida"
✗ "natijada men o'ylayman"   → ✓ "shuning uchun menimcha"
✗ "lozim deb hisoblayman"   → ✓ "kerak deb bilaman"

━━━ UMUMIY QOIDALAR ━━━
1. Ingliz tilidagi grammatik tuzilishni SO'ZMA-SO'Z ko'chirmang — o'zbek tilida xuddi
   shu fikrni odam qanday aytishini tasavvur qiling va SHUNDAY yozing.
2. "...ga ega", "...ning oldida/tomonida", "...ning joyi shundaki" kabi kitobiy
   qurilishlardan iloji boricha QOCHING — tabiiyroq muqobili doim bor.
3. Insoniy hissiyot, hayajon, hazil, jiddiylik va so'zlashuv ohangini to'liq saqlang.
4. Barcha raqamlarni, foizlarni va ramzlarni so'z bilan yozing (masalan: "100%" -> "yuz foiz", "58 sec" -> "ellik sakkiz soniya", "2025" -> "ikki ming yigirma beshinchi yil").
5. Ismlar va brendlarni o'zbekcha talaffuzga mos yozing (masalan: "YouTube" -> "Yutub", "Google" -> "Gugl").

━━━ VAQTGA MOSLIK ━━━
   • Kalta gap → kalta tarjima (so'z qo'shmang)
   • Uzun gap  → uzun, ammo ortiqchasiz
   • "va", "ham", "esa" larni kerak bo'lsa tashlab keting

JSON formatida qaytaring. Faqat "text" maydonini tarjima qiling."""


def translate_segments(segments: list[dict]) -> list[dict]:
    """
    Segmentlar ro'yxatini inglizchadan o'zbekchaga tarjima qilish.

    Args:
        segments: [{"id": 1, "start": 0.0, "end": 2.5, "text": "Hello world"}, ...]

    Returns:
        Tarjima qilingan segmentlar ro'yxati.
    """
    if not segments:
        return []

    if settings.FREE_MODE:
        logger.info("FREE_MODE: Translating segments using free Google Translate API...")
        with ThreadPoolExecutor(max_workers=5) as executor:
            return list(executor.map(_translate_segment_free, segments))

    chunk_size = 30
    chunks = [segments[i:i + chunk_size] for i in range(0, len(segments), chunk_size)]
    if not chunks:
        return []

    if len(chunks) == 1:
        return _translate_chunk(chunks[0])

    with ThreadPoolExecutor(max_workers=5) as executor:
        chunk_results = list(executor.map(_translate_chunk, chunks))

    translated = []
    for res in chunk_results:
        translated.extend(res)

    return translated


def _clean_text(text: str) -> str:
    """Null byte va boshqa muammoli belgilarni tozalash."""
    if not text:
        return text
    # BOM va null byte
    text = text.replace('\ufeff', '').replace('\x00', '')
    # JSON/HTTP uchun muammoli control characterlar (tab va newline tashqari)
    text = re.sub(r'[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    return text.strip()


def _extract_segments_from_result(result: dict | list, original: list[dict]) -> list[dict]:
    """
    GPT javobidan segmentlar ro'yxatini ajratib olish.
    GPT ba'zan boshqa key ishlatishi mumkin — barcha variantlarni tekshiramiz.
    """
    # 1. To'g'ridan-to'g'ri ro'yxat
    if isinstance(result, list):
        if result and isinstance(result[0], dict) and "text" in result[0]:
            return result

    # 2. Dict ichida ro'yxat — istalgan key ostida
    if isinstance(result, dict):
        for value in result.values():
            if (
                isinstance(value, list)
                and value
                and isinstance(value[0], dict)
                and "text" in value[0]
            ):
                return value

    # 3. Hech narsa topilmadi — fallback
    return original


def _get_client() -> OpenAI:
    if not client:
        raise RuntimeError("OPENAI_API_KEY not set")
    return client


def call_openai_with_retry(api_func, *args, **kwargs):
    max_attempts = 7
    for attempt in range(max_attempts):
        try:
            return api_func(*args, **kwargs)
        except RateLimitError as e:
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


def _build_instruction(clean_segments: list[dict]) -> str:
    user_message = json.dumps(clean_segments, ensure_ascii=True, indent=2)
    return (
        "Quyidagi segmentlarni O'ZBEK TILIGA tarjima qiling.\n"
        "MUHIM: faqat 'text' maydonini tarjima qiling.\n"
        "id, start, end — o'zgartirmang.\n"
        "JAVOB FORMATI — faqat shu ko'rinishda:\n"
        '{"segments": [{"id": ..., "start": ..., "end": ..., "text": "O\'ZBEKCHA TARJIMA"}, ...]}\n\n'
        f"{user_message}"
    )


def _translate_chunk_openai(segments: list[dict], clean_segments: list[dict]) -> list[dict]:
    instruction = _build_instruction(clean_segments)

    response = call_openai_with_retry(
        _get_client().chat.completions.create,
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": instruction},
        ],
        temperature=0.45,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    result = json.loads(content)
    return _extract_segments_from_result(result, segments)


def _translate_chunk_gemini(segments: list[dict], clean_segments: list[dict]) -> list[dict]:
    """
    Gemini ba'zan finish_reason=STOP deb hisoblasa ham, JSON'ni yakuniy
    yopuvchi qavssiz uzib qo'yadi (model tomonidagi xatti-harakat, token
    limitiga tegishli emas) — bu taxminan har 3 urinishdan 1 tasida
    uchraydi. Shuning uchun JSON parse xatosi ham rate-limit kabi qayta
    urinishga sabab bo'ladi — API chaqiruvining o'zi emas.
    """
    from google.genai import types

    instruction = _build_instruction(clean_segments)
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        temperature=0.45,
        response_mime_type="application/json",
    )

    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            response = _get_gemini_client().models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=instruction,
                config=config,
            )
            result = json.loads(response.text)
            return _extract_segments_from_result(result, segments)
        except Exception as e:
            is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
            is_bad_json = isinstance(e, json.JSONDecodeError)
            if attempt == max_attempts - 1 or not (is_rate_limit or is_bad_json):
                raise
            backoff = (2 ** attempt) + random.uniform(0.1, 1.0) if is_rate_limit else random.uniform(0.3, 1.2)
            reason = "RateLimit" if is_rate_limit else "noto'g'ri/kesilgan JSON"
            logger.warning(f"Gemini {reason} — qayta urinish {backoff:.2f}s dan so'ng (Urinish {attempt + 1}/{max_attempts}). Xato: {e}")
            time.sleep(backoff)


def _translate_chunk(segments: list[dict]) -> list[dict]:
    """Bir bo'lak segmentlarni tarjima qilish — TRANSLATE_PROVIDER ga qarab."""
    clean_segments = [
        {**s, 'text': _clean_text(s.get('text', ''))} for s in segments
    ]

    if settings.TRANSLATE_PROVIDER == "gemini":
        return _translate_chunk_gemini(segments, clean_segments)
    return _translate_chunk_openai(segments, clean_segments)


def translate_full_text(text: str) -> str:
    """To'liq matnni tarjima qilish (ko'rish uchun)."""
    response = call_openai_with_retry(
        _get_client().chat.completions.create,
        model=settings.OPENAI_MODEL,
        messages=[
            {
                "role": "system",
                "content": "Inglizcha matnni o'zbek tiliga professional tarzda tarjima qiling.",
            },
            {"role": "user", "content": text},
        ],
        temperature=0.3,
    )
    return response.choices[0].message.content
