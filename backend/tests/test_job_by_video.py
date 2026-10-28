"""GET /api/jobs/by-video/{video_id} -- Chrome kengaytmasi uchun.

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_job_by_video
"""
import unittest
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api import routes
from backend.models.database import Base, DubbingJob, JobStatus, User


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


VID = "dQw4w9WgXcQ"


class JobByVideoTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in ("users", "video_analyses", "dubbing_jobs")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()
        self.user = self.make_user()
        self.t0 = datetime(2026, 10, 1)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_user(self):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", is_verified=True)
        self.db.add(u)
        self.db.commit()
        return u

    def job(self, status, minutes=0, user=None, video=VID, **kw):
        j = DubbingJob(id=uuid.uuid4(), user_id=(user or self.user).id, youtube_url=f"https://youtu.be/{video}",
                       youtube_video_id=video, status=status, created_at=self.t0 + timedelta(minutes=minutes), **kw)
        self.db.add(j)
        self.db.commit()
        return str(j.id)

    def lookup(self, video=VID):
        return routes.get_job_for_youtube_video(video, db=self.db, current_user=self.user)["job"]

    def test_prefers_completed_over_newer_in_progress(self):
        done = self.job(JobStatus.COMPLETED, minutes=1)
        self.job(JobStatus.TRANSLATING, minutes=5)
        self.assertEqual(self.lookup().job_id, done)

    def test_in_progress_when_nothing_finished(self):
        running = self.job(JobStatus.SYNTHESIZING, minutes=2)
        self.job(JobStatus.FAILED, minutes=3)
        self.assertEqual(self.lookup().job_id, running)

    def test_ignores_failed_subtitle_preview_payment_and_other_users(self):
        self.job(JobStatus.FAILED)
        self.job(JobStatus.AWAITING_PAYMENT)
        self.job(JobStatus.COMPLETED, subtitle_only=True)
        self.job(JobStatus.COMPLETED, is_preview=True)
        self.job(JobStatus.COMPLETED, user=self.make_user())
        self.job(JobStatus.COMPLETED, video="aaaaaaaaaaa")
        self.assertIsNone(self.lookup())

    def test_rejects_malformed_video_id(self):
        with self.assertRaises(HTTPException) as e:
            self.lookup("../../etc")
        self.assertEqual(e.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
