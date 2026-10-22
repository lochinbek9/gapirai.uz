import unittest
from backend.services.merger import _build_audio_filtergraph, _build_dubbed_only_filtergraph


class TestMerger(unittest.TestCase):
    def test_dubbed_only_filtergraph_contains_atrim_and_apad(self):
        fg = _build_dubbed_only_filtergraph(target_dur=199.3)
        self.assertIn("atrim=0:199.300", fg)
        self.assertIn("apad=whole_dur=199.300", fg)

    def test_ducked_mix_filtergraph_contains_atrim_and_apad(self):
        fg = _build_audio_filtergraph(target_dur=201.8, audio_mix_mode="ducked_mix")
        self.assertIn("atrim=0:201.800", fg)
        self.assertIn("apad=whole_dur=201.800", fg)


if __name__ == "__main__":
    unittest.main()
