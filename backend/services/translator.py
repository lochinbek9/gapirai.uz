import html
import json
import os
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

# OpenAI'ning krediti tugaganda qayta urinish befoyda — darhol Gemini'ga
# o'tish uchun aniqlanadi (translate_segments()'dagi avtomatik fallback).
_NO_RETRY_ERROR_MARKERS = ("insufficient_quota", "credit_balance_exhausted")

# google-genai'ning Client'i parallel oqimlar orasida ulashilganda javoblar
# aralashib, JSON kesilib qolishiga sabab bo'ladi (thread-safe emas) —
# shuning uchun har bir thread o'zining alohida clientiga ega bo'ladi.
_gemini_local = threading.local()


def _get_gemini_client():
    if not hasattr(_gemini_local, "client"):
        from google import genai

        if settings.GEMINI_USE_VERTEX:
            if settings.GOOGLE_APPLICATION_CREDENTIALS and not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.GOOGLE_APPLICATION_CREDENTIALS
            _gemini_local.client = genai.Client(
                vertexai=True,
                project=settings.GCP_PROJECT_ID,
                location=settings.GCP_LOCATION,
            )
        else:
            api_key = settings.GEMINI_API_KEY or getattr(settings, "GOOGLE_GENERATIVE_AI_API_KEY", "") or os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY", "")
            if not api_key:
                raise RuntimeError("GEMINI_API_KEY yoki GOOGLE_GENERATIVE_AI_API_KEY sozlanmagan")
            _gemini_local.client = genai.Client(api_key=api_key)
    return _gemini_local.client


def _gemini_text_model() -> str:
    model = settings.GEMINI_VERTEX_TEXT_MODEL if settings.GEMINI_USE_VERTEX else settings.GEMINI_MODEL
    return model or "gemini-3.8-flash"


def _translate_mymemory(text: str, source_lang: str = "en", target_lang: str = "uz") -> str:
    """MyMemory — free 500K chars/month, no rate-limit issues."""
    url = "https://api.mymemory.translated.net/get"
    params = {"q": text, "langpair": f"{source_lang}|{target_lang}"}
    try:
        response = httpx.get(url, params=params, timeout=10.0)
        if response.status_code == 200:
            data = response.json()
            result = data.get("responseData", {}).get("translatedText", "")
            if result and result != text:
                return html.unescape(result)
    except Exception as e:
        logger.error(f"MyMemory translate failed: {e}")
    return text


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
        elif response.status_code == 429:
            logger.warning("Free Google Translate 429 — falling back to MyMemory")
            return _translate_mymemory(text, "en", target_lang)
    except Exception as e:
        logger.error(f"Free Google Translate API request failed: {e}")
    # Fallback: MyMemory (free, no rate-limit)
    return _translate_mymemory(text, "en", target_lang)


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

━━━ VAQTGA VA TALAFFUZGA MOSLIK (IXCHAMLIK VA DUB TALAFFUZI) ━━━
   • Har bir segment video vaqtiga mos ixcham, aniq va londa bo'lishi SHART.
   • Ortiqcha so'zlar, keraksiz kirish iboralari ("ma'lumki", "aytish joizki") va cho'zishlarni qo'shmang.
   • Barcha raqamlarni, yillarni va foizlarni og'zaki so'z bilan yozing (masalan: "100%" -> "yuz foiz", "2026" -> "ikki ming yigirma oltinchi yil").
   • Texnologiya va brend nomlarini o'qilishi bo'yicha yozing (masalan: "AI" -> "Ey Ay", "API" -> "Ey Pi Ay", "ChatGPT" -> "Chat Ji Pi Ti", "YouTube" -> "Yutub").

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

    if settings.FREE_MODE and not (settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX):
        logger.info("FREE_MODE (Gemini kaliti yo'q): Translating segments using free Google Translate API...")
        with ThreadPoolExecutor(max_workers=5) as executor:
            return list(executor.map(_translate_segment_free, segments))

    chunk_size = 45
    chunks = [segments[i:i + chunk_size] for i in range(0, len(segments), chunk_size)]
    if not chunks:
        return []

    if len(chunks) == 1:
        return _translate_chunk(chunks[0])

    with ThreadPoolExecutor(max_workers=6) as executor:
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


