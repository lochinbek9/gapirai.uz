"""Dublajdan oldingi majburiy kontent xavfsizligi tekshiruvi (Safety Gate).

Ikki bosqichda ishlaydi:
1. Metadata bosqichi — job yaratilishidan OLDIN (routes.py: create_job),
   sarlavha/tavsif/kanal nomi asosida, arzon va tez. Bloklansa, job
   umuman yaratilmaydi.
2. Transkript bosqichi — transkripsiyadan keyin, dublaj (tarjima/TTS)
   boshlanishidan OLDIN (tasks.py: process_video), videoning haqiqiy
   nutqi asosida tekshiruv. Sarlavha zararsiz ko'ringan, lekin
   videoning o'zi siyosatga zid bo'lgan holatlarni shu yerda ushlaydi.

TAQIQLANGAN KATEGORIYALAR (Qat'iy bloklanadi - allowed=False):
- religious_content: Diniy ma'ruza, va'z, xutba, amri-ma'ruf, da'vat, namoz/ibodat qoidalari, fatvolar, mazhablararo bahslar.
- sexual_explicit: Pornografiya, ochiq jinsiy aloqa, erotika, 18+ behayo sahnalar.
- sexual_violence: Zo'rlash, jinsiy tajovuz, voyaga yetmaganlarga nisbatan jinsiy ekspluatatsiya (CSAM).
- graphic_violence: Shafqatsiz qotilliklar, qonli qiynoqlar, terrorizm/ekstremizm targ'iboti, o'z joniga qasd qilish.

RUXSAT BERILGAN KONTENTLAR (Hech qachon bloklanmaydi - allowed=True):
- Gaming (o'yinlar: PUBG, GTA, CS:GO, Minecraft va b.)
- Anime, multfilm va kino sharhlari (Tokyo Ghoul, fantastika, jangari kinolar)
- Ko'ngilochar shoular va chellenjlar (MrBeast va b.)
- Tarixiy hujjatli filmlar (urushlar, sarkardalar tarixi)
- IT, dasturlash, texnologiya, ilm-fan, ta'lim, sport (UFC, futbol), avtomobillar.

OpenAI (gpt-4o-mini) asosiy tekshiruvchi sifatida ishlatiladi.
Agar OpenAI ishlamasa — Gemini (gemini-flash-latest) zaxira sifatida ishlatiladi.
Ikkalasi ham ishlamasa — FAIL OPEN (video bloklanmaydi).
"""
from dataclasses import dataclass
import json
import logging

from openai import OpenAI

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.OPENAI_API_KEY, max_retries=1)
    return _client


# category kodi -> admin panelda ko'rsatiladigan o'zbekcha nom
CATEGORY_LABELS: dict[str, str] = {
    "religious_content": "Diniy kontent",
    "sexual_explicit": "Pornografik / 18+ kontent",
    "sexual_violence": "Zo'rlash yoki jinsiy zo'ravonlik",
    "graphic_violence": "Haddan tashqari zo'ravonlik / qotillik",
    "terrorism_extremism": "Terroristik / ekstremistik targ'ibot",
    "sexual_minors": "Voyaga yetmaganlar ishtirokidagi noqobil kontent",
    "policy_violation": "Kontent siyosatini buzish",
}

CATEGORY_DEFAULT_REASONS: dict[str, str] = {
    "religious_content": "Platforma qoidalariga ko'ra diniy ma'ruzalar, va'zlar va diniy ta'limotlar dublaj qilinmaydi.",
    "sexual_explicit": "Platforma qoidalariga ko'ra 18+ behayo va pornografik kontentlar dublaj qilinmaydi.",
    "sexual_violence": "Platforma qoidalariga ko'ra jinsiy tajovuz, zo'rlash va shunga o'xshash zo'ravonlik mavzulari dublaj qilinmaydi.",
    "graphic_violence": "Platforma qoidalariga ko'ra shafqatsiz zo'ravonlik, terrorizm va qotillik mavzulari dublaj qilinmaydi.",
    "terrorism_extremism": "Platforma qoidalariga ko'ra terrorizm va ekstremistik targ'ibot dublaj qilinmaydi.",
    "sexual_minors": "Voyaga yetmaganlar xavfsizligi siyosatiga zid bo'lgan kontent aniqlandi.",
    "policy_violation": "Ushbu video platforma xavfsizlik siyosatiga mos kelmaydi.",
}

