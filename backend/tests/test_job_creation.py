"""backend/services/job_creation.py'ning kesh-hit fayl-mavjudlik tekshiruvi
uchun testlar (2026-08-24 tuzatilgan bag: COMPLETED holatidagi kesh-hit
job qaytarilardi, garchi uning S3 fayllari allaqachon saqlash muddati
bo'yicha o'chirilgan bo'lsa ham -- foydalanuvchi "tayyor" job olib, keyin
video yuklashda darhol 410 bilan yiqilardi)."""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from backend.models.database import DubbingJob, JobStatus, User
from backend.services import job_creation


def _make_completed_job(**overrides) -> DubbingJob:
    """Bazaga ulanmagan (transient) DubbingJob -- source_job_id=None bo'lgani
    uchun .storage_id o'zining .id'ini qaytaradi, sessiyaga tegmasdan."""
    defaults = dict(
        id=uuid.uuid4(),
        source_job_id=None,
        status=JobStatus.COMPLETED,
        youtube_video_id="abc12345678",
        speaker_gender="male",
        voice_gender_setting="auto",
        video_title="Test video",
        video_duration=60.0,  # 45 daqiqadan qisqa -- check_quota bazaga tegmasdan (True, 0) qaytaradi
        video_thumbnail=None,
        transcript_text="",
        translated_text="",
        srt_content="",
        uzbek_srt_content="",
        output_video_path="/outputs/some-job/video/dubbed_final.mp4",
    )
    defaults.update(overrides)
    return DubbingJob(**defaults)


class TestCachedJobFilesExist(unittest.TestCase):
    """_cached_job_files_exist() ni izolyatsiyada -- S3/lokal ikkala rejim uchun."""

    @patch.object(job_creation, "s3_object_exists")
    @patch.object(job_creation, "get_settings")
    def test_s3_mode_valid_files_returns_true(self, mock_get_settings, mock_exists):
        mock_get_settings.return_value = MagicMock(AWS_BUCKET_NAME="test-bucket")
        mock_exists.return_value = True
        job = _make_completed_job()

        self.assertTrue(job_creation._cached_job_files_exist(job))
        mock_exists.assert_called_once_with(f"dubber/{job.storage_id}/dubbed_final.mp4")

    @patch.object(job_creation, "s3_object_exists")
    @patch.object(job_creation, "get_settings")
    def test_s3_mode_expired_files_returns_false(self, mock_get_settings, mock_exists):
        mock_get_settings.return_value = MagicMock(AWS_BUCKET_NAME="test-bucket")
        mock_exists.return_value = False  # S3 lifecycle (3 kun) bo'yicha o'chirilgan
        job = _make_completed_job()

        self.assertFalse(job_creation._cached_job_files_exist(job))

    @patch.object(job_creation, "get_settings")
    def test_local_mode_valid_file_returns_true(self, mock_get_settings):
        mock_get_settings.return_value = MagicMock(AWS_BUCKET_NAME="")
        with patch("backend.services.job_creation.Path") as mock_path_cls:
            mock_path_cls.return_value.exists.return_value = True
            job = _make_completed_job(output_video_path="/outputs/x/video/dubbed_final.mp4")

            self.assertTrue(job_creation._cached_job_files_exist(job))

    @patch.object(job_creation, "get_settings")
    def test_local_mode_missing_file_returns_false(self, mock_get_settings):
        mock_get_settings.return_value = MagicMock(AWS_BUCKET_NAME="")
        with patch("backend.services.job_creation.Path") as mock_path_cls:
            mock_path_cls.return_value.exists.return_value = False
            job = _make_completed_job(output_video_path="/outputs/x/video/dubbed_final.mp4")

            self.assertFalse(job_creation._cached_job_files_exist(job))

    @patch.object(job_creation, "get_settings")
    def test_local_mode_no_path_returns_false(self, mock_get_settings):
        mock_get_settings.return_value = MagicMock(AWS_BUCKET_NAME="")
        job = _make_completed_job(output_video_path=None)

        self.assertFalse(job_creation._cached_job_files_exist(job))


