"""Worker uzoq TTS/STT davomida DB tranzaksiyasini ochiq qoldirmasligi
(2026-10-24): "idle in transaction" sessiya dubbing_jobs'dagi ALTER TABLE'ni
to'sib qo'yardi. DB'ga murojaat qilmaydi."""
import unittest
from unittest.mock import MagicMock

from backend.workers import tasks


class TestReleaseReadTx(unittest.TestCase):
    def test_commits_to_end_transaction(self):
        db = MagicMock()
        tasks._release_read_tx(db)
        db.commit.assert_called_once()
        db.rollback.assert_not_called()

    def test_rolls_back_if_commit_fails(self):
        db = MagicMock()
        db.commit.side_effect = RuntimeError("connection lost")
        tasks._release_read_tx(db)  # pipeline'ni yiqitmasligi kerak
        db.rollback.assert_called_once()

    def test_pipeline_session_does_not_expire_on_commit(self):
        # expire_on_commit=True bo'lsa har commit'dan keyingi job.xxx o'qilishi
        # yashirin SELECT bilan yangi tranzaksiya ochadi. process_video'ni
        # chaqirmaymiz (xato yo'li adminlarga xabar va Celery retry yuboradi).
        import inspect
        src = inspect.getsource(tasks.process_video.run)
        self.assertIn("SessionLocal(expire_on_commit=False)", src)

    def test_long_calls_are_preceded_by_tx_release(self):
        import inspect
        lines = [l.strip() for l in inspect.getsource(tasks.process_video.run).splitlines()]
        for call in (
            "download_result = downloader.download_video(",
            "translated_segments = translator.translate_segments(",
            "dubbed_audio_path, actual_timings, qa_results = synthesizer.synthesize_segments(",
            "merger.merge_video_audio(",
        ):
            idx = next(i for i, l in enumerate(lines) if l.startswith(call))
            self.assertEqual(lines[idx - 1], "_release_read_tx(db)", call)

if __name__ == "__main__":
    unittest.main()
