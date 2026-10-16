import subprocess
import logging
from pathlib import Path

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_MIX_SAMPLE_RATE = 44100


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


def _build_audio_filtergraph(target_dur: float | None = None) -> str:
    """
    Original audio (musiqa/SFX/ambient) va o'zbekcha dublyajni professional
    kino-dublyaji uslubida aralashtiradi — original TO'LIQ o'chirilmaydi.

    [0:a] (original) va [1:a] (dublyaj) bir xil formatga keltiriladi, so'ng:
    - sidechaincompress: dublyaj trekining o'zi "trigger" bo'lib, original
      FAQAT dub gapirayotgan joyda pasayadi — moslashuvchan (baland original
      ko'proq, past original kamroq pasayadi), tekis fade bilan (attack/
      release), gap-gap qo'lda hisoblangan oraliqlar emas. IKKI marta ketma-
      ket qo'llaniladi (2026-08-14, real production videosini tinglab
      tasdiqlangan muammo: bitta bosqich original ovozni yetarlicha
      bosolmadi, dublyaj ovozi eshitilmay qolgan edi) — ffmpeg bitta
      sidechaincompress chaqiruvida ratio'ni 20dan oshirishga ruxsat
      bermaydi, shuning uchun ikkinchi bosqich effektiv bosishni
      chuqurlashtiradi.
    - dublyaj eshittirishdan oldin ovoz protsessing zanjiridan o'tadi (xirillash
      kesiladi, aniqlik uchun subtle EQ, dinamika siqiladi, "s" tovushlari
      yumshatiladi, keyin baland qilinadi — VOICE_GAIN_BOOST_DB — va nihoyat
      limiter cho'qqilarni xavfsiz ushlab qoladi) — shunda "TTS videoning
      ustiga yopishtirilgandek" emas, videoning o'z ovoz treki kabi eshitiladi
      va fondan sezilarli darajada ajralib turadi.
    - Yakuniy aralashma EBU R128 bo'yicha normallashtiriladi.
    """
    s = settings
    # ffmpeg'ning sidechaincompress filtri ratio uchun faqat [1, 20] oralig'ini
    # qabul qiladi — chegaradan tashqari qiymat butun ffmpeg jarayonini xato
    # bilan to'xtatadi (2026-08-12 productionda haqiqiy job orqali aniqlangan:
    # "Value 30.0 for parameter 'ratio' out of range [1 - 20]"). Config'dagi
    # qiymat noto'g'ri sozlansa ham job qulamasligi uchun shu yerda cheklanadi.
    ducking_ratio = max(1.0, min(20.0, s.DUCKING_RATIO))
    duck_stage = (
        f"sidechaincompress=threshold={s.DUCKING_THRESHOLD}:ratio={ducking_ratio}:"
        f"attack={s.DUCKING_ATTACK_MS}:release={s.DUCKING_RELEASE_MS}:makeup=1"
    )
    orig_vol = getattr(s, "ORIGINAL_AUDIO_VOLUME", 0.22)
    # FFmpeg sidechaincompress filtri sidechain (1:a) trekida EOF bo'lishi bilan
    # asosiy trek (0:a)ni ham uzatishni to'xtatadi. Agar video audio dan uzun bo'lsa,
    # dub tugaganidan keyin original fon musiqa/ovoz uzilib qolmasligi uchun
    # dub trekini video oxirigacha sukunat bilan to'ldiramiz (apad).
    dub_pad = f"apad=whole_dur={target_dur:.3f}," if target_dur and target_dur > 0 else ""
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


def _get_video_codec(file_path: str) -> str:
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


def merge_video_audio(video_path: str, dubbed_audio_path: str, output_path: str) -> str:
    """
    Original video + O'zbekcha dublyaj → Tayyor video, kino-dublyaji uslubida
    aralashtirilgan (original musiqa/SFX/ambient saqlanadi, faqat dub
    gapirayotgan joyda moslashuvchan pasayadi — backend/config.py: DUCKING_*).

    Barcha tariflar uchun pastki o'ng burchakda rasmiy gapirai.uz suv belgisi
    (logo + domen) joylashtiriladi.

    Agar o'zbekcha dublyaj video dan uzunroq bo'lsa:
    → Video oxirgi kadri "freeze" qilinadi (qora ekran emas, tabiiy tugatish)

    Agar video uzunroq bo'lsa:
    → Original video TO'LIQ uzunligida saqlanadi.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    video_dur = _get_duration(video_path)
    audio_dur = _get_duration(dubbed_audio_path)

    target_dur = video_dur if audio_dur <= video_dur else None
    audio_filter = _build_audio_filtergraph(target_dur=target_dur)

    vcodec = _get_video_codec(video_path)
    needs_transcode = vcodec not in ("h264", "avc1")

    use_watermark = WATERMARK_PATH.exists() and getattr(settings, "ENABLE_VIDEO_WATERMARK", True)

    extra = audio_dur - video_dur if audio_dur > video_dur else 0.0

    if use_watermark:
        w, h = _get_video_dimensions(video_path)
        if w >= h:
            wm_h = max(48, min(160, round(h * 0.11)))
            wm_scale = f"scale=-1:{wm_h}:flags=lanczos"
        else:
            wm_w = max(50, min(160, round(w * 0.18)))
            wm_scale = f"scale={wm_w}:-1:flags=lanczos"

        pad_x = max(16, round(w * 0.025))
        pad_y = max(16, round(h * 0.035))

        if extra > 0:
            v_prep = f"[0:v]tpad=stop_mode=clone:stop_duration={extra:.3f}[v_base];"
        else:
            v_prep = "[0:v:0]null[v_base];"

        filter_complex = (
            f"{v_prep}"
            f"[2:v]{wm_scale}[wm];"
            f"[v_base][wm]overlay=W-w-{pad_x}:H-h-{pad_y}[v_out];"
            f"{audio_filter}"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", dubbed_audio_path,
            "-i", str(WATERMARK_PATH),
            "-filter_complex", filter_complex,
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
            filter_complex = audio_filter
            if needs_transcode:
                video_codec_args = [
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-crf", "22", "-preset", "veryfast", "-threads", "2",
                ]
            else:
                video_codec_args = ["-c:v", "copy"]

            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", dubbed_audio_path,
                "-filter_complex", filter_complex,
                "-map", "0:v:0",
                "-map", "[final]",
                *video_codec_args,
                "-c:a", "aac", "-b:a", "192k", "-ar", str(_MIX_SAMPLE_RATE),
                "-movflags", "+faststart",
                output_path,
            ]
        else:
            filter_complex = (
                f"[0:v]tpad=stop_mode=clone:stop_duration={extra:.3f}[v];"
                f"{audio_filter}"
            )
            cmd = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", dubbed_audio_path,
                "-filter_complex", filter_complex,
                "-map", "[v]",
                "-map", "[final]",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-preset", "veryfast", "-threads", "2",
                "-c:a", "aac", "-b:a", "192k", "-ar", str(_MIX_SAMPLE_RATE),
                "-movflags", "+faststart",
                output_path,
            ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=8000)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg xatoligi:\n{result.stderr[-1500:]}")

    return output_path
