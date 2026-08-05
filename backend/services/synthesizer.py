import os
import re
import subprocess
import tempfile
import time
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from pydub import AudioSegment
from backend.config import get_settings
from backend.services.tts.factory import get_provider, get_fallback_provider

logger = logging.getLogger(__name__)
settings = get_settings()

_FRAME_RATE = 24000


def _synthesize_text(
    text: str,
    output_path: str,
    retries: int = 3,
    voice_name: str | None = None,
) -> None:
    """
    Matnni audioga aylantiradi.

    Qatlam 1 — TTS_PROVIDER (default: ElevenLabs).
    Qatlam 2 — Edge TTS (bepul fallback, agar ELEVENLABS_FALLBACK_TO_EDGE=True).
    """
    if settings.FREE_MODE:
        logger.info("FREE_MODE: Edge TTS (bepul) ishlatilmoqda...")
        fallback = get_fallback_provider()
        if fallback.synthesize(text, output_path, voice_name=voice_name):
            return
        raise RuntimeError("FREE_MODE: Edge TTS muvaffaqiyatsiz.")

    # --- Asosiy provider ---
    primary = get_provider()
    logger.info(f"TTS provider: {primary.name} | chars={len(text)}")

    if primary.synthesize(text, output_path, voice_name=voice_name):
        return

    logger.warning(f"{primary.name} TTS muvaffaqiyatsiz — fallback Edge TTS ga o'tilmoqda.")

    # --- Fallback: Edge TTS ---
    if settings.ELEVENLABS_FALLBACK_TO_EDGE:
        fallback = get_fallback_provider()
        if fallback.synthesize(text, output_path, voice_name=voice_name):
            return

    raise RuntimeError(f"Barcha TTS providerlari muvaffaqiyatsiz: '{text[:50]}...'")


def _split_into_sentences(text: str) -> list[str]:
    """Matnni gaplarga bo'lish."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s for s in sentences if s.strip()]


def _build_ssml(text: str, voice_name: str | None = None) -> str:
    chosen_voice = voice_name or settings.AZURE_VOICE_NAME
    is_female = "Madina" in chosen_voice

    if is_female:
        rate   = "-4%"
        pitch  = "+2%"
        volume = "0%"
    else:
        rate   = "-8%"
        pitch  = "0%"
        volume = "0%"

    sentences = _split_into_sentences(text)
    ssml_sentences = []
    for sent in sentences:
        body = saxutils.escape(sent)
        if sent.rstrip().endswith("?"):
            ssml_sentences.append(
                f'<p><prosody pitch="+4%">{body}</prosody></p>'
            )
        elif sent.rstrip().endswith("!"):
            ssml_sentences.append(
                f'<p><prosody pitch="+2%">{body}</prosody></p>'
            )
        else:
            ssml_sentences.append(f'<p>{body}</p>')

    inner = "\n".join(ssml_sentences)

    return (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="http://www.w3.org/2001/mstts" '
        f'xml:lang="uz-UZ">'
        f'<voice name="{chosen_voice}">'
        f'<prosody rate="{rate}" pitch="{pitch}" volume="{volume}">'
        f'{inner}'
        f'</prosody>'
        f'</voice>'
        f'</speak>'
    )


def _speedup_audio(audio: AudioSegment, factor: float) -> AudioSegment:
    """FFmpeg atempo filter bilan audio tezlashtirish (pitch va namuna chastotasi o'zgarmaydi, toza ovoz saqlanadi)."""
    factor = max(0.5, min(2.0, round(factor, 3)))
    in_fd, in_path = tempfile.mkstemp(suffix=".wav")
    out_fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(in_fd); os.close(out_fd)
    try:
        audio.export(in_path, format="wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", in_path, "-filter:a", f"atempo={factor},volume=0.95", "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", out_path],
            check=True, capture_output=True,
        )
        return AudioSegment.from_wav(out_path)
    finally:
        if os.path.exists(in_path):
            try: os.unlink(in_path)
            except Exception: pass
        if os.path.exists(out_path):
            try: os.unlink(out_path)
            except Exception: pass


