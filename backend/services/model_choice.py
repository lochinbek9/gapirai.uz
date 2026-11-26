"""BYOK egasining bosqichma-bosqich provayder tanlovi (STT, matn LLM, dublyaj ovozi).

Faqat sozlangan (faol) provayderlar ko'rsatiladi. Tanlov qat'iy: tanlangan STT/LLM ishlamasa boshqasiga
o'tilmaydi -- egasi qaysi provayder sinalayotganini aniq bilishi kerak.
"""
from backend.config import get_settings

STT = ("gapi", "groq", "neuronai", "gemini")
LLM = ("groq", "neuronai", "gemini")
TTS = ("gapi", "edge", "azure", "gemini", "neuronai", "voicelab", "uzbekvoice", "elevenlabs")
# gapi ovoz uslublari (ayol -- Zebo, erkak -- Doston). Standartlar 2026-11-25 sinovidan: ikkalasida ham adabiy
# talaffuz; ayolda "iliq" (brend nomi to'g'ri eshitildi), erkakda "sokin" (xotirjam va "iliq"dan qisqaroq).
GAPI_DEFAULT_STYLE = {"female": "iliq", "male": "sokin"}
GAPI_STYLES = {
    "neytral": {"role": "operator", "style": "neutral", "dialect": False},
    "iliq": {"role": "assistant", "style": "warm", "dialect": False},
    "jonli": {"role": "assistant", "style": "cheerful", "dialect": True},  # so'zlashuv talaffuzi
    "sokin": {"role": "operator", "style": "calm", "dialect": False},
}
# mix: "vocal" -- faqat vokal almashadi (Demucs); voices: "two" -- erkak va ayol alohida ovozda
STAGES = {"mix": ("vocal",), "voices": ("two",), "stt": STT, "llm": LLM, "tts": TTS, "female": tuple(GAPI_STYLES), "male": tuple(GAPI_STYLES),
          "quality": ("2160", "1440", "720", "480", "360", "240", "144")}  # admin: bo'sh -- 1080p


def available(has_gapi_key: bool) -> dict[str, list[str]]:
    from backend.services.gemini_quota_manager import get_all_gemini_api_keys
    from backend.services.groq_service import get_all_groq_api_keys

    s = get_settings()
    has_gapi_key = has_gapi_key or bool((getattr(s, "GAPI_API_KEY", "") or "").strip())
    gemini, groq, neuronai = bool(get_all_gemini_api_keys()), bool(get_all_groq_api_keys()), bool(s.NEURONAI_API_KEY)
    azure = s.AZURE_SPEECH_KEY not in ("", "your-azure-key")
    on = {
        "stt": {"gapi": has_gapi_key, "groq": groq, "neuronai": neuronai and s.NEURONAI_STT_ENABLED, "gemini": gemini},
        "llm": {"groq": groq, "neuronai": neuronai, "gemini": gemini},
        "tts": {"gapi": has_gapi_key, "edge": True, "azure": azure, "gemini": gemini, "neuronai": neuronai,
                "voicelab": bool(s.VOICELAB_API_KEY), "uzbekvoice": bool(s.UZBEKVOICE_API_KEY),
                "elevenlabs": bool(s.ELEVENLABS_API_KEY)},
    }
    return {stage: [p for p in names if on[stage][p]] for stage, names in STAGES.items() if stage in on}
