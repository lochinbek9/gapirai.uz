"""
TTS Provider Base — barcha TTS provayderlari uchun umumiy interfeys.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class SynthesisResult:
    """Bitta sintez chaqiruvining natijasi."""
    success: bool
    provider: str
    latency_ms: float = 0.0
    audio_duration_ms: float = 0.0
    chars: int = 0
    cost_usd: float = 0.0
    error: str = ""


class TTSProvider(ABC):
    """
    Barcha TTS provayderlari uchun umumiy interfeys.
    """

    @abstractmethod
    def synthesize(
        self,
        text: str,
        output_path: str,
        voice_name: str | None = None,
    ) -> bool:
        """
        Matnni WAV audio ga aylantiradi.
        Returns: True — muvaffaqiyatli; False — xatolik.
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifikatori (masalan 'elevenlabs')."""
        ...

    @property
    def cost_per_1k(self) -> float:
        """1 000 belgi uchun taxminiy narx (USD). Default: 0."""
        return 0.0

    def synthesize_batch(
        self,
        segments: list[dict],
        output_dir: str,
        voice_name: str | None = None,
    ) -> dict[int, str]:
        """
        Bir nechta segmentni bitta chaqiruvda (yoki provayderga xos optimal
        usulda) sintez qiladi — daqiqalik/kunlik so'rov-soni limitiga ega
        provayderlar (masalan Gemini) uchun foydali. Default: qo'llab-
        quvvatlanmaydi (bo'sh natija — chaqiruvchi oddiy bir-bir yo'lga o'tadi).

        Returns: {segment_id: wav_fayl_yo'li} — faqat muvaffaqiyatli
        sintez qilingan segmentlar uchun.
        """
        return {}

    def _is_female(self, voice_name: str | None) -> bool:
        """voice_name orqali gender aniqlash yordamchi metodi."""
        if not voice_name:
            return False
        return any(kw in voice_name for kw in ("Madina", "female", "nova", "shimmer", "Aoede", "Kore"))
