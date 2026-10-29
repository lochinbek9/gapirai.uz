import { apiClient } from '../../api/client';

export type PaymentProvider = 'click' | 'payme';

/** Nima uchun to'lanadi: tarif obunasi, daqiqa paketi yoki bitta video (awaiting_payment) */
export type PaymentTarget = { kind: 'plan'; plan: string } | { kind: 'pack'; minutes: number } | { kind: 'job'; jobId: string };

interface InitiateResponse {
  success: boolean;
  payment_url: string;
  payment_id?: string;
  amount: number;
}

// Saytdagi bilan bir xil endpointlar (frontend/lib/api.ts) -- backend kirgan foydalanuvchi
// uchun tayyor Click/Payme to'lov sahifasi havolasini qaytaradi.
const ENDPOINTS: Record<PaymentTarget['kind'], Record<PaymentProvider, string>> = {
  plan: { click: '/api/plans/subscribe', payme: '/api/payments/payme/initiate-subscription' },
  pack: { click: '/api/minutes/purchase', payme: '/api/minutes/purchase' },
  job: { click: '/api/payments/click/initiate', payme: '/api/payments/payme/initiate' },
};

function body(target: PaymentTarget, provider: PaymentProvider) {
  if (target.kind === 'plan') return { plan: target.plan };
  if (target.kind === 'pack') return { pack: target.minutes, provider };
  return { job_id: target.jobId };
}

export async function initiatePayment(target: PaymentTarget, provider: PaymentProvider): Promise<string> {
  const res = await apiClient.post<InitiateResponse>(ENDPOINTS[target.kind][provider], body(target, provider));
  if (!res.data.payment_url) throw new Error('Toʻlov havolasi kelmadi');
  return res.data.payment_url;
}
