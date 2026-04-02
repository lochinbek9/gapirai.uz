import azure.cognitiveservices.speech as speechsdk
import os
import time
from pathlib import Path
from pydub import AudioSegment
from backend.config import get_settings

settings = get_settings()


def synthesize_segments(segments: list[dict], output_dir: str) -> str:
    """
    Har bir segmentni ovozga aylantirish va ularni birlashtirish.

    Args:
        segments: Tarjima qilingan segmentlar (start, end, text)
        output_dir: Chiqish papkasi

    Returns:
        Yakuniy audio fayl yo'li (.wav)
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    segment_files = []

    for seg in segments:
        if not seg.get("text", "").strip():
            continue

        seg_file = output_path / f"seg_{seg['id']:04d}.wav"
        _synthesize_text(seg["text"], str(seg_file))
        segment_files.append({
            "path": str(seg_file),
            "start": seg["start"],
            "end": seg["end"],
        })

    # Barcha segmentlarni bitta audio fayliga birlashtirish
    merged_path = str(output_path / "dubbed_audio.wav")
    _merge_segments(segment_files, merged_path)

    return merged_path


def _synthesize_text(text: str, output_path: str, retries: int = 3) -> None:
    """Azure TTS orqali matnni audio faylga aylantirish."""
    speech_config = speechsdk.SpeechConfig(
        subscription=settings.AZURE_SPEECH_KEY,
        region=settings.AZURE_SPEECH_REGION,
    )
    speech_config.speech_synthesis_voice_name = settings.AZURE_VOICE_NAME
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
    )

    audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config, audio_config=audio_config
    )

    for attempt in range(retries):
        result = synthesizer.speak_text_async(text).get()
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return
        if attempt < retries - 1:
            time.sleep(2)

    raise RuntimeError(f"TTS xatoligi: {text[:50]}...")


def _merge_segments(segment_files: list[dict], output_path: str) -> None:
    """
    Segmentlarni vaqt belgilari asosida birlashtirish.
    Segmentlar orasidagi bo'shliqlarni sukut (silence) bilan to'ldirish.
    """
    if not segment_files:
        raise ValueError("Birlashtirish uchun segment topilmadi.")

    # Umumiy audio uzunligini hisoblash (oxirgi segmentning end vaqti)
    total_duration_ms = int(segment_files[-1]["end"] * 1000)
    combined = AudioSegment.silent(duration=total_duration_ms)

    for seg in segment_files:
        if not os.path.exists(seg["path"]):
            continue

        seg_audio = AudioSegment.from_wav(seg["path"])
        start_ms = int(seg["start"] * 1000)
        end_ms = int(seg["end"] * 1000)
        available_ms = end_ms - start_ms

        # Segment original vaqtdan uzunroq bo'lsa, tezlashtirish
        if len(seg_audio) > available_ms and available_ms > 0:
            speed_ratio = len(seg_audio) / available_ms
            seg_audio = _change_speed(seg_audio, speed_ratio)

        combined = combined.overlay(seg_audio, position=start_ms)

    combined.export(output_path, format="wav")


def _change_speed(audio: AudioSegment, speed: float) -> AudioSegment:
    """Audio tezligini o'zgartirish (pitch o'zgarmasdan)."""
    # frame_rate ni o'zgartirish orqali tezlashtirish
    new_frame_rate = int(audio.frame_rate * speed)
    fast_audio = audio._spawn(
        audio.raw_data,
        overrides={"frame_rate": new_frame_rate}
    )
    return fast_audio.set_frame_rate(audio.frame_rate)
