"""2026-08-31 minute-based quota (backend/services/plans.py).

check_quota / consume_quota / refund_quota / add_purchased_minutes against a
real Subscription row -- monthly budget first, purchased minutes as overflow
that never resets.
"""
import unittest
from datetime import datetime, timedelta

from backend.models.database import SessionLocal, User, Subscription, PlanTier
from backend.services import plans


class TestMinuteQuota(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user = User(name="mq", email=f"mq-{datetime.utcnow().timestamp()}@t.co",
                         is_verified=True, auth_provider="password")
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self):
        self.db.query(Subscription).filter(Subscription.user_id == self.user.id).delete()
        self.db.query(User).filter(User.id == self.user.id).delete()
        self.db.commit()
        self.db.close()

    def _sub(self):
        return self.db.query(Subscription).filter(Subscription.user_id == self.user.id).first()

    def test_free_plan_25_minute_budget(self):
        covered, short = plans.check_quota(self.db, self.user.id, 20.0)
        self.assertTrue(covered)
        self.assertEqual(short, 0)

        covered, short = plans.check_quota(self.db, self.user.id, 40.0)
        self.assertFalse(covered)
        self.assertEqual(short, 15)  # 40 - 25

    def test_consume_then_blocked_then_refund(self):
        plans.consume_quota(self.db, self.user.id, 20.0)
        self.assertAlmostEqual(self._sub().monthly_minutes_used, 20.0)

        covered, short = plans.check_quota(self.db, self.user.id, 10.0)
        self.assertFalse(covered)
        self.assertEqual(short, 5)  # 10 needed, 5 left

        plans.refund_quota(self.db, self.user.id, 20.0)
        self.assertAlmostEqual(self._sub().monthly_minutes_used, 0.0)

    def test_purchased_minutes_cover_overflow_and_never_reset(self):
        plans.add_purchased_minutes(self.db, self.user.id, 60)
        # 25 monthly + 60 purchased = 85 available
        covered, short = plans.check_quota(self.db, self.user.id, 80.0)
        self.assertTrue(covered)

        plans.consume_quota(self.db, self.user.id, 80.0)
        sub = self._sub()
        self.assertAlmostEqual(sub.monthly_minutes_used, 25.0)   # monthly drained first
        self.assertAlmostEqual(sub.purchased_minutes, 5.0)       # 60 - 55

        # Billing cycle rolls over -> monthly resets, purchased untouched
        sub.period_started_at = datetime.utcnow() - timedelta(days=plans.QUOTA_RESET_DAYS + 1)
        self.db.commit()
        plans.get_or_create_subscription(self.db, self.user.id)
        sub = self._sub()
        self.assertAlmostEqual(sub.monthly_minutes_used, 0.0)
        self.assertAlmostEqual(sub.purchased_minutes, 5.0)

    def test_pro_plan_400_minutes(self):
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.plan = PlanTier.PRO
        sub.expires_at = datetime.utcnow() + timedelta(days=30)
        self.db.commit()
        covered, short = plans.check_quota(self.db, self.user.id, 390.0)
        self.assertTrue(covered)
        covered, short = plans.check_quota(self.db, self.user.id, 420.0)
        self.assertFalse(covered)
        self.assertEqual(short, 20)


if __name__ == "__main__":
    unittest.main()