PROHIBITED_CATEGORIES = set(CATEGORY_DEFAULT_REASONS.keys())


@dataclass
class SafetyResult:
    allowed: bool
    category: str | None = None
    reason: str | None = None


_CONTENT_SAFETY_SYSTEM_PROMPT = """Siz video kontent moderatsiyasi bo'yicha yuqori malakali sun'iy intellektsiz.
Vazifangiz: Berilgan video sarlavhasi, tavsifi yoki transkriptini chuqur tahlil qilib, u GapirAI platformasida DUBLAJ QILISH TAQIQLANGAN kategoriyalarga kirishini aniqlash.

MUHIM QOIDA: Oddiy, qonuniy va xavfsiz videolarni ADASHIB TAQIQLAMANG (soxta signal - false positive bo'lmasligi shart!). Kontekstni, janrni va maqsadni to'g'ri baholang.

⛔ TAQIQLANGAN KATEGORIYALAR (is_prohibited: true):
1. religious_content:
   - FAQAT va FAQAT sof diniy xutba, juma ma'ruzasi, amri-ma'ruf, masjiddagi yoki cherkovdagi va'zlar, diniy da'vatlar.
   - Namoz, tahorat, ro'za, zakot, haj kabi diniy ibodat/marosim qoidalarini o'rgatish, fiqhiy hukmlar va diniy fatvolar.
   - Diniy aqida, mazhablararo bahslar, diniy missionerlik va sof diniy targ'ibot.
   - Diniy muqaddas kitoblar (Qur'on, Hadis, Injil, Tavrot) tafsiri va sof diniy ta'limotlar.
2. sexual_explicit:
   - Ochiq pornografiya, bevosita jinsiy aloqa, erotika, 18+ behayo va shahvoniy sahnalar, intim xizmatlar.
3. sexual_violence:
   - Zo'rlash (rape), jinsiy tajovuz, jinsiy zo'ravonlik, voyaga yetmaganlarga nisbatan har qanday jinsiy mavzular yoki ekspluatatsiya (CSAM).
4. graphic_violence:
   - Haqiqiy hayotdagi shafqatsiz qotilliklar, qonli qiynoqlar, qurolli qirg'inlar.
   - Terrorizm, diniy ekstremizm, terroristik guruhlar (IShID, Al-Qoida va h.k.) targ'iboti va chaqiriqlari.
   - O'z joniga qasd qilish (suicide/self-harm)ni targ'ib qilish yoki o'rgatish.

✅ QAT'IYAN RUXSAT BERILGAN KONTENTLAR (is_prohibited: false):
- Kundalik nutq va iboralar: "Xudo xohlasa", "Allohga shukr", "InshaAlloh", "Subhanalloh", "Assalomu alaykum", "Bismillah", "Oh my God", "Thank God", "God bless" kabi so'zlar va iboralar ishlatilgan oddiy videolar (vloglar, suhbatlar, podkastlar) diniy kontent EMAS!
- Motivatsiya, psixologiya, shaxsiy rivojlanish, biznes, hayotiy saboqlar, falsafa, oilaviy munosabatlar va axloqiy o'gitlar diniy kontent EMAS!
- Tarix, arxitektura, sayohat, madaniyat (masjidlar, cherkovlar, ibodatxonalar yoki tarixiy obidalar haqidagi hujjatli filmlar) diniy kontent EMAS!
- Kinolar, seriallar, romantik filmlar, sevgi, qo'shiqlar, hazillar, memlar, plyajdagi suzish kiyimidagi sahnalar yoki tibbiy/biologik tushuntirishlar 18+ pornografiya EMAS!
- O'yinlar (Gaming): PUBG, GTA, CS:GO, Call of Duty, Minecraft va barcha kompyuter o'yinlari (o'yindagi otishmalar va janglar zo'ravonlik EMAS!).
- Anime, multfilm va kino sharhlari: Tokyo Ghoul, Attack on Titan, Naruto, kinolar tahlili, jangari filmlar sharhi, fantastika (fentezi/anime syujetlari va personajlar taqiqlanmaydi!).
- Ko'ngilochar shoular va chellenjlar: MrBeast, omon qolish (survival) chellenjlari, pranki, vloglar, sarguzashtlar.
- Tarixiy hujjatli filmlar: Dunyo tarixi, urushlar tarixi (masalan, 2-jahon urushi, Stalingrad jangi, sarkardalar tarixi).
- IT, dasturlash, texnologiya, ilm-fan, ta'lim, tibbiyot, sport (UFC, boks, futbol) va yangiliklar.

MUHIM QOIDA: Agar video aniq va 100% yuqoridagi 4 ta taqiqlangan kategoriyaga kirmasa yoki ikkilanish bo'lsa, HAR DOIM RUXSAT BERING (is_prohibited: false)!

Qat'iy quyidagi JSON formatda javob bering:
{
  "reasoning": "1 jumlada nima uchun ruxsat berilgani yoki taqiqlangani sababi",
  "is_prohibited": true yoki false,
  "category": "religious_content" | "sexual_explicit" | "sexual_violence" | "graphic_violence" | null,
  "reason_uz": "O'zbek tilida foydalanuvchiga ko'rsatiladigan muloyim va aniq tushuntirish (agar is_prohibited true bo'lsa) yoki null"
}"""


