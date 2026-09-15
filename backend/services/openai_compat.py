"""OpenAI'ning "reasoning" oilasi (gpt-5, gpt-5.1, gpt-5-nano/mini va
hokazo) eski chat.completions.create() parametrlarining bir qismini
qabul qilmaydi -- 2026-09 hujjatlashtirilgan, real hodisalar bilan
tasdiqlangan farqlar:

1. 'temperature' butunlay rad etiladi (faqat standart 1 qabul qilinadi,
   boshqa qiymat 400 xato beradi) -- "Unsupported parameter: 'temperature'
   is not supported with this model."
2. 'max_tokens' o'rniga 'max_completion_tokens' talab qilinadi.
3. Standart 'reasoning_effort' ("medium") kichik token byudjetida butun
   byudjetni YASHIRIN fikrlashga sarflab, ko'rinadigan javobni BUTUNLAY
   BO'SH qoldirishi mumkin -- ayniqsa OPENAI_LIGHT_MODEL'ning ba'zi
   chaqiruvlari (masalan _detect_gender, atigi bir necha token kutadi)
   uchun xavfli. Shuning uchun bu oilaga doim reasoning_effort="minimal"
   beriladi -- eng tez/eng arzon, deyarli fikrlamaydigan rejim, bizning
   vazifalarimiz (tasniflash, qisqa matn) uchun yetarli.

OPENAI_MODEL (asosiy tarjima) hozircha gpt-4o-mini bo'lib qolgani uchun bu
fayl faqat OPENAI_LIGHT_MODEL ishlatadigan joylarga tegishli."""
from backend.config import get_settings


def _is_reasoning_model(model: str) -> bool:
    return model.startswith("gpt-5")


def light_model_kwargs(*, temperature: float, max_tokens: int | None = None) -> dict:
    """chat.completions.create()'ga qo'shiladigan temperature/max_tokens
    (yoki ularning gpt-5 muqobili) kalit so'zli argumentlarini qaytaradi --
    OPENAI_LIGHT_MODEL qaysi oilaga tegishli ekaniga qarab."""
    model = get_settings().OPENAI_LIGHT_MODEL
    if _is_reasoning_model(model):
        kwargs: dict = {"reasoning_effort": "minimal"}
        if max_tokens is not None:
            # Juda kichik byudjet ("male"/"female" kabi bir so'zlik javob
            # kutilgan holatlarda) reasoning modelida bo'sh javob bilan
            # tugashi mumkin -- xavfsiz minimal qiymat bilan kengaytiriladi.
            kwargs["max_completion_tokens"] = max(max_tokens, 32)
        return kwargs
    kwargs = {"temperature": temperature}
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    return kwargs