def _reconcile_segments(original: list[dict], translated: list[dict]) -> list[dict]:
    """LLM ba'zan 'id'/'start'/'end' maydonlarini o'zgartirib yuboradi yoki
    butunlay tashlab qoldiradi (JSON tuzilishi cheklovi bo'lsa ham) — bu
    keyinroq TTS bosqichida KeyError('id') bilan butun jobni qulatadi.
    Shuning uchun id/start/end HECH QACHON modeldan ishonib olinmaydi —
    faqat 'text' olinadi, qolgani original segmentdan tiklanadi."""
    if len(translated) != len(original):
        logger.warning(
            f"Tarjima segmentlar soni mos kelmadi (original={len(original)}, "
            f"natija={len(translated)}) — pozitsiya bo'yicha moslashtirilmoqda."
        )
    reconciled = []
    for i, orig in enumerate(original):
        text = orig.get("text", "")
        if i < len(translated) and isinstance(translated[i], dict):
            candidate = translated[i].get("text")
            if candidate:
                text = candidate
        reconciled.append({**orig, "text": text})
    return reconciled


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
    return _reconcile_segments(segments, _extract_segments_from_result(result, segments))


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

    candidate_models = [
        _gemini_text_model(),
        "gemini-3.8-flash",
        "gemini-flash-latest",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
    ]
    seen = set()
    candidate_models = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

    last_error = None
    for model_name in candidate_models:
        for attempt in range(3):
            try:
                response = _get_gemini_client().models.generate_content(
                    model=model_name,
                    contents=instruction,
                    config=config,
                )
                result = json.loads(response.text)
                return _reconcile_segments(segments, _extract_segments_from_result(result, segments))
            except Exception as e:
                last_error = e
                err_str = str(e)
                is_rate_limit = "429" in err_str or "RESOURCE_EXHAUSTED" in err_str
                is_server_error = "503" in err_str or "UNAVAILABLE" in err_str or "500" in err_str or "high demand" in err_str.lower()
                is_bad_json = isinstance(e, json.JSONDecodeError)
                if not (is_rate_limit or is_server_error or is_bad_json):
                    logger.warning(f"Gemini tarjima ({model_name}) doimiy xato: {e} — keyingi modelga o'tilmoqda.")
                    break
                backoff = (2 ** attempt) + random.uniform(0.5, 1.5)
                logger.warning(f"Gemini tarjima ({model_name}) xato, qayta urinish {backoff:.2f}s ({attempt + 1}/3): {e}")
                time.sleep(backoff)

    raise last_error or RuntimeError("Barcha Gemini tarjima modellari muvaffaqiyatsiz bo'ldi")


def _translate_chunk_free_mt(segments: list[dict]) -> list[dict]:
    """Oxirgi chora -- OpenAI HAM, Gemini HAM ishlamasa (ikkalasi ham
    kvota/kredit tugagan holat, 2026-09-12 haqiqiy production hodisasi:
    OpenAI 429 insufficient_quota -> Gemini 429 RESOURCE_EXHAUSTED bir xil
    videoda ketma-ket), dublyaj butunlay to'xtab QOLMASIN deb xom (LLM'siz)
    Google Translate/MyMemory'ga tushiladi -- xuddi FREE_MODE'ning eski
    yo'li (translate_segments()dagi _translate_segment_free bilan bir xil).
    Sifat pastroq (SYSTEM_PROMPT'dagi tabiiy dublyaj qoidalari, raqam/nom
    talaffuzi qo'llanmaydi) -- lekin video muvaffaqiyatsiz bo'lib navbatda
    abadiy qayta urinaverishdan ko'ra ancha yaxshi."""
    with ThreadPoolExecutor(max_workers=5) as executor:
        return list(executor.map(_translate_segment_free, segments))


