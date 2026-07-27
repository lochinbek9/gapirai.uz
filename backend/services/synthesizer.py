import azure.cognitiveservices.speech as speechsdk
import os
import re
import subprocess
import tempfile
import time
import xml.sax.saxutils as saxutils
from pathlib import Path
from pydub import AudioSegment
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_AUDIO_FORMAT = speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
_FRAME_RATE = 24000


async def _synthesize_edge_tts(text: str, output_path: str, voice_name: str | None = None) -> bool:
    """Free Microsoft/Edge Neural TTS — supports uz-UZ-SardorNeural (male) & uz-UZ-MadinaNeural (female)."""
    voice = voice_name or settings.AZURE_VOICE_NAME or "uz-UZ-SardorNeural"
    chosen_voice = "uz-UZ-MadinaNeural" if "Madina" in voice else "uz-UZ-SardorNeural"

    # Strip SSML XML tags if any
    clean_text = re.sub(r'<[^>]+>', '', text).strip()
    if not clean_text:
        return False

    try:
        import edge_tts
        communicate = edge_tts.Communicate(clean_text, chosen_voice)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_mp3:
            tmp_mp3_path = tmp_mp3.name

        try:
            await communicate.save(tmp_mp3_path)
            if os.path.exists(tmp_mp3_path) and os.path.getsize(tmp_mp3_path) > 100:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_mp3_path, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", output_path],
                    check=True, capture_output=True
                )
                return True
        finally:
            if os.path.exists(tmp_mp3_path):
                try:
                    os.remove(tmp_mp3_path)
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"edge-tts synthesis failed: {e}")
    return False


def _synthesize_google_cloud_tts(text: str, output_path: str, voice_name: str | None = None) -> bool:
    """Google Cloud TTS API (if GOOGLE_APPLICATION_CREDENTIALS set)."""
    if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        return False
    try:
        from google.cloud import texttospeech
        client = texttospeech.TextToSpeechClient()
        clean_text = re.sub(r'<[^>]+>', '', text).strip()
        s_input = texttospeech.SynthesisInput(text=clean_text)
        voice = texttospeech.VoiceSelectionParams(
            language_code="uz-UZ",
            name="uz-UZ-Standard-A"
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            sample_rate_hertz=24000
        )
        response = client.synthesize_speech(
            input=s_input, voice=voice, audio_config=audio_config
        )
        with open(output_path, "wb") as out:
            out.write(response.audio_content)
        return True
    except Exception as e:
        logger.warning(f"Google Cloud TTS error: {e}")
        return False


def _synthesize_azure_tts(
    text: str,
    output_path: str,
    retries: int = 3,
    voice_name: str | None = None,
) -> bool:
    if not settings.AZURE_SPEECH_KEY or settings.AZURE_SPEECH_KEY == "your-azure-key":
        return False
    speech_config = speechsdk.SpeechConfig(
        subscription=settings.AZURE_SPEECH_KEY,
        region=settings.AZURE_SPEECH_REGION,
    )
    speech_config.speech_synthesis_voice_name = voice_name or settings.AZURE_VOICE_NAME
    speech_config.set_speech_synthesis_output_format(_AUDIO_FORMAT)

    audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
    synth = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)
    ssml = _build_ssml(text, voice_name=voice_name)

    for attempt in range(retries):
        result = synth.speak_ssml_async(ssml).get()
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return True
        if attempt < retries - 1:
            time.sleep(2)
    return False


