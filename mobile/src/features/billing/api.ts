import { apiClient } from '../../api/client';
import type { BillingOverview, BillingPreferences } from '../plans/types';

// Mirrors frontend/lib/api.ts's billing block (backend/api/billing_routes.py).
// Variant A: the mobile app never sends card data — binding/enabling happens
// on gapirai.uz. Here we only read status and turn things OFF / remove a card.

export async function getBillingOverview(): Promise<BillingOverview> {
  const res = await apiClient.get('/api/billing/overview');
  return res.data;
}

export async function deleteCard(cardId: string): Promise<void> {
  await apiClient.delete(`/api/billing/cards/${cardId}`);
}

export async function setAutoRenew(enabled: boolean, plan?: string): Promise<BillingPreferences> {
  const res = await apiClient.put('/api/billing/auto-renew', { enabled, plan });
  return res.data;
}

export async function setAutoTopup(enabled: boolean, pack?: number | null): Promise<BillingPreferences> {
  const res = await apiClient.put('/api/billing/auto-topup', { enabled, pack });
  return res.data;
}
