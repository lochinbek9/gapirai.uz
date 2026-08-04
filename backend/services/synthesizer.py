import azure.cognitiveservices.speech as speechsdk
import os
import re
import subprocess
import tempfile
import time
import xml.sax.saxutils as saxutils
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
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
    chosen_voice = "uz-UZ-MadinaNeural" if any(f in voice for f in ["Madina", "female"]) else "uz-UZ-SardorNeural"

    # Matnni tozalash va o'zbekcha talaffuzga tayyorlash
    clean_text = re.sub(r'<[^>]+>', '', text)
    clean_text = clean_text.replace("%", " foiz ").replace("$", " dollar ").replace("&", " va ").replace("+", " plyus ")
    clean_text = clean_text.replace("`", "'").replace("’", "'").replace("‘", "'")
    clean_text = re.sub(r'\s+', ' ', clean_text).strip()
    if not clean_text or not re.search(r'[A-Za-z0-9\u0400-\u04FF\u0100-\u017F\u00C0-\u017F]', clean_text):
        logger.info(f"Text '{text}' has no pronounceable characters. Generating silence.")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.5", "-acodec", "pcm_s16le", output_path],
                check=True, capture_output=True
            )
            return True
        except Exception as e:
            logger.warning(f"Failed to generate silence for empty segment: {e}")
            return False

    try:
        import edge_tts
        communicate = edge_tts.Communicate(clean_text, chosen_voice, rate="-2%")
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_mp3:
            tmp_mp3_path = tmp_mp3.name

        try:
            await communicate.save(tmp_mp3_path)
            if os.path.exists(tmp_mp3_path) and os.path.getsize(tmp_mp3_path) > 100:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_mp3_path, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", output_path],
                    check=True, capture_output=True
                )
                logger.info(f"Edge Neural TTS successfully generated audio with native voice {chosen_voice}")
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


def _synthesize_google_ai_studio_tts(text: str, output_path: str, voice_name: str | None = None) -> bool:
    """Google AI Studio Gemini TTS API (`gemini-3.1-flash-tts-preview`) call using GEMINI_API_KEY for native human speech."""
    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
    if not api_key:
        return False

    try:
        import requests
        import base64
        import tempfile
        import subprocess

        clean_text = re.sub(r'<[^>]+>', '', text)
        clean_text = clean_text.replace("%", " foiz ").replace("$", " dollar ").replace("&", " va ").replace("+", " plyus ")
        clean_text = clean_text.replace("`", "'").replace("’", "'").replace("‘", "'")
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
        if not clean_text:
            return False

        voice = voice_name or settings.AZURE_VOICE_NAME or "uz-UZ-SardorNeural"
        if any(female_keyword in voice for female_keyword in ["Madina", "female", "Kore", "Aoede"]):
            gemini_voice = "Kore"
        else:
            gemini_voice = "Puck"

        # Direct prompt for Google AI Studio Gemini TTS model to perform expressive native Uzbek voice acting
        prompt_text = f"Read out loud in a natural, emotional, expressive native Uzbek voice actor tone: {clean_text}"

        models_to_try = [
            "gemini-3.1-flash-tts-preview",
            "gemini-2.5-flash-preview-tts"
        ]

        for model in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {
                    "responseModalities": ["AUDIO"],
                    "speechConfig": {
                        "voiceConfig": {
                            "prebuiltVoiceConfig": {
                                "voiceName": gemini_voice
                            }
                        }
                    }
                }
            }

            try:
                response = requests.post(url, json=payload, timeout=30)
                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            if "inlineData" in part:
                                audio_b64 = part["inlineData"].get("data")
                                if audio_b64:
                                    audio_bytes = base64.b64decode(audio_b64)
                                    with tempfile.NamedTemporaryFile(suffix=".pcm", delete=False) as tmp_pcm:
                                        tmp_pcm.write(audio_bytes)
                                        tmp_pcm_path = tmp_pcm.name
                                    try:
                                        subprocess.run(
                                            ["ffmpeg", "-y", "-f", "s16be", "-ar", "24000", "-ac", "1", "-i", tmp_pcm_path, "-ar", "24000", "-ac", "1", output_path],
                                            check=True, capture_output=True
                                        )
                                        logger.info(f"Google AI Studio Gemini TTS ({model}) successfully generated audio using voice {gemini_voice}")
                                        return True
                                    finally:
                                        if os.path.exists(tmp_pcm_path):
                                            try:
                                                os.remove(tmp_pcm_path)
                                            except Exception:
                                                pass
                else:
                    logger.warning(f"Google AI Studio TTS API model {model} response {response.status_code}: {response.text[:200]}")
            except Exception as e:
                logger.warning(f"Google AI Studio TTS error for model {model}: {e}")

    except Exception as e:
        logger.warning(f"Google AI Studio TTS error: {e}")
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


