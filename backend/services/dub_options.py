"""Egasining qo'shimcha dublyaj rejimlari: vokalni almashtirish va ikki ovoz (erkak + ayol)."""
from backend.services.gemini_quota_manager import REQUEST_OVERRIDE, chosen_provider


def vocal_replace() -> bool:
    return chosen_provider("mix") == "vocal"


def two_voices() -> bool:
    return chosen_provider("voices") == "two"


def tag(override: dict | None) -> str | None:
    """DubbingJob.dub_options qiymati. Bunday job natijasi oddiy keshga berilmaydi va keshdan olinmaydi."""
    parts = [(override or {}).get(k) for k in ("mix", "voices")]
    return ",".join(p for p in parts if p) or None


def requested_tag() -> str | None:
    return tag(REQUEST_OVERRIDE.get())


def active_tag() -> str | None:
    return tag({k: chosen_provider(k) for k in ("mix", "voices")})