def _ai_classify(text: str) -> SafetyResult:
    """OpenAI orqali aniq va kontekstni tushunuvchi moderatsiya tekshiruvi."""
    client = _get_client()
    model = settings.OPENAI_MODEL or "gpt-4o-mini"
    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        temperature=0.0,
        max_tokens=300,
        messages=[
            {"role": "system", "content": _CONTENT_SAFETY_SYSTEM_PROMPT},
            {"role": "user", "content": text[:8000]},
        ],
    )
    data = json.loads(response.choices[0].message.content)
    is_prohibited = bool(data.get("is_prohibited"))
    category = data.get("category")
    reason_uz = data.get("reason_uz")

    if is_prohibited:
        cat_key = category if category in PROHIBITED_CATEGORIES else "policy_violation"
        fallback_reason = CATEGORY_DEFAULT_REASONS.get(cat_key, "Ushbu video kontent siyosatiga to'g'ri kelmaydi.")
        return SafetyResult(
            allowed=False,
            category=cat_key,
            reason=reason_uz or fallback_reason,
        )
    return SafetyResult(allowed=True)


def _gemini_safety_check(text: str) -> SafetyResult:
    """OpenAI mavjud bo'lmaganda yoki xato berganda Gemini zaxira tekshiruvi."""
    from google.genai import types
    from backend.services.translator import _get_gemini_client

    config = types.GenerateContentConfig(
        system_instruction=_CONTENT_SAFETY_SYSTEM_PROMPT,
        temperature=0.0,
        response_mime_type="application/json",
    )
    client = _get_gemini_client()

    candidate_models = [
        getattr(settings, "GEMINI_MODEL", "gemini-3.8-flash"),
        "gemini-3.8-flash",
        "gemini-3.7-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-2.5-flash-lite",
    ]
    response = None
    for m in candidate_models:
        try:
            response = client.models.generate_content(
                model=m, contents=text[:8000], config=config
            )
            if response and response.text:
                break
        except Exception:
            continue
    if not response or not response.text:
        raise RuntimeError("Gemini content safety failed on all candidate models")

    data = json.loads(response.text)
    is_prohibited = bool(data.get("is_prohibited"))
    category = data.get("category")
    reason_uz = data.get("reason_uz")

    if is_prohibited:
        cat_key = category if category in PROHIBITED_CATEGORIES else "policy_violation"
        fallback_reason = CATEGORY_DEFAULT_REASONS.get(cat_key, "Ushbu video kontent siyosatiga to'g'ri kelmaydi.")
        return SafetyResult(
            allowed=False,
            category=cat_key,
            reason=reason_uz or fallback_reason,
        )
    return SafetyResult(allowed=True)


