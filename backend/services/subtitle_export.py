"""Subtitr eksporti yordamchilari (2026-09-20): oddiy matn (.txt) formati va
yuklab olinadigan fayl nomi / Content-Disposition.

Toza funksiyalar (bazaga/tarmoqqa tegmaydi) -- backend/api/routes.py'dagi
`/jobs/{id}/subtitles.{srt,vtt,txt}` endpointlari shularni ishlatadi."""
import re
import unicodedata
from urllib.parse import quote

# Fayl nomida mumkin bo'lmagan / xavfli belgilar (yo'l ajratgichlar, Windows
# taqiqlagan belgilar, boshqaruv belgilari) -- probelga almashtiriladi.
_BAD_NAME_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f\x7f]+')
_MAX_STEM_LEN = 80


def segments_to_txt(segments: list[dict] | None) -> str:
    """Tarjima qilingan segmentlarni oddiy matnga aylantiradi: har bir subtitr
    qatori alohida satrda, vaqt kodlarisiz (o'qish/nusxalash/tahrirlash uchun).
    Bo'sh segmentlar tashlab yuboriladi. Oxirida bitta yangi qator."""
    lines = []
    for seg in segments or []:
        text = " ".join(str(seg.get("text", "")).split())
        if text:
            lines.append(text)
    return "\n".join(lines) + ("\n" if lines else "")


def plain_text_fallback(translated_text: str | None) -> str:
    """Segmentlar yo'q (eski job'lar), lekin yaxlit tarjima matni bor bo'lsa."""
    text = (translated_text or "").strip()
    return text + "\n" if text else ""


def download_filename(title: str | None, job_id, ext: str) -> str:
    """Foydalanuvchi qurilmasida ko'rinadigan fayl nomi: `<sarlavha>.uz.<ext>`.
    Yuklangan videoning nomi bilan bir xil bo'lgani uchun pleerlar (VLC va h.k.)
    subtitrni avtomatik topadi. Sarlavha bo'sh/yaroqsiz bo'lsa job_id ishlatiladi."""
    stem = _BAD_NAME_CHARS.sub(" ", title or "")
    stem = " ".join(stem.split()).strip(" .")[:_MAX_STEM_LEN].strip(" .")
    if not stem:
        stem = str(job_id)
    return f"{stem}.uz.{ext}"


def content_disposition(filename: str) -> str:
    """`attachment` sarlavhasi: ASCII zaxira `filename` + UTF-8 `filename*`
    (RFC 5987) -- o'zbekcha/kirillcha nomlar brauzerlarda to'g'ri chiqishi
    uchun, sarlavha injection (qo'shtirnoq/CRLF) esa imkonsiz."""
    stem, dot, ext = filename.rpartition(".")
    if not dot:
        stem, ext = filename, "txt"
    lang = ""
    if stem.endswith(".uz"):
        stem, lang = stem[:-3], ".uz"
    ascii_stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
    ascii_stem = re.sub(r'[^A-Za-z0-9._ -]', "_", ascii_stem).strip(" ._-") or "subtitle"
    ext = re.sub(r'[^A-Za-z0-9]', "", ext) or "txt"
    return f"attachment; filename=\"{ascii_stem}{lang}.{ext}\"; filename*=UTF-8''{quote(filename, safe='')}"
