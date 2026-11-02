"""backend/scripts/cleanup_jobs.py -- qaysi job'lar tozalanadi.

test_job_deletion.py bilan bir xil muhit (SQLite + soxta S3), ishga tushirish:
    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_cleanup_jobs
"""
import unittest
import uuid
from datetime import datetime, timedelta

from backend.models.database import DubbingJob, JobStatus, User
from backend.scripts.cleanup_jobs import find_candidates
from backend.services import job_deletion
from backend.tests import test_job_deletion as base

NOW = datetime(2026, 10, 26, 12, 0)


class CleanupJobsTest(base.JobDeletionTest):
    def user(self):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t")
        self.db.add(u)
        self.db.commit()
        return u

    def job(self, user, status=JobStatus.COMPLETED, days_ago=1, vid="vid1", **kw):
        j = DubbingJob(
            id=uuid.uuid4(), user_id=user.id if user else None, youtube_url=f"https://youtu.be/{vid}",
            youtube_video_id=vid, status=status, created_at=NOW - timedelta(days=days_ago), **kw,
        )
        self.db.add(j)
        self.db.commit()
        return j

    def ids(self, jobs):
        return {j.id for j in jobs}

    def test_rules(self):
        a, b = self.user(), self.user()
        cancelled_new = self.job(a, JobStatus.FAILED, days_ago=0, vid="c1", error_code="USER_CANCELLED")
        admin_cancel = self.job(a, JobStatus.FAILED, days_ago=0, vid="c2", error_code="ADMIN_CANCELLED")
        failed_new = self.job(a, JobStatus.FAILED, days_ago=2, vid="f1", error_code="DOWNLOAD_FAILED")
        failed_old = self.job(a, JobStatus.FAILED, days_ago=10, vid="f2", error_code="DOWNLOAD_FAILED")
        running_old = self.job(a, JobStatus.TRANSLATING, days_ago=30, vid="r1")
        awaiting = self.job(a, JobStatus.AWAITING_PAYMENT, days_ago=30, vid="r2")

        # a: bitta video uch marta -- eng yangi to'liq dublaj qoladi
        old_full = self.job(a, days_ago=9, vid="dup")
        keep_full = self.job(a, days_ago=5, vid="dup")
        preview = self.job(a, days_ago=1, vid="dup", is_preview=True)
        # a: o'sha video subtitr rejimida -- dublikat emas
        subtitle = self.job(a, days_ago=1, vid="dup", subtitle_only=True)
        # b: o'sha video -- boshqa foydalanuvchi, dublikat emas
        other_user = self.job(b, days_ago=1, vid="dup")
        # b: ommaviy eski nusxa yangisidan ustun
        public_old = self.job(b, days_ago=20, vid="pub", is_public=True)
        newer = self.job(b, days_ago=1, vid="pub")

        c = find_candidates(self.db, now=NOW)
        self.assertEqual(self.ids(c["cancelled"]), {cancelled_new.id, admin_cancel.id})
        self.assertEqual(self.ids(c["failed"]), {failed_old.id})
        self.assertEqual(self.ids(c["duplicates"]), {old_full.id, preview.id, newer.id})

        touched = set().union(*(self.ids(v) for v in c.values()))
        for safe in (failed_new, running_old, awaiting, keep_full, subtitle, other_user, public_old):
            self.assertNotIn(safe.id, touched)

    def test_deleting_duplicate_keeps_other_users_cached_copy(self):
        a, b = self.user(), self.user()
        root = self.make_root()                                  # a ning eski nusxasi -- asl fayllar shu yerda
        # make_root() vaqtni haqiqiy soatdan oladi, qolgan job'lar esa qat'iy NOW'dan -- sanani
        # NOW'ga bog'laymiz, aks holda test yozilganidan ~9 kun o'tib tartib aylanib qolardi
        root.user_id, root.youtube_video_id, root.created_at = a.id, "dup", NOW - timedelta(days=9)
        keep = self.job(a, days_ago=2, vid="dup")                # a ning yangi nusxasi qoladi
        copy_b = self.make_copy(root, 60)                        # b ning kesh nusxasi asl fayllarga ishora qiladi
        copy_b.user_id, copy_b.youtube_video_id = b.id, "dup"
        self.db.commit()

        dups = find_candidates(self.db, now=NOW)["duplicates"]
        self.assertEqual(self.ids(dups), {root.id})
        job_deletion.delete_job(self.db, dups[0])
        self.db.expire_all()

        survivor = self.db.get(DubbingJob, copy_b.id)
        self.assertIsNotNone(survivor)
        self.assertIsNone(survivor.source_job_id)                # b ning nusxasi endi o'zi asl
        self.assertTrue((self.out / str(copy_b.id) / "video" / "dubbed_final.mp4").exists())
        self.assertIsNotNone(self.db.get(DubbingJob, keep.id))


# JobDeletionTest'dagi testlar bu yerda qayta ishlamasin
for _name in [n for n in dir(base.JobDeletionTest) if n.startswith("test_")]:
    setattr(CleanupJobsTest, _name, None)

if __name__ == "__main__":
    unittest.main()
