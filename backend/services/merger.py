import subprocess
import logging
import time
from pathlib import Path

from backend.config import get_settings

from functools import lru_cache

logger = logging.getLogger(__name__)
settings = get_settings()

_MIX_SAMPLE_RATE = 44100


def _has_audio_stream(file_path: str) -> bool:
    """Check if the media file contains at least one audio stream."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        return bool(result.stdout.strip())
    except Exception:
        return True


@lru_cache(maxsize=1)
def _has_nvenc() -> bool:
    """Check if NVENC GPU encoder is available in ffmpeg."""
    if not getattr(settings, "ENABLE_NVENC", False):
        return False
    try:
        res = subprocess.run(["ffmpeg", "-encoders"], capture_output=True, text=True, check=True)
        if "h264_nvenc" not in res.stdout:
            return False
        test_res = subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=1", "-c:v", "h264_nvenc", "-f", "null", "-"],
            capture_output=True,
            timeout=5,
        )
        return test_res.returncode == 0
    except Exception:
        return False


def _get_video_codec() -> tuple[str, list[str]]:
    """Get video encoder codec and arguments based on NVENC availability."""
    if _has_nvenc():
        return "h264_nvenc", [
            "-preset", getattr(settings, "NVENC_PRESET", "p1"),
            "-tune", getattr(settings, "NVENC_TUNE", "hq"),
            "-rc", getattr(settings, "NVENC_RC", "vbr"),
            "-cq", str(getattr(settings, "NVENC_CQ", 28)),
            "-b:v", "0",
        ]
    return "libx264", [
        "-preset", "ultrafast",
        "-crf", "23",
        "-tune", "zerolatency",
        "-threads", "0",
    ]


def _get_video_codec_for_chunk(chunk_index: int = 0) -> tuple[str, list[str]]:
    return _get_video_codec()



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


def _build_dubbed_only_filtergraph(target_dur: float | None = None) -> str:
    """Process the TTS track without feeding the original speech into the mix."""
    s = settings
    dub_pad = (
        f"atrim=0:{target_dur:.3f},asetpts=PTS-STARTPTS,apad=whole_dur={target_dur:.3f},"
        if isinstance(target_dur, (int, float)) and target_dur > 0
        else ""
    )
    return (
        f"[1:a]{dub_pad}aformat=sample_rates={_MIX_SAMPLE_RATE}:channel_layouts=stereo,"
        f"highpass=f={s.VOICE_HIGHPASS_HZ},"
        f"equalizer=f={s.VOICE_EQ_FREQ_HZ}:width_type=q:width=1:g={s.VOICE_EQ_GAIN_DB},"
        f"acompressor=threshold=0.1:ratio={s.VOICE_COMPRESSOR_RATIO}:attack=20:release=250:makeup=1,"
        f"deesser=i=0.2:m=0.5:f=0.5,"
        f"volume={s.VOICE_GAIN_BOOST_DB}dB,"
        f"alimiter=limit={s.VOICE_LIMITER_LIMIT}:attack=5:release=50,"
        f"loudnorm=I={s.FINAL_LOUDNORM_I}:TP={s.FINAL_LOUDNORM_TP}:LRA={s.FINAL_LOUDNORM_LRA}[final]"
    )


def _build_audio_filtergraph(
    target_dur: float | None | str = None,
    audio_mix_mode: str | None = None,
    has_orig_audio: bool = True,
) -> str:
    """
    Original audio (musiqa/SFX/ambient) va o'zbekcha dublyajni professional
    kino-dublyaji uslubida aralashtiradi — original TO'LIQ o'chirilmaydi.
    Agar original videoda audio trek bo'lmasa, avtomatik ravishda dubbed_only rejimiga o'tadi.
    """
    if isinstance(target_dur, str):
        audio_mix_mode = target_dur
        target_dur = None

    mode = audio_mix_mode or getattr(settings, "AUDIO_MIX_MODE", "ducked_mix")
    if mode == "dubbed_only" or not has_orig_audio:
        return _build_dubbed_only_filtergraph(target_dur)

    s = settings
    ducking_ratio = max(1.0, min(20.0, s.DUCKING_RATIO))
    duck_stage = (
        f"sidechaincompress=threshold={s.DUCKING_THRESHOLD}:ratio={ducking_ratio}:"
        f"attack={s.DUCKING_ATTACK_MS}:release={s.DUCKING_RELEASE_MS}:makeup=1"
    )
    orig_vol = getattr(s, "ORIGINAL_AUDIO_VOLUME", 0.22)
    dub_pad = (
        f"atrim=0:{target_dur:.3f},asetpts=PTS-STARTPTS,apad=whole_dur={target_dur:.3f},"
        if isinstance(target_dur, (int, float)) and target_dur > 0
        else ""
    )
    return (
        f"[0:a]aformat=sample_rates={_MIX_SAMPLE_RATE}:channel_layouts=stereo,volume={orig_vol}[orig];"
        f"[1:a]{dub_pad}aformat=sample_rates={_MIX_SAMPLE_RATE}:channel_layouts=stereo,"
        f"asplit=3[dubsc1][dubsc2][dubdsp];"
        f"[orig][dubsc1]{duck_stage}[duck1];"
        f"[duck1][dubsc2]{duck_stage}[ducked];"
        f"[dubdsp]highpass=f={s.VOICE_HIGHPASS_HZ},"
        f"equalizer=f={s.VOICE_EQ_FREQ_HZ}:width_type=q:width=1:g={s.VOICE_EQ_GAIN_DB},"
        f"acompressor=threshold=0.1:ratio={s.VOICE_COMPRESSOR_RATIO}:attack=20:release=250:makeup=1,"
        f"deesser=i=0.2:m=0.5:f=0.5,"
        f"volume={s.VOICE_GAIN_BOOST_DB}dB,"
        f"alimiter=limit={s.VOICE_LIMITER_LIMIT}:attack=5:release=50[dubproc];"
        f"[ducked][dubproc]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mixed];"
        f"[mixed]loudnorm=I={s.FINAL_LOUDNORM_I}:TP={s.FINAL_LOUDNORM_TP}:LRA={s.FINAL_LOUDNORM_LRA}[final]"
    )



def _probe_video_codec(file_path: str) -> str:
    """FFprobe orqali video codec nomini olish (masalan 'h264', 'av1', 'vp9')."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True, text=True, timeout=15,
        )
        return result.stdout.strip().lower()
    except Exception:
        return ""



