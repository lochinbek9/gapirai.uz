"""Ommaviy API v1 (backend/api/v1_routes.py, backend/services/api_v1.py).
SQLite + dependency override -- prod bazasiga tegmaydi; job yaratish va tarmoq mock."""
import hashlib
import hmac
import json
import socket
import unittest
import uuid
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.models.database import (ApiJobRequest, Base, DubbingJob, JobStatus, PlanTier, Subscription, User,
                                     get_db)
from backend.services import api_v1
from backend.services.auth import get_current_user
from backend.services.job_creation import JobCreationResult


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


PUBLIC_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]
PRIVATE_DNS = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.18.0.1", 443))]
_real_getaddrinfo = socket.getaddrinfo


def fake_dns(answer):
    """Faqat *.example.com uchun soxta DNS -- Redis (rate limiter) kabi boshqa ulanishlar haqiqiy qoladi."""
    def _resolve(host, *a, **kw):
        return answer if str(host).endswith("example.com") else _real_getaddrinfo(host, *a, **kw)
    return patch("socket.getaddrinfo", side_effect=_resolve)


BODY = {"source_url": "https://youtu.be/dQw4w9WgXcQ", "mode": "dub", "webhook_url": "https://hooks.example.com/gapirai"}


class ApiV1Base(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        tables = ("users", "subscriptions", "video_analyses", "dubbing_jobs", "api_job_requests")
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables[n] for n in tables])
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.user = self.make_user()
        p = patch("backend.models.database.SessionLocal", side_effect=lambda: self.Session())
        p.start()
        self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_user(self):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", role="user")
        self.db.add(u)
        self.db.add(Subscription(id=uuid.uuid4(), user_id=u.id, plan=PlanTier.STANDARD, monthly_minutes_used=0,
                                 purchased_minutes=0, period_started_at=datetime.utcnow(),
                                 expires_at=datetime.utcnow() + timedelta(days=30)))
        self.db.commit()
        return u

    def make_job(self, user, status=JobStatus.PENDING, subtitle_only=False):
        j = DubbingJob(id=uuid.uuid4(), user_id=user.id, youtube_url=BODY["source_url"], video_title="Demo",
                       video_duration=125.0, status=status, progress=0.0, subtitle_only=subtitle_only)
        self.db.add(j)
        self.db.commit()
        return j