def _result_from_data(data: dict) -> SafetyResult:
    if data.get("is_prohibited") is True or str(data.get("is_prohibited")).lower() == "true":
        category = data.get("category")
        cat_key = category if category in PROHIBITED_CATEGORIES else "policy_violation"
        fallback_reason = CATEGORY_DEFAULT_REASONS.get(cat_key, "Ushbu video kontent siyosatiga to'g'ri kelmaydi.")
        return SafetyResult(allowed=False, category=cat_key, reason=data.get("reason_uz") or fallback_reason)
    return SafetyResult(allowed=True)


def _neuronai_safety_check(text: str) -> SafetyResult:
    """NeuronAI LLM (NEURONAI_AUX_LLM_ENABLED) -- o'sha prompt, o'sha JSON format."""
    from backend.services import neuronai_llm
    data = neuronai_llm.chat_json([
        {"role": "system", "content": _CONTENT_SAFETY_SYSTEM_PROMPT},
        {"role": "user", "content": text[:8000]},
    ], temperature=0.0)
    return _result_from_data(data)


def check_safety(text: str) -> SafetyResult:
    """Matnni (metadata yoki transkript) xavfsizlik tekshiruvidan o'tkazadi.
    Bo'sh matn yoki xizmat o'chirilgan bo'lsa — avtomatik ruxsat.

    Taqiqlangan kontent (diniy, 18+, zo'ravonlik, zo'rlash) aniqlansa:
    allowed=False va o'zbekcha tushunarli sabab qaytaradi.
    """
    if not settings.CONTENT_SAFETY_ENABLED or not text.strip():
        return SafetyResult(allowed=True)

    if settings.NEURONAI_AUX_LLM_ENABLED and settings.NEURONAI_API_KEY:
        try:
            return _neuronai_safety_check(text)
        except Exception as e:
            logger.warning(f"NeuronAI kontent xavfsizligi tekshiruvida xatolik ({e}) — avvalgi zanjirga o'tilmoqda.")

    openai_ok = bool(settings.OPENAI_API_KEY and getattr(settings, "OPENAI_ENABLED", True))
    gemini_available = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    prefer_gemini = settings.TRANSLATE_PROVIDER == "gemini" or not openai_ok

    if prefer_gemini and gemini_available:
        try:
            return _gemini_safety_check(text)
        except Exception as e:
            logger.warning(f"Gemini kontent xavfsizligi tekshiruvida xatolik ({e}) — OpenAI'ga o'tilmoqda.")
            if openai_ok:
                try:
                    return _ai_classify(text)
                except Exception as e2:
                    logger.error(f"OpenAI ham ishlamadi (fail-open, ruxsat berildi): {e2}")
            return SafetyResult(allowed=True)

    try:
        if not openai_ok:
            raise RuntimeError("OpenAI o'chirilgan yoki kalit sozlanmagan")
        return _ai_classify(text)
    except Exception as e:
        logger.warning(f"OpenAI kontent xavfsizligi tekshiruvida xatolik ({e}) — Gemini'ga o'tilmoqda.")
        if gemini_available:
            try:
                return _gemini_safety_check(text)
            except Exception as e2:
                logger.error(f"Gemini kontent xavfsizligi ham ishlamadi (fail-open, ruxsat berildi): {e2}")
                return SafetyResult(allowed=True)
        logger.error(f"Kontent xavfsizligi tekshiruvi amalga oshmadi (fail-open, ruxsat berildi): {e}")
        return SafetyResult(allowed=True)
