"""Faqat vokalni olib tashlash (Demucs, CPU).

Nutq/kuylash oraliqlarida original audio o'rniga vokalsiz trek qo'yiladi; qolgan joylar
(musiqa, kulgi, effektlar) asl audiodan o'zgarishsiz olinadi.
"""
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

SAMPLE_RATE = 44100
_CHUNK_S = 300       # xotira chegarasi: uzun video bo'laklab ajratiladi
_PAD_S = 0.25
_FADE_S = 0.05
_THREADS = "4"       # qolgan yadrolar sayt va boshqa xizmatlarga


def speech_intervals(segments: list[dict], pad: float = _PAD_S) -> list[tuple[float, float]]:
    spans = sorted(
        (max(0.0, float(s["start"]) - pad), float(s["end"]) + pad)
        for s in segments or [] if (s.get("text") or "").strip() and float(s["end"]) > float(s["start"])
    )
    merged: list[list[float]] = []
    for a, b in spans:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]


def _separate(chunk: Path, out_dir: Path) -> Path:
    cmd = ["nice", "-n", "10", sys.executable, "-m", "demucs.separate", "-n", "htdemucs",
           "--two-stems", "vocals", "-o", str(out_dir), str(chunk)]
    env = {**os.environ, "OMP_NUM_THREADS": _THREADS, "MKL_NUM_THREADS": _THREADS}
    result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=3600)
    stem = out_dir / "htdemucs" / chunk.stem / "no_vocals.wav"
    if result.returncode != 0 or not stem.exists():
        raise RuntimeError(f"Vokalni ajratib bo'lmadi: {result.stderr[-600:]}")
    return stem


def build_background(video_path: str, segments: list[dict], output_path: str, separate=_separate) -> str:
    import numpy as np
    import soundfile as sf

    intervals = speech_intervals(segments)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        original = Path(tmp) / "original.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(video_path), "-vn", "-ac", "2",
                        "-ar", str(SAMPLE_RATE), "-c:a", "pcm_s16le", str(original)], check=True, timeout=1800)
        with sf.SoundFile(str(original)) as src, sf.SoundFile(
                str(output_path), "w", SAMPLE_RATE, 2, subtype="PCM_16") as dst:
            index = 0
            while True:
                block = src.read(_CHUNK_S * SAMPLE_RATE, dtype="float32", always_2d=True)
                if not len(block):
                    break
                start = index * _CHUNK_S
                end = start + len(block) / SAMPLE_RATE
                local = [(max(a, start) - start, min(b, end) - start) for a, b in intervals if a < end and b > start]
                if local:
                    chunk = Path(tmp) / f"chunk{index}.wav"
                    sf.write(str(chunk), block, SAMPLE_RATE, subtype="PCM_16")
                    clean, _ = sf.read(str(separate(chunk, Path(tmp) / "out")), dtype="float32", always_2d=True)
                    mask = np.zeros(len(block), dtype="float32")
                    fade = int(_FADE_S * SAMPLE_RATE)
                    for a, b in local:
                        i, j = int(a * SAMPLE_RATE), min(len(block), int(b * SAMPLE_RATE))
                        ramp = np.ones(j - i, dtype="float32")
                        n = min(fade, (j - i) // 2)
                        if n:
                            ramp[:n] = np.linspace(0, 1, n)
                            ramp[-n:] = np.linspace(1, 0, n)
                        mask[i:j] = np.maximum(mask[i:j], ramp)
                    usable = min(len(block), len(clean))
                    weight = mask[:usable, None]
                    block[:usable] = block[:usable] * (1 - weight) + clean[:usable] * weight
                dst.write(block)
                index += 1
    logger.info(f"Vokal olib tashlandi: {len(intervals)} oraliq -> {output_path}")
    return str(output_path)
