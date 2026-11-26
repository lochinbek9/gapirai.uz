"""Gapi tanlovi: yangi ish, admin qayta urinishi va STT tizim kaliti (tarmoqsiz)."""
from types import SimpleNamespace
from unittest.mock import patch

from backend.api.routes import RegenerateJobRequest, _apply_admin_retry_choice
from backend.services import gapi_stt, gemini_quota_manager as gqm, plans


def _cfg(default: bool, key: str = "k"):
    return SimpleNamespace(GAPI_TTS_DEFAULT=default, GAPI_API_KEY=key)


def test_requested_provider():
    with patch("backend.config.get_settings", return_value=_cfg(True)):
        assert plans.requested_tts_provider("edge") == "gapi"
    with patch("backend.config.get_settings", return_value=_cfg(False)):
        assert plans.requested_tts_provider("gapi") == "gapi"
        assert plans.requested_tts_provider("nope") == "gemini"
    with patch("backend.config.get_settings", return_value=_cfg(False, "")):
        assert plans.requested_tts_provider("gapi") == "gemini"


def test_admin_retry_choice_is_saved():
    payload = RegenerateJobRequest(tts_provider="edge", stt_provider="gapi", reuse_transcript=False,
                                   translation_model="qwen/qwen3", reuse_translation=True)
    with patch.object(gqm, "load_job_gemini_override", return_value={"llm": "gemini", "mix": "vocal"}), \
         patch.object(gqm, "save_job_gemini_override") as save:
        token = gqm.REQUEST_OVERRIDE.set(None)
        try:
            _apply_admin_retry_choice("j", payload)
        finally:
            gqm.REQUEST_OVERRIDE.reset(token)
    assert save.call_args.args[1] == {"tts": "edge", "stt": "gapi", "llm": "gemini", "mix": "vocal"}


def test_stt_uses_system_key():
    with patch("backend.config.get_settings", return_value=_cfg(False, "sys")):
        assert gapi_stt.keys() == ["sys"]
