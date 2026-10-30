"""GET /api/jobs/{id} -- ulashilgan havola (Unlisted) qoidalari.

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_job_share_access
"""
import unittest
import uuid
from unittest.mock import patch

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


class JobShareAccessTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in ("users", "video_analyses", "dubbing_jobs")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()
        self.owner, self.friend = self.user(), self.user()
        # Video fayl tekshiruvi va admin tekshiruvi bu test uchun ahamiyatsiz
        for target, value in (("backend.services.job_recovery.is_output_video_missing", False),
                              ("backend.services.plans.is_user_admin", False)):
            p = patch(target, return_value=value)
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def user(self):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", is_verified=True)
        self.db.add(u)
        self.db.commit()
        return u

    def job(self, status):
        j = DubbingJob(id=uuid.uuid4(), user_id=self.owner.id, youtube_url="https://youtu.be/dQw4w9WgXcQ",
                       status=status, transcript_text="secret source", rating=5)
        self.db.add(j)
        self.db.commit()
        return j.id

    def get(self, job_id, viewer):
        return routes.get_job(job_id, db=self.db, current_user_id=viewer.id if viewer else None)

    def test_other_logged_in_user_sees_completed_shared_video_redacted(self):
        jid = self.job(JobStatus.COMPLETED)
        res = self.get(jid, self.friend)
        self.assertEqual(res.job_id, str(jid))
        self.assertIsNone(res.transcript_text)
        self.assertIsNone(res.rating)

    def test_anonymous_sees_completed_shared_video(self):
        self.assertEqual(self.get(self.job(JobStatus.COMPLETED), None).job_id is not None, True)

    def test_in_progress_job_stays_hidden_from_non_owner(self):
        jid = self.job(JobStatus.TRANSLATING)
        for viewer in (self.friend, None):
            with self.assertRaises(HTTPException) as ctx:
                self.get(jid, viewer)
            self.assertEqual(ctx.exception.status_code, 404)

    def test_owner_gets_full_response(self):
        res = self.get(self.job(JobStatus.COMPLETED), self.owner)
        self.assertEqual(res.transcript_text, "secret source")


if __name__ == "__main__":
    unittest.main()
