import json
from openai import OpenAI
from backend.config import get_settings

settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY)

SYSTEM_PROMPT = """Siz professional tarjimon va dublyaj mutaxassisisiz.
Sizning vazifangiz inglizcha matnni o'zbek tiliga tarjima qilish.

QOIDALAR:
1. Tarjima tabiiy va ravon bo'lishi kerak — bu dublyaj uchun.
2. Har bir segmentning vaqt belgilarini (start/end) o'zgartirmang.
3. Faqat matnni tarjima qiling, boshqa hech narsa qo'shmang.
4. Texnik atamalarni o'zbek tilidagi muqobillari bilan almashtiring.
5. Gaplar qisqa va aniq bo'lsin (ovoz bera oladigan hajmda).
6. JSON formatida qaytaring.
"""


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


def _translate_chunk(segments: list[dict]) -> list[dict]:
    """Bir bo'lak segmentlarni tarjima qilish."""
    user_message = json.dumps(segments, ensure_ascii=False, indent=2)

    response = client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Quyidagi segmentlarni o'zbek tiliga tarjima qiling.\n"
                    f"Faqat 'text' maydonini tarjima qiling, qolganlarini o'zgartirmang.\n"
                    f"JSON formatida qaytaring:\n\n{user_message}"
                ),
            },
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    result = json.loads(content)

    # Javob formatini normallashtirish
    if isinstance(result, dict) and "segments" in result:
        return result["segments"]
    if isinstance(result, list):
        return result

    return segments  # Xatolik bo'lsa, asl segmentlarni qaytarish


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
