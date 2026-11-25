"""Har bir nutq segmentini kim aytganini (erkak/ayol) aniqlash.

Asosiy usul: Gemini audioni eshitadi. Ishlamasa yoki segmentni o'tkazib yuborsa -- ovoz balandligi (F0).
"""
import json
import logging
import re
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

_CHUNK_S = 600
_RATE = 16000
_FEMALE_F0_HZ = 165.0


def _cut(video_path: str, start: float, seconds: float, out: Path, codec: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{seconds:.3f}", "-i", str(video_path),
                    "-vn", "-ac", "1", "-ar", str(_RATE), *codec, str(out)], check=True, timeout=600)


def parse_labels(raw: str) -> dict[int, str]:
    raw = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", (raw or "").strip())
    data = json.loads(raw)
    out = {}
    for key, value in (data.items() if isinstance(data, dict) else []):
        letter = str(value).strip().lower()[:1]
        if str(key).isdigit() and letter in ("m", "f"):
            out[int(key)] = "female" if letter == "f" else "male"
    return out


def _gemini_labels(audio: bytes, lines: list[str]) -> dict[int, str]:
    from google.genai import types

    from backend.services import gemini_quota_manager as quota
    from backend.services.transcriber import _get_gemini_candidate_models, _get_gemini_stt_model_name, _get_gemini_transcribe_client

    prompt = (
        "Listen to the audio. For every numbered time range decide whether the voice speaking or singing there is "
        "male or female. Judge by the sound of the voice, not by the words. "
        'Reply with JSON only: {"<number>": "m" or "f", ...}.\n' + "\n".join(lines)
    )
    contents = [types.Part.from_bytes(data=audio, mime_type="audio/mpeg"), prompt]
    config = types.GenerateContentConfig(temperature=0.0, response_mime_type="application/json")
    last = None
    for model in _get_gemini_candidate_models(_get_gemini_stt_model_name()):
        for key in quota.get_gemini_keys_for_request(is_paid=False):
            if not quota.is_model_available(key, model)[0]:
                continue
            quota.record_model_request(key, model)
            try:
                response = _get_gemini_transcribe_client(api_key=key).models.generate_content(
                    model=model, contents=contents, config=config)
                labels = parse_labels(response.text)
                quota.record_model_success(key, model)
                return labels
            except Exception as exc:
                last = exc
                if "429" in str(exc):
                    quota.mark_model_cooldown(key, model, quota.parse_retry_delay(str(exc)), reason=str(exc))
    raise RuntimeError(f"Gemini jinsni aniqlay olmadi: {last}")


def pitch_gender(samples, rate: int = _RATE) -> str | None:
    """Ovozli kadrlarning median asosiy chastotasi; ishonchli kadr yetmasa None."""
    import numpy as np

    size, lo, hi = int(0.04 * rate), rate // 350, rate // 70
    pitches = []
    for i in range(0, len(samples) - size, size // 2):
        frame = samples[i:i + size] - np.mean(samples[i:i + size])
        energy = float(np.dot(frame, frame))
        if energy / size < 1e-5:
            continue
        spectrum = np.fft.rfft(frame, 2 * size)
        corr = np.fft.irfft(spectrum * np.conj(spectrum))[:hi + 1]
        peak = corr[lo:].max()
        if peak < 0.35 * energy:
            continue
        # birinchi kuchli cho'qqi -- oktava xatosiga qarshi
        lag = next(k for k in range(lo, hi + 1) if corr[k] >= 0.9 * peak)
        while lag < hi and corr[lag + 1] > corr[lag]:
            lag += 1
        pitches.append(rate / lag)
    if len(pitches) < 5:
        return None
    return "female" if float(np.median(pitches)) >= _FEMALE_F0_HZ else "male"


def _pitch_for(video_path: str, segment: dict, tmp: Path) -> str | None:
    import numpy as np

    raw = tmp / "segment.raw"
    _cut(video_path, segment["start"], max(0.2, segment["end"] - segment["start"]), raw, ["-f", "f32le"])
    return pitch_gender(np.fromfile(raw, dtype="float32"))


def label_segments(video_path: str, segments: list[dict]) -> list[dict]:
    """Segmentlarning nusxasi, aniqlanganlariga "gender" qo'shilgan."""
    out = [dict(s) for s in segments]
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        chunks: dict[int, list[int]] = {}
        for i, s in enumerate(out):
            chunks.setdefault(int(s["start"] // _CHUNK_S), []).append(i)
        for chunk, indexes in chunks.items():
            offset = chunk * _CHUNK_S
            labels: dict[int, str] = {}
            try:
                audio = tmp / f"chunk{chunk}.mp3"
                span = max(out[i]["end"] for i in indexes) - offset
                _cut(video_path, offset, span + 1, audio, ["-b:a", "48k"])
                lines = [f"{i}: {out[i]['start'] - offset:.1f}s - {out[i]['end'] - offset:.1f}s" for i in indexes]
                labels = _gemini_labels(audio.read_bytes(), lines)
            except Exception as exc:
                logger.warning(f"Jinsni Gemini bilan aniqlab bo'lmadi, ovoz balandligi ishlatiladi: {exc}")
            for i in indexes:
                try:
                    gender = labels.get(i) or _pitch_for(video_path, out[i], tmp)
                except Exception as exc:
                    logger.warning(f"Segment {i}: jins aniqlanmadi: {exc}")
                    gender = None
                if gender:
                    out[i]["gender"] = gender
    counts = {g: sum(s.get("gender") == g for s in out) for g in ("female", "male")}
    logger.info(f"Ikki ovoz: {len(out)} segment -- ayol {counts['female']}, erkak {counts['male']}")
    return out


def assign_voices(segments: list[dict], main_gender: str, main_voice: str, default_voice) -> list[dict]:
    """Asosiy jins tanlangan ovozni oladi, ikkinchisi -- provayderning standart ovozini."""
    return [
        {**s, "voice": main_voice if s.get("gender", main_gender) == main_gender else default_voice(s["gender"])}
        for s in segments
    ]
