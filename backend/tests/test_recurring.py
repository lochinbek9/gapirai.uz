"""2026-09-03 avtomatik to'lov (backend/services/recurring.py).

Provayder API'lari (Click/Payme) mock qilinadi — DB mantiqini tekshiramiz:
  - apply_successful_payment idempotentligi (fulfilled_at -> ikki marta kredit yo'q)
  - try_auto_topup: o'chiq / karta yo'q / kunlik limit / muvaffaqiyatli
  - run_auto_renew: charge OK -> uzaytiriladi; charge FAIL -> grace -> FREE
  - _pick_pack tanlash mantig'i
"""
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

from backend.models.database import SessionLocal, User, Subscription, PlanTier
from backend.models.payment import Payment, PaymentCard, PaymentStatus
from backend.services import plans, recurring
from backend.services.payment_fulfillment import apply_successful_payment


class _Base(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user = User(name="rc", email=f"rc-{datetime.utcnow().timestamp()}@t.co",
                         is_verified=True, auth_provider="password")
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

    def tearDown(self):
        self.db.query(Payment).filter(Payment.user_id == self.user.id).delete()
        self.db.query(PaymentCard).filter(PaymentCard.user_id == self.user.id).delete()
        self.db.query(Subscription).filter(Subscription.user_id == self.user.id).delete()
        self.db.query(User).filter(User.id == self.user.id).delete()
        self.db.commit()
        self.db.close()

    def _sub(self):
        return self.db.query(Subscription).filter(Subscription.user_id == self.user.id).first()

    def _card(self, active=True, default=True):
        c = PaymentCard(user_id=self.user.id, provider="click", token=f"tok-{datetime.utcnow().timestamp()}",
                        card_mask="860049******1234", card_type="uzcard", is_active=active, is_default=default,
                        consent_at=datetime.utcnow())
        self.db.add(c)
        self.db.commit()
        self.db.refresh(c)
        return c


class TestFulfillmentIdempotency(_Base):
    def test_minutes_credited_once_even_if_applied_twice(self):
        plans.get_or_create_subscription(self.db, self.user.id)
        p = Payment(user_id=self.user.id, amount=25000, minutes_purchased=60,
                    status=PaymentStatus.APPROVED, is_auto=True)
        self.db.add(p)
        self.db.commit()
        self.db.refresh(p)

        apply_successful_payment(self.db, p)   # webhook yo'li
        apply_successful_payment(self.db, p)   # charge() ichidagi to'g'ridan-to'g'ri yo'l

        self.assertAlmostEqual(self._sub().purchased_minutes, 60.0)
        self.assertIsNotNone(p.fulfilled_at)


class TestAutoTopup(_Base):
    def test_disabled_returns_false(self):
        self._card()
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.auto_topup_enabled = False
        self.db.commit()
        self.assertFalse(recurring.try_auto_topup(self.db, self.user.id, 10))

    def test_no_card_returns_false(self):
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.auto_topup_enabled = True
        self.db.commit()
        self.assertFalse(recurring.try_auto_topup(self.db, self.user.id, 10))

    @patch("backend.services.recurring.charge_card")
    def test_success_credits_and_picks_smallest_pack(self, mock_charge):
        self._card()
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.auto_topup_enabled = True
        self.db.commit()

        def _fake_charge(db, card, amount, *, minutes_purchased, is_auto, description, **kw):
            plans.add_purchased_minutes(db, card.user_id, minutes_purchased)
            p = Payment(user_id=card.user_id, amount=amount, minutes_purchased=minutes_purchased,
                        status=PaymentStatus.APPROVED, is_auto=True, fulfilled_at=datetime.utcnow())
            db.add(p)
            db.commit()
            return True, p
        mock_charge.side_effect = _fake_charge

        ok = recurring.try_auto_topup(self.db, self.user.id, 40)  # 40 -> 60 paket
        self.assertTrue(ok)
        self.assertEqual(mock_charge.call_args.kwargs["minutes_purchased"], 60)
        self.assertAlmostEqual(self._sub().purchased_minutes, 60.0)

    @patch("backend.services.recurring.charge_card")
    def test_daily_limit_blocks_further(self, mock_charge):
        self._card()
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.auto_topup_enabled = True
        self.db.commit()
        # bugun allaqachon AUTO_TOPUP_MAX_PER_DAY ta avtomatik to'lov bo'lgan
        from backend.config import get_settings
        for _ in range(get_settings().AUTO_TOPUP_MAX_PER_DAY):
            self.db.add(Payment(user_id=self.user.id, amount=15000, minutes_purchased=30,
                                status=PaymentStatus.APPROVED, is_auto=True))
        self.db.commit()

        self.assertFalse(recurring.try_auto_topup(self.db, self.user.id, 10))
        mock_charge.assert_not_called()

    def test_pick_pack(self):
        self.assertEqual(recurring._pick_pack(None, 10), 30)
        self.assertEqual(recurring._pick_pack(None, 40), 60)
        self.assertEqual(recurring._pick_pack(None, 200), 300)
        self.assertEqual(recurring._pick_pack(120, 40), 120)   # afzal ko'rilgan, qoplaydi
        self.assertEqual(recurring._pick_pack(30, 40), 60)     # afzal ko'rilgan qoplamaydi -> eng kichik mos


class TestAutoRenew(_Base):
    def _paid_sub(self, days_left=0):
        sub = plans.get_or_create_subscription(self.db, self.user.id)
        sub.plan = PlanTier.STANDARD
        sub.expires_at = datetime.utcnow() + timedelta(days=days_left)
        sub.auto_renew = True
        sub.auto_renew_plan = "standard"
        self.db.commit()
        return sub

    @patch("backend.services.recurring.charge_card")
    def test_charge_ok_extends_and_clears_grace(self, mock_charge):
        self._card()
        self._paid_sub(days_left=0)

        def _fake(db, card, amount, *, plan, is_auto, description, **kw):
            plans.activate_subscription(db, card.user_id, plan)
            p = Payment(user_id=card.user_id, amount=amount, plan=plan,
                        status=PaymentStatus.APPROVED, is_auto=True, fulfilled_at=datetime.utcnow())
            db.add(p); db.commit()
            return True, p
        mock_charge.side_effect = _fake

        out = recurring.run_auto_renew(self.db)
        self.assertEqual(out["charged"], 1)
        sub = self._sub()
        self.assertEqual(sub.plan, PlanTier.STANDARD)
        self.assertGreater(sub.expires_at, datetime.utcnow() + timedelta(days=25))
        self.assertIsNone(sub.grace_until)
        self.assertEqual(sub.renew_failed_attempts, 0)

    @patch("backend.services.recurring._notify")
    @patch("backend.services.recurring.charge_card")
    def test_charge_fail_enters_grace_then_downgrades(self, mock_charge, _n):
        self._card()
        self._paid_sub(days_left=0)
        mock_charge.return_value = (False, None)

        from backend.config import get_settings
        grace_days = get_settings().AUTO_RENEW_GRACE_DAYS

        # 1..grace_days-1: grace; oxirgi urinish: FREE
        for attempt in range(1, grace_days + 1):
            sub = self._sub()
            sub.renew_last_attempt_at = None  # keyingi cron kunini simulyatsiya
            if sub.grace_until:
                sub.grace_until = datetime.utcnow() + timedelta(days=grace_days)  # hali grace ichida
            self.db.commit()
            out = recurring.run_auto_renew(self.db)

        sub = self._sub()
        self.assertEqual(sub.plan, PlanTier.FREE)
        self.assertFalse(sub.auto_renew)

    @patch("backend.services.recurring._notify")
    @patch("backend.services.recurring.charge_card")
    def test_no_card_downgrades_path(self, mock_charge, _n):
        self._paid_sub(days_left=0)  # karta yo'q
        for _ in range(get_settings_grace() + 1):
            sub = self._sub()
            sub.renew_last_attempt_at = None
            if sub.grace_until:
                sub.grace_until = datetime.utcnow() + timedelta(days=10)
            self.db.commit()
            recurring.run_auto_renew(self.db)
        self.assertEqual(self._sub().plan, PlanTier.FREE)
        mock_charge.assert_not_called()


def get_settings_grace():
    from backend.config import get_settings
    return get_settings().AUTO_RENEW_GRACE_DAYS


if __name__ == "__main__":
    unittest.main()
