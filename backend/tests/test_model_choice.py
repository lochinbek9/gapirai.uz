"""BYOK egasining model/ovoz tanlovi endpoint va navbatgacha yetib boradi."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend.api.gemini_override_dep import capture_gemini_override
from backend.services import gemini_quota_manager as gqm
from backend.services.auth import get_current_user


class ModelChoiceTest(unittest.TestCase):
    def _seen(self, role):
        app = FastAPI()
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(role=role)

        @app.get("/x", dependencies=[Depends(capture_gemini_override)])
        def endpoint():  # sinxron endpoint ham tanlovni ko'rishi kerak
            return gqm.REQUEST_OVERRIDE.get()

        headers = {"X-Gemini-Model": gqm.GEMINI_TEXT_MODELS[1], "X-Tts-Choice": "edge", "X-Stt-Choice": "groq"}
        return TestClient(app).get("/x", headers=headers).json()

    def test_admin_choice_reaches_endpoint(self):
        self.assertEqual(self._seen("admin"), {"model": gqm.GEMINI_TEXT_MODELS[1], "tts": "edge", "stt": "groq"})

    def test_saved_choice_loads_without_tier_and_model(self):
        saved = {}
        redis = SimpleNamespace(set=lambda k, v, ex=None: saved.__setitem__(k, v), get=saved.get)
        with patch.object(gqm, "_get_redis", return_value=redis):
            gqm.save_job_gemini_override("j1", {"stt": "gapi", "llm": "neuronai"})
            self.assertEqual(gqm.load_job_gemini_override("j1"), {"stt": "gapi", "llm": "neuronai"})

    def test_unknown_values_dropped(self):
        self.assertEqual(gqm.sanitize_override(None, None, "system", "groq", "yoq"), {"stt": "groq"})

    def test_chosen_providers_are_strict(self):
        from backend.services import synthesizer, transcriber, translator
        gqm.activate_gemini_override({"stt": "gemini", "llm": "neuronai", "tts": "edge"})
        self.addCleanup(gqm.deactivate_gemini_override)
        self.assertEqual(transcriber._transcribe_provider_order("groq"), ["gemini"])
        self.assertFalse(synthesizer._free_tts("edge"))
        with patch.object(translator, "_translate_chunk_neuronai", return_value=["ok"]), \
             patch.object(translator, "_translate_chunk_groq") as groq:
            self.assertEqual(translator._translate_chunk([{"id": 1, "text": "hi"}]), ["ok"])
        groq.assert_not_called()

    def test_others_ignored(self):
        self.assertIsNone(self._seen("user"))


if __name__ == "__main__":
    unittest.main()
