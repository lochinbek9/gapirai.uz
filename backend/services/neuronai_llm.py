"""NeuronAI til modeli (my.neuronai.uz, OpenAI-mos /v1/chat/completions).

Narx: 1K token uchun kirish 1,5 so'm, chiqish 6 so'm (1 kredit = 1 so'm). 2026-11-11 sinovi:
12 segment dublyaj tarjimasi ~10 s, ~8 so'm, sifati Google MT'dan ancha tabiiy.
"""
import json
import logging

from openai import OpenAI

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_client: OpenAI | None = None


def is_available() -> bool:
    return bool(settings.NEURONAI_API_KEY)


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(
            base_url=settings.NEURONAI_BASE_URL.rstrip("/"),
            api_key=settings.NEURONAI_API_KEY,
            timeout=120.0,
            max_retries=2,
        )
    return _client


def _complete(messages: list[dict], **kwargs) -> str:
    resp = _get_client().chat.completions.create(model=settings.NEURONAI_LLM_MODEL, messages=messages, **kwargs)
    usage = resp.usage
    if usage:
        cost = (usage.prompt_tokens * 1.5 + usage.completion_tokens * 6) / 1000
        logger.info(f"NeuronAI LLM: {usage.prompt_tokens}+{usage.completion_tokens} token, ~{cost:.1f} so'm")
    return resp.choices[0].message.content or ""


def chat_text(messages: list[dict], temperature: float = 0.0, max_tokens: int | None = None) -> str:
    kwargs = {"temperature": temperature}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    return _complete(messages, **kwargs).strip()


def chat_json(messages: list[dict], temperature: float = 0.45) -> dict:
    """JSON javob qaytaradigan so'rov. Model ba'zan JSON atrofiga matn qo'shadi --
    birinchi '{' dan oxirgi '}' gacha bo'lgan qism o'qiladi."""
    content = _complete(messages, temperature=temperature, response_format={"type": "json_object"})
    start, end = content.find("{"), content.rfind("}")
    if start < 0 or end <= start:
        raise ValueError(f"NeuronAI LLM JSON qaytarmadi: {content[:200]}")
    return json.loads(content[start:end + 1])