def _translate_chunk(segments: list[dict]) -> list[dict]:
    """Bir bo'lak segmentlarni tarjima qilish -- TRANSLATE_PROVIDER ga qarab,
    uch pog'onali zaxira bilan: OpenAI -> Gemini -> xom Google Translate
    (oxirgi chora). Ilgari faqat ikki pog'ona bor edi (OpenAI -> Gemini) --
    2026-09-12 ikkalasi ham bir vaqtda kvota tugashi (OpenAI insufficient_quota
    + Gemini free-tier RESOURCE_EXHAUSTED) kuzatilgach, video butunlay
    muvaffaqiyatsiz bo'lib qolmasligi uchun uchinchi pog'ona qo'shildi."""
    clean_segments = [
        {**s, 'text': _clean_text(s.get('text', ''))} for s in segments
    ]
    gemini_available = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)

    if settings.TRANSLATE_PROVIDER == "gemini":
        try:
            return _translate_chunk_gemini(segments, clean_segments)
        except Exception as e:
            logger.warning(f"Gemini tarjima muvaffaqiyatsiz ({e}) — bepul (LLM'siz) tarjimaga o'tilmoqda.")
            return _translate_chunk_free_mt(segments)

    try:
        return _translate_chunk_openai(segments, clean_segments)
    except Exception as e:
        if not gemini_available:
            logger.warning(f"OpenAI tarjima muvaffaqiyatsiz ({e}) va Gemini kaliti yo'q — bepul (LLM'siz) tarjimaga o'tilmoqda.")
            return _translate_chunk_free_mt(segments)
        logger.warning(f"OpenAI tarjima muvaffaqiyatsiz ({e}) — Gemini'ga o'tilmoqda.")
        try:
            return _translate_chunk_gemini(segments, clean_segments)
        except Exception as e2:
            logger.warning(f"Gemini ham muvaffaqiyatsiz ({e2}) — bepul (LLM'siz) tarjimaga (oxirgi chora) o'tilmoqda.")
            return _translate_chunk_free_mt(segments)


def passthrough_segments(segments: list[dict]) -> list[dict]:
    """O'zbekcha manba uchun "tarjima": matn o'zgarishsiz (faqat tozalanadi), id/vaqtlar saqlanadi.
    LLM/tarmoq chaqiruvi YO'Q -- subtitr rejimida nutq allaqachon o'zbekcha (STT natijasi)."""
    out = []
    for i, seg in enumerate(segments or [], start=1):
        text = " ".join(_clean_text(seg.get("text", "")).split())   # ortiqcha probel/qator uzilishlarini yig'ish
        if not text:
            continue
        out.append({"id": seg.get("id", i), "start": seg.get("start", 0.0), "end": seg.get("end", 0.0), "text": text})
    return out


_CALIBRATED_RATE_CACHE: dict = {"value": None, "computed_at": 0.0}
_DEFAULT_CHARS_PER_SECOND = 15.0  # taxminiy — TTSUsageLog'da hali ma'lumot bo'lmasa


def _get_calibrated_chars_per_second() -> float:
    """TTSUsageLog'dagi haqiqiy sintez natijalaridan o'rtacha belgi/soniya
    tezligini hisoblaydi (taxmin emas, real ma'lumot). Jarayon davomida
    keshlanadi — har segment uchun DB so'rov yubormaslik uchun."""
    now = time.time()
    if _CALIBRATED_RATE_CACHE["value"] is not None and now - _CALIBRATED_RATE_CACHE["computed_at"] < 3600:
        return _CALIBRATED_RATE_CACHE["value"]

    rate = _DEFAULT_CHARS_PER_SECOND
    try:
        from backend.models.database import SessionLocal, TTSUsageLog
        db = SessionLocal()
        try:
            rows = (
                db.query(TTSUsageLog)
                .filter(TTSUsageLog.duration_seconds.isnot(None), TTSUsageLog.duration_seconds > 0, TTSUsageLog.characters > 0)
                .order_by(TTSUsageLog.created_at.desc())
                .limit(500)
                .all()
            )
            total_chars = sum(r.characters for r in rows)
            total_seconds = sum(r.duration_seconds for r in rows)
            if total_seconds > 0:
                rate = total_chars / total_seconds
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"Kalibrlangan nutq tezligini olishda xatolik, standart qiymat ishlatiladi: {exc}")

    _CALIBRATED_RATE_CACHE["value"] = rate
    _CALIBRATED_RATE_CACHE["computed_at"] = now
    return rate