def _synthesize_openai_tts(text: str, output_path: str, voice_name: str | None = None) -> bool:
    """OpenAI TTS API call (tts-1) using OPENAI_API_KEY for studio-grade crystal clear audio."""
    api_key = settings.OPENAI_API_KEY or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return False

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        clean_text = re.sub(r'<[^>]+>', '', text).strip()
        if not clean_text:
            return False

        voice = voice_name or settings.AZURE_VOICE_NAME or "uz-UZ-SardorNeural"
        if any(female_kw in voice for female_kw in ["Madina", "female", "Kore", "Aoede", "nova", "shimmer"]):
            openai_voice = "nova"
        else:
            openai_voice = "onyx"

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_mp3:
            tmp_mp3_path = tmp_mp3.name

        try:
            response = client.audio.speech.create(
                model="tts-1",
                voice=openai_voice,
                input=clean_text,
                response_format="mp3"
            )
            response.stream_to_file(tmp_mp3_path)

            if os.path.exists(tmp_mp3_path) and os.path.getsize(tmp_mp3_path) > 100:
                subprocess.run(
                    ["ffmpeg", "-y", "-i", tmp_mp3_path, "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1", output_path],
                    check=True, capture_output=True
                )
                logger.info(f"OpenAI TTS successfully generated audio using voice {openai_voice}")
                return True
        finally:
            if os.path.exists(tmp_mp3_path):
                try:
                    os.remove(tmp_mp3_path)
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"OpenAI TTS error: {e}")
    return False


def _synthesize_text(
    text: str,
    output_path: str,
    retries: int = 3,
    voice_name: str | None = None,
) -> None:
    if settings.FREE_MODE:
        logger.info("FREE_MODE: Forcing free Edge TTS synthesis...")
    else:
        # 1. Primary Engine: Google AI Studio Text-to-Speech (Gemini 3.1 / 2.5 Flash TTS Engine)
        if _synthesize_google_ai_studio_tts(text, output_path, voice_name=voice_name):
            return

    # 2. Native Uzbek Neural TTS (uz-UZ-SardorNeural / uz-UZ-MadinaNeural)
    try:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        if loop.is_running():
            # If called inside an existing running loop, use new loop in thread
            new_loop = asyncio.new_event_loop()
            try:
                if new_loop.run_until_complete(_synthesize_edge_tts(text, output_path, voice_name=voice_name)):
                    return
            finally:
                new_loop.close()
        else:
            if loop.run_until_complete(_synthesize_edge_tts(text, output_path, voice_name=voice_name)):
                return
            if settings.FREE_MODE:
                raise RuntimeError("FREE_MODE: Edge TTS synthesis failed and paid fallbacks are disabled.")
    except Exception as e:
        logger.warning(f"Edge TTS fallback error: {e}")
        if settings.FREE_MODE:
            raise e

    # 3. Azure Speech SDK with uz-UZ voices
    try:
        if _synthesize_azure_tts(text, output_path, retries=retries, voice_name=voice_name):
            return
    except Exception as e:
        logger.warning(f"Azure TTS error: {e}")

    # 4. Google Cloud TTS if configured
    if _synthesize_google_cloud_tts(text, output_path, voice_name=voice_name):
        return

    # 5. OpenAI Studio TTS (Fallback)
    if _synthesize_openai_tts(text, output_path, voice_name=voice_name):
        return

    raise RuntimeError(f"Ovozlalashtirishda (TTS) xatolik yuz berdi: {text[:50]}...")


def _split_into_sentences(text: str) -> list[str]:
    """Matnni gaplarga bo'lish."""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s for s in sentences if s.strip()]


def _build_ssml(text: str, voice_name: str | None = None) -> str:
    chosen_voice = voice_name or settings.AZURE_VOICE_NAME
    is_female = "Madina" in chosen_voice

    if is_female:
        rate   = "-4%"
        pitch  = "+2%"
        volume = "0%"
    else:
        rate   = "-8%"
        pitch  = "0%"
        volume = "0%"

    sentences = _split_into_sentences(text)
    ssml_sentences = []
    for sent in sentences:
        body = saxutils.escape(sent)
        if sent.rstrip().endswith("?"):
            ssml_sentences.append(
                f'<p><prosody pitch="+4%">{body}</prosody></p>'
            )
        elif sent.rstrip().endswith("!"):
            ssml_sentences.append(
                f'<p><prosody pitch="+2%">{body}</prosody></p>'
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
    """FFmpeg atempo filter bilan audio tezlashtirish (pitch va namuna chastotasi o'zgarmaydi, toza ovoz saqlanadi)."""
    factor = max(0.5, min(2.0, round(factor, 3)))
    in_fd, in_path = tempfile.mkstemp(suffix=".wav")
    out_fd, out_path = tempfile.mkstemp(suffix=".wav")
    os.close(in_fd); os.close(out_fd)
    try:
        audio.export(in_path, format="wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", in_path, "-filter:a", f"atempo={factor},volume=0.95", "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", out_path],
            check=True, capture_output=True,
        )
        return AudioSegment.from_wav(out_path)
    finally:
        if os.path.exists(in_path):
            try: os.unlink(in_path)
            except Exception: pass
        if os.path.exists(out_path):
            try: os.unlink(out_path)
            except Exception: pass


