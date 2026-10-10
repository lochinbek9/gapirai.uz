"""Subtitr kuelarini (cue) qurish (2026-09-20) -- "Subtitr" rejimi uchun.

Muammo: tarjima bosqichi Whisper bo'laklarini TO'LIQ GAPlarga birlashtiradi
(30 so'zgacha, 12 soniyagacha -- tarjima sifati uchun kerak), va shu gaplarning
o'zi to'g'ridan-to'g'ri subtitr kuesi bo'lib chiqardi: uzun (3+ qator) va juda
tez o'qish kerak bo'lgan matn bloklari, vaqtlari esa Whisper'ning TAXMINIY
segment vaqtlari (ko'pincha butun soniyalarga yaxlitlangan, nutqdan oldinroq
boshlanadi). Haqiqiy videolardagi subtitrlar esa qisqa (1-2 qator, ~42 belgi)
va nutqqa mos.

Yechim (dublyaj yo'liga TEGILMAYDI, faqat subtitr chiqishi):
  1. Vaqtlar: Whisper so'z darajasidagi vaqtlari (segment["words"]) bo'lsa,
     har bir manba segmentining boshi/oxiri shulardan olinadi (birinchi so'z
     boshlanishi -- oxirgi so'z tugashi).
  2. Uzun gap tarjimasi tinish belgilari/probellar bo'yicha qisqa kuelarga
     bo'linadi (har biri <=2 qator x 42 belgi, <=6 soniya). Vaqt belgilar soniga
     mutanosib taqsimlanadi va mumkin bo'lsa manba nutqidagi HAQIQIY pauzalarga
     yaqinlashtiriladi (subtitr pauzada yo'qoladi).
  3. Juda tez o'qiladigan kuelar keyingi kue boshlanishigacha bo'lgan bo'shliqqa
     uzaytiriladi (matnni o'zgartirmasdan o'qishga ko'proq vaqt).
  4. Baribir o'qib bo'lmaydigan (MAX_READ_CPS dan tez) gaplarni tarjima bosqichi
     qisqartiradi (reading_budgets -> translator.shorten_segments) -- faqat shularni.
Toza funksiyalar -- bazaga/tarmoqqa tegmaydi."""
from __future__ import annotations

import bisect
import math
import re

MAX_LINE_CHARS = 42
MAX_CUE_CHARS = MAX_LINE_CHARS * 2      # 2 qator
SPLIT_TARGET_CHARS = 72                 # kue shundan uzun bo'lsa bo'linadi
MAX_CUE_SECONDS = 6.0                   # kue shundan uzoq turmasin (bo'linadi)
MIN_CUE_SECONDS = 1.0
TARGET_CPS = 17.0                       # qulay o'qish tezligi (belgi/soniya)
MAX_READ_CPS = 24.0                     # shundan tez o'qiladigan gaplar tarjimada qisqartiriladi
                                        # (o'zbek matnida ~75-persentil 23.5, ~90-persentil 25.8 belgi/s: faqat eng tezlari)
CONDENSE_SLACK = 1.3                    # shorten_segments TTS tezligiga (~15 b/s) mo'ljallangan, subtitrni esa
                                        # ~20 b/s da o'qish mumkin -> byudjet oynadan shuncha ko'p soniya
MAX_CUE_HOLD_SECONDS = 7.0              # uzaytirilganda ham shundan oshmaydi
MIN_GAP_SECONDS = 0.04
SNAP_WINDOW_SECONDS = 1.0               # bo'linish nutq pauzasiga shuncha masofadan tortiladi
MIN_PAUSE_SECONDS = 0.25                # bundan uzun pauzada subtitr yo'qoladi
MIN_PART_CHARS = 6
_WORD_TIME_TOLERANCE = 1.0              # so'z vaqti segmentdan shuncha chetga chiqsa ishonilmaydi

import html

_WS = re.compile(r"\s+")
_SENTENCE_END = ".!?…"
_CLAUSE_END = ",;:—–"
_PENALTY_SENTENCE, _PENALTY_CLAUSE, _PENALTY_SPACE = 0, 6, 14


