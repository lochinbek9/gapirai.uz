"""Kurs subtitridan dublaj: API (backend/api/caption_dub_routes.py) va Celery vazifasi
(backend/workers/caption_dub_tasks.py). SQLite + dependency override -- prod bazasiga tegmaydi."""
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import app
from backend.models.database import Base, CaptionDub, PlanTier, Subscription, User, get_db
from backend.services.auth import get_current_user
from backend.services.tts.base import TTSOutOfCreditsError
from backend.workers import caption_dub_tasks


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


CUES = [{"start": 0.0, "end": 4.0, "text": "Hello  and welcome."}, {"start": 4.0, "end": 9.5, "text": "Today we learn Python."},
        {"start": 9.5, "end": 9.5, "text": "zero length"}, {"start": 61.0, "end": 64.0, "text": "Bye."}]
BODY = {"platform": "coursera", "page_key": "/learn/py/lecture/abc", "title": "Intro", "voice_gender": "male", "cues": CUES}


class CaptionDubTestBase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables[n] for n in ("users", "subscriptions", "caption_dubs")])
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.user = self.make_user()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def make_user(self, role="user", plan=PlanTier.FREE, used=0.0):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", role=role)
        self.db.add(u)
        self.db.add(Subscription(id=uuid.uuid4(), user_id=u.id, plan=plan, monthly_minutes_used=used, purchased_minutes=0,
                                 period_started_at=datetime.utcnow(), expires_at=datetime.utcnow() + timedelta(days=30)))
        self.db.commit()
        return u


class CaptionDubApiTest(CaptionDubTestBase):
    def setUp(self):
        super().setUp()
        app.dependency_overrides[get_db] = lambda: self.Session()
        app.dependency_overrides[get_current_user] = lambda: self.current
        self.addCleanup(app.dependency_overrides.clear)
        self.current = self.user
        p = patch.object(caption_dub_tasks.process_caption_dub, "apply_async")
        self.enqueue = p.start()
        self.addCleanup(p.stop)
        self.client = TestClient(app)

    def test_create_cleans_cues_charges_minutes_and_enqueues(self):
        r = self.client.post("/api/caption-dubs", json=BODY)
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertEqual((d["status"], d["duration_seconds"], d["minutes_charged"]), ("pending", 64.0, 1.07))
        dub = self.Session().get(CaptionDub, uuid.UUID(d["id"]))
        self.assertEqual([c["text"] for c in dub.cues], ["Hello and welcome.", "Today we learn Python.", "Bye."])
        self.assertEqual(self.enqueue.call_args.kwargs["task_id"], d["id"])
        sub = self.Session().query(Subscription).filter_by(user_id=self.user.id).one()
        self.assertAlmostEqual(sub.monthly_minutes_used, 1.07)

    def test_same_lesson_again_is_free_and_returns_existing(self):
        first = self.client.post("/api/caption-dubs", json=BODY).json()
        second = self.client.post("/api/caption-dubs", json=BODY).json()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.enqueue.call_count, 1)
        sub = self.Session().query(Subscription).filter_by(user_id=self.user.id).one()
        self.assertAlmostEqual(sub.monthly_minutes_used, 1.07)

    def test_not_enough_minutes_is_402(self):
        self.current = self.make_user(used=4.5)  # bepul tarif: 5 daqiqa
        long_cues = [{"start": 0, "end": 120, "text": "a"}]
        r = self.client.post("/api/caption-dubs", json={**BODY, "cues": long_cues})
        self.assertEqual(r.status_code, 402)
        self.enqueue.assert_not_called()

    def test_admin_is_not_charged(self):
        self.current = self.make_user(role="admin")
        d = self.client.post("/api/caption-dubs", json=BODY).json()
        self.assertEqual(d["minutes_charged"], 0.0)

    def test_unknown_platform_and_empty_cues_rejected(self):
        self.assertEqual(self.client.post("/api/caption-dubs", json={**BODY, "platform": "udemy"}).status_code, 400)
        self.assertEqual(self.client.post("/api/caption-dubs", json={**BODY, "cues": [{"start": 1, "end": 1, "text": "x"}]}).status_code, 400)

    def test_by_page_and_get_are_owner_only(self):
        d = self.client.post("/api/caption-dubs", json=BODY).json()
        r = self.client.get("/api/caption-dubs/by-page", params={"platform": "coursera", "page_key": BODY["page_key"]})
        self.assertEqual(r.json()["dub"]["id"], d["id"])
        self.current = self.make_user()
        self.assertIsNone(self.client.get("/api/caption-dubs/by-page", params={"platform": "coursera", "page_key": BODY["page_key"]}).json()["dub"])
        self.assertEqual(self.client.get(f"/api/caption-dubs/{d['id']}").status_code, 404)

    def test_audio_only_when_completed(self):
        d = self.client.post("/api/caption-dubs", json=BODY).json()
        self.assertEqual(self.client.get(f"/api/caption-dubs/{d['id']}/audio").status_code, 404)
        wav = Path(self.tmp.name) / "dub.wav"
        wav.write_bytes(b"RIFF....WAVE")
        s = self.Session()
        dub = s.get(CaptionDub, uuid.UUID(d["id"]))
        dub.status, dub.audio_path, dub.translated = "completed", str(wav), [{"start": 0, "end": 4, "text": "Salom"}]
        s.commit()
        self.assertEqual(self.client.get(f"/api/caption-dubs/{d['id']}/audio").status_code, 200)
        self.assertEqual(self.client.get(f"/api/caption-dubs/{d['id']}").json()["cues_uz"][0]["text"], "Salom")


