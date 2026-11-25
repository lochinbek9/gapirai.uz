import json
import math
import subprocess

import pytest

from backend.services import dub_options, merger, speaker_voices, synthesizer, vocals
from backend.services.gemini_quota_manager import REQUEST_OVERRIDE, sanitize_override


def test_override_accepts_new_modes_and_tags_them():
    ov = sanitize_override(mix="vocal", voices="two")
    assert ov == {"mix": "vocal", "voices": "two"}
    assert dub_options.tag(ov) == "vocal,two"
    assert sanitize_override(mix="x", voices="3") is None
    token = REQUEST_OVERRIDE.set(None)
    try:
        assert dub_options.requested_tag() is None
    finally:
        REQUEST_OVERRIDE.reset(token)


def test_speech_intervals_pad_and_merge():
    segs = [{"start": 1, "end": 2, "text": "a"}, {"start": 2.3, "end": 3, "text": "b"},
            {"start": 10, "end": 11, "text": "c"}, {"start": 20, "end": 21, "text": " "}]
    assert vocals.speech_intervals(segs) == [(0.75, 3.25), (9.75, 11.25)]


def test_voices_follow_gender_and_groups_do_not_cross_it():
    segs = [{"id": 1, "start": 0, "end": 1, "text": "salom", "gender": "male"},
            {"id": 2, "start": 1.1, "end": 2, "text": "dunyo", "gender": "female"}]
    assert len(synthesizer.group_segments_into_sentences(segs)) == 2
    out = speaker_voices.assign_voices(segs, "male", "Fenrir", lambda g: "Autonoe")
    assert [s["voice"] for s in out] == ["Fenrir", "Autonoe"]


def test_parse_labels_and_pitch():
    assert speaker_voices.parse_labels('```json\n{"0":"m","1":"female","x":"f","2":"?"}\n```') == {0: "male", 1: "female"}
    np = pytest.importorskip("numpy")
    t = np.arange(16000) / 16000
    assert speaker_voices.pitch_gender((0.3 * np.sin(2 * math.pi * 120 * t)).astype("float32")) == "male"
    assert speaker_voices.pitch_gender((0.3 * np.sin(2 * math.pi * 220 * t)).astype("float32")) == "female"
    assert speaker_voices.pitch_gender(np.zeros(16000, dtype="float32")) is None


def _tone(path, freq, seconds=3):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}",
                    "-ar", "44100", "-ac", "2", str(path)], check=True)


def test_background_replaces_only_speech_and_merges(tmp_path):
    np = pytest.importorskip("numpy")
    sf = pytest.importorskip("soundfile")
    video = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=s=256x144:d=3", "-f", "lavfi", "-i",
                    "sine=frequency=300:duration=3", "-shortest", "-c:v", "libx264", "-c:a", "aac", str(video)], check=True)

    def silent(chunk, out_dir):
        data, rate = sf.read(str(chunk))
        target = tmp_path / "silent.wav"
        sf.write(str(target), np.zeros_like(data), rate)
        return target

    bg = vocals.build_background(str(video), [{"start": 1.0, "end": 2.0, "text": "a"}], str(tmp_path / "bg.wav"), silent)
    data, rate = sf.read(bg)
    level = lambda a, b: float(np.abs(data[int(a * rate):int(b * rate)]).max())
    assert level(1.1, 1.9) < 0.001 and level(0.1, 0.6) > 0.05 and level(2.4, 2.9) > 0.05

    _tone(tmp_path / "dub.wav", 600)
    for watermark in (True, False):
        out = merger.merge_video_audio(str(video), str(tmp_path / "dub.wav"), str(tmp_path / f"o{watermark}.mp4"),
                                       watermark=watermark, background_path=bg)
        probe = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "stream=codec_type", "-of", "json", out],
                               capture_output=True, text=True).stdout
        assert {s["codec_type"] for s in json.loads(probe)["streams"]} == {"video", "audio"}
