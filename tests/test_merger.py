"""
Unit tests for backend/services/merger.py
"""
import pytest
from unittest.mock import patch, MagicMock
from backend.services.merger import (
    _build_audio_filtergraph,
    _build_dubbed_only_filtergraph,
    _has_audio_stream,
)


def test_build_audio_filtergraph_dubbed_only():
    fg = _build_audio_filtergraph(target_dur=10.0, audio_mix_mode="dubbed_only")
    assert "[0:a]" not in fg
    assert "[1:a]" in fg
    assert "[final]" in fg


def test_build_audio_filtergraph_no_orig_audio():
    fg = _build_audio_filtergraph(target_dur=15.0, audio_mix_mode="ducked_mix", has_orig_audio=False)
    assert "[0:a]" not in fg
    assert "[1:a]" in fg
    assert "[final]" in fg


def test_build_audio_filtergraph_with_orig_audio():
    fg = _build_audio_filtergraph(target_dur=20.0, audio_mix_mode="ducked_mix", has_orig_audio=True)
    assert "[0:a]" in fg
    assert "[1:a]" in fg
    assert "[final]" in fg


def test_has_audio_stream():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="aac\n", returncode=0)
        assert _has_audio_stream("test.mp4") is True

    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="", returncode=0)
        assert _has_audio_stream("silent.mp4") is False