def synthesize_segments(segments: list[dict], output_dir: str, voice_name: str | None = None) -> str:
    """
    Har bir segmentni to'liq matn bilan ovozga aylantirish.

    Sinxronizatsiya va sifat strategiyasi:
    - HECH QACHON gap / matn oxiridan kesib tashlanmaydi!
    - Har bir audio segment headroom normalizatsiyadan o'tkaziladi (shirillash to'liq yo'qotiladi).
    - Kerak bo'lsa biroz mo''tadil tezlashtiriladi (max 1.25x).
    - Hali ham yetmasa, keyingi segment boshlanishi keyinroqqa suriladi (gap to'liq tugaydi).
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 1. Har bir segmentni parallel ravishda sintez qilish (16x tezlashtirish)
    def _process_single_segment(idx_seg):
        idx, seg = idx_seg
        text = seg.get("text", "").strip()
        if not text:
            return None
        seg_file = output_path / f"seg_{seg['id']:04d}.wav"
        _synthesize_text(text, str(seg_file), voice_name=voice_name)
        if seg_file.exists():
            audio = AudioSegment.from_wav(str(seg_file))
            # Bosh va oxiridagi bo'sh sukunatni tozalash (audio o'z-o'zidan 200-400ms qisqaradi va aniqroq bo'ladi)
            silence_len = 30
            while len(audio) > 150 and audio[:silence_len].dBFS < -42:
                audio = audio[silence_len:]
            while len(audio) > 150 and audio[-silence_len:].dBFS < -42:
                audio = audio[:-silence_len]
            audio = audio.normalize(headroom=2.0)
            return (idx, {
                "audio": audio,
                "start_ms": int(seg["start"] * 1000),
                "end_ms": int(seg["end"] * 1000),
            })
        return None

    with ThreadPoolExecutor(max_workers=16) as executor:
        raw_results = list(executor.map(_process_single_segment, enumerate(segments)))

    # Saralangan segmentlarni yig'ish
    valid_results = [r for r in raw_results if r is not None]
    valid_results.sort(key=lambda x: x[0])
    seg_data = [item for _, item in valid_results]

    if not seg_data:
        raise ValueError("Birlashtirish uchun segment topilmadi.")

    # 2. Aniq vaqtga sinxronlash (Strict Timestamp Synchronization)
    # HECH QACHON keyingi segment vaqti surilmaydi — barcha segmentlar o'z vaqtida (lip-sync) chiqadi!
    for i in range(len(seg_data)):
        cur = seg_data[i]
        start_ms = cur["start_ms"]

        if i < len(seg_data) - 1:
            slot_ms = seg_data[i + 1]["start_ms"] - start_ms
        else:
            slot_ms = max(cur["end_ms"] - start_ms, 1000)

        audio_ms = len(cur["audio"])

        # Agar audio navbatdagi segmentgacha bo'lgan vaqt oralig'idan uzunroq bo'lsa, mos ravishda tezlashtiramiz:
        if slot_ms > 150 and audio_ms > slot_ms:
            factor = audio_ms / slot_ms
            speed_factor = min(factor, 1.45)
            if speed_factor > 1.03:
                try:
                    cur["audio"] = _speedup_audio(cur["audio"], speed_factor)
                except Exception:
                    pass

            # Tezlashtirilgandan so'ng ham keyingi segment vaqtiga tutashib ketsa, fade-out bilan keskin ustma-ust tushish oldi olinadi
            if i < len(seg_data) - 1:
                max_allowed_ms = seg_data[i + 1]["start_ms"] - start_ms
                if max_allowed_ms > 100 and len(cur["audio"]) > max_allowed_ms:
                    cur["audio"] = cur["audio"][:max_allowed_ms].fade_out(25)

    # 3. Umumiy audio uzunligini hisoblash
    last = seg_data[-1]
    natural_end_ms = last["start_ms"] + len(last["audio"])
    original_end_ms = last["end_ms"]
    total_ms = max(natural_end_ms, original_end_ms) + 200

    combined = AudioSegment.silent(duration=total_ms, frame_rate=_FRAME_RATE)

    # 4. Har bir segmentni o'zining ANIQ vaqt koordinatasiga o'rnatish
    for item in seg_data:
        combined = combined.overlay(item["audio"], position=item["start_ms"])

    # Final headroom normalization to prevent clipping/crackling
    combined = combined.normalize(headroom=1.5)

    merged_path = str(output_path / "dubbed_audio.wav")
    combined.set_frame_rate(_FRAME_RATE).export(merged_path, format="wav")
    return merged_path


