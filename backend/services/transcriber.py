from faster_whisper import WhisperModel
from pathlib import Path
from backend.config import get_settings

settings = get_settings()

# Model bir marta yuklanadi (singleton pattern)
_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            settings.WHISPER_MODEL_SIZE,
            device=settings.WHISPER_DEVICE,
            compute_type="int8",  # Hisoblash uchun int8 - tezroq va kamroq RAM
            cpu_threads=4,        # Ko'p yadro ishlatish
            num_workers=2,        # Parallel workers
        )
    return _model


def transcribe_audio(audio_path: str) -> dict:
    """
    Audio faylni matnga aylantirish (STT).

    Returns:
        dict: {
            "text": str,           # To'liq matn
            "segments": list,      # Vaqt belgilangan segmentlar
            "srt": str,            # SRT format subtitles
            "language": str,       # Aniqlangan til
        }
    """
    model = get_model()

    segments, info = model.transcribe(
        audio_path,
        beam_size=1,            # Greedy decoding — 3-5x tezroq (CPU uchun optimal)
        language="en",          # Ingliz tilini majburiy aniqlash
        vad_filter=True,        # Sukut(silence)larni filtrlash
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,  # Qo'shimcha tezlashtirish
    )

    segments_list = []
    full_text_parts = []
    srt_lines = []

    for i, seg in enumerate(segments, start=1):
        segment_data = {
            "id": i,
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
        }
        segments_list.append(segment_data)
        full_text_parts.append(seg.text.strip())

        # SRT format
        srt_lines.append(str(i))
        srt_lines.append(f"{_format_time(seg.start)} --> {_format_time(seg.end)}")
        srt_lines.append(seg.text.strip())
        srt_lines.append("")

    return {
        "text": " ".join(full_text_parts),
        "segments": segments_list,
        "srt": "\n".join(srt_lines),
        "language": info.language,
    }


def _format_time(seconds: float) -> str:
    """Sekundni SRT vaqt formatiga aylantirish: 00:01:23,456"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
