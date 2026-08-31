// Mirrors frontend/lib/api.ts's PlanDef/CurrentSubscription (backend/services/plans.py).

export interface PlanDef {
  id: string;
  name: string;
  price: number;
  monthly_minutes: number;
  priority: boolean;
  tts_tier: string;
}

export interface MinuteBalance {
  monthly_cap: number;
  monthly_used: number;
  monthly_remaining: number;
  purchased: number;
  total_available: number;
}

export interface MinutePack {
  minutes: number;
  price: number;
}

export interface CurrentSubscription {
  plan: string;
  expires_at: string | null;
  minutes: MinuteBalance;
}

export interface SubscribeResponse {
  success: boolean;
  payment_url: string;
  payment_id?: string;
  amount: number;
}

export const PLAN_NAMES: Record<string, string> = { free: 'Bepul', standard: 'Standart', pro: 'Pro' };
