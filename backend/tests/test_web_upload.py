"""POST /api/jobs/upload (veb orqali video fayl yuklash, 2026-09-20) va
subtitr yuklab olish endpointlari.

Postgres KERAK EMAS: autentifikatsiya/DB dependency'lari almashtirilgan
(dependency_overrides), job yaratish (`_finish_uploaded_job`) va yuklashdan
oldingi tekshiruv (`precheck_local_upload`) soxtalashtirilgan -- bu testlar
endpointning O'ZINI tekshiradi: tur/hajm/Content-Length tekshiruvi, rad
holatlarida fayl yozilmasligi, yarim yozilgan fayl tozalanishi, DB
ulanishi yuklashdan oldin yopilishi, disk himoyasi."""
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.api import routes
from backend.main import app
from backend.models.database import get_db
from backend.services.auth import get_current_user
from backend.services.job_creation import JobCreationResult

USER_ID = uuid.uuid4()


class FakeSession:
    def __init__(self):
        self.closed_at_call = None
        self.close_calls = 0
        self.events = []

    def close(self):
        self.close_calls += 1
        self.events.append("db.close")


class UploadTestBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = FakeSession()
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=USER_ID, is_active=True)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        p = patch.object(routes.settings, "UPLOAD_DIR", self.tmp.name)
        p.start(); self.addCleanup(p.stop)
        p_out = patch.object(routes.settings, "OUTPUT_DIR", self.tmp.name)
        p_out.start(); self.addCleanup(p_out.stop)
        p = patch.object(routes.settings, "WEB_UPLOAD_MAX_MB", 1)
        p.start(); self.addCleanup(p.stop)
        # diskda hamma vaqt yetarli joy bor deb (alohida testda aksi tekshiriladi)
        p = patch.object(routes.shutil, "disk_usage", return_value=SimpleNamespace(free=10 ** 13))
        p.start(); self.addCleanup(p.stop)
        self.precheck = patch.object(routes, "precheck_local_upload", return_value=None)
        self.precheck_mock = self.precheck.start(); self.addCleanup(self.precheck.stop)
        p_rl = patch("backend.services.rate_limiter._get_redis")
        mock_rl = p_rl.start()
        mock_rl.return_value.incr.return_value = 1
        self.addCleanup(p_rl.stop)

    def tearDown(self):
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_db, None)
        self.tmp.cleanup()

    def files_on_disk(self):
        return list(Path(self.tmp.name).rglob("*"))


class TestUploadValidation(UploadTestBase):
    def test_wrong_content_type_is_415_and_nothing_is_written(self):
        r = self.client.post("/api/jobs/upload", content=b"x" * 100, headers={"Content-Type": "application/pdf"})
        self.assertEqual(r.status_code, 415)
        self.assertEqual(self.files_on_disk(), [])
        self.precheck_mock.assert_not_called()

    def test_missing_content_length_is_411(self):
        def gen():
            yield b"abc"
        r = self.client.post("/api/jobs/upload", content=gen(), headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 411)
        self.assertEqual(self.files_on_disk(), [])

    def test_empty_body_is_400(self):
        r = self.client.post("/api/jobs/upload", content=b"", headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 400)

    def test_declared_size_over_limit_is_413_before_reading_and_before_precheck(self):
        r = self.client.post("/api/jobs/upload", content=b"x" * (1024 * 1024 + 1), headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 413)
        self.assertEqual(self.files_on_disk(), [])
        self.precheck_mock.assert_not_called()


class TestUploadRejectionsBeforeReadingFile(UploadTestBase):
    def test_precheck_rejection_returns_error_and_writes_no_file(self):
        self.precheck_mock.return_value = JobCreationResult(outcome="queue_full", queue_wait_minutes=45)
        r = self.client.post("/api/jobs/upload", content=b"x" * 1000, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.headers.get("retry-after"), "300")
        self.assertEqual(self.files_on_disk(), [])

    def test_no_minutes_left_is_402_with_pricing_error_shape(self):
        self.precheck_mock.return_value = JobCreationResult(outcome="insufficient_minutes")
        r = self.client.post("/api/jobs/upload", content=b"x" * 1000, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 402)
        detail = r.json()["detail"]
        self.assertEqual(detail["error"], "insufficient_minutes")
        self.assertIn("qolmagan", detail["message"])
        self.assertEqual(self.files_on_disk(), [])

    def test_low_disk_space_is_503_and_writes_nothing(self):
        with patch.object(routes.shutil, "disk_usage", return_value=SimpleNamespace(free=1024)):
            r = self.client.post("/api/jobs/upload", content=b"x" * 1000, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 503)
        self.assertEqual(self.files_on_disk(), [])

    def test_db_connection_is_released_before_the_file_is_read(self):
        order = []
        self.db.events = order

        def fake_finish(*a, **k):
            order.append("finish")
            return JobCreationResult(outcome="queued", job_id=a[1], duration_minutes=2.0)

        with patch.object(routes, "_finish_uploaded_job", side_effect=fake_finish):
            r = self.client.post("/api/jobs/upload", content=b"x" * 5000, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 201)
        self.assertIn("db.close", order)
        self.assertLess(order.index("db.close"), order.index("finish"))


