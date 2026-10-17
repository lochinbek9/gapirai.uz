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

    def test_free_plan_monthly_budget(self):
        cap = plans.PLANS["free"].monthly_minutes  # kvota o'zgarsa test buzilmasin

        covered, short = plans.check_quota(self.db, self.user.id, cap - 1)
        self.assertTrue(covered)
        self.assertEqual(short, 0)

        covered, short = plans.check_quota(self.db, self.user.id, cap + 15)
        self.assertFalse(covered)
        self.assertEqual(short, 15)  # (cap + 15) - cap

    def test_consume_then_blocked_then_refund(self):
        cap = plans.PLANS["free"].monthly_minutes
        used = cap - 2  # 2 daqiqa qoladi
        plans.consume_quota(self.db, self.user.id, used)
        self.assertAlmostEqual(self._sub().monthly_minutes_used, used)

        covered, short = plans.check_quota(self.db, self.user.id, 7.0)
        self.assertFalse(covered)
        self.assertEqual(short, 5)  # 7 needed, 2 left

        plans.refund_quota(self.db, self.user.id, used)
        self.assertAlmostEqual(self._sub().monthly_minutes_used, 0.0)

    def test_purchased_minutes_cover_overflow_and_never_reset(self):
        cap = plans.PLANS["free"].monthly_minutes
        plans.add_purchased_minutes(self.db, self.user.id, 60)
        # cap monthly + 60 purchased available; 55 daqiqa oylikdan tashqari sarflanadi
        spend = cap + 55
        covered, short = plans.check_quota(self.db, self.user.id, spend)
        self.assertTrue(covered)

        plans.consume_quota(self.db, self.user.id, spend)
        sub = self._sub()
        self.assertAlmostEqual(sub.monthly_minutes_used, cap)    # monthly drained first
        self.assertAlmostEqual(sub.purchased_minutes, 5.0)       # 60 - 55

        # Billing cycle rolls over -> monthly resets, purchased untouched
        sub.period_started_at = datetime.utcnow() - timedelta(days=plans.QUOTA_RESET_DAYS + 1)
        self.db.commit()
        plans.get_or_create_subscription(self.db, self.user.id)
        sub = self._sub()
        self.assertAlmostEqual(sub.monthly_minutes_used, 0.0)
        self.assertAlmostEqual(sub.purchased_minutes, 5.0)

    def test_pro_plan_minutes(self):
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.plan = PlanTier.PRO
        sub.expires_at = datetime.utcnow() + timedelta(days=30)
        self.db.commit()
        cap = plans.PLANS["pro"].monthly_minutes
        covered, short = plans.check_quota(self.db, self.user.id, cap - 10.0)
        self.assertTrue(covered)
        covered, short = plans.check_quota(self.db, self.user.id, cap + 20.0)
        self.assertFalse(covered)
        self.assertEqual(short, 20)


if __name__ == "__main__":
    unittest.main()
