import subprocess
import os
from pathlib import Path


def _get_duration(file_path: str) -> float:
    """FFprobe orqali fayl davomiyligini olish (soniyada)."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ],
        capture_output=True, text=True,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def merge_video_audio(video_path: str, dubbed_audio_path: str, output_path: str) -> str:
    """
    Original video + O'zbekcha audio → Tayyor video.

    Agar o'zbekcha audio video dan uzunroq bo'lsa:
    → Video oxirgi kadri "freeze" qilinadi (qora ekran emas, tabiiy tugatish)

    Agar video uzunroq bo'lsa:
    → Audio tugagandan so'ng video ham tugaydi
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    video_dur = _get_duration(video_path)
    audio_dur = _get_duration(dubbed_audio_path)

    if audio_dur <= video_dur:
        # Audio qisqaroq — oddiy birlashtirish, video davom etadi (sukut qoladi)
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", dubbed_audio_path,
            "-c:v", "copy",
            "-af", "alimiter=limit=0.95:level=true",
            "-c:a", "aac", "-b:a", "192k",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            output_path,
        ]
    else:
        # Audio uzunroq — video oxirgi kadrini "freeze" qilib audio ga uzaytirish
        extra = audio_dur - video_dur
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", dubbed_audio_path,
            # Video oxirini "tpad" bilan uzaytirish (oxirgi kadr freeze)
            "-filter_complex",
            f"[0:v]tpad=stop_mode=clone:stop_duration={extra:.3f}[v];[1:a]alimiter=limit=0.95:level=true[a]",
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264", "-crf", "18", "-preset", "fast",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=8000)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg xatoligi:\n{result.stderr[-1000:]}")

    return output_path