class TestUploadSuccessAndFailure(UploadTestBase):
    def test_success_streams_file_to_job_dir_and_passes_metadata(self):
        payload = bytes(range(256)) * 2000  # ~500 KB
        seen = {}

        def fake_finish(user_id, job_id, video_path, subtitle_only, voice_gender, title, source_language=None, *args, **kwargs):
            seen.update(user_id=user_id, video_path=video_path, subtitle_only=subtitle_only,
                        voice_gender=voice_gender, title=title, source_language=source_language,
                        data=Path(video_path).read_bytes())
            return JobCreationResult(outcome="queued", job_id=job_id, duration_minutes=3.0)

        with patch.object(routes, "_finish_uploaded_job", side_effect=fake_finish):
            r = self.client.post(
                "/api/jobs/upload?subtitle_only=true", content=payload,
                headers={"Content-Type": "video/mp4", "X-File-Name": "Mening%20videom.final.mp4"},
            )
        self.assertEqual(r.status_code, 201)
        body = r.json()
        self.assertEqual(body["status"], "pending")
        self.assertEqual(seen["data"], payload)                      # bayt-baytiga saqlangan
        self.assertEqual(seen["user_id"], USER_ID)
        self.assertTrue(seen["subtitle_only"])
        self.assertEqual(seen["title"], "Mening videom.final")      # kengaytmasiz sarlavha
        self.assertIn(body["job_id"], str(Path(seen["video_path"])))
        self.assertEqual(Path(seen["video_path"]).name, "video.mp4")  # nom faqat content-type'dan

    def test_hostile_file_name_header_cannot_change_where_the_file_is_saved(self):
        seen = {}

        def fake_finish(user_id, job_id, video_path, *a, **kw):
            seen["path"] = Path(video_path)
            seen["title"] = a[2]
            return JobCreationResult(outcome="queued", job_id=job_id)

        with patch.object(routes, "_finish_uploaded_job", side_effect=fake_finish):
            r = self.client.post(
                "/api/jobs/upload", content=b"x" * 100,
                headers={"Content-Type": "video/webm", "X-File-Name": "..%2F..%2Fetc%2Fpasswd.webm"},
            )
        self.assertEqual(r.status_code, 201)
        self.assertTrue(str(seen["path"].resolve()).startswith(str(Path(self.tmp.name).resolve())))
        self.assertEqual(seen["path"].name, "video.webm")
        self.assertEqual(seen["title"], "passwd")

    def test_uzbek_source_language_is_passed_through_for_subtitles(self):
        seen = {}

        def fake_finish(user_id, job_id, video_path, subtitle_only, voice_gender, title, source_language=None, *args, **kwargs):
            seen["lang"], seen["sub"] = source_language, subtitle_only
            return JobCreationResult(outcome="queued", job_id=job_id)

        with patch.object(routes, "_finish_uploaded_job", side_effect=fake_finish):
            r = self.client.post("/api/jobs/upload?source_language=uz", content=b"x" * 500, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual((seen["lang"], seen["sub"]), ("uz", True))

    def test_default_source_language_is_none_meaning_translate(self):
        seen = {}

        def fake_finish(user_id, job_id, video_path, subtitle_only, voice_gender, title, source_language=None, *args, **kwargs):
            seen["lang"] = source_language
            return JobCreationResult(outcome="queued", job_id=job_id)

        with patch.object(routes, "_finish_uploaded_job", side_effect=fake_finish):
            self.client.post("/api/jobs/upload", content=b"x" * 500, headers={"Content-Type": "video/mp4"})
        self.assertIsNone(seen["lang"])

    def test_invalid_or_dubbing_uzbek_source_is_400_before_anything_is_read(self):
        for query in ("source_language=klingon", "source_language=uz&subtitle_only=false"):
            with self.subTest(query=query):
                r = self.client.post(f"/api/jobs/upload?{query}", content=b"x" * 500, headers={"Content-Type": "video/mp4"})
                self.assertEqual(r.status_code, 400)
                self.assertEqual(self.files_on_disk(), [])
                self.precheck_mock.assert_not_called()

    def test_rejected_after_upload_removes_the_job_dir(self):
        def fake_finish(user_id, job_id, video_path, *a):
            return JobCreationResult(outcome="bad_file")

        with patch.object(routes, "_finish_uploaded_job", side_effect=fake_finish):
            r = self.client.post("/api/jobs/upload", content=b"x" * 3000, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.files_on_disk(), [])

    def test_too_long_and_insufficient_minutes_after_upload_map_to_http_errors(self):
        cases = [
            (JobCreationResult(outcome="too_long", duration_minutes=200.0), 400),
            (JobCreationResult(outcome="insufficient_minutes", duration_minutes=30.0, minutes_short=25), 402),
        ]
        for result, status in cases:
            with self.subTest(outcome=result.outcome):
                with patch.object(routes, "_finish_uploaded_job", return_value=result):
                    r = self.client.post("/api/jobs/upload", content=b"x" * 500, headers={"Content-Type": "video/mp4"})
                self.assertEqual(r.status_code, status)
                self.assertEqual(self.files_on_disk(), [])

    def test_unexpected_error_while_finishing_does_not_leave_files(self):
        # DB/ffmpeg kutilmagan xato: javob 500, lekin job yaratilmagani uchun yuklangan
        # (1 GB gacha) fayl diskda yetim bo'lib QOLMASLIGI kerak.
        with patch.object(routes, "_finish_uploaded_job", side_effect=RuntimeError("boom")):
            client = TestClient(app, raise_server_exceptions=False)
            r = client.post("/api/jobs/upload", content=b"x" * 500, headers={"Content-Type": "video/mp4"})
        self.assertEqual(r.status_code, 500)
        self.assertEqual(self.files_on_disk(), [])


class TestDisplayTitle(unittest.TestCase):
    def test_strips_path_extension_and_control_chars(self):
        f = routes._upload_display_title
        self.assertEqual(f("clip.mp4"), "clip")
        self.assertEqual(f("C%3A%5CUsers%5Cme%5Cmovie.final.mkv"), "movie.final")
        self.assertEqual(f("a%0D%0Ab.mp4"), "a b")
        self.assertEqual(f(None), "Yuklangan video")
        self.assertEqual(f(""), "Yuklangan video")
        self.assertEqual(f(".mp4"), "Yuklangan video")
        self.assertLessEqual(len(f("x" * 1000 + ".mp4")), 120)


class FakeQuery:
    def __init__(self, job):
        self.job = job

    def filter(self, *a, **k):
        return self

    def first(self):
        return self.job


class TestSubtitleDownloads(unittest.TestCase):
    def setUp(self):
        self.job = SimpleNamespace(
            id=uuid.uuid4(), video_title="Mening videom",
            translated_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom"},
                                 {"id": 2, "start": 2.0, "end": 4.0, "text": "Dunyo"}],
            translated_text="Salom Dunyo", uzbek_srt_content="WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nSalom\n",
        )

        class DB:
            def __init__(s, job): s.job = job
            def query(s, *a): return FakeQuery(s.job)
            def close(s): pass

        app.dependency_overrides[get_db] = lambda: DB(self.job)
        self.client = TestClient(app)
        self.addCleanup(lambda: app.dependency_overrides.pop(get_db, None))

    def test_txt_download(self):
        r = self.client.get(f"/api/jobs/{self.job.id}/subtitles.txt")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.text, "Salom\nDunyo\n")
        self.assertTrue(r.headers["content-type"].startswith("text/plain"))
        self.assertIn("attachment", r.headers["content-disposition"])
        self.assertIn("Mening videom.uz.txt", r.headers["content-disposition"])

    def test_txt_falls_back_to_plain_translated_text(self):
        self.job.translated_segments = None
        r = self.client.get(f"/api/jobs/{self.job.id}/subtitles.txt")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.text, "Salom Dunyo\n")

    def test_txt_404_when_nothing_exists(self):
        self.job.translated_segments = None
        self.job.translated_text = None
        self.assertEqual(self.client.get(f"/api/jobs/{self.job.id}/subtitles.txt").status_code, 404)

    def test_vtt_is_inline_by_default_for_the_player_and_attachment_with_download(self):
        inline = self.client.get(f"/api/jobs/{self.job.id}/subtitles.vtt")
        self.assertEqual(inline.status_code, 200)
        self.assertNotIn("content-disposition", inline.headers)     # <track> uchun BUZILMASLIGI kerak
        dl = self.client.get(f"/api/jobs/{self.job.id}/subtitles.vtt?download=1")
        self.assertEqual(dl.status_code, 200)
        self.assertIn("attachment", dl.headers["content-disposition"])
        self.assertIn("Mening videom.uz.vtt", dl.headers["content-disposition"])
        self.assertEqual(inline.text, dl.text)

    def test_srt_filename_uses_video_title(self):
        r = self.client.get(f"/api/jobs/{self.job.id}/subtitles.srt")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Mening videom.uz.srt", r.headers["content-disposition"])
        self.assertIn("-->", r.text)


if __name__ == "__main__":
    unittest.main()
