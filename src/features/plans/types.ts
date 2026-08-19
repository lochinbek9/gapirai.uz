// Mirrors frontend/lib/api.ts's PlanDef/CurrentSubscription (backend/services/plans.py).

export interface PlanDef {
  id: string;
  name: string;
  price: number;
  videos_per_period: number;
  free_minutes: number;
  priority: boolean;
  tts_tier: string;
}

export interface CurrentSubscription {
  plan: string;
  expires_at: string | null;
  videos_used_this_period: number;
}

export interface SubscribeResponse {
  success: boolean;
  payment_url: string;
  payment_id?: string;
  amount: number;
}

export const PLAN_NAMES: Record<string, string> = { free: 'Bepul', standard: 'Standart', pro: 'Pro' };
