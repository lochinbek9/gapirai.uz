"""Regression testlar: bepul tarif davomiyligi 45 daqiqa canonical qiymatiga
bog'langan bo'lishi kerak.

Tarix: 2026-08-28 `b679939` ("adopt Denis-kaa/ai-dubbet ...") merge'i
`PLANS["free"].free_minutes` ni 45.0 dan 5.0 ga QAYTARDI (Denis'ning 1-kunlik
bazasi initial-commit qiymatini ushlab turgan edi; `515fc6c` fix'i yo'qoldi).
Natijada `/api/plans` bepul kartada "5 daqiqagacha" ko'rsatib, boshqa barcha
yuza (FAQ / Terms / meta / `_FREE_THRESHOLD_MINUTES` / `calculate_price`) bilan
ziddiyatga kirardi. Bu test o'sha regressiya qaytmasligi uchun.
"""
import math
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.models.database import PlanTier
from backend.services import plans
from backend.services.plans import PLANS, _FREE_THRESHOLD_MINUTES, check_quota


def _free_sub(videos_used: int = 0):
    """check_quota() faqat shu uch maydonni o'qiydi -- transient obyekt kifoya."""
    return SimpleNamespace(plan=PlanTier.FREE, videos_used_this_period=videos_used)


class TestFreePlanThresholdConstant(unittest.TestCase):
    def test_free_plan_free_minutes_is_45(self):
        self.assertEqual(PLANS["free"].free_minutes, 45.0)

    def test_free_plan_free_minutes_matches_canonical_threshold(self):
        self.assertEqual(PLANS["free"].free_minutes, _FREE_THRESHOLD_MINUTES)

    def test_canonical_threshold_unchanged(self):
        # Ikkinchi tomonlama himoya: kimdir "moslashtiraman" deb threshold'ni
        # o'zgartirib qo'ymasin -- 45 daqiqa hamma frontend/FAQ/Terms matnida qattiq yozilgan.
        self.assertEqual(_FREE_THRESHOLD_MINUTES, 45.0)


class TestCheckQuotaFreeTier(unittest.TestCase):
    """check_quota(db, user_id, duration_minutes) -> (covered_without_payment, price_uzs)"""

    def _check(self, minutes, videos_used=0):
        with patch.object(plans, "get_or_create_subscription", return_value=_free_sub(videos_used)):
            return check_quota(db=None, user_id="u", duration_minutes=minutes)

    def test_30min_free_video_is_free(self):
        # 45 daqiqadan qisqa -> get_or_create_subscription'ga umuman bormaydi.
        self.assertEqual(check_quota(db=None, user_id="u", duration_minutes=30.0), (True, 0))

    def test_44min_free_video_is_free(self):
        self.assertEqual(check_quota(db=None, user_id="u", duration_minutes=44.0), (True, 0))

    def test_46min_free_video_costs_23000(self):
        covered, price = self._check(46.0)
        self.assertFalse(covered)
        self.assertEqual(price, math.ceil(46) * 500)   # 23_000
        self.assertEqual(price, 23_000)

    def test_90min_free_video_costs_45000(self):
        covered, price = self._check(90.0)
        self.assertFalse(covered)
        self.assertEqual(price, math.ceil(90) * 500)   # 45_000
        self.assertEqual(price, 45_000)

    def test_46min_price_is_23000_even_when_free_minutes_would_be_5(self):
        # Regressiya sirtmog'i: agar free_minutes yana 5.0 ga qaytsa, bu holat
        # baribir (False, 23000) qaytaradi (chunki 46 > 45 > 5 ikkalasida ham),
        # shuning uchun narx testlari YOLG'IZ o'zi regressiyani ushlay olmaydi --
        # TestFreePlanThresholdConstant birlamchi qo'riqchi. Bu test faqat
        # narx formulasini muzlatadi.
        self.assertEqual(self._check(46.0)[1], 23_000)


class TestCheckQuotaFreeTierBoundary(unittest.TestCase):
    """Aynan 45.0 daqiqa -- chegara xatti-harakati. HOZIRGI holatni MUZLATADI
    (siyosat qarori alohida; bu test faqat "kutilmaganda o'zgarmasin" uchun).

    free_minutes=45.0 bilan:
      - 45.0 < _FREE_THRESHOLD_MINUTES (45.0) -> False, birinchi shox o'tmaydi.
      - FREE tarif: covered = (45.0 <= 45.0) AND (videos_used < 1)
        -> davr ichidagi 1-video BEPUL, kvota tugagan bo'lsa PULLIK.
    """

    def _check(self, minutes, videos_used):
        with patch.object(plans, "get_or_create_subscription", return_value=_free_sub(videos_used)):
            return check_quota(db=None, user_id="u", duration_minutes=45.0)

    def test_exactly_45min_first_video_of_period_is_free(self):
        self.assertEqual(self._check(45.0, videos_used=0), (True, 0))

    def test_exactly_45min_when_quota_exhausted_is_paid(self):
        covered, price = self._check(45.0, videos_used=1)
        self.assertFalse(covered)
        self.assertEqual(price, math.ceil(45) * 500)   # 22_500


if __name__ == "__main__":
    unittest.main()
