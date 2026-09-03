import { apiClient } from '../../api/client';
import type { BillingOverview, BillingPreferences, SavedCard } from '../plans/types';

// Mirrors frontend/lib/api.ts's billing block (backend/api/billing_routes.py).
// Card number (PAN) is sent straight to the provider and never stored/logged.

export async function getBillingOverview(): Promise<BillingOverview> {
  const res = await apiClient.get('/api/billing/overview');
  return res.data;
}

export async function bindCard(
  provider: 'click' | 'payme',
  cardNumber: string,
  expire: string,
): Promise<{ card: SavedCard; needs_code: boolean; phone_hint: string | null }> {
  const res = await apiClient.post('/api/billing/cards', {
    provider,
    card_number: cardNumber,
    expire,
  });
  return res.data;
}

export async function verifyCard(cardId: string, code: string): Promise<{ card: SavedCard }> {
  const res = await apiClient.post(`/api/billing/cards/${cardId}/verify`, { code });
  return res.data;
}

export async function resendCardCode(cardId: string): Promise<{ phone_hint: string | null }> {
  const res = await apiClient.post(`/api/billing/cards/${cardId}/resend`);
  return res.data;
}

export async function setDefaultCard(cardId: string): Promise<void> {
  await apiClient.post(`/api/billing/cards/${cardId}/default`);
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
