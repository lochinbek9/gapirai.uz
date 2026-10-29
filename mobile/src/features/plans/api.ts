import { apiClient } from '../../api/client';
import type { CurrentSubscription, MinutePack, PlanDef } from './types';

export async function getPlans(): Promise<{ plans: PlanDef[]; current: CurrentSubscription | null; minute_packs?: MinutePack[] }> {
  const res = await apiClient.get('/api/plans');
  return res.data;
}

// Obuna / to'lov mobil ilova ichida amalga oshirilmaydi (Google Play Payments
// siyosati) — pricing ekrani foydalanuvchini gapirai.uz saytiga yo'naltiradi.
// backend /api/plans/subscribe endpointi web tomonidan ishlatiladi.
