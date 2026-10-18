"""Fayldan (YouTube'siz) job yaratish -- "Subtitr" rejimi (2026-09-20):
create_job_from_local_video_file_sync haqiqiy ffmpeg/ffprobe bilan, DB va
Celery soxtalashtirilgan (Postgres/Redis kerak emas).

Tekshiriladi: subtitle_only/video_title job'ga yoziladi, job HAR DOIM
LOCAL_UPLOAD_QUEUE'ga tushadi (fayl faqat host-1 diskida), kvota yechiladi,
rad holatlarida fayl o'chadi, yuklashdan oldingi tekshiruv (precheck)."""
import shutil
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.services import job_creation as jc
from backend.services.plans import LOCAL_UPLOAD_QUEUE

HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


class FakeDB:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def close(self):
        pass


def make_video(path: Path, seconds: float = 2.0) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
         "-f", "lavfi", "-i", f"color=c=black:s=64x64:d={seconds}", "-shortest", str(path)],
        check=True, capture_output=True,
    )


@unittest.skipUnless(HAS_FFMPEG, "ffmpeg/ffprobe o'rnatilmagan")
class TestCreateLocalSubtitleJob(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.job_id = str(uuid.uuid4())
        self.job_dir = Path(self.tmp.name) / self.job_id
        self.job_dir.mkdir()
        self.video = self.job_dir / "video.mp4"
        make_video(self.video)
        self.db = FakeDB()
        self.user = SimpleNamespace(id=uuid.uuid4())
        for target, value in (
            ("_daily_job_limit_reached", False),
            ("check_queue_capacity", None),
            ("_quota_or_autotopup", (True, 0)),
        ):
            p = patch.object(jc, target, return_value=value)
            p.start(); self.addCleanup(p.stop)
        p = patch("backend.services.plans.consume_quota")
        self.consume = p.start(); self.addCleanup(p.stop)
        p = patch("backend.services.plans.get_or_create_subscription", return_value=SimpleNamespace(plan="pro", plan_tier="pro"))
        p.start(); self.addCleanup(p.stop)
        p = patch.object(jc.process_video, "apply_async")
        self.apply_async = p.start(); self.addCleanup(p.stop)

    def tearDown(self):
        self.tmp.cleanup()

    def test_subtitle_job_from_file_is_flagged_titled_and_routed_to_local_queue(self):
        result = jc.create_job_from_local_video_file_sync(
            self.db, self.user, self.job_id, self.video, source_url=f"upload://{self.job_id}",
            subtitle_only=True, video_title="Mening videom",
        )
        self.assertEqual(result.outcome, "queued")
        job = self.db.added[0]
        self.assertTrue(job.subtitle_only)
        self.assertEqual(job.video_title, "Mening videom")
        self.assertEqual(job.original_video_path, str(self.video))
        self.assertTrue(job.quota_consumed)
        self.assertGreater(job.video_duration, 1.0)
        self.assertTrue((self.job_dir / "audio.wav").exists())        # audio ajratildi
        self.consume.assert_called_once()
        _, kwargs = self.apply_async.call_args
        self.assertEqual(kwargs["queue"], LOCAL_UPLOAD_QUEUE)         # boshqa worker host fayl topa olmaydi

    def test_uzbek_source_is_recorded_only_for_subtitle_jobs(self):
        jc.create_job_from_local_video_file_sync(
            self.db, self.user, self.job_id, self.video, source_url="upload://x", subtitle_only=True, source_language="uz",
        )
        self.assertEqual(self.db.added[0].source_language, "uz")

    def test_uzbek_source_is_ignored_for_dubbing_jobs_and_unknown_values(self):
        jc.create_job_from_local_video_file_sync(
            self.db, self.user, self.job_id, self.video, source_url="upload://x", subtitle_only=False, source_language="uz",
        )
        self.assertIsNone(self.db.added[0].source_language)     # dublyajda o'zbekcha manba ma'nosiz
        make_video(self.video)
        jc.create_job_from_local_video_file_sync(
            self.db, self.user, str(uuid.uuid4()), self.video, source_url="upload://y", subtitle_only=True, source_language="fr",
        )
        self.assertIsNone(self.db.added[1].source_language)

    def test_default_is_still_a_normal_dub_job(self):
        jc.create_job_from_local_video_file_sync(
            self.db, self.user, self.job_id, self.video, source_url="telegram://file/x",
        )
        job = self.db.added[0]
        self.assertFalse(job.subtitle_only)
        self.assertIsNone(job.video_title)

    def test_corrupt_file_is_rejected_and_deleted(self):
        self.video.write_bytes(b"this is not a video")
        result = jc.create_job_from_local_video_file_sync(
            self.db, self.user, self.job_id, self.video, source_url="upload://x", subtitle_only=True,
        )
        self.assertEqual(result.outcome, "bad_file")
        self.assertFalse(self.video.exists())
        self.assertEqual(self.db.added, [])
        self.apply_async.assert_not_called()

    def test_insufficient_minutes_deletes_file_and_does_not_consume_quota(self):
        with patch.object(jc, "_quota_or_autotopup", return_value=(False, 3)):
            result = jc.create_job_from_local_video_file_sync(
                self.db, self.user, self.job_id, self.video, source_url="upload://x", subtitle_only=True,
            )
        self.assertEqual(result.outcome, "insufficient_minutes")
        self.assertEqual(result.minutes_short, 3)
        self.assertFalse(self.video.exists())
        self.consume.assert_not_called()
        self.apply_async.assert_not_called()

    def test_async_wrapper_used_by_the_telegram_bot_forwards_new_arguments(self):
        import asyncio
        result = asyncio.run(jc.create_job_from_local_video_file(
            self.db, self.user, self.job_id, self.video, source_url="telegram://file/x",
            subtitle_only=True, video_title="Bot fayli",
        ))
        self.assertEqual(result.outcome, "queued")
        self.assertTrue(self.db.added[0].subtitle_only)
        self.assertEqual(self.db.added[0].video_title, "Bot fayli")


class TestPrecheckLocalUpload(unittest.TestCase):
    def _patch(self, daily=False, capacity=None, available=10.0, auto_topup=False):
        patches = [
            patch.object(jc, "_daily_job_limit_reached", return_value=daily),
            patch.object(jc, "check_queue_capacity", return_value=capacity),
            patch("backend.services.plans.get_minute_balance", return_value={"total_available": available}),
            patch("backend.services.plans.get_or_create_subscription", return_value=SimpleNamespace(auto_topup_enabled=auto_topup)),
        ]
        for p in patches:
            p.start(); self.addCleanup(p.stop)

    def test_ok_when_everything_is_fine(self):
        self._patch()
        self.assertIsNone(jc.precheck_local_upload(object(), uuid.uuid4()))

    def test_daily_limit(self):
        self._patch(daily=True)
        self.assertEqual(jc.precheck_local_upload(object(), uuid.uuid4()).outcome, "daily_limit")

    def test_queue_protection_is_applied_before_upload(self):
        rej = jc.JobCreationResult(outcome="queue_full", queue_wait_minutes=30)
        self._patch(capacity=rej)
        self.assertIs(jc.precheck_local_upload(object(), uuid.uuid4()), rej)

    def test_no_minutes_left_rejects_before_upload(self):
        self._patch(available=0.0)
        r = jc.precheck_local_upload(object(), uuid.uuid4())
        self.assertEqual(r.outcome, "insufficient_minutes")
        self.assertIsNone(r.minutes_short)   # davomiylik hali noma'lum

    def test_auto_topup_users_are_not_rejected_up_front(self):
        self._patch(available=0.0, auto_topup=True)
        self.assertIsNone(jc.precheck_local_upload(object(), uuid.uuid4()))


if __name__ == "__main__":
    unittest.main()
