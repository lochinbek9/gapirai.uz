import re
import subprocess
import tempfile
import time
import random
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from openai import OpenAI, RateLimitError
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
client = OpenAI(api_key=settings.OPENAI_API_KEY, max_retries=5) if settings.OPENAI_API_KEY else None
_CHUNK_DURATION_SECONDS = 8 * 60
_CHUNK_BITRATE = "64k"

# Whisper faqat cholg'u ohangini "♪♪" yoki "[Music]"/"(applause)" kabi
# belgi bilan qaytarishi mumkin — bular haqiqiy nutq emas.
_NON_SPEECH_RE = re.compile(r"[♩-♯]|\[[^\]]*\]|\([^)]*\)")


def has_speech(segments: list[dict]) -> bool:
    """Segmentlar orasida kamida bitta haqiqiy nutq (so'z) bor-yo'qligini tekshiradi."""
    for seg in segments:
        if _NON_SPEECH_RE.sub("", seg.get("text", "")).strip():
            return True
    return False


def _get_client() -> OpenAI:
    if not client:
        raise RuntimeError("OPENAI_API_KEY not set")
    return client


def _chunk_audio(audio_path: str, chunk_dir: Path) -> list[Path]:
    output_pattern = chunk_dir / "chunk_%03d.mp3"
    proc = subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-y",
            "-i",
            audio_path,
            "-f",
            "segment",
            "-segment_time",
            str(_CHUNK_DURATION_SECONDS),
            "-reset_timestamps",
            "1",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            _CHUNK_BITRATE,
            str(output_pattern),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Audio bo'laklarga ajratishda xatolik: {proc.stderr[-500:]}")

    chunks = sorted(chunk_dir.glob("chunk_*.mp3"))
    if not chunks:
        raise RuntimeError("OpenAI transkripsiyasi uchun audio bo'laklari yaratilmadi.")
    return chunks


def _segment_to_dict(segment: object) -> dict:
    if hasattr(segment, "model_dump"):
        return segment.model_dump()
    if isinstance(segment, dict):
        return segment
    return {
        "start": getattr(segment, "start", None),
        "end": getattr(segment, "end", None),
        "text": getattr(segment, "text", ""),
    }


def _response_to_dict(response: object) -> dict:
    if hasattr(response, "model_dump"):
        return response.model_dump()
    if isinstance(response, dict):
        return response
    return {
        "text": getattr(response, "text", ""),
        "language": getattr(response, "language", ""),
        "segments": getattr(response, "segments", []),
    }


def call_openai_with_retry(api_func, *args, **kwargs):
    max_attempts = 7
    for attempt in range(max_attempts):
        try:
            return api_func(*args, **kwargs)
        except RateLimitError as e:
            if attempt == max_attempts - 1:
                raise e
            
            retry_after = 5.0
            try:
                if hasattr(e, "response") and e.response is not None:
                    headers = e.response.headers
                    if "retry-after-ms" in headers:
                        retry_after = float(headers["retry-after-ms"]) / 1000.0
                    elif "retry-after" in headers:
                        retry_after = float(headers["retry-after"])
            except Exception:
                pass
            
            backoff = (2 ** attempt) + random.uniform(0.1, 1.0)
            sleep_time = max(retry_after, backoff)
            logger.warning(f"OpenAI RateLimit (429) hit. Qayta urinish {sleep_time:.2f} soniyadan so'ng (Urinish {attempt + 1}/{max_attempts}). Xato: {e}")
            time.sleep(sleep_time)


def _transcribe_chunk(chunk_path: Path, offset_seconds: float) -> tuple[list[dict], str, str]:
    with chunk_path.open("rb") as audio_file:
        response = call_openai_with_retry(
            _get_client().audio.transcriptions.create,
            file=audio_file,
            model=settings.OPENAI_TRANSCRIPTION_MODEL,
            language="en",
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    response_data = _response_to_dict(response)
    segments = []
    for segment in response_data.get("segments", []):
        segment_data = _segment_to_dict(segment)
        text = (segment_data.get("text") or "").strip()
        start = segment_data.get("start")
        end = segment_data.get("end")
        if not text or start is None or end is None:
            continue
        segments.append(
            {
                "start": round(float(start) + offset_seconds, 3),
                "end": round(float(end) + offset_seconds, 3),
                "text": text,
            }
        )

    return (
        segments,
        (response_data.get("text") or "").strip(),
        response_data.get("language") or "en",
    )


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
    if settings.FREE_MODE:
        try:
            from faster_whisper import WhisperModel
            logger.info("FREE_MODE: Running local faster-whisper transcription (small model on CPU)...")
            
            model = WhisperModel("tiny", device="cpu", compute_type="int8")
            segments, info = model.transcribe(audio_path, beam_size=5)
            
            segments_list = []
            full_text_parts = []
            for i, segment in enumerate(segments, start=1):
                text = segment.text.strip()
                if not text:
                    continue
                full_text_parts.append(text)
                segments_list.append({
                    "id": i,
                    "start": round(segment.start, 3),
                    "end": round(segment.end, 3),
                    "text": text
                })
                
            srt_lines = []
            for seg in segments_list:
                srt_lines.append(str(seg["id"]))
                srt_lines.append(f"{_format_time(seg['start'])} --> {_format_time(seg['end'])}")
                srt_lines.append(seg["text"])
                srt_lines.append("")
                
            return {
                "text": " ".join(full_text_parts),
                "segments": segments_list,
                "srt": "\n".join(srt_lines),
                "language": info.language,
            }
        except Exception as e:
            logger.error(f"Local faster-whisper transcription failed: {e}. Falling back to OpenAI...")

    segments_list = []
    full_text_parts = []
    language = "en"

    with tempfile.TemporaryDirectory(prefix="openai-stt-") as temp_dir:
        chunk_paths = _chunk_audio(audio_path, Path(temp_dir))
        
        if len(chunk_paths) == 1:
            chunk_results = [
                (0, _transcribe_chunk(chunk_paths[0], offset_seconds=0))
            ]
        else:
            def _process_chunk(args):
                idx, cpath = args
                return idx, _transcribe_chunk(cpath, offset_seconds=idx * _CHUNK_DURATION_SECONDS)

            with ThreadPoolExecutor(max_workers=min(len(chunk_paths), 4)) as executor:
                chunk_results = list(executor.map(_process_chunk, enumerate(chunk_paths)))

        chunk_results.sort(key=lambda x: x[0])
        for _, (chunk_segments, chunk_text, chunk_language) in chunk_results:
            if chunk_text:
                full_text_parts.append(chunk_text)
            if chunk_segments:
                segments_list.extend(chunk_segments)
            if chunk_language:
                language = chunk_language

    srt_lines = []
    for i, seg in enumerate(segments_list, start=1):
        seg["id"] = i

        # SRT format
        srt_lines.append(str(i))
        srt_lines.append(f"{_format_time(seg['start'])} --> {_format_time(seg['end'])}")
        srt_lines.append(seg["text"])
        srt_lines.append("")

    return {
        "text": " ".join(full_text_parts),
        "segments": segments_list,
        "srt": "\n".join(srt_lines),
        "language": language,
    }


def _format_time(seconds: float) -> str:
    """Sekundni SRT vaqt formatiga aylantirish: 00:01:23,456"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
