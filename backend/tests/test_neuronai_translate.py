"""NeuronAI LLM tarjimasi (backend/services/translator.py, neuronai_llm.py)."""
import json
import unittest
from unittest.mock import MagicMock, patch

from backend.services import neuronai_llm, translator
from backend.services.translator import settings

SEGS = [{"id": 1, "start": 0.0, "end": 2.0, "text": "Hello"}, {"id": 2, "start": 2.0, "end": 4.0, "text": "Step 2."}]
UZ = {"segments": [{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom"}, {"id": 2, "start": 2.0, "end": 4.0, "text": "Ikkinchi qadam."}]}


class NeuronAITranslateTest(unittest.TestCase):
    def setUp(self):
        for name, value in (("NEURONAI_API_KEY", "nai_test"), ("NEURONAI_TRANSLATE_ENABLED", True), ("TRANSLATE_PROVIDER", "gemini")):
            p = patch.object(settings, name, value)
            p.start()
            self.addCleanup(p.stop)

    def test_neuronai_used_first(self):
        with patch.object(neuronai_llm, "chat_json", return_value=UZ) as chat, \
             patch.object(translator, "_translate_chunk_gemini") as gemini:
            out = translator._translate_chunk(SEGS)
        self.assertEqual([s["text"] for s in out], ["Salom", "Ikkinchi qadam."])
        self.assertEqual([s["start"] for s in out], [0.0, 2.0])
        self.assertEqual(chat.call_args.args[0][0]["content"], translator.SYSTEM_PROMPT)
        gemini.assert_not_called()

    def test_failure_falls_back_to_existing_chain(self):
        with patch.object(neuronai_llm, "chat_json", side_effect=RuntimeError("402 insufficient_balance")), \
             patch.object(translator, "_translate_chunk_gemini", return_value=SEGS) as gemini:
            self.assertEqual(translator._translate_chunk(SEGS), SEGS)
        gemini.assert_called_once()

    def test_disabled_flag_keeps_old_behaviour(self):
        with patch.object(settings, "NEURONAI_TRANSLATE_ENABLED", False), \
             patch.object(neuronai_llm, "chat_json") as chat, \
             patch.object(translator, "_translate_chunk_gemini", return_value=SEGS):
            translator._translate_chunk(SEGS)
        chat.assert_not_called()


class ChatJsonTest(unittest.TestCase):
    def test_json_is_extracted_from_surrounding_text(self):
        resp = MagicMock()
        resp.choices = [MagicMock(message=MagicMock(content="Mana:\n" + json.dumps(UZ) + "\nTayyor."))]
        resp.usage = MagicMock(prompt_tokens=1000, completion_tokens=500)
        client = MagicMock()
        client.chat.completions.create.return_value = resp
        with patch.object(neuronai_llm, "_get_client", return_value=client):
            self.assertEqual(neuronai_llm.chat_json([{"role": "user", "content": "x"}]), UZ)
        kwargs = client.chat.completions.create.call_args.kwargs
        self.assertEqual(kwargs["model"], settings.NEURONAI_LLM_MODEL)
        self.assertEqual(kwargs["response_format"], {"type": "json_object"})

    def test_no_json_raises(self):
        resp = MagicMock()
        resp.choices = [MagicMock(message=MagicMock(content="kechirasiz"))]
        resp.usage = None
        client = MagicMock()
        client.chat.completions.create.return_value = resp
        with patch.object(neuronai_llm, "_get_client", return_value=client):
            with self.assertRaises(ValueError):
                neuronai_llm.chat_json([])


if __name__ == "__main__":
    unittest.main()
