"""GET /api/jobs/{job_id} access control (2026-08-28 hardening).

Denis's 416a0ba added get_optional_user + an owner check, but an anonymous
caller could still read ANY job by UUID -- including in-progress / failed ones
-- and _job_to_response leaks transcript_text / error_message / feedback.

Contract now:
  owner (authenticated)     -> full response
  authenticated non-owner   -> 404
  anonymous + COMPLETED     -> redacted response (no transcript/error/feedback)
  anonymous + not COMPLETED -> 404
"""
import unittest
import uuid

from fastapi.testclient import TestClient

from backend.main import app
from backend.models.database import SessionLocal, DubbingJob, JobStatus, User
from backend.services.auth import create_access_token, hash_password


class TestGetJobAccess(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.db = SessionLocal()
        self.owner = User(email=f"owner+{uuid.uuid4()}@t.co", name="o",
                          password_hash=hash_password("x"), is_verified=True, is_active=True)
        self.other = User(email=f"other+{uuid.uuid4()}@t.co", name="x",
                          password_hash=hash_password("x"), is_verified=True, is_active=True)
        self.db.add_all([self.owner, self.other])
        self.db.commit()
        self.owner_tok = create_access_token(str(self.owner.id), self.owner.email)
        self.other_tok = create_access_token(str(self.other.id), self.other.email)

    def tearDown(self):
        from backend.models.database import Subscription
        self.db.query(DubbingJob).filter(DubbingJob.user_id.in_([self.owner.id, self.other.id])).delete(synchronize_session=False)
        self.db.query(Subscription).filter(Subscription.user_id.in_([self.owner.id, self.other.id])).delete(synchronize_session=False)
        self.db.query(User).filter(User.id.in_([self.owner.id, self.other.id])).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def _job(self, status):
        j = DubbingJob(
            id=uuid.uuid4(), user_id=self.owner.id, youtube_url="https://youtu.be/x",
            status=status, transcript_text="SECRET english transcript",
            translated_text="uzbek dub", error_message="internal ffmpeg blew up",
            error_code="MERGE_FAILED", rating=5, feedback_comment="owner note",
            video_title="T",
        )
        self.db.add(j); self.db.commit()
        return str(j.id)

    def test_owner_gets_full(self):
        jid = self._job(JobStatus.COMPLETED)
        r = self.client.get(f"/api/jobs/{jid}", headers={"Authorization": f"Bearer {self.owner_tok}"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["transcript_text"], "SECRET english transcript")
        self.assertEqual(r.json()["error_message"], "internal ffmpeg blew up")
        self.assertEqual(r.json()["rating"], 5)

    def test_authenticated_non_owner_404(self):
        jid = self._job(JobStatus.COMPLETED)
        r = self.client.get(f"/api/jobs/{jid}", headers={"Authorization": f"Bearer {self.other_tok}"})
        self.assertEqual(r.status_code, 404)

    def test_anon_completed_redacted(self):
        jid = self._job(JobStatus.COMPLETED)
        r = self.client.get(f"/api/jobs/{jid}")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIsNone(body["transcript_text"])
        self.assertIsNone(body["error_message"])
        self.assertIsNone(body["error_code"])
        self.assertIsNone(body["rating"])
        self.assertIsNone(body["feedback_comment"])
        # shareable bits still present
        self.assertEqual(body["status"], "completed")
        self.assertEqual(body["video_title"], "T")

    def test_anon_in_progress_404(self):
        for st in (JobStatus.DOWNLOADING, JobStatus.TRANSCRIBING, JobStatus.FAILED, JobStatus.AWAITING_PAYMENT):
            jid = self._job(st)
            r = self.client.get(f"/api/jobs/{jid}")
            self.assertEqual(r.status_code, 404, f"anon must not see {st} job")

    def test_unknown_id_404(self):
        r = self.client.get(f"/api/jobs/{uuid.uuid4()}")
        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
