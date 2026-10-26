"""backend/services/job_deletion.py -- kesh nusxalari bor job'ni o'chirish.

Haqiqiy bazaga ulanmaydi: xotiradagi SQLite (FK tekshiruvi yoqilgan),
soxta S3 (dict) va vaqtinchalik OUTPUT_DIR. conftest'ni chetlab o'tish
uchun `python -m unittest backend.tests.test_job_deletion` bilan ishga
tushiring (DATABASE_URL=sqlite:///... bo'lishi kerak, aks holda models
import paytida Postgres drayverini so'raydi).
"""
import tempfile
import unittest
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.models.database import Base, DubbingJob, JobStatus, ResolutionVariant
from backend.services import job_deletion, storage


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


class FakeS3:
    def __init__(self):
        self.objects: dict[str, bytes] = {}

    def list_keys(self, prefix):
        return [k for k in self.objects if k.startswith(prefix)]

    def copy(self, src, dst):
        if src not in self.objects:
            return False
        self.objects[dst] = self.objects[src]
        return True

    def delete(self, key):
        return self.objects.pop(key, None) is not None

    def delete_prefix(self, prefix):
        return sum(1 for k in self.list_keys(prefix) if self.delete(k))


class JobDeletionTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        event.listen(self.engine, "connect", lambda c, _: c.execute("PRAGMA foreign_keys=ON"))
        tables = [Base.metadata.tables[n] for n in ("users", "video_analyses", "dubbing_jobs", "resolution_variants")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()

        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)
        self.s3 = FakeS3()
        patches = [
            mock.patch.object(job_deletion, "get_settings", return_value=SimpleNamespace(OUTPUT_DIR=str(self.out))),
            mock.patch.object(job_deletion, "_cancel_task", lambda _id: None),
            mock.patch.object(job_deletion, "_detach_payments", lambda db, _id: None),
            mock.patch.object(storage, "list_s3_keys", self.s3.list_keys),
            mock.patch.object(storage, "copy_s3_object", self.s3.copy),
            mock.patch.object(storage, "delete_file_from_s3", self.s3.delete),
            mock.patch.object(storage, "delete_s3_prefix", self.s3.delete_prefix),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.tmp.cleanup()

    # --- yordamchilar ---
    def make_root(self, minutes_ago=60):
        jid = uuid.uuid4()
        job = DubbingJob(
            id=jid, youtube_url="https://youtu.be/x", status=JobStatus.COMPLETED,
            created_at=datetime.utcnow() - timedelta(minutes=minutes_ago),
            output_video_path=f"outputs/{jid}/video/dubbed_final.mp4",
            output_video_url=f"/outputs/{jid}/video/dubbed_final.mp4",
            dubbed_audio_path=f"outputs/{jid}/audio/dubbed_audio.wav",
        )
        self.db.add(job)
        (self.out / str(jid) / "video").mkdir(parents=True)
        (self.out / str(jid) / "video" / "dubbed_final.mp4").write_bytes(b"video")
        self.s3.objects[f"dubber/{jid}/dubbed_final.mp4"] = b"video"
        self.s3.objects[f"dubber/{jid}/dubbed_360p.mp4"] = b"360"
        self.s3.objects[f"dubber-checkpoints/{jid}/video.mp4"] = b"ckpt"
        self.db.add(ResolutionVariant(job_id=jid, resolution="360p", status="ready", s3_key=f"dubber/{jid}/dubbed_360p.mp4"))
        self.db.commit()
        return job

    def make_copy(self, root, minutes_ago):
        job = DubbingJob(
            id=uuid.uuid4(), youtube_url=root.youtube_url, status=JobStatus.COMPLETED,
            source_job_id=root.id, created_at=datetime.utcnow() - timedelta(minutes=minutes_ago),
            output_video_path=root.output_video_path, output_video_url=root.output_video_url,
            dubbed_audio_path=root.dubbed_audio_path,
        )
        self.db.add(job)
        self.db.commit()
        return job

    # --- holatlar ---
    def test_root_without_copies_removes_all_files(self):
        root = self.make_root()
        rid = str(root.id)
        impact = job_deletion.delete_job(self.db, root)
        self.assertEqual((impact.is_copy, impact.copies), (False, 0))
        self.assertIsNone(self.db.get(DubbingJob, uuid.UUID(rid)))
        self.assertFalse((self.out / rid).exists())
        self.assertEqual(self.s3.objects, {})
        self.assertEqual(self.db.query(ResolutionVariant).count(), 0)

    def test_copy_deletes_only_its_row(self):
        root = self.make_root()
        copy = self.make_copy(root, 30)
        before = dict(self.s3.objects)
        impact = job_deletion.delete_job(self.db, copy)
        self.assertTrue(impact.is_copy)
        self.assertIsNotNone(self.db.get(DubbingJob, root.id))
        self.assertTrue((self.out / str(root.id) / "video" / "dubbed_final.mp4").exists())
        self.assertEqual(self.s3.objects, before)

    def test_root_with_copies_promotes_oldest_copy(self):
        root = self.make_root(minutes_ago=90)
        later = self.make_copy(root, 10)
        oldest = self.make_copy(root, 50)
        rid, hid, lid = str(root.id), str(oldest.id), str(later.id)

        impact = job_deletion.delete_job(self.db, root)
        self.db.expire_all()
        self.assertEqual(impact.copies, 2)
        self.assertIsNone(self.db.get(DubbingJob, uuid.UUID(rid)))

        heir = self.db.get(DubbingJob, uuid.UUID(hid))
        other = self.db.get(DubbingJob, uuid.UUID(lid))
        self.assertIsNone(heir.source_job_id)
        self.assertEqual(str(other.source_job_id), hid)
        self.assertEqual(heir.storage_id, hid)
        self.assertEqual(other.storage_id, hid)
        for j in (heir, other):
            self.assertEqual(j.output_video_url, f"/outputs/{hid}/video/dubbed_final.mp4")
            self.assertNotIn(rid, j.dubbed_audio_path)

        # fayllar merosxo'r ID'siga ko'chgan, eskilari qolmagan
        self.assertTrue((self.out / hid / "video" / "dubbed_final.mp4").exists())
        self.assertFalse((self.out / rid).exists())
        self.assertIn(f"dubber/{hid}/dubbed_final.mp4", self.s3.objects)
        self.assertIn(f"dubber/{hid}/dubbed_360p.mp4", self.s3.objects)
        self.assertFalse([k for k in self.s3.objects if rid in k])

        variant = self.db.query(ResolutionVariant).one()
        self.assertEqual(str(variant.job_id), hid)
        self.assertEqual(variant.s3_key, f"dubber/{hid}/dubbed_360p.mp4")

    def test_copy_with_chained_copy_relinks_to_original(self):
        root = self.make_root()
        copy = self.make_copy(root, 30)
        # eski zanjir: nusxaga ishora qiluvchi nusxa
        chained = self.make_copy(root, 10)
        chained.source_job_id = copy.id
        self.db.commit()

        job_deletion.delete_job(self.db, copy)
        self.db.expire_all()
        self.assertIsNone(self.db.get(DubbingJob, copy.id))
        survivor = self.db.get(DubbingJob, chained.id)
        self.assertEqual(survivor.source_job_id, root.id)
        self.assertEqual(survivor.storage_id, str(root.id))
        self.assertTrue((self.out / str(root.id) / "video" / "dubbed_final.mp4").exists())

    def test_failed_s3_copy_rolls_back_everything(self):
        root = self.make_root()
        copy = self.make_copy(root, 10)
        rid, cid = str(root.id), str(copy.id)
        before = dict(self.s3.objects)
        with mock.patch.object(storage, "copy_s3_object", lambda s, d: False):
            with self.assertRaises(job_deletion.JobDeletionError):
                job_deletion.delete_job(self.db, root)
        self.db.expire_all()
        self.assertIsNotNone(self.db.get(DubbingJob, uuid.UUID(rid)))
        self.assertEqual(str(self.db.get(DubbingJob, uuid.UUID(cid)).source_job_id), rid)
        self.assertTrue((self.out / rid / "video" / "dubbed_final.mp4").exists())
        self.assertFalse((self.out / cid).exists())
        self.assertEqual(self.s3.objects, before)


if __name__ == "__main__":
    unittest.main()