def _synthesize_text(
    text: str,
    output_path: str,
    retries: int = 3,
    voice_name: str | None = None,
) -> None:
    # 1. Google Cloud TTS if configured
    if _synthesize_google_cloud_tts(text, output_path, voice_name=voice_name):
        return

    # 2. Edge Free Neural TTS (Sardor / Madina voices, zero cost)
    try:
        if asyncio.run(_synthesize_edge_tts(text, output_path, voice_name=voice_name)):
            return
    except Exception as e:
        logger.warning(f"Edge TTS fallback error: {e}")

    # 3. Azure Speech SDK
    try:
        if _synthesize_azure_tts(text, output_path, retries=retries, voice_name=voice_name):
            return
    except Exception as e:
        logger.warning(f"Azure TTS error: {e}")

    raise RuntimeError(f"Ovozlalashtirishda (TTS) xatolik yuz berdi: {text[:50]}...")
    """
    Matnni SSML formatiga o'girish.
    Tabiiy o'zbek nutq ritmi uchun optimallashtirilgan.
    """
    escaped = saxutils.escape(text)

    # Ko'p nuqta — uzoq pauza (o'ylash, kutish)
    escaped = re.sub(r'\.{3,}\s*', '...<break time="550ms"/> ', escaped)

    # Savol gaplari — biroz ko'proq pauza (tinglovchi o'ylansin)
    escaped = re.sub(r'\?\s+', '?<break time="420ms"/> ', escaped)

    # Undov gaplari — ta'kidli pauza
    escaped = re.sub(r'!\s+', '!<break time="380ms"/> ', escaped)

    # Oddiy gap tugashi — tabiiy nafas
    escaped = re.sub(r'\.\s+', '.<break time="320ms"/> ', escaped)

    # Vergul, nuqtali vergul — kichik pauza
    escaped = re.sub(r',\s+', ',<break time="160ms"/> ', escaped)
    escaped = re.sub(r';\s+', ';<break time="200ms"/> ', escaped)

    # Ikki nuqta — tushuntirish oldidan pauza
    escaped = re.sub(r':\s+', ':<break time="220ms"/> ', escaped)

    # Tire — gap ichida pauza (o'zbek nutqida ko'p ishlatiladi)
    escaped = re.sub(r'\s[—–-]\s', ' <break time="180ms"/>— ', escaped)

    # Qavs yopilishi — kichik pauza
    escaped = re.sub(r'\)\s+', ')<break time="110ms"/> ', escaped)

    return escaped.strip()


def _split_into_sentences(text: str) -> list[str]:
    """Matnni gaplarga bo'lish."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s for s in sentences if s.strip()]


def _build_ssml(text: str, voice_name: str | None = None) -> str:
    chosen_voice = voice_name or settings.AZURE_VOICE_NAME
    is_female = "Madina" in chosen_voice

    # Ovoz xususiyatlari
    # Sardor: biroz past, sekinroq — erkakcha vazmin ovoz
    # Madina: biroz baland, tabiiy tezlik — ayolcha ravon ovoz
    if is_female:
        rate   = "-4%"
        pitch  = "+4%"
        volume = "+8%"
    else:
        rate   = "-10%"   # Erkak o'zbek podcast ovozi sekinroq gapiradi
        pitch  = "-1%"    # Deyarli tabiiy pitch
        volume = "+6%"

    # Har bir gapni alohida <p> teg ichiga joylash — tabiiy ritm uchun
    sentences = _split_into_sentences(text)
    ssml_sentences = []
    for sent in sentences:
        body = _text_to_ssml_body(sent)
        # Savol gaplari uchun ko'tariluvchi intonatsiya
        if sent.rstrip().endswith("?"):
            ssml_sentences.append(
                f'<p><prosody pitch="+6%">{body}</prosody></p>'
            )
        # Undov gaplari uchun ta'kidliroq
        elif sent.rstrip().endswith("!"):
            ssml_sentences.append(
                f'<p><prosody pitch="+2%" volume="+12%">{body}</prosody></p>'
            )
        else:
            ssml_sentences.append(f'<p>{body}</p>')

    inner = "\n".join(ssml_sentences)

    return (
        '<speak version="1.0" '
        'xmlns="http://www.w3.org/2001/10/synthesis" '
        'xmlns:mstts="http://www.w3.org/2001/mstts" '
        f'xml:lang="uz-UZ">'
        f'<voice name="{chosen_voice}">'
        f'<prosody rate="{rate}" pitch="{pitch}" volume="{volume}">'
        f'{inner}'
        f'</prosody>'
        f'</voice>'
        f'</speak>'
    )


def _speedup_audio(audio: AudioSegment, factor: float) -> AudioSegment:
    """FFmpeg atempo filter bilan audio tezlashtirish (pitch o'zgarmaydi)."""
    factor = max(0.5, min(2.0, round(factor, 3)))
    in_fd, in_path = tempfile.mkstemp(suffix=".wav")
    out_fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(in_fd); os.close(out_fd)
    try:
        audio.export(in_path, format="wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", in_path, "-filter:a", f"atempo={factor}", out_path],
            check=True, capture_output=True,
        )
        return AudioSegment.from_wav(out_path)
    finally:
        os.unlink(in_path)
        os.unlink(out_path)