class ApiV1RoutesTest(ApiV1Base):
    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_db] = lambda: self.Session()
        app.dependency_overrides[get_current_user] = lambda: self.current
        self.addCleanup(app.dependency_overrides.clear)
        self.current = self.user
        self.client = TestClient(app)
        p = fake_dns(PUBLIC_DNS)
        p.start()
        self.addCleanup(p.stop)

    def fake_create(self, outcome="queued", **extra):
        async def _create(db, user, url, voice_gender, subtitle_only=False, source_language=None, **kw):
            self.calls.append({"subtitle_only": subtitle_only, "source_language": source_language})
            if outcome != "queued":
                return JobCreationResult(outcome=outcome, **extra)
            job = self.make_job(user, subtitle_only=subtitle_only)
            return JobCreationResult(outcome="queued", job_id=str(job.id))
        self.calls = []
        return patch("backend.services.job_creation.create_dubbing_job", side_effect=_create)

    def test_create_records_request_and_idempotency_returns_same(self):
        with self.fake_create():
            r1 = self.client.post("/v1/dubs", json=BODY, headers={"Idempotency-Key": "order-1"})
            r2 = self.client.post("/v1/dubs", json=BODY, headers={"Idempotency-Key": "order-1"})
        self.assertEqual(r1.status_code, 201, r1.text)
        self.assertEqual(r2.status_code, 200)
        d = r1.json()
        self.assertEqual((d["object"], d["status"], d["mode"], d["outputs"]), ("dub", "queued", "dub", None))
        self.assertEqual(d["webhook"], {"url": BODY["webhook_url"], "status": "pending", "attempts": 0})
        self.assertEqual(r2.json()["id"], d["id"])
        self.assertEqual(len(self.calls), 1)

    def test_subtitles_mode_and_uzbek_source(self):
        with self.fake_create():
            r = self.client.post("/v1/dubs", json={**BODY, "mode": "subtitles", "source_language": "uz", "webhook_url": None})
            self.assertEqual(r.status_code, 201, r.text)
            self.assertEqual(self.calls[-1], {"subtitle_only": True, "source_language": "uz"})
            bad = self.client.post("/v1/dubs", json={**BODY, "source_language": "uz"})
        self.assertEqual(bad.json()["error"]["code"], "invalid_request")

    def test_webhook_must_be_public_https(self):
        with self.fake_create():
            r = self.client.post("/v1/dubs", json={**BODY, "webhook_url": "http://hooks.example.com/x"})
            self.assertEqual((r.status_code, r.json()["error"]["code"]), (400, "invalid_webhook_url"))
            with fake_dns(PRIVATE_DNS):
                r = self.client.post("/v1/dubs", json={**BODY, "webhook_url": "https://internal.example.com/x"})
            self.assertEqual(r.json()["error"]["code"], "invalid_webhook_url")
        self.assertEqual(self.calls, [])

    def test_outcome_errors_use_v1_format(self):
        with self.fake_create("insufficient_minutes", minutes_short=3, duration_minutes=10):
            r = self.client.post("/v1/dubs", json=BODY)
        self.assertEqual(r.status_code, 402)
        self.assertEqual(r.json(), {"error": {"code": "insufficient_minutes", "message": "Daqiqa balansi yetarli emas.",
                                              "minutes_short": 3}})

    def test_get_completed_has_outputs_and_is_owner_only(self):
        job = self.make_job(self.user, status=JobStatus.COMPLETED)
        d = self.client.get(f"/v1/dubs/{job.id}").json()
        self.assertEqual(d["status"], "completed")
        self.assertTrue(d["outputs"]["video_url"].endswith(f"/api/outputs/{job.id}/video"))
        self.assertIn("srt_url", d["outputs"])
        self.current = self.make_user()
        r = self.client.get(f"/v1/dubs/{job.id}")
        self.assertEqual((r.status_code, r.json()["error"]["code"]), (404, "not_found"))

    def test_subtitles_job_has_no_video_output(self):
        job = self.make_job(self.user, status=JobStatus.COMPLETED, subtitle_only=True)
        out = self.client.get(f"/v1/dubs/{job.id}").json()["outputs"]
        self.assertNotIn("video_url", out)
        self.assertIn("vtt_url", out)

    def test_list_only_api_created(self):
        self.make_job(self.user)  # saytdan yaratilgan -- ro'yxatga kirmaydi
        with self.fake_create():
            created = self.client.post("/v1/dubs", json=BODY).json()
        data = self.client.get("/v1/dubs").json()["data"]
        self.assertEqual([d["id"] for d in data], [created["id"]])

    def test_failed_job_error_object(self):
        job = self.make_job(self.user, status=JobStatus.FAILED)
        job.error_code, job.error_message = "NO_SPEECH_FOUND", "Videoda nutq topilmadi."
        self.db.commit()
        d = self.client.get(f"/v1/dubs/{job.id}").json()
        self.assertEqual(d["error"], {"code": "NO_SPEECH_FOUND", "message": "Videoda nutq topilmadi."})

    def test_redeliver_requires_finished_job_with_webhook(self):
        with self.fake_create():
            d = self.client.post("/v1/dubs", json=BODY).json()
        r = self.client.post(f"/v1/dubs/{d['id']}/webhook/redeliver")
        self.assertEqual((r.status_code, r.json()["error"]["code"]), (409, "not_finished"))
        s = self.Session()
        s.get(DubbingJob, uuid.UUID(d["id"])).status = JobStatus.COMPLETED
        s.commit()
        with patch.object(api_v1, "start_delivery") as start:
            r = self.client.post(f"/v1/dubs/{d['id']}/webhook/redeliver")
        self.assertEqual(r.status_code, 202)
        start.assert_called_once()

    def test_upload_errors_are_mapped_to_v1_format(self):
        r = self.client.post("/v1/dubs/upload?mode=subtitles", content=b"abc", headers={"Content-Type": "text/plain"})
        self.assertEqual((r.status_code, r.json()["error"]["code"]), (415, "unsupported_media_type"))

    def test_webhook_secret_is_stable_per_user(self):
        a = self.client.get("/v1/webhook-secret").json()["secret"]
        self.assertEqual(a, self.client.get("/v1/webhook-secret").json()["secret"])
        self.assertTrue(a.startswith("whsec_"))
        self.current = self.make_user()
        self.assertNotEqual(a, self.client.get("/v1/webhook-secret").json()["secret"])


class WebhookDeliveryTest(ApiV1Base):
    def setUp(self):
        super().setUp()
        self.job = self.make_job(self.user, status=JobStatus.COMPLETED)
        self.req = ApiJobRequest(user_id=self.user.id, job_id=self.job.id, mode="dub",
                                 webhook_url="https://hooks.example.com/x", webhook_status="pending")
        self.db.add(self.req)
        self.db.commit()
        p = fake_dns(PUBLIC_DNS)
        p.start()
        self.addCleanup(p.stop)

    def test_delivers_signed_payload(self):
        with patch("httpx.post", return_value=MagicMock(status_code=200)) as post:
            self.assertTrue(api_v1._deliver_once(self.req.id))
        kw = post.call_args.kwargs
        body, sig = kw["content"], kw["headers"][api_v1.SIGNATURE_HEADER]
        payload = json.loads(body)
        self.assertEqual((payload["event"], payload["data"]["id"]), ("dub.completed", str(self.job.id)))
        self.assertFalse(kw["follow_redirects"])
        t, v1 = (part.split("=", 1)[1] for part in sig.split(","))
        expected = hmac.new(api_v1.webhook_secret(self.user.id).encode(), f"{t}.".encode() + body, hashlib.sha256).hexdigest()
        self.assertEqual(v1, expected)
        row = self.Session().get(ApiJobRequest, self.req.id)
        self.assertEqual((row.webhook_status, row.webhook_attempts), ("delivered", 1))

    def test_non_2xx_marks_failed(self):
        with patch("httpx.post", return_value=MagicMock(status_code=500)):
            self.assertFalse(api_v1._deliver_once(self.req.id))
        row = self.Session().get(ApiJobRequest, self.req.id)
        self.assertEqual((row.webhook_status, row.webhook_last_error), ("failed", "HTTP 500"))

    def test_notify_only_for_api_jobs_with_pending_webhook(self):
        other = self.make_job(self.user, status=JobStatus.COMPLETED)
        with patch.object(api_v1, "start_delivery") as start:
            api_v1.notify_api_job_finished([self.job.id, other.id])
        start.assert_called_once_with(self.req.id)

    def test_notify_never_raises(self):
        api_v1.notify_api_job_finished("not-a-uuid")


if __name__ == "__main__":
    unittest.main()