def _clean(text: str | None) -> str:
    if not text:
        return ""
    t = html.unescape(text)
    t = t.replace("&quot;", '"').replace("&#39;", "'").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    t = t.replace("`", "'").replace("ʻ", "'").replace("ʼ", "'")
    return _WS.sub(" ", t).strip()


# ── manba (Whisper) vaqtlarini aniqlashtirish ────────────────────────────

def refine_source_segments(source_segments: list[dict] | None) -> list[tuple[float, float]]:
    """Har bir manba segmenti uchun (boshlanish, tugash) -- so'z vaqtlari bo'lsa
    ularga ko'ra (Whisper segment vaqtlari taxminiy, so'z vaqtlari ancha aniq),
    aks holda segmentning o'zi. Markaz bo'yicha saralangan ro'yxat qaytaradi."""
    out: list[tuple[float, float]] = []
    for seg in source_segments or []:
        try:
            start, end = float(seg["start"]), float(seg["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end <= start:
            continue
        starts, ends = [], []
        for w in seg.get("words") or []:
            try:
                ws, we = float(w["start"]), float(w["end"])
            except (KeyError, TypeError, ValueError):
                continue
            if we >= ws:
                starts.append(ws)
                ends.append(we)
        if starts:
            ws, we = min(starts), max(ends)
            if we > ws and ws >= start - _WORD_TIME_TOLERANCE and we <= end + _WORD_TIME_TOLERANCE:
                start, end = ws, we
        out.append((start, end))
    out.sort(key=lambda a: (a[0] + a[1]) / 2)
    return out


# ── matnni bo'lish va qatorlarga ajratish ────────────────────────────────

def _split_candidates(text: str) -> dict[int, int]:
    """{bo'linish indeksi: jarima}: gap oxiridan keyin -- eng yaxshi, vergul/
    nuqtali vergul va h.k. dan keyin -- yaxshi, oddiy probeldan keyin -- oxirgi chora."""
    cands: dict[int, int] = {}
    for i, ch in enumerate(text[:-1]):
        nxt = text[i + 1]
        if ch in _SENTENCE_END and nxt == " ":
            cands[i + 2] = min(cands.get(i + 2, 99), _PENALTY_SENTENCE)
        elif ch in _CLAUSE_END and nxt == " ":
            cands[i + 2] = min(cands.get(i + 2, 99), _PENALTY_CLAUSE)
        elif ch == " ":
            cands[i + 1] = min(cands.get(i + 1, 99), _PENALTY_SPACE)
    return cands


def split_text(text: str, n: int) -> list[str]:
    """Matnni n ta (imkon qadar teng, lekin tinish belgilarida) bo'lakka bo'ladi."""
    text = _clean(text)
    if n <= 1 or len(text) < 2 * MIN_PART_CHARS:
        return [text]
    cands = _split_candidates(text)
    total = len(text)
    cuts: list[int] = []
    prev = 0
    for k in range(1, n):
        target = total * k / n
        best = None
        for idx, penalty in cands.items():
            if idx <= prev + MIN_PART_CHARS or idx >= total - MIN_PART_CHARS:
                continue
            score = abs(idx - target) + penalty
            if best is None or score < best[0]:
                best = (score, idx)
        if best is None:
            break
        cuts.append(best[1])
        prev = best[1]
    bounds = [0, *cuts, total]
    return [p for p in (text[a:b].strip() for a, b in zip(bounds, bounds[1:])) if p]


def wrap_lines(text: str, max_line: int = MAX_LINE_CHARS) -> str:
    """Kue matnini <=max_line belgili qatorlarga ("\\n" bilan) ajratadi: ikki
    qator, tinish belgisidan keyin va teng uzunlikda bo'lish afzal."""
    text = _clean(text)
    if len(text) <= max_line:
        return text
    words = text.split(" ")
    best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        over = max(0, len(a) - max_line) + max(0, len(b) - max_line)
        score = over * 100 + abs(len(a) - len(b)) + (-4 if a[-1] in _SENTENCE_END + _CLAUSE_END else 0)
        if best is None or score < best[0]:
            best = (score, a, b, over)
    if best is not None and best[3] == 0:
        return f"{best[1]}\n{best[2]}"
    # ikki qatorga sig'masa -- ochko'z (greedy) ravishda uch va undan ko'p qatorga
    lines, cur = [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > max_line:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return "\n".join(lines)


# ── kuelarni qurish ──────────────────────────────────────────────────────

def _sentence_cues(text: str, start: float, end: float, anchors: list[tuple[float, float]]) -> list[dict]:
    """Bitta tarjima qilingan gapni (start..end oralig'ida) kuelarga bo'ladi.
    anchors -- shu gapga tegishli manba segmentlarining aniqlashtirilgan
    vaqtlari (tartiblangan); ular orasidagi pauzalar kue chegaralari uchun tayanch."""
    duration = max(end - start, 0.001)
    n = max(1, math.ceil(len(text) / SPLIT_TARGET_CHARS), math.ceil(duration / MAX_CUE_SECONDS))
    parts = split_text(text, n)
    if len(parts) <= 1:
        return [{"start": start, "end": end, "text": text}]

    total = sum(len(p) for p in parts)
    # 1) belgilar soniga mutanosib chegara vaqtlari
    cum = 0
    times = []
    for p in parts[:-1]:
        cum += len(p)
        times.append(start + duration * cum / total)

    # 2) nutqdagi haqiqiy pauzalarga yaqinlashtirish (agar bor bo'lsa)
    pauses = []  # (oldingi segment tugashi, keyingisi boshlanishi)
    for a, b in zip(anchors, anchors[1:]):
        pauses.append((min(a[1], b[0]), max(a[1], b[0])))
    bounds: list[tuple[float, float]] = []  # har bir ichki chegara uchun (oldingi kue tugashi, keyingisi boshlanishi)
    last_pause = -1
    for t in times:
        pick = None
        for j in range(last_pause + 1, len(pauses)):
            mid = (pauses[j][0] + pauses[j][1]) / 2
            if abs(mid - t) <= SNAP_WINDOW_SECONDS and (pick is None or abs(mid - t) < abs(pick[1] - t)):
                pick = (j, mid)
        if pick is not None:
            j, mid = pick
            last_pause = j
            gap_start, gap_end = pauses[j]
            bounds.append((gap_start, gap_end) if gap_end - gap_start >= MIN_PAUSE_SECONDS else (mid, mid))
        else:
            bounds.append((t, t))

    cues = []
    cur_start = start
    for part, (cut_end, cut_start) in zip(parts, bounds):
        cues.append({"start": cur_start, "end": cut_end, "text": part})
        cur_start = cut_start
    cues.append({"start": cur_start, "end": end, "text": parts[-1]})
    return cues


def _normalize(cues: list[dict]) -> list[dict]:
    """Tartiblaydi, ustma-ust tushishni yo'qotadi, juda qisqa kuelarni va juda
    tez o'qiladiganlarni bo'shliqqa uzaytiradi."""
    cues = sorted((c for c in cues if c["text"]), key=lambda c: (c["start"], c["end"]))
    for i, c in enumerate(cues):
        nxt = cues[i + 1] if i + 1 < len(cues) else None
        flat_len = len(c["text"].replace("\n", " "))
        want = max(MIN_CUE_SECONDS, min(flat_len / TARGET_CPS, MAX_CUE_HOLD_SECONDS))
        if c["end"] - c["start"] < want:
            limit = nxt["start"] - MIN_GAP_SECONDS if nxt else c["start"] + want
            c["end"] = max(c["end"], min(c["start"] + want, limit))
        if c["end"] <= c["start"]:
            c["end"] = c["start"] + 0.3
        if nxt is not None:
            if nxt["start"] < c["end"]:
                # ustma-ust: avval oldingisini qisqartiramiz, imkon bo'lmasa keyingisini surib qo'yamiz
                if nxt["start"] - c["start"] >= 0.3:
                    c["end"] = nxt["start"]
                else:
                    c["end"] = c["start"] + 0.3
                    nxt["start"] = max(nxt["start"], c["end"])
                    nxt["end"] = max(nxt["end"], nxt["start"] + 0.3)
    return cues


def _sentence_windows(translated_segments, source_segments):
    """Har bir tarjima qilingan gap uchun (segment, matn, boshlanish, tugash,
    anchors): vaqt oynasi manba segmentlarining aniqlashtirilgan (so'z
    vaqtlariga asoslangan) chegaralari bo'yicha, ular bo'lmasa segmentning o'zi.
    Yaroqsiz/bo'sh segmentlar tashlab yuboriladi."""
    anchors_all = refine_source_segments(source_segments)
    mids = [(a + b) / 2 for a, b in anchors_all]
    out = []
    for seg in translated_segments or []:
        text = _clean(seg.get("text") if isinstance(seg, dict) else None)
        if not text:
            continue
        try:
            start, end = float(seg["start"]), float(seg["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if end <= start:
            end = start + max(MIN_CUE_SECONDS, len(text) / TARGET_CPS)
        lo = bisect.bisect_left(mids, start - 0.01)
        hi = bisect.bisect_right(mids, end + 0.01)
        anchors = sorted(anchors_all[lo:hi])
        if anchors:
            a_start, a_end = anchors[0][0], max(a[1] for a in anchors)
            if a_end > a_start:
                start, end = a_start, a_end
        out.append((seg, text, start, end, anchors))
    return out


def reading_budgets(
    translated_segments: list[dict] | None,
    source_segments: list[dict] | None = None,
    max_cps: float = MAX_READ_CPS,
) -> dict:
    """{segment id: soniya}: shu gapning nutq oynasiga (aniqlashtirilgan) SIG'MAYDIGAN
    -- ya'ni o'qish tezligi max_cps dan oshadigan -- tarjimalar. Subtitr rejimida
    tarjima bosqichi shularni (va faqat shularni) qisqartiradi: dublyajdagi kabi
    barcha uzun gaplarni emas, faqat haqiqatan o'qib bo'lmaydiganlarini."""
    budgets: dict = {}
    for seg, text, start, end, _ in _sentence_windows(translated_segments, source_segments):
        window = end - start
        if window > 0 and "id" in seg and len(text) / window > max_cps:
            budgets[seg["id"]] = window * CONDENSE_SLACK
    return budgets


def build_cues(translated_segments: list[dict] | None, source_segments: list[dict] | None = None) -> list[dict]:
    """Tarjima qilingan gaplar (+ ixtiyoriy: manba Whisper segmentlari, so'z
    vaqtlari bilan) -> tayyor subtitr kuelari: [{"start","end","text"}], matnda
    qator uzilishlari "\\n" bilan. Hech qachon istisno ko'tarmaydi (yaroqsiz
    segmentlar tashlab yuboriladi)."""
    cues: list[dict] = []
    for _, text, start, end, anchors in _sentence_windows(translated_segments, source_segments):
        cues.extend(_sentence_cues(text, start, end, anchors))
    cues = _normalize(cues)
    for c in cues:
        c["text"] = wrap_lines(c["text"])
    return cues


# ── formatlash ───────────────────────────────────────────────────────────

def _ts(seconds: float, sep: str) -> str:
    total_ms = max(0, int(round(seconds * 1000)))
    h, rem = divmod(total_ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def cues_to_vtt(cues: list[dict]) -> str:
    lines = ["WEBVTT", ""]
    for i, c in enumerate(cues, 1):
        txt = _clean(c.get("text", ""))
        lines += [str(i), f"{_ts(c['start'], '.')} --> {_ts(c['end'], '.')}", txt, ""]
    return "\n".join(lines)


def cues_to_srt(cues: list[dict]) -> str:
    lines = []
    for i, c in enumerate(cues, 1):
        txt = _clean(c.get("text", ""))
        lines += [str(i), f"{_ts(c['start'], ',')} --> {_ts(c['end'], ',')}", txt, ""]
    return "\n".join(lines)
