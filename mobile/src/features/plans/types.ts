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

export const PLAN_NAMES: Record<string, string> = { free: 'Bepul', standard: 'Standart', pro: 'Pro' };

// ── Avtomatik to'lov (mirrors frontend/lib/api.ts, backend/services/recurring.py) ──

export interface SavedCard {
  id: string;
  provider: 'click' | 'payme';
  card_mask: string | null;
  card_type: string | null;
  expire: string | null;
  is_active: boolean;
  is_default: boolean;
  phone_hint: string | null;
  last_error: string | null;
  created_at: string | null;
}

export interface BillingPreferences {
  auto_renew: boolean;
  auto_renew_plan: string | null;
  auto_topup_enabled: boolean;
  auto_topup_pack: number | null;
  in_grace: boolean;
  grace_until: string | null;
  renew_failed_attempts: number;
}

export interface BillingOverview {
  providers: { click: boolean; payme: boolean };
  cards: SavedCard[];
  has_active_card: boolean;
  current_plan: string;
  current_plan_paid: boolean;
  preferences: BillingPreferences;
  minute_balance: MinuteBalance;
  minute_packs: MinutePack[];
}
