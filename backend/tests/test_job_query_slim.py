"""GET /api/jobs/{id} va GET /api/jobs (dashboard) og'ir, javobda ishlatilmaydigan
ustunlarni yuklamasligi kerak (routes._JOB_RESPONSE_DEFERRED). Haqiqiy tugagan
job'da o'lchandi: bu ustunlar bilan yo'l ~100 so'rov/s da to'yinardi, 404 yo'li
esa 690+ da. Bazaga ulanmaydi -- SQL kompilyatsiya qilinib tekshiriladi."""
import inspect
import re
import unittest
import uuid

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from backend.api import routes
from backend.models.database import DubbingJob

HEAVY = ("srt_content", "transcript_segments", "translated_segments", "speech_segments", "segment_qa")


def _select_columns() -> str:
    stmt = select(DubbingJob).options(*routes._JOB_RESPONSE_DEFERRED).where(DubbingJob.id == uuid.uuid4())
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    return sql.split(" FROM ")[0]


class TestJobQuerySlim(unittest.TestCase):
    def test_heavy_columns_are_not_selected(self):
        cols = _select_columns()
        for name in HEAVY:
            # "dubbing_jobs.srt_content" -- "uzbek_srt_content" bilan adashmaslik uchun nuqtali shakl
            self.assertNotIn(f"dubbing_jobs.{name}", cols, f"{name} yuklanmasligi kerak")

    def test_columns_the_response_needs_are_still_selected(self):
        cols = _select_columns()
        for name in ("status", "transcript_text", "translated_text", "uzbek_srt_content",
                     "original_video_path", "updated_at", "created_at", "status_message", "progress"):
            self.assertIn(f"dubbing_jobs.{name}", cols, f"{name} kerak")

    def test_job_to_response_never_reads_a_deferred_column(self):
        """Agar kimdir _job_to_response'ga deferred ustunni qo'shsa, har so'rovda
        yashirin qo'shimcha SELECT (lazy load) boshlanadi -- shuni ushlaymiz."""
        used = set(re.findall(r"\bjob\.(\w+)", inspect.getsource(routes._job_to_response)))
        self.assertFalse(used & set(HEAVY), f"_job_to_response deferred ustun ishlatyapti: {used & set(HEAVY)}")


if __name__ == "__main__":
    unittest.main()