class MergeIntoSentencesTest(unittest.TestCase):
    def test_coursera_line_fragments_become_sentences(self):
        from backend.api.caption_dub_routes import merge_into_sentences
        raw = [(3.59, 5.855, "Welcome to this course"), (5.855, 8.7, "Introduction to Artificial Intelligence."),
               (8.7, 11.64, "Imagine unlocking new career opportunities"), (11.64, 13.16, "and gaining a competitive edge in"),
               (13.16, 15.38, "your field."), (20.0, 22.0, "After a pause"), (22.0, 24.0, "it continues")]
        out = merge_into_sentences([{"start": a, "end": b, "text": t} for a, b, t in raw])
        self.assertEqual([(o["start"], o["end"]) for o in out], [(3.59, 8.7), (8.7, 15.38), (20.0, 24.0)])
        self.assertEqual(out[1]["text"], "Imagine unlocking new career opportunities and gaining a competitive edge in your field.")

    def test_long_run_on_is_capped(self):
        from backend.api.caption_dub_routes import MERGE_MAX_SECONDS, merge_into_sentences
        cues = [{"start": i * 3.0, "end": i * 3.0 + 3, "text": f"part {i}"} for i in range(12)]
        out = merge_into_sentences(cues)
        self.assertGreater(len(out), 1)
        self.assertTrue(all(o["end"] - o["start"] <= MERGE_MAX_SECONDS + 3 for o in out))
        self.assertEqual(" ".join(o["text"] for o in out), " ".join(c["text"] for c in cues))


class CaptionDubTaskTest(CaptionDubTestBase):
    def setUp(self):
        super().setUp()
        p = patch.object(caption_dub_tasks, "SessionLocal", side_effect=lambda: self.Session())
        p.start()
        self.addCleanup(p.stop)
        p = patch.object(caption_dub_tasks, "caption_dub_dir", side_effect=lambda i: Path(self.tmp.name) / str(i))
        p.start()
        self.addCleanup(p.stop)
        self.dub = CaptionDub(user_id=self.user.id, platform="coursera", page_key="/x", source_key="k", voice_gender="female",
                              cues=[{"start": 0, "end": 3, "text": "Hello"}], duration_seconds=3, minutes_charged=0.05)
        self.db.add(self.dub)
        self.db.commit()

    def fake_synth(self, segments, out_dir, **kw):
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        f = Path(out_dir) / "dubbed_audio.wav"
        f.write_bytes(b"RIFF")
        return str(f), [], {}

    def run_task(self):
        caption_dub_tasks.process_caption_dub.run(str(self.dub.id))
        return self.Session().get(CaptionDub, self.dub.id)

    def test_success_translates_synthesizes_and_saves_audio(self):
        with patch("backend.services.translator.translate_segments", return_value=[{"id": 1, "start": 0, "end": 3, "text": "Salom"}]), \
             patch("backend.services.plans.get_tts_provider_for_job", return_value="neuronai"), \
             patch("backend.services.synthesizer.synthesize_segments", side_effect=self.fake_synth) as synth:
            d = self.run_task()
        self.assertEqual((d.status, d.tts_provider, d.translated[0]["text"]), ("completed", "neuronai", "Salom"))
        self.assertTrue(Path(d.audio_path).exists())
        self.assertEqual(synth.call_args.kwargs["voice_name"], "uz-UZ-MadinaNeural")

    def test_out_of_credits_redoes_on_edge(self):
        calls = []

        def synth(segments, out_dir, **kw):
            calls.append(kw["provider_name"])
            if kw["provider_name"] == "voicelab":
                raise TTSOutOfCreditsError("402")
            return self.fake_synth(segments, out_dir)

        with patch("backend.services.translator.translate_segments", return_value=[{"id": 1, "start": 0, "end": 3, "text": "Salom"}]), \
             patch("backend.services.plans.get_tts_provider_for_job", return_value="voicelab"), \
             patch("backend.services.synthesizer.synthesize_segments", side_effect=synth):
            d = self.run_task()
        self.assertEqual((calls, d.status, d.tts_provider), (["voicelab", "edge"], "completed", "edge"))

    def test_failure_refunds_minutes(self):
        with patch("backend.services.translator.translate_segments", side_effect=RuntimeError("boom")), \
             patch("backend.services.plans.refund_quota") as refund:
            d = self.run_task()
        self.assertEqual((d.status, d.minutes_charged), ("failed", 0.0))
        refund.assert_called_once()
        self.assertAlmostEqual(refund.call_args.args[2], 0.05)


if __name__ == "__main__":
    unittest.main()
