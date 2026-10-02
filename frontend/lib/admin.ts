import axios from 'axios'
import { getApiUrl } from './runtime-config'

const API_URL = getApiUrl()

export interface AdminStats {
  users: { total: number; verified: number; last_7d: number; last_24h: number }
  jobs: {
    total: number
    with_registered_user: number
    anonymous: number
    by_status: Record<string, number>
    last_7d: number
    last_24h: number
  }
  payments: { approved_count: number; revenue_total_uzs: number }
  recent_users: { email: string; created_at: string | null; is_verified: boolean }[]
  recent_jobs: {
    id: string
    created_at: string | null
    video_title: string | null
    youtube_url: string
    user_email: string | null
    status: string
    error_code: string | null
    error_message: string | null
  }[]
  trends: {
    daily: { date: string; users: number; jobs: number }[]
    monthly: { date: string; users: number; jobs: number }[]
    yearly: { date: string; users: number; jobs: number }[]
    today: { users: number; jobs: number }
    yesterday: { users: number; jobs: number }
    this_month: { users: number; jobs: number }
    last_month: { users: number; jobs: number }
  }
}

export async function apiAdminStats(token: string): Promise<AdminStats> {
  const res = await axios.get(`${API_URL}/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}


export interface BlockedUsersReport {
  total_blocked_accounts: number
  total_violations: number
  users: {
    user_id: string
    name: string | null
    email: string | null
    phone: string | null
    violation_count: number
    last_violation_at: string | null
  }[]
  recent_violations: {
    id: string
    user_id: string
    video_title: string | null
    stage: string
    category: string
    reason: string | null
    created_at: string
  }[]
}

export async function apiAdminBlockedUsers(token: string): Promise<BlockedUsersReport> {
  const res = await axios.get(`${API_URL}/admin/blocked-users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export interface RefundsNeededReport {
  total_amount: number
  payments: {
    payment_id: string
    user_name: string | null
    user_email: string | null
    user_phone: string | null
    amount: number
    video_title: string | null
    error_message: string | null
    click_transaction_id: string | null
    paid_at: string | null
  }[]
}

export async function apiAdminRefundsNeeded(token: string): Promise<RefundsNeededReport> {
  const res = await axios.get(`${API_URL}/admin/refunds-needed`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export interface AdminUserItem {
  id: string
  email: string | null
  name: string | null
  phone: string | null
  role: string
  is_verified: boolean
  created_at: string | null
  plan: 'free' | 'standard' | 'pro' | string
  expires_at: string | null
  monthly_minutes_used: number
  purchased_minutes: number
  balance: {
    monthly_cap: number
    monthly_used: number
    monthly_remaining: number
    purchased: number
    total_available: number
  }
}

export interface AdminUsersResponse {
  total: number
  page: number
  limit: number
  users: AdminUserItem[]
}

export async function apiAdminListUsers(token: string, q?: string, page: number = 1, limit: number = 25): Promise<AdminUsersResponse> {
  const params: Record<string, any> = { page, limit }
  if (q && q.trim()) params.q = q.trim()
  const res = await axios.get(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  })
  return res.data
}

export async function apiAdminAddMinutes(
  token: string,
  userId: string,
  payload: { minutes?: number; amount_uzs?: number; rate_per_minute?: number; reason?: string }
) {
  const res = await axios.post(`${API_URL}/admin/users/${userId}/add-minutes`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminSetPlan(
  token: string,
  userId: string,
  payload: { plan: string; days?: number; reset_monthly?: boolean }
) {
  const res = await axios.post(`${API_URL}/admin/users/${userId}/set-plan`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export interface CookieHealth {
  exists: boolean
  path: string
  size: number
  min_expiry: number
  days_remaining: number
  is_fresh: boolean
  updated_at?: string | null
  cookie_count?: number
}

export async function apiAdminGetCookies(token: string): Promise<CookieHealth> {
  const res = await axios.get(`${API_URL}/admin/cookies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminUploadCookies(token: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const res = await axios.post(`${API_URL}/admin/cookies`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  })
  return res.data
}

export async function apiAdminDeleteCookies(token: string) {
  const res = await axios.delete(`${API_URL}/admin/cookies`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export interface RetentionSummary {
  total_registered: number
  total_active_all_time: number
  total_returning_all_time: number
  overall_retention_pct: number
  today: {
    total_active: number
    new_users: number
    returning_users: number
    returning_pct: number
  }
  yesterday: {
    total_active: number
    new_users: number
    returning_users: number
    returning_pct: number
  }
}

export interface DailyRetentionStat {
  date: string
  total_active: number
  new_users: number
  returning_users: number
  returning_pct: number
  jobs_count: number
}

export interface FrequencyBucket {
  label: string
  count: number
  pct: number
}

export interface RetentionUserItem {
  id: string
  name: string
  email: string
  phone: string
  created_at: string | null
  last_active_at: string | null
  active_days: number
  jobs_count: number
  loyalty_status: 'loyal' | 'returning' | 'one_time'
  loyalty_label: string
}

export interface RetentionStatsResponse {
  summary: RetentionSummary
  daily_stats: DailyRetentionStat[]
  frequency: FrequencyBucket[]
  recent_users: RetentionUserItem[]
}

export async function apiAdminRetentionStats(token: string, days: number = 14): Promise<RetentionStatsResponse> {
  const res = await axios.get(`${API_URL}/admin/retention`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days },
  })
  return res.data
}

// ─────────────────────────────────────────────────────────────
// Ommaviy xabarnomalar (Broadcast: Email & Telegram)
// ─────────────────────────────────────────────────────────────

export interface BroadcastCampaignItem {
  id: string
  title: string
  message: string
  channel: 'both' | 'telegram' | 'email'
  target_filter: 'all' | 'telegram_users' | 'email_users' | 'paid_users' | 'free_users'
  button_text: string | null
  button_url: string | null
  status: 'pending' | 'sending' | 'completed' | 'failed'
  total_recipients: number
  email_sent: number
  email_failed: number
  telegram_sent: number
  telegram_failed: number
  error_message: string | null
  created_at: string | null
  completed_at: string | null
  admin: {
    name: string
    email: string
  }
}

export interface BroadcastAudience {
  total_matched: number
  email_recipients: number
  telegram_recipients: number
  channel: string
  target_filter: string
}

export interface BroadcastCreatePayload {
  title: string
  message: string
  channel: 'both' | 'telegram' | 'email'
  target_filter: 'all' | 'telegram_users' | 'email_users' | 'paid_users' | 'free_users'
  button_text?: string
  button_url?: string
}

export interface BroadcastTestPayload {
  title: string
  message: string
  channel: 'both' | 'telegram' | 'email'
  button_text?: string
  button_url?: string
  test_email?: string
  test_telegram_chat_id?: string
}

export async function apiGetBroadcastAudience(
  token: string,
  channel: string,
  target_filter: string
): Promise<BroadcastAudience> {
  const res = await axios.get(`${API_URL}/admin/broadcast/audience`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { channel, target_filter },
  })
  return res.data
}

export async function apiSendBroadcastTest(
  token: string,
  payload: BroadcastTestPayload
): Promise<{ success: boolean; email_sent: boolean; telegram_sent: boolean; target_email?: string; target_telegram?: string; errors: string[] }> {
  const res = await axios.post(`${API_URL}/admin/broadcast/test`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiCreateBroadcast(
  token: string,
  payload: BroadcastCreatePayload
): Promise<{ success: boolean; campaign_id: string; message: string }> {
  const res = await axios.post(`${API_URL}/admin/broadcast`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiListBroadcasts(
  token: string,
  limit: number = 20
): Promise<{ campaigns: BroadcastCampaignItem[] }> {
  const res = await axios.get(`${API_URL}/admin/broadcast`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit },
  })
  return res.data
}