def _get_video_dimensions(file_path: str) -> tuple[int, int]:
    """FFprobe orqali video o'lchamlarini (width, height) olish."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=s=x:p=0",
                file_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        parts = result.stdout.strip().split("x")
        if len(parts) == 2:
            return int(parts[0]), int(parts[1])
    except Exception:
        pass
    return 1280, 720


WATERMARK_PATH = Path(__file__).resolve().parent.parent / "assets" / "watermark_gapirai.png"


def merge_video_audio(
    video_path: str,
    dubbed_audio_path: str,
    output_path: str,
    max_duration: float | None = None,
    audio_mix_mode: str | None = None,
) -> str:
    """
    Original video + O'zbekcha dublyaj → Tayyor video, kino-dublyaji uslubida
    aralashtirilgan (original musiqa/SFX/ambient saqlanadi, faqat dub
    gapirayotgan joyda moslashuvchan pasayadi — backend/config.py: DUCKING_*).

    Barcha tariflar uchun yuqori o'ng burchakda rasmiy GapirAI.uz suv belgisi
    (logo + domen) joylashtiriladi.

    Agar o'zbekcha dublyaj video dan uzunroq bo'lsa:
    → Video oxirgi kadri "freeze" qilinadi (qora ekran emas, tabiiy tugatish)

    Agar video uzunroq bo'lsa:
    → Original video TO'LIQ uzunligida saqlanadi.
    """
    output_path = str(Path(output_path).resolve())
    video_path = str(Path(video_path).resolve())
    dubbed_audio_path = str(Path(dubbed_audio_path).resolve())
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    video_dur = _get_duration(video_path)
    audio_dur = _get_duration(dubbed_audio_path)
    has_orig_audio = _has_audio_stream(video_path)

    # Agar o'zbekcha audio videodan uzun bo'lsa, videoni behuda bir necha daqiqaga
    # muzlatib (freeze-frame) cho'zmaslik uchun maksimal ruxsat etilgan farq 2.5 soniya.
    # Undan ortiq bo'lsa, audio video uzunligi + 2.5s ga cheklanadi.
    max_extra_allowed = 2.5
    if audio_dur > video_dur + max_extra_allowed:
        logger.warning(
            f"Dublyaj audio ({audio_dur:.1f}s) video ({video_dur:.1f}s) dan ancha uzun! "
            f"Videoni behuda cho'zmaslik uchun audio {video_dur + max_extra_allowed:.1f}s ga cheklanmoqda."
        )
        target_dur = video_dur + max_extra_allowed
        extra = max_extra_allowed
    elif audio_dur > video_dur:
        target_dur = audio_dur
        extra = audio_dur - video_dur
    else:
        target_dur = video_dur
        extra = 0.0

    audio_filter = _build_audio_filtergraph(
        target_dur=target_dur,
        audio_mix_mode=audio_mix_mode,
        has_orig_audio=has_orig_audio,
    )

    vcodec = _probe_video_codec(video_path)
    needs_transcode = vcodec not in ("h264", "avc1")

    use_watermark = WATERMARK_PATH.exists() and getattr(settings, "ENABLE_VIDEO_WATERMARK", True)

    def _build_cmd(with_watermark: bool) -> list[str]:
        if with_watermark:
            w, h = _get_video_dimensions(video_path)
            # Gorizontal logo (ikonka + "GapirAI.uz", soyasi rasmning o'zida) -- kalta
            # tomonga nisbatan: 720p -> ~68px, vertikal 1080x1920 -> ~103px balandlik.
            wm_h = max(40, min(130, round(min(w, h) * 0.095)))
            wm_scale = f"scale=-1:{wm_h}:flags=lanczos"

            pad_x = max(10, round(w * 0.02))
            pad_y = max(10, round(h * 0.025))

            if extra > 0:
                v_prep = f"[0:v]tpad=stop_mode=clone:stop_duration={extra:.3f}[v_base];"
            else:
                v_prep = "[0:v:0]null[v_base];"

            fc = (
                f"{v_prep}"
                f"[2:v]{wm_scale}[wm];"
                f"[v_base][wm]overlay=W-w-{pad_x}:{pad_y}[v_out];"
                f"{audio_filter}"
            )

            c = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", dubbed_audio_path,
                "-i", str(WATERMARK_PATH),
                "-filter_complex", fc,
                "-map", "[v_out]",
                "-map", "[final]",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "veryfast", "-threads", "2",
                "-c:a", "aac", "-b:a", "192k", "-ar", str(_MIX_SAMPLE_RATE),
                "-movflags", "+faststart",
                output_path,
            ]
        else:
            # Suv belgisisiz (fallback)
            if extra <= 0:
                fc = audio_filter
                if needs_transcode:
                    video_codec_args = [
                        "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-crf", "22", "-preset", "veryfast", "-threads", "2",
                    ]
                else:
                    video_codec_args = ["-c:v", "copy"]

                c = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", dubbed_audio_path,
                    "-filter_complex", fc,
                    "-map", "0:v:0",
                    "-map", "[final]",
                    *video_codec_args,
                    "-c:a", "aac", "-b:a", "192k", "-ar", str(_MIX_SAMPLE_RATE),
                    "-movflags", "+faststart",
                    output_path,
                ]
            else:
                fc = (
                    f"[0:v]tpad=stop_mode=clone:stop_duration={extra:.3f}[v];"
                    f"{audio_filter}"
                )
                c = [
                    "ffmpeg", "-y",
                    "-i", video_path,
                    "-i", dubbed_audio_path,
                    "-filter_complex", fc,
                    "-map", "[v]",
                    "-map", "[final]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "veryfast", "-threads", "2",
                    "-c:a", "aac", "-b:a", "192k", "-ar", str(_MIX_SAMPLE_RATE),
                    "-movflags", "+faststart",
                    output_path,
                ]

        # Qat'iy davomiylik chegarasi: video_dur + extra dan oshmasligi SHART.
        # Bu audio qoldig'i yoki freeze-frame hisobiga video uzayib (masalan 3:19 o'rniga 4:17 bo'lib)
        # qolishining butunlay oldini oladi.
        actual_limit_dur = (video_dur + extra) if video_dur > 0 else 0.0
        if max_duration and max_duration > 0:
            actual_limit_dur = min(actual_limit_dur, max_duration) if actual_limit_dur > 0 else max_duration
        if actual_limit_dur > 0:
            c.insert(-1, "-t")
            c.insert(-1, f"{actual_limit_dur:.3f}")
        return c

    cmd = _build_cmd(with_watermark=use_watermark)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=8000)

    out_p = Path(output_path)
    for _ in range(6):
        if out_p.exists() and out_p.is_file() and out_p.stat().st_size > 0:
            break
        time.sleep(0.5)

    is_valid = out_p.exists() and out_p.is_file() and out_p.stat().st_size > 0

    if result.returncode != 0 or not is_valid:
        stderr_tail = (result.stderr or "")[-2000:]
        stdout_tail = (result.stdout or "")[-500:]

        if use_watermark:
            logger.warning(
                f"[MERGER] Suv belgisi bilan birlashtirish muvaffaqiyatsiz bo'ldi (code={result.returncode}, "
                f"valid={is_valid}). Suv belgisisiz qayta urinilmoqda...\nSTDERR: {stderr_tail}"
            )
            fallback_cmd = _build_cmd(with_watermark=False)
            result_fb = subprocess.run(fallback_cmd, capture_output=True, text=True, timeout=8000)
            for _ in range(6):
                if out_p.exists() and out_p.is_file() and out_p.stat().st_size > 0:
                    break
                time.sleep(0.5)

            if out_p.exists() and out_p.is_file() and out_p.stat().st_size > 0:
                logger.info(f"[MERGER] Suv belgisisiz fallback muvaffaqiyatli yakunlandi: {output_path}")
                return output_path

            fb_stderr = (result_fb.stderr or "")[-2000:]
            if result_fb.returncode == 0:
                raise RuntimeError(
                    f"FFmpeg yakunlandi (exit={result_fb.returncode}), lekin chiqish video fayli yaratilmadi yoki bo'sh (0 bayt): {output_path}\n"
                    f"STDERR:\n{fb_stderr}"
                )
            raise RuntimeError(
                f"FFmpeg xatoligi (suv belgisi va fallback ham muvaffaqiyatsiz, exit={result_fb.returncode}): "
                f"chiqish video fayli yaratilmadi yoki bo'sh (0 bayt): {output_path}\n"
                f"STDERR:\n{fb_stderr}"
            )

        raise RuntimeError(
            f"FFmpeg yakunlandi (exit={result.returncode}), lekin chiqish video fayli yaratilmadi yoki bo'sh (0 bayt): {output_path}\n"
            f"STDERR:\n{stderr_tail}\nSTDOUT:\n{stdout_tail}"
        )

    return output_path

