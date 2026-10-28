"""CapCut uchun paket (2026-10-28): o'zbekcha ovoz (MP3) + subtitr (SRT) +
qo'llanma, bitta zip'da.

CapCut'da plagin tizimi yo'q -- foydalanuvchi bu fayllarni o'zi import qiladi.
MP3 -- WAV'dan ancha yengil (telefonga yuklash uchun) va CapCut'ning ikkala
(telefon/kompyuter) versiyasi ham ochadi. Zip ichidagi nomlar ASCII: eski
Windows arxivlovchilari UTF-8 nomlarni buzadi.
"""
import logging
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

AUDIO_NAME = "ovoz-uz.mp3"
SRT_NAME = "subtitr-uz.srt"
GUIDE_NAME = "QOLLANMA-CapCut.txt"


def guide_text(title: str | None, has_audio: bool) -> str:
    lines = [
        f"GapirAI — CapCut uchun paket: {title or 'video'}",
        "",
        "Ichida:",
    ]
    if has_audio:
        lines.append(f"  {AUDIO_NAME}  — oʻzbekcha ovoz (faqat ovoz, video bilan bir xil uzunlikda)")
    lines += [
        f"  {SRT_NAME}  — oʻzbekcha subtitr",
        "",
        "CapCut (kompyuter: Windows / Mac)",
        "  1. Videoni loyihaga qoʻshing — oʻzingizning asl videongiz yoki gapirai.uz'dan yuklab olingan video.",
    ]
    if has_audio:
        lines += [
            "  2. Asl ovozni oʻchiring yoki pasaytiring: videoni tanlang → Audio → Volume.",
            f"  3. {AUDIO_NAME} ni Import qilib, audio trekka videoning eng boshiga (0:00) qoʻying.",
            "     Agar gapirai.uz'dan dublaj qilingan videoni olgan boʻlsangiz, 2–3-qadam kerak emas.",
            f"  4. Subtitr: Text (Matn) → Captions (Subtitrlar) → Import captions → {SRT_NAME}.",
        ]
    else:
        lines.append(f"  2. Subtitr: Text (Matn) → Captions (Subtitrlar) → Import captions → {SRT_NAME}.")
    lines += [
        "     Subtitr videoning boshidan boshlanadi — videoni qisqartirgan boʻlsangiz, ularni birga suring.",
        "",
        "CapCut (telefon)",
    ]
    if has_audio:
        lines += [
            "  1. Videoni qoʻshing, uni tanlab ovozini oʻchiring (Volume → 0).",
            f"  2. Audio → Sounds → Your sounds (Mening ovozlarim) → From device (Qurilmadan) → {AUDIO_NAME}.",
            "     Uni videoning eng boshiga qoʻying.",
        ]
    lines += [
        "  Telefon versiyasi SRT import qilishni qoʻllamaydi — subtitr uchun CapCut'ning kompyuter",
        "  versiyasidan foydalaning.",
        "",
        "Menyu nomlari CapCut versiyasi va tiliga qarab biroz farq qilishi mumkin.",
        "Savollar: https://t.me/gapir_uz_muhokama",
        "",
    ]
    return "\n".join(lines)


def wav_to_mp3(wav_path: str, mp3_path: str) -> bool:
    """ffmpeg bilan 192 kbit/s MP3. Avval vaqtinchalik faylga -- yarim yozilgan
    MP3 keshda qolmasin."""
    tmp = f"{mp3_path}.part.mp3"
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", tmp],
            check=True, capture_output=True, timeout=600,
        )
        os.replace(tmp, mp3_path)
        return True
    except (subprocess.SubprocessError, OSError) as e:
        logger.warning("CapCut MP3 yaratilmadi (%s): %s", wav_path, getattr(e, "stderr", e))
        try:
            os.remove(tmp)
        except OSError:
            pass
        return False


def cached_mp3(wav_path: str) -> str | None:
    """WAV yonida keshlangan MP3 (yo'q yoki eskirgan bo'lsa yaratiladi). WAV
    papkasiga yozib bo'lmasa -- vaqtinchalik faylga (chaqiruvchi o'chiradi)."""
    wav = Path(wav_path)
    mp3 = wav.with_name(wav.stem + ".capcut.mp3")
    if mp3.exists() and mp3.stat().st_mtime >= wav.stat().st_mtime:
        return str(mp3)
    if os.access(wav.parent, os.W_OK) and wav_to_mp3(str(wav), str(mp3)):
        return str(mp3)
    fd, tmp = tempfile.mkstemp(suffix=".mp3", prefix="gapirai-capcut-")
    os.close(fd)
    if wav_to_mp3(str(wav), tmp):
        return tmp
    os.remove(tmp)
    return None


def build_zip(srt_text: str, mp3_path: str | None, title: str | None) -> str:
    """Zip'ni vaqtinchalik faylga yozadi va yo'lini qaytaradi (chaqiruvchi o'chiradi).
    MP3 allaqachon siqilgan -- ZIP_STORED (CPU sarflamaymiz); matnlar -- DEFLATED."""
    fd, out = tempfile.mkstemp(suffix=".zip", prefix="gapirai-capcut-")
    os.close(fd)
    with zipfile.ZipFile(out, "w") as z:
        if mp3_path:
            z.write(mp3_path, AUDIO_NAME, compress_type=zipfile.ZIP_STORED)
        z.writestr(SRT_NAME, srt_text, compress_type=zipfile.ZIP_DEFLATED)
        z.writestr(GUIDE_NAME, guide_text(title, bool(mp3_path)), compress_type=zipfile.ZIP_DEFLATED)
    return out
