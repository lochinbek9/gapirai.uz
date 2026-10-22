"""Tests for first video 24-hour 10% discount logic and target audience filtering."""
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock

from backend.services.plans import get_user_first_video_discount
from backend.models.database import PlanTier


class TestFirstVideoDiscount(unittest.TestCase):
    def test_anonymous_user(self):
        """Anonymous user (None) must not receive any discount."""
        mock_db = MagicMock()
        res = get_user_first_video_discount(mock_db, None)
        self.assertFalse(res["eligible"])
        self.assertFalse(res["active"])
        self.assertFalse(res["expired"])

    def test_admin_user_excluded(self):
        """Admins and internal staff must not see discount or expired discount soft-landing."""
        mock_db = MagicMock()
        admin_user = MagicMock()
        admin_user.role = "admin"
        admin_user.is_internal = True

        mock_db.query.return_value.filter.return_value.first.return_value = admin_user
        res = get_user_first_video_discount(mock_db, 1)
        self.assertFalse(res["eligible"])
        self.assertFalse(res["active"])
        self.assertFalse(res["expired"])

    def test_paid_subscriber_excluded(self):
        """Users with active paid plans (Standard/Pro) must not see first video discount."""
        mock_db = MagicMock()
        normal_user = MagicMock(role="user", is_internal=False)
        paid_sub = MagicMock(plan=PlanTier.PRO)

        # Setup query returns for User then Subscription
        mock_db.query.return_value.filter.return_value.first.side_effect = [
            normal_user,  # User
            paid_sub,     # Subscription
        ]

        res = get_user_first_video_discount(mock_db, 2)
        self.assertFalse(res["eligible"])
        self.assertFalse(res["active"])
        self.assertFalse(res["expired"])

    def test_paid_payment_customer_excluded(self):
        """Users with approved payments must not see first video discount."""
        mock_db = MagicMock()
        normal_user = MagicMock(role="user", is_internal=False)
        free_sub = MagicMock(plan=PlanTier.FREE)
        approved_payment = MagicMock()

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            normal_user,       # User
            free_sub,          # Subscription
            approved_payment,  # Payment
        ]

        res = get_user_first_video_discount(mock_db, 3)
        self.assertFalse(res["eligible"])
        self.assertFalse(res["active"])
        self.assertFalse(res["expired"])

    def test_active_discount_within_24h(self):
        """Eligible free user whose first video completed 2 hours ago has active discount."""
        mock_db = MagicMock()
        normal_user = MagicMock(role="user", is_internal=False)
        free_sub = MagicMock(plan=PlanTier.FREE)
        completed_job = MagicMock(
            id="test-job-uuid",
            completed_at=datetime.utcnow() - timedelta(hours=2),
            created_at=datetime.utcnow() - timedelta(hours=3),
        )

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            normal_user,  # User
            free_sub,     # Subscription
            None,         # Payment (not paid)
        ]
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = completed_job

        res = get_user_first_video_discount(mock_db, 4)
        self.assertTrue(res["eligible"])
        self.assertTrue(res["active"])
        self.assertFalse(res["expired"])
        self.assertEqual(res["percent"], 10)
        self.assertGreater(res["seconds_left"], 0)

    def test_recently_expired_discount_within_7_days(self):
        """Free user whose discount expired 2 days ago receives soft-landing expired banner."""
        mock_db = MagicMock()
        normal_user = MagicMock(role="user", is_internal=False)
        free_sub = MagicMock(plan=PlanTier.FREE)
        completed_job = MagicMock(
            id="test-job-uuid",
            completed_at=datetime.utcnow() - timedelta(hours=48),
            created_at=datetime.utcnow() - timedelta(hours=49),
        )

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            normal_user,  # User
            free_sub,     # Subscription
            None,         # Payment (not paid)
        ]
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = completed_job

        res = get_user_first_video_discount(mock_db, 5)
        self.assertTrue(res["eligible"])
        self.assertFalse(res["active"])
        self.assertTrue(res["expired"])
        self.assertEqual(res["percent"], 0)
        self.assertEqual(res["seconds_left"], 0)

    def test_old_expired_discount_after_7_days_not_shown(self):
        """Free user whose discount expired 10 days ago does NOT see expired banner."""
        mock_db = MagicMock()
        normal_user = MagicMock(role="user", is_internal=False)
        free_sub = MagicMock(plan=PlanTier.FREE)
        completed_job = MagicMock(
            id="test-job-uuid",
            completed_at=datetime.utcnow() - timedelta(days=12),
            created_at=datetime.utcnow() - timedelta(days=12),
        )

        mock_db.query.return_value.filter.return_value.first.side_effect = [
            normal_user,  # User
            free_sub,     # Subscription
            None,         # Payment (not paid)
        ]
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = completed_job

        res = get_user_first_video_discount(mock_db, 6)
        self.assertFalse(res["eligible"])
        self.assertFalse(res["active"])
        self.assertFalse(res["expired"])


if __name__ == "__main__":
    unittest.main()
