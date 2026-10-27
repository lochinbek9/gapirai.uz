"""GET /api/public-stats -- bosh sahifadagi jonli raqamlar.

Ishga tushirish (conftest'siz, SQLite bilan):
    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_public_stats
"""
import unittest
import uuid

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api import routes
from backend.models.database import Base, DubbingJob, JobStatus, User


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


class PublicStatsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in ("users", "video_analyses", "dubbing_jobs")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()
        routes._public_stats_cache.update(at=0.0, data=None)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def user(self, verified=True, internal=False):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", is_verified=verified, is_internal=internal)
        self.db.add(u)
        self.db.commit()
        return u

    def job(self, user, seconds=120, status=JobStatus.COMPLETED, **kw):
        j = DubbingJob(id=uuid.uuid4(), user_id=user.id if user else None, youtube_url="https://youtu.be/x",
                       status=status, video_duration=seconds, **kw)
        self.db.add(j)
        self.db.commit()
        return j

    def test_counts_finished_videos_and_real_users(self):
        real, other = self.user(), self.user()
        self.user(verified=False)                          # tasdiqlanmagan -- sanalmaydi
        staff = self.user(internal=True)                   # ichki -- foydalanuvchi sifatida sanalmaydi

        root = self.job(real, seconds=600)                 # 10 daqiqa
        self.job(other, seconds=600, source_job_id=root.id)  # kesh nusxasi: video sanaladi, daqiqa yo'q
        self.job(None, seconds=180)                        # mehmon (user'siz) -- sanaladi, 3 daqiqa
        self.job(real, seconds=300, subtitle_only=True)    # subtitr -- video sanaladi, ovoz daqiqasi yo'q
        self.job(real, seconds=300, status=JobStatus.FAILED)       # tayyor emas -- sanalmaydi
        self.job(real, seconds=300, status=JobStatus.TRANSLATING)  # tayyor emas -- sanalmaydi
        self.job(staff, seconds=900)                       # ichki xodim videosi -- sanaladi, 15 daqiqa

        # videolar: 5 ta tayyor; daqiqa: 10 + 3 + 15; foydalanuvchilar: ichkisiz va tasdiqlanganlar
        self.assertEqual(routes.public_stats(self.db), {"dubs": 5, "minutes": 28, "users": 2})

    def test_result_is_cached_briefly(self):
        u = self.user()
        self.job(u)
        first = routes.public_stats(self.db)
        self.job(u)
        self.assertEqual(routes.public_stats(self.db), first)
        routes._public_stats_cache.update(at=0.0, data=None)
        self.assertEqual(routes.public_stats(self.db)["dubs"], first["dubs"] + 1)


if __name__ == "__main__":
    unittest.main()
