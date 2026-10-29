import { apiClient } from '../../api/client';

export type PaymentProvider = 'click' | 'payme' | 'uzum' | 'paynet';

/** Nima uchun to'lanadi: tarif obunasi, daqiqa paketi yoki bitta video (awaiting_payment) */
export type PaymentTarget = { kind: 'plan'; plan: string } | { kind: 'pack'; minutes: number } | { kind: 'job'; jobId: string };

/**
 * Provayder javobi bitta shaklga keltiriladi:
 * - `url`: Click/Payme to'lov sahifasi yoki Uzum ilovasini ochuvchi universal havola;
 * - `code`: Paynet buyurtma raqami (checkout havolasi yo'q -- Paynet ilovasi/bankomatda
 *   kiritiladi) yoki Uzum havolasi kelmagan holatdagi account raqami;
 * - `none`: to'lov kerak emas (video kvota bilan qoplangan yoki allaqachon to'langan).
 */
export type PaymentStart =
  | { kind: 'url'; url: string; external: boolean }
  | { kind: 'code'; code: string; amount: number; provider: 'uzum' | 'paynet' }
  | { kind: 'none'; message: string };

interface InitiateResponse {
  success: boolean;
  payment_url?: string;
  order_id?: string;
  account?: number;
  amount: number;
  message?: string;
}

// Saytdagi bilan bir xil endpointlar (frontend/lib/api.ts) -- backend kirgan foydalanuvchi
// uchun to'lovni yaratadi.
const ENDPOINTS: Record<PaymentTarget['kind'], Record<PaymentProvider, string>> = {
  plan: {
    click: '/api/plans/subscribe',
    payme: '/api/payments/payme/initiate-subscription',
    uzum: '/api/payments/uzum/initiate-subscription',
    paynet: '/api/payments/paynet/initiate-subscription',
  },
  pack: {
    click: '/api/minutes/purchase',
    payme: '/api/minutes/purchase',
    uzum: '/api/payments/uzum/initiate-minutes',
    paynet: '/api/payments/paynet/initiate-minutes',
  },
  job: {
    click: '/api/payments/click/initiate',
    payme: '/api/payments/payme/initiate',
    uzum: '/api/payments/uzum/initiate',
    paynet: '/api/payments/paynet/initiate',
  },
};

function body(target: PaymentTarget, provider: PaymentProvider) {
  if (target.kind === 'plan') return { plan: target.plan };
  // /api/minutes/purchase Click va Payme uchun umumiy -- provayder tanadan olinadi
  if (target.kind === 'pack') return provider === 'click' || provider === 'payme' ? { pack: target.minutes, provider } : { pack: target.minutes };
  return { job_id: target.jobId };
}

export async function initiatePayment(target: PaymentTarget, provider: PaymentProvider): Promise<PaymentStart> {
  const { data } = await apiClient.post<InitiateResponse>(ENDPOINTS[target.kind][provider], body(target, provider));
  if (data.payment_url) return { kind: 'url', url: data.payment_url, external: provider === 'uzum' };
  if (provider === 'paynet' && data.order_id) return { kind: 'code', code: data.order_id, amount: data.amount, provider };
  if (provider === 'uzum' && data.account) return { kind: 'code', code: String(data.account), amount: data.amount, provider };
  if (data.amount === 0) return { kind: 'none', message: data.message || 'Toʻlov talab qilinmaydi.' };
  throw new Error('Toʻlov havolasi kelmadi');
}
