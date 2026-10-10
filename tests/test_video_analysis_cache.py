"""backend/services/video_analysis.py:find_cached_analysis/clone_analysis_for_user
uchun testlar -- 2026-08-25 audit: VideoAnalysis'da video-darajasidagi
kesh umuman yo'q edi, har so'rov (boshqa foydalanuvchi allaqachon aynan
shu videoni tahlil qilgan bo'lsa ham) mustaqil yuklab olish/transkripsiya/
LLM chaqiruvlarini takrorlardi."""
import unittest
import uuid
from unittest.mock import MagicMock

from backend.models.database import VideoAnalysis, AnalysisStatus
from backend.services.video_analysis import find_cached_analysis, clone_analysis_for_user


def _make_completed_analysis(**overrides) -> VideoAnalysis:
    defaults = dict(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        youtube_url="https://www.youtube.com/watch?v=abc12345678",
        youtube_video_id="abc12345678",
        video_title="Test video",
        video_duration=120.0,
        video_thumbnail=None,
        language="uz",
        video_language="en",
        status=AnalysisStatus.COMPLETED,
        transcript_segments=[{"start": 0.0, "end": 5.0, "text": "hello"}],
        summary={"short": "s", "medium": "m", "detailed": "d"},
        key_points=[{"title": "t", "description": "d", "timestamp": 1.0}],
        chapters=[{"title": "c", "start": 0.0, "end": 5.0}],
        five_minute_summary={"title": "5min"},
        notes="# notes",
        quiz=[{"question": "q", "options": ["a", "b"], "correct_answer": 0, "explanation": "e", "timestamp": 1.0}],
        bilingual_segments=None,
        qa_history=[{"question": "old question", "answer": "old answer", "timestamps": [], "asked_at": "x"}],
    )
    defaults.update(overrides)
    return VideoAnalysis(**defaults)


def _mock_cache_query(db, result):
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = result


class TestFindCachedAnalysis(unittest.TestCase):
    def test_no_video_id_returns_none_without_querying(self):
        db = MagicMock()
        self.assertIsNone(find_cached_analysis(db, None, "uz"))
        db.query.assert_not_called()

    def test_original_language_returns_none_without_querying(self):
        """"original" tahlil tili faqat transkripsiyadan KEYIN hal bo'ladi --
        kesh qidiruvi paytida (transkripsiyagacha) hali qaysi tilga
        moslashini bilib bo'lmaydi, shuning uchun kesh ataylab o'tkazib
        yuboriladi."""
        db = MagicMock()
        self.assertIsNone(find_cached_analysis(db, "abc12345678", "original"))
        db.query.assert_not_called()

    def test_match_found_returns_it(self):
        db = MagicMock()
        cached = _make_completed_analysis()
        _mock_cache_query(db, cached)
        result = find_cached_analysis(db, "abc12345678", "uz")
        self.assertIs(result, cached)

    def test_no_match_returns_none(self):
        db = MagicMock()
        _mock_cache_query(db, None)
        result = find_cached_analysis(db, "abc12345678", "uz")
        self.assertIsNone(result)


class TestCloneAnalysisForUser(unittest.TestCase):
    def test_clone_copies_expensive_fields_but_not_qa_history(self):
        db = MagicMock()
        cached = _make_completed_analysis()
        new_user_id = uuid.uuid4()

        clone_analysis_for_user(db, cached, new_user_id)

        # db.add() ga uzatilgan yangi VideoAnalysis obyektini tekshiramiz
        added = db.add.call_args[0][0]
        self.assertEqual(added.user_id, new_user_id)
        self.assertEqual(added.status, AnalysisStatus.COMPLETED)
        self.assertEqual(added.progress, 100.0)
        # Qimmat maydonlar ko'chirilgan
        self.assertEqual(added.transcript_segments, cached.transcript_segments)
        self.assertEqual(added.summary, cached.summary)
        self.assertEqual(added.five_minute_summary, cached.five_minute_summary)
        self.assertEqual(added.notes, cached.notes)
        self.assertEqual(added.quiz, cached.quiz)
        # qa_history shaxsiy -- yangi qatorda BO'SH boshlanishi kerak,
        # asl (boshqa foydalanuvchining) savol-javob tarixi ko'chmasligi kerak.
        self.assertEqual(added.qa_history, [])
        db.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
