"""Avtomatik xatlar (backend/services/lifecycle_emails.py): kimga, qachon, qaysi xat."""
import unittest
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.models.database import (
    Base, DubbingJob, EmailLog, EmailOptOut, JobStatus, PlanTier, SiteNews, Subscription, User,
)
from backend.services import lifecycle_emails as le
from backend.services.email_service import DeliveryResult


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


# Toshkent 12:00 -- yuborish soatlari ichida
NOON = datetime(2026, 11, 2, 7, 0)


class LifecycleTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in (
            "users", "video_analyses", "dubbing_jobs", "subscriptions", "email_log", "email_opt_outs", "site_news")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()
        self.sent = []
        p = patch.object(le, "deliver_email", side_effect=self._deliver)
        p.start()
        self.addCleanup(p.stop)
        self.result = DeliveryResult.OK

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _deliver(self, to, subject, html, text, headers):
        self.sent.append((to, subject, headers))
        return self.result

    def user(self, days_ago=10, active_days_ago=0, **kw):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="Ali",
                 created_at=NOON - timedelta(days=days_ago), last_active_at=NOON - timedelta(days=active_days_ago), **kw)
        self.db.add(u)
        self.db.commit()
        return u

    def kinds(self, user):
        return {k for (k,) in self.db.query(EmailLog.kind).filter(EmailLog.user_id == user.id)}

    def test_activation_series_steps_and_spacing(self):
        u = self.user(days_ago=10)
        le.run(self.db, now=NOON, daily_limit=100)
        self.assertEqual(self.kinds(u), {"activate_1"})
        le.run(self.db, now=NOON + timedelta(days=1), daily_limit=100)   # 3 kunlik oraliq -- kutadi
        self.assertEqual(self.kinds(u), {"activate_1"})
        le.run(self.db, now=NOON + timedelta(days=3), daily_limit=100)
        le.run(self.db, now=NOON + timedelta(days=6), daily_limit=100)
        le.run(self.db, now=NOON + timedelta(days=9), daily_limit=100)   # seriya tugagan
        self.assertEqual(self.kinds(u), {"activate_1", "activate_2", "activate_3"})
        self.assertEqual(len(self.sent), 3)
        self.assertIn("List-Unsubscribe", self.sent[0][2])

    def test_new_user_waits_one_day_and_active_user_gets_nothing(self):
        fresh = self.user(days_ago=0)
        worker = self.user(days_ago=10)
        self.db.add(DubbingJob(id=uuid.uuid4(), user_id=worker.id, youtube_url="https://youtu.be/x", status=JobStatus.COMPLETED))
        self.db.commit()
        le.run(self.db, now=NOON, daily_limit=100)
        self.assertEqual(self.sent, [])

    def test_opt_out_internal_and_no_email_are_skipped(self):
        out = self.user()
        self.db.add(EmailOptOut(user_id=out.id))
        self.user(is_internal=True)
        nomail = self.user()
        nomail.email = None
        self.db.commit()
        le.run(self.db, now=NOON, daily_limit=100)
        self.assertEqual(self.sent, [])

    def test_night_and_daily_limit(self):
        for _ in range(5):
            self.user()
        night = datetime(2026, 11, 2, 20, 0)  # Toshkent 01:00
        self.assertEqual(le.run(self.db, now=night, daily_limit=100)["reason"], "tungi vaqt")
        res = le.run(self.db, now=NOON, daily_limit=2)
        self.assertEqual(res["sent"], 2)
        self.assertIn("keyingi kunlarga", res["reason"])
        self.assertEqual(le.run(self.db, now=NOON + timedelta(hours=1), daily_limit=2)["reason"], "kunlik limit")

    def test_rate_limited_is_not_logged_and_stops(self):
        u = self.user()
        self.user()
        self.result = DeliveryResult.RATE_LIMITED
        res = le.run(self.db, now=NOON, daily_limit=100)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("429", res["reason"])
        self.assertEqual(self.kinds(u), set())

    def test_quota_email_once_per_period(self):
        u = self.user()
        self.db.add(DubbingJob(id=uuid.uuid4(), user_id=u.id, youtube_url="https://youtu.be/x", status=JobStatus.COMPLETED))
        self.db.add(Subscription(id=uuid.uuid4(), user_id=u.id, plan=PlanTier.FREE, monthly_minutes_used=5.2,
                                 purchased_minutes=0, period_started_at=NOON - timedelta(days=4)))
        self.db.commit()
        le.run(self.db, now=NOON, daily_limit=100)
        le.run(self.db, now=NOON + timedelta(days=5), daily_limit=100)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0][1], "Bepul daqiqalaringiz tugadi")

    def test_weekly_news_only_when_there_is_news(self):
        u = self.user()
        self.db.add(DubbingJob(id=uuid.uuid4(), user_id=u.id, youtube_url="https://youtu.be/x", status=JobStatus.COMPLETED))
        self.db.commit()
        le.run(self.db, now=NOON, daily_limit=100)
        self.assertEqual(self.sent, [])
        self.db.add(SiteNews(title="Hujjat tahlili", body="PDF va Word fayllarni tahlil qiling.", created_at=NOON - timedelta(days=1)))
        self.db.commit()
        le.run(self.db, now=NOON, daily_limit=100)
        le.run(self.db, now=NOON + timedelta(days=4), daily_limit=100)  # shu hafta -- ikkinchi marta yo'q
        self.assertEqual(len(self.sent), 1)
        self.assertIn("Hujjat tahlili", self.sent[0][1])

    def test_unsubscribe_token(self):
        uid = uuid.uuid4()
        self.assertTrue(le.verify_unsubscribe(str(uid), le.unsubscribe_token(uid)))
        self.assertFalse(le.verify_unsubscribe(str(uid), le.unsubscribe_token(uuid.uuid4())))
        self.assertIn(str(uid), le.unsubscribe_url(uid))


if __name__ == "__main__":
    unittest.main()
