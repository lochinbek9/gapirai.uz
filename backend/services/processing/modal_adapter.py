"""Modal adapter — Phase 3A PROTOTYPE (hech qayerga ulanmagan).

`ModalEncoder` / `ModalTranscriber` — backend/services/processing/interface.py
dagi `Encoder` / `Transcriber` Protocol'lariga mos. DO-tomon orkestratsiyasi:

    lokal fayl --upload--> S3  →  Modal function (S3 kalitlar bilan)
      →  Modal S3'ga natija yozadi  →  download --> lokal yo'l qaytariladi

DIQQAT (Phase 3A doirasi):
  * Bu adapter PIPELINE'ga ULANMAGAN. `get_encoder()` / `get_transcriber()`
    hamon `LocalEncoder` / `LocalTranscriber` qaytaradi (interface.py o'zgarmagan).
    Feature-flag YO'Q, default behavior o'zgarmagan.
  * `modal` paketi requirements.txt da YO'Q. Bu modul `modal`siz ham import
    qilinadi (barcha modal importlar lazy). `__init__.py` bu modulni
    re-export QILMAYDI.
  * Metodlar Modal yoki S3 sozlanmagan bo'lsa `ModalNotConfigured` ko'taradi —
    JIM FALLBACK YO'Q. Fallback / tanlov mantig'i keyingi phase'da,
    `get_encoder()` ichida bo'ladi.
  * S3 prod'da ishlashi HALI TASDIQLANMAGAN (S3 verification NO-GO).
  * Modal function'lari (backend/modal_app/app.py) DEPLOY QILINMAGAN.
  * Biznes mantiq (merger.py / transcriber.py) KO'CHIRILMAYDI — Modal image
    o'sha kodni AYNAN ishga tushiradi (backend/modal_app/app.py).
"""
from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# backend/modal_app/app.py dagi modal.App nomi (deploy nishoni).
_MODAL_APP_NAME = "gapirai-processing"

# S3 handoff prefiksi — EFEMER ishchi fayllar. Yakuniy yetkazib beriladigan
# `dubber/` prefiksidan ATAYIN alohida (bucket lifecycle uni ham 3 kunda
# o'chiradi; ishchi fayllar uchun bu maqbul yoki qisqaroq qoida qo'yiladi).
_WORK_PREFIX = "dubber-work"


class ModalNotConfigured(RuntimeError):
    """`modal` o'rnatilmagan / MODAL_ENABLED yoki MODAL_API_KEY yo'q / S3 sozlanmagan."""


# ─────────────────────────────────────────────────────────────────────────────
# Tayyorlik tekshiruvlari (hammasi lazy — modul importi hech narsani talab qilmaydi)
# ─────────────────────────────────────────────────────────────────────────────
def _modal_ready() -> bool:
    if os.environ.get("MODAL_ENABLED", "false").strip().lower() != "true":
        return False
    if not os.environ.get("MODAL_API_KEY"):
        return False
    try:
        import modal  # noqa: F401
    except ImportError:
        return False
    return True


def _s3_ready() -> bool:
    from backend.services.storage import _get_s3_client

    client, _ = _get_s3_client()
    return client is not None


def _require_ready() -> None:
    if not _modal_ready():
        raise ModalNotConfigured(
            "Modal tayyor emas: `modal` o'rnatilmagan yoki MODAL_ENABLED!=true yoki MODAL_API_KEY yo'q"
        )
    if not _s3_ready():
        raise ModalNotConfigured(
            "S3 sozlanmagan (AWS_BUCKET_NAME / AWS kalitlari) — Modal S3 handoff'ga bog'liq"
        )


def _lookup_remote(fn_name: str):
    """backend/modal_app/app.py da deploy qilingan function'ni topadi.

    Aniq Modal API (`Function.lookup` / `Function.from_name`) o'rnatilgan
    `modal` versiyasiga qarab farq qiladi — Phase 3 execution'da tekshiriladi.
    Test'larda bu funksiya mock qilinadi (haqiqiy `modal` importi bo'lmaydi).
    """
    import modal

    return modal.Function.lookup(_MODAL_APP_NAME, fn_name)  # type: ignore[attr-defined]


def _work_key(job_tag: str, name: str) -> str:
    return f"{_WORK_PREFIX}/{job_tag}/{name}"


# ─────────────────────────────────────────────────────────────────────────────
# Adapterlar — interface.Encoder / interface.Transcriber Protocol'lariga mos
# ─────────────────────────────────────────────────────────────────────────────
class ModalEncoder:
    """`Encoder` — merge/re-encode Modal compute'da. `merger.py` o'zgarmaydi:
    Modal function o'sha `merger.merge_video_audio()` ni chaqiradi."""

    def encode_merge(
        self,
        video_path: str,
        audio_path: str,
        out_path: str,
        mix_mode: Optional[str] = None,
    ) -> str:
        _require_ready()
        from backend.services.storage import download_file_from_s3, upload_file_to_s3

        job_tag = uuid.uuid4().hex[:12]
        v_key = _work_key(job_tag, f"video{Path(video_path).suffix or '.mp4'}")
        a_key = _work_key(job_tag, f"audio{Path(audio_path).suffix or '.wav'}")
        o_key = _work_key(job_tag, "dubbed_final.mp4")

        if not upload_file_to_s3(video_path, v_key):
            raise ModalNotConfigured(f"kirish videosini S3'ga yuklab bo'lmadi: {v_key}")
        if not upload_file_to_s3(audio_path, a_key):
            raise ModalNotConfigured(f"kirish audiosini S3'ga yuklab bo'lmadi: {a_key}")

        fn = _lookup_remote("encode_merge_remote")
        result_key = fn.remote(
            video_key=v_key, audio_key=a_key, out_key=o_key, mix_mode=mix_mode
        )

        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        if not download_file_from_s3(result_key, out_path):
            raise ModalNotConfigured(f"Modal natijasini S3'dan yuklab bo'lmadi: {result_key}")
        return out_path


class ModalTranscriber:
    """`Transcriber` — transkripsiya Modal compute'da. `transcriber.py` o'zgarmaydi.

    PROTOTIP eslatmasi: Modal function o'sha `transcriber.transcribe_audio()`
    ni chaqiradi (OpenAI Whisper API) — ya'ni bu FAQAT compute joyini
    ko'chiradi, xatti-harakat bir xil. GPU `faster-whisper large-v3`
    varianti — keyingi phase qarori (benchmark kerak)."""

    def transcribe(self, audio_path: str, language: Optional[str] = "en") -> dict:
        _require_ready()
        from backend.services.storage import upload_file_to_s3

        job_tag = uuid.uuid4().hex[:12]
        a_key = _work_key(job_tag, f"audio{Path(audio_path).suffix or '.wav'}")
        if not upload_file_to_s3(audio_path, a_key):
            raise ModalNotConfigured(f"audioni S3'ga yuklab bo'lmadi: {a_key}")

        fn = _lookup_remote("transcribe_remote")
        result = fn.remote(audio_key=a_key, language=language)
        # transcriber.transcribe_audio() bilan bir xil shakl
        # ({"text","segments","srt","language"}), JSON-serializable.
        return result
