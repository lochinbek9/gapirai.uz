"""Suv belgisi istisnosi (hamkorlar): merger belgisiz yig'adi, kesh belgi holati mos
kelmaganda berilmaydi (backend/services/watermark.py)."""
import inspect
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.models.database import Base, DubbingJob, JobStatus, User, WatermarkExemption
from backend.services import merger
from backend.services.watermark import is_cache_compatible, is_watermark_exempt


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


class MergerWatermarkTest(unittest.TestCase):
    @patch("backend.services.merger._get_duration", side_effect=[10.0, 10.0])
    @patch("backend.services.merger._probe_video_codec", return_value="h264")
    @patch("backend.services.merger.subprocess.run")
    def _cmd(self, watermark, mock_run, _codec, _dur):
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "out.mp4")

            def run(*args, **kwargs):
                Path(out).write_bytes(b"v")
                return MagicMock(returncode=0)

            mock_run.side_effect = run
            merger.merge_video_audio("v.mp4", "a.wav", out, watermark=watermark)
            return " ".join(mock_run.call_args[0][0])

    def test_watermark_on_by_default_and_off_for_partner(self):
        if not merger.WATERMARK_PATH.exists():
            self.skipTest("watermark asset yo'q")
        self.assertIn(str(merger.WATERMARK_PATH), self._cmd(True))
        self.assertNotIn(str(merger.WATERMARK_PATH), self._cmd(False))

    def test_worker_passes_exemption_to_merger(self):
        from backend.workers import tasks
        src = inspect.getsource(tasks.process_video.run)
        self.assertIn("with_watermark = not is_watermark_exempt(db, job.user_id)", src)
        self.assertIn("watermark=with_watermark,", src)


class CacheCompatibilityTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in ("users", "video_analyses", "dubbing_jobs", "watermark_exemptions")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def user(self, exempt=False):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t")
        self.db.add(u)
        if exempt:
            self.db.add(WatermarkExemption(user_id=u.id, note="hamkor"))
        self.db.commit()
        return u

    def job(self, user, source=None):
        j = DubbingJob(id=uuid.uuid4(), user_id=user.id, youtube_url="https://youtu.be/x", status=JobStatus.COMPLETED,
                       source_job_id=source.id if source else None)
        self.db.add(j)
        self.db.commit()
        return j

    def test_rules(self):
        partner, regular, other = self.user(exempt=True), self.user(), self.user()
        regular_root = self.job(regular)
        partner_root = self.job(partner)
        copy_of_partner = self.job(other, source=partner_root)

        self.assertTrue(is_watermark_exempt(self.db, partner.id))
        self.assertFalse(is_watermark_exempt(self.db, regular.id))
        self.assertFalse(is_watermark_exempt(self.db, None))

        self.assertTrue(is_cache_compatible(self.db, other.id, regular_root))      # oddiy <- oddiy
        self.assertFalse(is_cache_compatible(self.db, partner.id, regular_root))   # hamkor belgili nusxa olmaydi
        self.assertFalse(is_cache_compatible(self.db, other.id, partner_root))     # boshqalar belgisizini olmaydi
        self.assertFalse(is_cache_compatible(self.db, regular.id, copy_of_partner))  # nusxa orqali ham
        self.assertTrue(is_cache_compatible(self.db, partner.id, partner_root))


if __name__ == "__main__":
    unittest.main()
