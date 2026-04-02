import subprocess
import os
from pathlib import Path


def merge_video_audio(video_path: str, dubbed_audio_path: str, output_path: str) -> str:
    """
    Original video + O'zbekcha audio → Tayyor video.

    FFmpeg yordamida:
    1. Original audioni o'chirib tashlash
    2. Yangi dublyaj audioni qo'shish

    Args:
        video_path: Original video fayl (.mp4, audio yo'q)
        dubbed_audio_path: O'zbekcha audio (.wav)
        output_path: Chiqish video fayl yo'li

    Returns:
        Chiqish video fayl yo'li
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",                          # Mavjud faylni ustiga yozish
        "-i", video_path,              # Video manba
        "-i", dubbed_audio_path,       # Audio manba
        "-c:v", "copy",                # Videoni qayta encode qilmaslik (tezroq)
        "-c:a", "aac",                 # Audio codec
        "-b:a", "192k",               # Audio bitrate
        "-map", "0:v:0",              # 1-manbadan video
        "-map", "1:a:0",              # 2-manbadan audio
        "-shortest",                   # Qisqaroq stream tugaganda to'xtatish
        output_path,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10 daqiqa
    )

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg xatoligi:\n{result.stderr}")

    return output_path


def merge_with_background_music(
    video_path: str,
    dubbed_audio_path: str,
    original_audio_path: str,
    output_path: str,
    music_volume: float = 0.15,  # Fon musiqasi balandligi (0.0 - 1.0)
) -> str:
    """
    Video + Dublyaj audio + Original fon musiqasi (aralashtirilgan).

    Bu funksiya demucs bilan ajratilgan musiqa trekini ishlatadi.
    Dublyaj ovozi 100%, fon musiqasi 15% balandlikda.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    # FFmpeg filter: dubbed_audio to'liq + original_music past balandlikda
    filter_complex = (
        f"[1:a]volume=1.0[dubbed];"
        f"[2:a]volume={music_volume}[music];"
        f"[dubbed][music]amix=inputs=2:duration=longest[aout]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i", video_path,
        "-i", dubbed_audio_path,
        "-i", original_audio_path,
        "-filter_complex", filter_complex,
        "-map", "0:v:0",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        output_path,
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,
    )

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg xatoligi:\n{result.stderr}")

    return output_path