def estimate_duration_seconds(text: str) -> float:
    """Matn TTS bilan taxminan qancha davom etishini hisoblaydi — haqiqiy
    sintez qilmasdan, TTSUsageLog'dan kalibrlangan belgi/soniya tezligi
    orqali. Aniq emas, lekin narxsiz va tez — tarjima uzunligini TTS'dan
    OLDIN, bitta qo'shimcha API chaqiruvisiz tekshirish uchun yetarli."""
    chars = len(text or "")
    if chars == 0:
        return 0.0
    return chars / _get_calibrated_chars_per_second()


_SHORTEN_SYSTEM_PROMPT = """Siz professional o'zbek dublyaj muharririsiz. Sizga
o'zbekcha dublyaj matni segmentlari beriladi — ular TTS orqali aytilganda,
original video segmentining vaqt oralig'iga sig'may qolgan (juda uzun).

Vazifangiz: har bir segment matnini QISQARTIRING, shunda u aytilganda
belgilangan maksimal davomiylikka (max_seconds) sig'sin, lekin:
- asosiy ma'no va ohang saqlansin
- tabiiy, jonli o'zbek tilida qolsin (kitobiy/robot tilga aylanmasin)
- keraksiz so'zlarni ("va", "ham", "esa", takroriy iboralarni) olib tashlang
- gapni to'liq, tugallangan holda qoldiring — yarim gap qilib kesmang

JSON formatida qaytaring. Faqat "text" maydonini qisqartiring."""


def shorten_segments(segments: list[dict], targets: dict) -> list[dict]:
    """Berilgan segmentlarni target soniyaga sig'adigan qilib BIR MARTA
    qisqartiradi (iteratsiya qilmaydi — natija hali ham uzun bo'lsa,
    synthesizer.py'dagi audio tezlashtirish xavfsizlik to'ri buni hal qiladi).

    targets: {segment_id: max_seconds}. Xatolik bo'lsa original segmentlar
    o'zgarishsiz qaytariladi — bu bosqich hech qachon pipeline'ni qulatmaydi.
    """
    if not segments:
        return segments

    payload = [{**s, "max_seconds": round(targets.get(s["id"], 0), 2)} for s in segments]
    clean_payload = [{**s, "text": _clean_text(s.get("text", ""))} for s in payload]

    instruction = (
        "Quyidagi segmentlarni max_seconds ga sig'adigan qilib qisqartiring.\n"
        "MUHIM: faqat 'text' maydonini qisqartiring. id, start, end, max_seconds — o'zgartirmang.\n"
        "JAVOB FORMATI — faqat shu ko'rinishda:\n"
        '{"segments": [{"id": ..., "start": ..., "end": ..., "text": "QISQARTIRILGAN MATN"}, ...]}\n\n'
        f"{json.dumps(clean_payload, ensure_ascii=True, indent=2)}"
    )

    try:
        if settings.TRANSLATE_PROVIDER == "gemini":
            from google.genai import types
            config = types.GenerateContentConfig(
                system_instruction=_SHORTEN_SYSTEM_PROMPT,
                temperature=0.4,
                response_mime_type="application/json",
            )
            response = _get_gemini_client().models.generate_content(
                model=_gemini_text_model(), contents=instruction, config=config,
            )
            result = json.loads(response.text)
        else:
            response = call_openai_with_retry(
                _get_client().chat.completions.create,
                model=settings.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": _SHORTEN_SYSTEM_PROMPT},
                    {"role": "user", "content": instruction},
                ],
                temperature=0.4,
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
        return _reconcile_segments(segments, _extract_segments_from_result(result, segments))
    except Exception as exc:
        logger.warning(f"Segmentlarni qisqartirishda xatolik — original tarjima saqlanadi: {exc}")
        return segments


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