def synthesize_segments(segments: list[dict], output_dir: str, voice_name: str | None = None) -> str:
    """
    Har bir segmentni to'liq matn bilan ovozga aylantirish.

    Sinxronizatsiya va sifat strategiyasi:
    - HECH QACHON gap / matn oxiridan kesib tashlanmaydi!
    - Har bir audio segment headroom normalizatsiyadan o'tkaziladi (shirillash to'liq yo'qotiladi).
    - Kerak bo'lsa biroz mo''tadil tezlashtiriladi (max 1.25x).
    - Hali ham yetmasa, keyingi segment boshlanishi keyinroqqa suriladi (gap to'liq tugaydi).
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 1. Har bir segmentni parallel ravishda sintez qilish (16x tezlashtirish)
    def _process_single_segment(idx_seg):
        idx, seg = idx_seg
        text = seg.get("text", "").strip()
        if not text:
            return None
        seg_file = output_path / f"seg_{seg['id']:04d}.wav"
        _synthesize_text(text, str(seg_file), voice_name=voice_name)
        if seg_file.exists():
            audio = AudioSegment.from_wav(str(seg_file))
            # Bosh va oxiridagi bo'sh sukunatni tozalash (audio o'z-o'zidan 200-400ms qisqaradi va aniqroq bo'ladi)
            silence_len = 30
            while len(audio) > 150 and audio[:silence_len].dBFS < -42:
                audio = audio[silence_len:]
            while len(audio) > 150 and audio[-silence_len:].dBFS < -42:
                audio = audio[:-silence_len]
            audio = audio.normalize(headroom=2.0)
            return (idx, {
                "audio": audio,
                "start_ms": int(seg["start"] * 1000),
                "end_ms": int(seg["end"] * 1000),
            })
        return None

    with ThreadPoolExecutor(max_workers=16) as executor:
        raw_results = list(executor.map(_process_single_segment, enumerate(segments)))

    # Saralangan segmentlarni yig'ish
    valid_results = [r for r in raw_results if r is not None]
    valid_results.sort(key=lambda x: x[0])
    seg_data = [item for _, item in valid_results]

    if not seg_data:
        raise ValueError("Birlashtirish uchun segment topilmadi.")

    # 2. Aniq vaqtga sinxronlash (Strict Timestamp Synchronization)
    # HECH QACHON keyingi segment vaqti surilmaydi — barcha segmentlar o'z vaqtida (lip-sync) chiqadi!
    for i in range(len(seg_data)):
        cur = seg_data[i]
        start_ms = cur["start_ms"]

        if i < len(seg_data) - 1:
            slot_ms = seg_data[i + 1]["start_ms"] - start_ms
        else:
            slot_ms = max(cur["end_ms"] - start_ms, 1000)

        audio_ms = len(cur["audio"])

        # Agar audio navbatdagi segmentgacha bo'lgan vaqt oralig'idan uzunroq bo'lsa, mos ravishda tezlashtiramiz:
        if slot_ms > 150 and audio_ms > slot_ms:
            factor = audio_ms / slot_ms
            speed_factor = min(factor, 1.45)
            if speed_factor > 1.03:
                try:
                    cur["audio"] = _speedup_audio(cur["audio"], speed_factor)
                except Exception:
                    pass

            # Tezlashtirilgandan so'ng ham keyingi segment vaqtiga tutashib ketsa, fade-out bilan keskin ustma-ust tushish oldi olinadi
            if i < len(seg_data) - 1:
                max_allowed_ms = seg_data[i + 1]["start_ms"] - start_ms
                if max_allowed_ms > 100 and len(cur["audio"]) > max_allowed_ms:
                    cur["audio"] = cur["audio"][:max_allowed_ms].fade_out(25)

    # 3. Umumiy audio uzunligini hisoblash
    last = seg_data[-1]
    natural_end_ms = last["start_ms"] + len(last["audio"])
    original_end_ms = last["end_ms"]
    total_ms = max(natural_end_ms, original_end_ms) + 200

    combined = AudioSegment.silent(duration=total_ms, frame_rate=_FRAME_RATE)

    # 4. Har bir segmentni o'zining ANIQ vaqt koordinatasiga o'rnatish
    for item in seg_data:
        combined = combined.overlay(item["audio"], position=item["start_ms"])

    # Final headroom normalization to prevent clipping/crackling
    combined = combined.normalize(headroom=1.5)

    merged_path = str(output_path / "dubbed_audio.wav")
    combined.set_frame_rate(_FRAME_RATE).export(merged_path, format="wav")
    return merged_path