def synthesize_segments(segments: list[dict], output_dir: str, voice_name: str | None = None) -> str:
    """
    Har bir segmentni tabiiy tezlikda ovozga aylantirish.

    Sinxronizatsiya strategiyasi:
    - Har segment asl BOSHLANISH vaqtida joylashtiriladi (sync saqlanadi)
    - Tabiiy tezlik — hech qanday tezlashtirish yo'q
    - Agar segment vaqt slotidan uzun bo'lsa → sukut qismiga kirib ketadi (tabiiy)
    - Agar audio video dan uzun bo'lsa → merger oxirgi kadrni freeze qiladi
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 1. Har bir segmentni tabiiy tezlikda sintez qilish
    seg_data = []
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        seg_file = output_path / f"seg_{seg['id']:04d}.wav"
        _synthesize_text(text, str(seg_file), voice_name=voice_name)
        if seg_file.exists():
            audio = AudioSegment.from_wav(str(seg_file))
            seg_data.append({
                "audio": audio,
                "start_ms": int(seg["start"] * 1000),
                "end_ms": int(seg["end"] * 1000),
            })

    if not seg_data:
        raise ValueError("Birlashtirish uchun segment topilmadi.")

    # 2. Overlap oldini olish: tezlashtir → hali ham uzoq bo'lsa → trim + fade
    for i in range(len(seg_data) - 1):
        cur = seg_data[i]
        nxt = seg_data[i + 1]
        slot_ms = nxt["start_ms"] - cur["start_ms"]
        audio_ms = len(cur["audio"])

        if audio_ms <= slot_ms + 60:
            continue  # overlap yo'q

        # Qadam 1: tezlashtirish (max 1.5x)
        if slot_ms > 200:
            factor = min(audio_ms / slot_ms, 1.5)
            if factor > 1.05:
                try:
                    cur["audio"] = _speedup_audio(cur["audio"], factor)
                    audio_ms = len(cur["audio"])
                except Exception:
                    pass  # tezlashtirish xato bo'lsa original qoladi

        # Qadam 2: hali ham uzun bo'lsa — oxirini trim + fade out
        if len(cur["audio"]) > slot_ms + 60:
            cut_ms = max(slot_ms - 50, 100)
            fade_ms = min(80, cut_ms // 2)
            cur["audio"] = cur["audio"][:cut_ms].fade_out(fade_ms)

    # 3. Umumiy audio uzunligini hisoblash
    #    = asl video uzunligi YOKI oxirgi segment + uning audio uzunligi
    last = seg_data[-1]
    natural_end_ms = last["start_ms"] + len(last["audio"])
    original_end_ms = last["end_ms"]
    total_ms = max(natural_end_ms, original_end_ms) + 200  # 200ms buffer

    combined = AudioSegment.silent(duration=total_ms, frame_rate=_FRAME_RATE)

    # 4. Har segmentni asl boshlanish vaqtiga qo'yish
    for item in seg_data:
        combined = combined.overlay(item["audio"], position=item["start_ms"])

    merged_path = str(output_path / "dubbed_audio.wav")
    combined.set_frame_rate(_FRAME_RATE).export(merged_path, format="wav")
    return merged_path