class TestCreateDubbingJobCacheReuse(unittest.IsolatedAsyncioTestCase):
    """create_dubbing_job()'ning kesh-hit qarori -- fayllar mavjud/yo'qligiga
    qarab keshni ishlatadi yoki chetlab o'tib haqiqiy yangi job yaratadi."""

    def setUp(self):
        self.db = MagicMock()
        self.user = User(id=uuid.uuid4(), name="Test User")
        self.youtube_url = "https://www.youtube.com/watch?v=abc12345678"

        # Suv belgisi istisnosi (watermark.py) MagicMock db'da har kimni "hamkor" deb ko'radi --
        # bu testlar kesh qarorining boshqa shartlarini tekshiradi
        _w = patch("backend.services.watermark.is_cache_compatible", return_value=True)
        _w.start()
        self.addCleanup(_w.stop)

        # Kunlik job chegarasi -- bu testlar kesh-hit qarorini tekshiradi,
        # chegara emas (chegara test_daily_job_limit'da alohida sinaladi).
        _p = patch.object(job_creation, "_daily_job_limit_reached", return_value=False)
        _p.start()
        self.addCleanup(_p.stop)

        # Navbat himoyasi ham shunday -- test_queue_load.py'da alohida sinaladi.
        _q = patch.object(job_creation, "check_queue_capacity", return_value=None)
        _q.start()
        self.addCleanup(_q.stop)

        # check_dubbing_job/videoni bazaga tegmasdan qisqa deb hisoblaydigan
        # get_video_info javobi -- 45 daqiqadan qisqa, check_quota shu bilan
        # bazaga tegmasdan (True, 0) qaytaradi (backend/services/plans.py:129).
        self.video_info = {
            "title": "Test video",
            "duration": 60,
            "thumbnail": None,
            "description": "",
            "uploader": "test channel",
        }

        self.safety_ok = MagicMock(allowed=True, category=None)

    def _mock_cache_query(self, cached_job_or_none):
        chain = self.db.query.return_value.filter.return_value
        chain.filter.return_value = chain
        chain.order_by.return_value.first.return_value = cached_job_or_none

    @patch("backend.services.job_creation.process_video")
    @patch("backend.services.plans.get_job_queue", return_value="default")
    @patch("backend.services.plans.consume_quota")
    @patch("backend.services.plans.check_quota", return_value=(True, 0))
    @patch("backend.services.job_creation.check_safety")
    @patch("backend.services.job_creation.get_video_info")
    @patch.object(job_creation, "_cached_job_files_exist", return_value=True)
    async def test_valid_cached_job_is_reused(
        self, mock_files_exist, mock_get_info, mock_check_safety, mock_check_quota,
        mock_consume_quota, mock_get_queue, mock_process_video,
    ):
        cached = _make_completed_job()
        self._mock_cache_query(cached)

        result = await job_creation.create_dubbing_job(self.db, self.user, self.youtube_url)

        mock_files_exist.assert_called_once_with(cached)
        self.assertEqual(result.outcome, "ready")
        mock_get_info.assert_not_called()  # kesh-hit YouTube'ga so'rov yubormasligi kerak
        mock_process_video.apply_async.assert_not_called()  # kesh-hit qayta ishlanmaydi

    @patch("backend.services.job_creation.process_video")
    @patch("backend.services.plans.get_job_queue", return_value="default")
    @patch("backend.services.plans.consume_quota")
    @patch("backend.services.plans.check_quota", return_value=(True, 0))
    @patch("backend.services.job_creation.check_safety")
    @patch("backend.services.job_creation.get_video_info")
    @patch.object(job_creation, "_cached_job_files_exist", return_value=False)
    async def test_stale_cached_job_triggers_fresh_dub(
        self, mock_files_exist, mock_get_info, mock_check_safety, mock_check_quota,
        mock_consume_quota, mock_get_queue, mock_process_video,
    ):
        cached = _make_completed_job()
        self._mock_cache_query(cached)
        mock_get_info.return_value = self.video_info
        mock_check_safety.return_value = self.safety_ok

        result = await job_creation.create_dubbing_job(self.db, self.user, self.youtube_url)

        mock_files_exist.assert_called_once_with(cached)
        # Eski kesh chetlab o'tildi -- haqiqiy yangi job yaratildi (video
        # ma'lumoti YouTube'dan qayta olindi, Celery navbatiga qo'yildi).
        mock_get_info.assert_called_once()
        mock_process_video.apply_async.assert_called_once()
        self.assertEqual(result.outcome, "queued")
        self.assertIsNotNone(result.job_id)

    @patch("backend.services.job_creation.process_video")
    @patch("backend.services.plans.get_job_queue", return_value="default")
    @patch("backend.services.plans.consume_quota")
    @patch("backend.services.plans.check_quota", return_value=(True, 0))
    @patch("backend.services.job_creation.check_safety")
    @patch("backend.services.job_creation.get_video_info")
    async def test_no_cached_job_behaves_as_before(
        self, mock_get_info, mock_check_safety, mock_check_quota,
        mock_consume_quota, mock_get_queue, mock_process_video,
    ):
        """Kesh-hit umuman topilmasa (yangi video) -- eski, o'zgartirilmagan
        yo'l bo'yicha ishlashini tasdiqlaydi (regressiya himoyasi)."""
        self._mock_cache_query(None)
        mock_get_info.return_value = self.video_info
        mock_check_safety.return_value = self.safety_ok

        result = await job_creation.create_dubbing_job(self.db, self.user, self.youtube_url)

        mock_get_info.assert_called_once()
        mock_process_video.apply_async.assert_called_once()
        self.assertEqual(result.outcome, "queued")
        self.assertIsNotNone(result.job_id)

    async def test_daily_limit_reached_short_circuits_before_any_work(self):
        """Kunlik chegara -- get_video_info'gacha ham bormasdan
        "daily_limit" qaytaradi."""
        with patch.object(job_creation, "_daily_job_limit_reached", return_value=True), \
             patch.object(job_creation, "get_settings", return_value=MagicMock(MAX_JOBS_PER_DAY=20)), \
             patch("backend.services.job_creation.get_video_info") as mock_get_info:
            result = await job_creation.create_dubbing_job(self.db, self.user, self.youtube_url)

        self.assertEqual(result.outcome, "daily_limit")
        self.assertEqual(result.daily_limit, 20)
        mock_get_info.assert_not_called()


class TestDailyJobLimit(unittest.TestCase):
    """_daily_job_limit_reached() -- settings.MAX_JOBS_PER_DAY chegarasi."""

    def _db_returning_count(self, n: int):
        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = n
        return db

    @patch.object(job_creation, "get_settings")
    def test_below_limit_is_allowed(self, mock_gs):
        mock_gs.return_value = MagicMock(MAX_JOBS_PER_DAY=20)
        self.assertFalse(job_creation._daily_job_limit_reached(self._db_returning_count(19), uuid.uuid4()))

    @patch.object(job_creation, "get_settings")
    def test_at_limit_is_blocked(self, mock_gs):
        mock_gs.return_value = MagicMock(MAX_JOBS_PER_DAY=20)
        self.assertTrue(job_creation._daily_job_limit_reached(self._db_returning_count(20), uuid.uuid4()))

    @patch.object(job_creation, "get_settings")
    def test_zero_limit_disables_and_never_queries(self, mock_gs):
        mock_gs.return_value = MagicMock(MAX_JOBS_PER_DAY=0)
        db = MagicMock()
        self.assertFalse(job_creation._daily_job_limit_reached(db, uuid.uuid4()))
        db.query.assert_not_called()


if __name__ == "__main__":
    unittest.main()
