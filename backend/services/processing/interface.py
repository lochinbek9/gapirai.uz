"""Processing boundary — Modal migratsiyasi uchun arxitektura chegarasi (Phase 2).

Bu qatlam FAQAT invocation boundary. Hech qanday transkripsiya yoki merge
biznes mantiqi (chunking, provayder zanjiri, fallback, DSP filtergraph,
timing/sync) shu yerda YO'Q — u backend/services/transcriber.py va
backend/services/merger.py da o'z holicha qoladi.

LocalTranscriber / LocalEncoder o'sha mavjud funksiyalarni O'ZGARTIRMASDAN
o'raydi (wrapper). Xatti-harakat 100% lokal va bir xil. Modal
implementatsiyasi keyinroq (Phase 3+) shu Protocol'lar ortida, feature-flag
bilan qo'shiladi — bu fayl o'sha vaqtгача hech qanday tashqi tanlov qilmaydi.
"""
from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable

from backend.services import merger, transcriber


@runtime_checkable
class Encoder(Protocol):
    """Video + dublyaj audiosini yakuniy videoga birlashtiruvchi qatlam."""

    def encode_merge(
        self,
        video_path: str,
        audio_path: str,
        out_path: str,
        mix_mode: Optional[str] = None,
    ) -> str:
        """`out_path` (yozilgan fayl yo'li) qaytaradi.

        `mix_mode`: "dubbed_only" | "ducked_mix" | None (None -> config default).
        """
        ...


@runtime_checkable
class Transcriber(Protocol):
    """Audio faylni vaqt-belgilangan matnga aylantiruvchi qatlam."""

    def transcribe(self, audio_path: str, language: Optional[str] = "en") -> dict:
        """`{"text": str, "segments": list, "srt": str, "language": str}` qaytaradi
        (backend/services/transcriber.py::transcribe_audio bilan bir xil shakl).
        """
        ...


class LocalEncoder:
    """merger.merge_video_audio() ustidagi yupqa wrapper — mantiq ko'chirilmaydi."""

    def encode_merge(
        self,
        video_path: str,
        audio_path: str,
        out_path: str,
        mix_mode: Optional[str] = None,
    ) -> str:
        return merger.merge_video_audio(
            video_path=video_path,
            dubbed_audio_path=audio_path,
            output_path=out_path,
            audio_mix_mode=mix_mode,
        )


class LocalTranscriber:
    """transcriber.transcribe_audio() ustidagi yupqa wrapper — mantiq ko'chirilmaydi."""

    def transcribe(self, audio_path: str, language: Optional[str] = "en") -> dict:
        return transcriber.transcribe_audio(audio_path, language=language)


# Jarayon ichida bir marta yaratiladi. Hozircha har doim lokal.
_encoder: Optional[Encoder] = None
_transcriber: Optional[Transcriber] = None


def get_encoder() -> Encoder:
    global _encoder
    if _encoder is None:
        _encoder = LocalEncoder()
    return _encoder


def get_transcriber() -> Transcriber:
    global _transcriber
    if _transcriber is None:
        _transcriber = LocalTranscriber()
    return _transcriber
