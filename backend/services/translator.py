import json
import re
from openai import OpenAI
from backend.config import get_settings

settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """Siz professional dublyaj tarjimoni va ovoz rejissyorisiz.
Kino va hujjatli filmlar uchun JONLI, RAVON, 100% O'ZBEKCHA dublyaj yaratasiz.
Maqsad: tomoshabin eshitib, bu dublyaj emasday his qilsin — sof o'zbek tili.

━━━ ASOSIY QOIDA: FAQAT O'ZBEK TILI ━━━
Barcha so'zlar o'zbekcha bo'lishi SHART.
Faqat ism-sharif, kompaniya nomi va sertifikat nomlari (CompTIA, CISSP, CEH, CCNA,
Google, Microsoft) inglizchada qolishi mumkin — boshqa hech narsa emas.

━━━ ATAMALAR LUGA'TI (doim shulardan foydalaning) ━━━

  cybersecurity / cyber security → kiber xavfsizlik
  security       → xavfsizlik
  network        → tarmoq
  networking     → tarmoqchilik / tarmoq texnologiyalari
  firewall       → xavfsizlik devori
  hacker         → xaker
  ethical hacking→ axloqiy xakerlik
  malware        → zararli dastur
  phishing       → fishing / fishing hujumi
  vulnerability  → zaiflik
  exploit        → zaiflikdan foydalanish
  patch          → yamash / tuzatish
  encryption     → shifrlash
  decryption     → shifrni ochish
  password       → parol
  VPN            → VPN (virtual shaxsiy tarmoq)
  IP address     → IP manzil
  server         → server
  database       → ma'lumotlar bazasi
  backup         → zaxira nusxa
  antivirus      → antivirus
  threat         → tahdid
  attack         → hujum / kiberhujum
  defense        → himoya
  incident       → hodisa
  access control → kirish nazorati
  authentication → autentifikatsiya
  authorization  → ruxsat berish
  penetration testing → penetratsion test / kirib borish testi
  entry-level    → boshlang'ich daraja
  career         → karyera / martaba
  skill          → ko'nikma / mahorat
  roadmap        → yo'l xaritasi
  resume / CV    → rezyume
  interview      → ish suhbati
  certification  → sertifikatlash
  certificate    → sertifikat
  job            → ish / lavozim
  company        → kompaniya / tashkilot
  study          → o'rganish / o'qish
  practice       → mashq / amaliyot
  step           → qadam / bosqich
  month          → oy
  hour           → soat
  tool           → vosita / dastur
  software       → dastur / dasturiy ta'minot
  hardware       → qurilma / jihozlar
  operating system → operatsion tizim
  Linux          → Linux
  Windows        → Windows
  command        → buyruq
  script         → skript
  programming    → dasturlash
  code / coding  → kod yozish / dasturlash
  beginner       → yangi boshlovchi / boshlang'ich

━━━ TIL USLUBI — tirik so'zlashuv ━━━
   ✗ "amalga oshirish mumkin"  → ✓ "qilsa bo'ladi"
   ✗ "ushbu"                  → ✓ "bu"
   ✗ "natijada"               → ✓ "shunda" / "demak"
   ✗ "men o'ylayman"          → ✓ "menimcha"
   ✗ "lozim"                  → ✓ "kerak"
   ✗ "amalga oshirish"        → ✓ "qilish"
   ✗ "ushbu bosqichda"        → ✓ "bu qadamda"

━━━ OHANG — original nutqning energiyasini saqlang ━━━
   • Ishonchli gapirsa  → qat'iy, aniq jumlalar
   • Savolda            → ishtiyoqli, jonli
   • Ro'yxat sanaganda  → ritmik, jo'shqin
   • Ogohlantirsa       → jiddiy, vazmin

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
    # Katta videolar uchun bo'laklarga bo'lish (token limiti)
    chunk_size = 30
    translated = []

    for i in range(0, len(segments), chunk_size):
        chunk = segments[i:i + chunk_size]
        translated_chunk = _translate_chunk(chunk)
        translated.extend(translated_chunk)

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


def _translate_chunk(segments: list[dict]) -> list[dict]:
    """Bir bo'lak segmentlarni tarjima qilish."""
    clean_segments = [
        {**s, 'text': _clean_text(s.get('text', ''))} for s in segments
    ]
    user_message = json.dumps(clean_segments, ensure_ascii=True, indent=2)

    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "Quyidagi segmentlarni O'ZBEK TILIGA tarjima qiling.\n"
                    "MUHIM: faqat 'text' maydonini tarjima qiling.\n"
                    "id, start, end — o'zgartirmang.\n"
                    'JAVOB FORMATI — faqat shu ko\'rinishda:\n'
                    '{"segments": [{"id": ..., "start": ..., "end": ..., "text": "O\'ZBEKCHA TARJIMA"}, ...]}\n\n'
                    f"{user_message}"
                ),
            },
        ],
        temperature=0.45,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    result = json.loads(content)
    return _extract_segments_from_result(result, segments)


def translate_full_text(text: str) -> str:
    """To'liq matnni tarjima qilish (ko'rish uchun)."""
    response = client.chat.completions.create(
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
