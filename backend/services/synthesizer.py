import azure.cognitiveservices.speech as speechsdk
import os
import re
import time
import xml.sax.saxutils as saxutils
from pathlib import Path
from pydub import AudioSegment
from backend.config import get_settings

settings = get_settings()

# Uzbek TTS taxminiy tezligi: ~13 harf/soniya (neutral prosody)
_CHARS_PER_SEC = 13.0

# Chiqish audio formati
_AUDIO_FORMAT = speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
_FRAME_RATE = 24000


def _calculate_ssml_rate(text: str, available_ms: int) -> str:
    """
    Segment vaqtiga mos SSML rate qiymatini hisoblash.
    SSML orqali tezlikni oldindan sozlash → post-process minimallashadi.
    """
    if available_ms <= 0:
        return "-8%"
    text_length = len(text.strip())
    if text_length == 0:
        return "-8%"

    estimated_ms = (text_length / _CHARS_PER_SEC) * 1000
    ratio = estimated_ms / available_ms

    if ratio <= 0.75:
        return "-12%"   # Ko'p vaqt → sekin, vazmin
    elif ratio <= 0.90:
        return "-8%"    # Vaqt bor → tabiiy sekin
    elif ratio <= 1.05:
        return "-3%"    # Deyarli mos → salgina sekin
    elif ratio <= 1.20:
        return "+8%"    # Biroz qisiq → oz tezroq
    elif ratio <= 1.40:
        return "+20%"   # Qisiq
    elif ratio <= 1.65:
        return "+35%"   # Juda qisiq
    else:
        return "+50%"   # Haddan qisiq → SSML max (+ post-process)


def _text_to_ssml_body(text: str) -> str:
    """
    Matnni SSML formatiga o'tkazish:
    — XML belgilarini qochirish
    — Tinish belgilari bo'yicha tabiiy pauza qo'shish
    — Dublyaj uchun tabiiy nafas ritmi
    """
    # 1. XML xavfsizligi
    escaped = saxutils.escape(text)

    # 2. Ko'p nuqta → uzoqroq pauza (fikr to'xtatilishi)
    escaped = re.sub(
        r'\.{3,}\s*',
        '...<break time="380ms"/> ',
        escaped
    )

    # 3. Gap oxiri (. ! ?) → tabiiy nafas pauza
    escaped = re.sub(
        r'([.!?])\s+',
        r'\1<break time="260ms"/> ',
        escaped
    )

    # 4. Vergul, nuqtali vergul → qisqa pauza
    escaped = re.sub(
        r'([,;])\s+',
        r'\1<break time="110ms"/> ',
        escaped
    )

    # 5. Ikki nuqta → o'rta pauza (ro'yxat boshlanishi)
    escaped = re.sub(
        r'([:])\s+',
        r'\1<break time="180ms"/> ',
        escaped
    )

    return escaped.strip()


def _build_ssml(text: str, rate: str = "-8%") -> str:
    """
    Azure TTS uchun kinodagi kabi tabiiy SSML yaratish.
    — prosody: tezlik va pitch boshqaruvi
    — break: tinish belgilari bo'yicha pauza
    — pitch kontouri: gap oxirida tabiiy pasayish
    """
    body = _text_to_ssml_body(text)

    return (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="http://www.w3.org/2001/mstts" '
        f'xml:lang="uz-UZ">'
        f'<voice name="{settings.AZURE_VOICE_NAME}">'
        # Biroz chuqurroq va sekinroq → erkak dublyaj ovoziga o'xshash
        f'<prosody rate="{rate}" pitch="-4%" volume="+8%">'
        f'{body}'
        f'</prosody>'
        f'</voice>'
        f'</speak>'
    )


def synthesize_segments(segments: list[dict], output_dir: str) -> str:
    """
    Har bir segmentni SSML orqali ovozga aylantirish va birlashtirish.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    segment_files = []

    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue

        available_ms = int((seg["end"] - seg["start"]) * 1000)
        seg_file = output_path / f"seg_{seg['id']:04d}.wav"
        _synthesize_text(text, str(seg_file), available_ms=available_ms)
        segment_files.append({
            "path": str(seg_file),
            "start": seg["start"],
            "end": seg["end"],
        })

    merged_path = str(output_path / "dubbed_audio.wav")
    _merge_segments(segment_files, merged_path)
    return merged_path


def _synthesize_text(
    text: str,
    output_path: str,
    available_ms: int = 0,
    retries: int = 3,
) -> None:
    """
    Azure TTS orqali SSML bilan matnni audio faylga aylantirish.
    Har segment uchun optimal rate avtomatik hisoblanadi.
    """
    speech_config = speechsdk.SpeechConfig(
        subscription=settings.AZURE_SPEECH_KEY,
        region=settings.AZURE_SPEECH_REGION,
    )
    speech_config.speech_synthesis_voice_name = settings.AZURE_VOICE_NAME
    speech_config.set_speech_synthesis_output_format(_AUDIO_FORMAT)

    audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config, audio_config=audio_config
    )

    rate = _calculate_ssml_rate(text, available_ms)
    ssml = _build_ssml(text, rate=rate)

    for attempt in range(retries):
        result = synthesizer.speak_ssml_async(ssml).get()
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return
        if attempt < retries - 1:
            time.sleep(2)

    raise RuntimeError(f"TTS xatoligi: {text[:50]}...")


def _merge_segments(segment_files: list[dict], output_path: str) -> None:
    """
    Segmentlarni vaqt belgilari asosida birlashtirish.
    SSML rate tufayli ko'p holda post-process minimal bo'ladi.
    """
    if not segment_files:
        raise ValueError("Birlashtirish uchun segment topilmadi.")

    total_duration_ms = int(segment_files[-1]["end"] * 1000)
    # Shovqin yo'q, toza sukut — 24kHz, mono
    combined = AudioSegment.silent(
        duration=total_duration_ms,
        frame_rate=_FRAME_RATE,
    )

    for seg in segment_files:
        if not os.path.exists(seg["path"]):
            continue

        seg_audio = AudioSegment.from_wav(seg["path"])
        start_ms = int(seg["start"] * 1000)
        end_ms = int(seg["end"] * 1000)
        available_ms = end_ms - start_ms

        # Hali slot dan uzun bo'lsa → minimal post-process (1.12x dan yuqori)
        if len(seg_audio) > available_ms and available_ms > 0:
            speed_ratio = len(seg_audio) / available_ms
            if speed_ratio > 1.12:
                seg_audio = _change_speed(seg_audio, speed_ratio)

        combined = combined.overlay(seg_audio, position=start_ms)

    combined.export(output_path, format="wav")


def _change_speed(audio: AudioSegment, speed: float) -> AudioSegment:
    """Audio tezligini o'zgartirish — pitch saqlanadi."""
    new_frame_rate = int(audio.frame_rate * speed)
    fast_audio = audio._spawn(
        audio.raw_data,
        overrides={"frame_rate": new_frame_rate}
    )
    return fast_audio.set_frame_rate(audio.frame_rate)
