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
    tts_provider?: string | null
    voice_name?: string | null
    stt_model?: string | null
    translation_model?: string | null
    tts_model?: string | null
  }[]
  trends: {
    daily: { date: string; users: number; jobs: number }[]
    monthly: { date: string; users: number; jobs: number }[]
    yearly: { date: string; users: number; jobs: number }[]
    today: { users: number; jobs: number; payments?: number; revenue_uzs?: number }
    yesterday: { users: number; jobs: number; payments?: number; revenue_uzs?: number }
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
  is_internal?: boolean
  is_verified: boolean
  is_active?: boolean
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

export interface AdminUsersSummary {
  total: number
  paid_count: number
  free_count: number
  has_package_count: number
  zero_balance_count: number
  unverified_count: number
  period_label: string
}

export interface AdminUserInsight {
  type: 'warning' | 'caution' | 'success' | 'info'
  title: string
  description: string
}

export interface AdminUsersResponse {
  total: number
  page: number
  limit: number
  users: AdminUserItem[]
  summary?: AdminUsersSummary
  insights?: AdminUserInsight[]
}

export async function apiAdminListUsers(
  token: string,
  q?: string,
  page: number = 1,
  limit: number = 25,
  planFilter?: string,
  balanceFilter?: string,
  sortBy: string = 'newest',
  dateRange?: string,
  startDate?: string,
  endDate?: string
): Promise<AdminUsersResponse> {
  const params: Record<string, any> = { page, limit }
  if (q && q.trim()) params.q = q.trim()
  if (planFilter && planFilter !== 'all') params.plan_filter = planFilter
  if (balanceFilter && balanceFilter !== 'all') params.balance_filter = balanceFilter
  if (sortBy) params.sort_by = sortBy
  if (dateRange && dateRange !== 'all') params.date_range = dateRange
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  const res = await axios.get(`${API_URL}/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  })
  return res.data
}

export async function apiAdminAddMinutes(
  token: string,
  userId: string,
  payload: {
    minutes?: number
    amount_uzs?: number
    rate_per_minute?: number
    action?: 'add' | 'deduct'
    target?: 'purchased' | 'monthly' | 'kuymas' | 'tarif'
    balance_type?: 'purchased' | 'monthly' | 'kuymas' | 'tarif'
    reason?: string
  }
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

export interface AdminCreateUserPayload {
  name: string
  email: string
  password: string
  role?: 'user' | 'admin' | string
  phone?: string
  is_internal?: boolean
  is_verified?: boolean
}

export interface AdminUpdateCredentialsPayload {
  name?: string
  email?: string
  password?: string
  role?: 'user' | 'admin' | string
  phone?: string
  is_internal?: boolean
  is_verified?: boolean
  is_active?: boolean
}

export interface AdminChangeSelfPayload {
  name?: string
  email?: string
  new_password?: string
}

export async function apiAdminCreateUser(token: string, payload: AdminCreateUserPayload) {
  const res = await axios.post(`${API_URL}/admin/users`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminUpdateUserCredentials(token: string, userId: string, payload: AdminUpdateCredentialsPayload) {
  const res = await axios.patch(`${API_URL}/admin/users/${userId}/credentials`, payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminChangeMyCredentials(token: string, payload: AdminChangeSelfPayload) {
  const res = await axios.post(`${API_URL}/admin/change-my-credentials`, payload, {
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
  streak: number
  plan: string
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

export async function apiAdminRetentionStats(
  token: string,
  days: number = 7,
  limit: number = 20,
  offset: number = 0
): Promise<RetentionStatsResponse> {
  const res = await axios.get(`${API_URL}/admin/retention`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days, limit, offset },
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
  target_filter: 'all' | 'unactivated_users' | 'telegram_users' | 'email_users' | 'paid_users' | 'free_users'
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


// ─────────────────────────────────────────────────────────────
// Funnel (Voronka) Konversiya Tahlili
// ─────────────────────────────────────────────────────────────

export interface FunnelStageItem {
  key: string
  label: string
  count: number
  pct_of_top: number
  conversion_from_prev: number
  drop_pct: number
  icon: string
}

export interface FunnelFinancialMetrics {
  overall_conversion_pct: number
  total_revenue_uzs: number
  subscription_revenue_uzs: number
  minute_packs_revenue_uzs: number
  average_order_value_uzs: number
  approved_transactions_count: number
}

export interface FunnelProviderItem {
  provider: string
  count: number
  total_uzs: number
  pct: number
}

export interface FunnelRecentConversion {
  payment_id: string
  user_id: string
  user_name: string
  user_email: string
  user_phone: string
  item_type: string
  item_label: string
  amount_uzs: number
  provider: string
  paid_at: string | null
}

export interface FunnelInsight {
  stage: string
  type: 'warning' | 'caution' | 'success' | 'info'
  title: string
  description: string
}

export interface FunnelStatsResponse {
  timeframe: {
    days: number
    since_date: string
    today: string
  }
  stages: FunnelStageItem[]
  metrics: FunnelFinancialMetrics
  providers: FunnelProviderItem[]
  recent_conversions: FunnelRecentConversion[]
  insights: FunnelInsight[]
}

export async function apiAdminFunnel(
  token: string,
  days: number = 30,
  includeInternal: boolean = false
): Promise<FunnelStatsResponse> {
  const res = await axios.get(`${API_URL}/admin/funnel`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { days, include_internal: includeInternal },
  })
  return res.data
}

// ─────────────────────────────────────────────────────────────
// Kohortalar (Activation & Retention Cohorts)
// ─────────────────────────────────────────────────────────────

export interface CohortPeriodItem {
  period_index: number
  label: string
  active_count: number
  retention_pct: number | null
  is_future: boolean
}

export interface RetentionCohortRow {
  cohort_id: string
  cohort_label: string
  cohort_start: string
  cohort_end: string
  cohort_size: number
  periods: CohortPeriodItem[]
}

export interface CohortBenchmarkItem {
  period_index: number
  label: string
  avg_retention_pct: number | null
  cohorts_count: number
}

export interface ActivationCohortRow {
  cohort_id: string
  cohort_label: string
  cohort_start: string
  cohort_end: string
  cohort_size: number
  verified_count: number
  verified_pct: number
  attempted_count: number
  attempted_pct: number
  d0_activated_count: number
  d0_activated_pct: number
  d3_activated_count: number
  d3_activated_pct: number
  d7_activated_count: number
  d7_activated_pct: number
  completed_job_count: number
  completed_job_pct: number
  habit_2plus_count: number
  habit_2plus_pct: number
  paid_count: number
  paid_pct: number
  avg_min_to_action: number
  median_min_to_action: number
}

export interface CohortsActivationSummary {
  total_users_evaluated: number
  overall_verified_pct: number
  overall_d0_activation_pct: number
  overall_aha_moment_pct: number
  overall_habit_pct: number
  overall_paid_pct: number
  avg_w1_retention_pct: number | null
  median_time_to_first_action_min: number
}

export interface CohortInsight {
  type: 'warning' | 'caution' | 'success' | 'info'
  title: string
  description: string
}

export interface CohortsResponse {
  granularity: 'weekly' | 'monthly'
  metric: 'activity' | 'jobs' | 'paying'
  timeframe: {
    since_date: string
    today: string
  }
  cohorts: RetentionCohortRow[]
  benchmarks: CohortBenchmarkItem[]
  activation: ActivationCohortRow[]
  activation_summary: CohortsActivationSummary
  insights: CohortInsight[]
}

export async function apiAdminCohorts(
  token: string,
  granularity: 'weekly' | 'monthly' = 'weekly',
  metric: 'activity' | 'jobs' | 'paying' = 'activity',
  periodsCount: number = 8,
  includeInternal: boolean = false
): Promise<CohortsResponse> {
  const res = await axios.get(`${API_URL}/admin/cohorts`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      granularity,
      metric,
      periods_count: periodsCount,
      include_internal: includeInternal,
    },
  })
  return res.data
}

export interface AdminJobCostSummary {
  total_jobs: number
  completed_jobs: number
  failed_jobs: number
  processing_jobs: number
  queued_jobs?: number
  awaiting_payment_jobs: number
  success_rate_pct: number
  total_completed_duration_min: number
  providers: Record<string, number>
  page_total_cost_usd: number
  page_total_cost_uzs: number
  page_avg_job_cost_uzs: number
}

export interface AdminJobCostItem {
  id: string
  video_title: string
  youtube_url: string
  youtube_video_id: string | null
  video_thumbnail: string | null
  video_duration: number
  video_duration_min: number
  status: string
  status_message: string | null
  progress: number
  created_at: string | null
  completed_at: string | null
  processing_seconds: number | null
  subtitle_only: boolean
  is_preview?: boolean
  is_public?: boolean
  published_at?: string | null
  source_language: string | null
  models: {
    tts_provider: string
    voice_name: string | null
    voice_style: string | null
    stt_model: string | null
    stt_display?: string | null
    stt_provider_name?: string | null
    is_groq?: boolean
    translation_model: string | null
    gemini_key_tier?: 'paid' | 'free' | null
    gemini_key_used?: string | null
    has_transcript?: boolean
    has_translation?: boolean
  }
  costs: {
    tts_cost_usd: number
    tts_cost_uzs: number
    tts_characters: number
    tts_duration_seconds: number
    tts_calls_count: number
    cache_hits_count: number
    cache_saved_usd: number
    stt_cost_usd: number
    llm_cost_usd: number
    total_cost_usd: number
    total_cost_uzs: number
    cost_per_minute_uzs: number
  }
  payment: {
    has_payment: boolean
    revenue_uzs: number
    profit_uzs: number | null
    margin_pct: number | null
    provider: string | null
  }
  user: {
    id: string | null
    name: string
    email: string | null
    phone: string | null
    is_internal: boolean
    is_active?: boolean
    plan?: string
    balance_minutes?: number
  }
  error_code: string | null
  error_message: string | null
  qa_summary: {
    total_segments: number
    passed_segments: number
    retried_segments: number
    avg_score: number | null
  } | null
}

export interface AdminJobsCostResponse {
  summary: AdminJobCostSummary & { date_range?: string }
  pagination: {
    page: number
    page_size: number
    total_items: number
    total_pages: number
  }
  jobs: AdminJobCostItem[]
}

export async function apiAdminJobsCost(
  token: string,
  page: number = 1,
  pageSize: number = 25,
  status?: string,
  search?: string,
  ttsProvider?: string,
  includeInternal: boolean = false,
  sortBy: string = 'newest',
  dateRange: string = 'today',
  startDate?: string,
  endDate?: string,
  plan?: string,
  errorCode?: string,
  publicOnly: boolean = false
): Promise<AdminJobsCostResponse> {
  const res = await axios.get(`${API_URL}/admin/jobs-cost`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      page,
      page_size: pageSize,
      status: status || undefined,
      search: search || undefined,
      tts_provider: ttsProvider || undefined,
      plan: plan && plan !== 'ALL' ? plan : undefined,
      error_code: errorCode && errorCode !== 'ALL' ? errorCode : undefined,
      include_internal: includeInternal,
      public_only: publicOnly || undefined,
      sort_by: sortBy,
      date_range: dateRange,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    },
  })
  return res.data
}

export interface UnactivatedUserItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  telegram_chat_id: string | null
  is_verified: boolean
  registered_at: string | null
  attempt_count: number
  category: 'never_attempted' | 'failed_attempt' | 'awaiting_payment'
  last_job: {
    id: string
    video_title: string
    youtube_url: string
    video_duration: number | null
    status: string
    error_code: string | null
    error_message: string | null
    created_at: string | null
  } | null
}

export interface UnactivatedUsersResponse {
  summary: {
    date_range?: string
    start_date?: string | null
    end_date?: string | null
    total_users: number
    completed_users: number
    completed_pct: number
    unactivated_users: number
    unactivated_pct: number
    never_attempted_users: number
    never_attempted_pct: number
    failed_attempt_users: number
    failed_attempt_pct: number
    awaiting_payment_users: number
    awaiting_payment_pct: number
  }
  top_reasons: {
    code: string
    label: string
    count: number
    pct: number
  }[]
  pagination: {
    page: number
    page_size: number
    total_items: number
    total_pages: number
  }
  users: UnactivatedUserItem[]
}

export async function apiGetUnactivatedUsers(
  token: string,
  page: number = 1,
  pageSize: number = 25,
  filterType: string = 'all',
  search?: string,
  sortBy: string = 'newest',
  dateRange: string = 'today',
  startDate?: string,
  endDate?: string
): Promise<UnactivatedUsersResponse> {
  const res = await axios.get(`${API_URL}/admin/unactivated-users`, {
    headers: { Authorization: `Bearer ${token}` },
    params: {
      page,
      page_size: pageSize,
      filter_type: filterType,
      search: search || undefined,
      sort_by: sortBy,
      date_range: dateRange,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    },
  })
  return res.data
}

export interface SystemHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  service: string
  components: {
    database: {
      status: string
      latency_ms?: number
      error?: string
    }
    redis: {
      status: string
      latency_ms?: number
      error?: string
    }
    disk?: {
      status: string
      free_gb?: number
      total_gb?: number
      used_gb?: number
      used_percent?: number
      error?: string
    }
    celery?: {
      status: string
      worker_count?: number
      workers?: string[]
      error?: string
      message?: string
    }
    youtube_cookies?: {
      status: string
      exists?: boolean
      days_remaining?: number
      is_fresh?: boolean
      message?: string
      error?: string
    }
    ai_providers?: {
      gemini: {
        status: string
        name: string
        enabled: boolean
        configured: boolean
        models?: {
          general?: string
          stt?: string
          tts?: string
        }
        note?: string
      }
      azure: {
        status: string
        name: string
        enabled: boolean
        configured: boolean
        region?: string
        note?: string
      }
      openai: {
        status: string
        name: string
        enabled: boolean
        configured: boolean
        note?: string
      }
      edge_tts: {
        status: string
        name: string
        enabled: boolean
        configured: boolean
        note?: string
      }
    }
    queues?: {
      status: string
      video_processing: number
      local_upload: number
      celery: number
      total_queued: number
      error?: string
    }
  }
}

export async function apiAdminSystemHealth(token: string): Promise<SystemHealthResponse> {
  const res = await axios.get(`${API_URL}/admin/system-health`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminRetryJob(
  token: string,
  jobId: string,
  payload?: {
    gemini_key_tier?: string
    tts_provider?: string
    voice_name?: string
    stt_provider?: string
    translation_model?: string
    reuse_transcript?: boolean
    reuse_translation?: boolean
    force_regenerate?: boolean
  }
): Promise<{ success: boolean; message: string }> {
  const res = await axios.post(`${API_URL}/admin/jobs/${jobId}/retry`, payload || {}, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminSetJobVisibility(token: string, jobId: string, isPublic: boolean): Promise<{ is_public: boolean; published_at: string | null }> {
  const res = await axios.post(`${API_URL}/admin/jobs/${jobId}/visibility`, { is_public: isPublic }, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export interface AdminJobDeleteImpact {
  is_copy: boolean
  copies: number
  is_public: boolean
}

/** O'chirishdan oldin: kesh nusxasimi va unga boshqa foydalanuvchilarning nechta nusxasi ishora qiladi. */
export async function apiAdminJobDeleteImpact(token: string, jobId: string): Promise<AdminJobDeleteImpact> {
  const res = await axios.get(`${API_URL}/admin/jobs/${jobId}/delete-impact`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminDeleteJob(token: string, jobId: string): Promise<void> {
  await axios.delete(`${API_URL}/admin/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function apiAdminCancelJob(token: string, jobId: string): Promise<{ status: string; message: string }> {
  const res = await axios.post(`${API_URL}/admin/jobs/${jobId}/cancel`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminCancelAnalysis(token: string, analysisId: string): Promise<{ status: string; message: string }> {
  const res = await axios.post(`${API_URL}/admin/analyses/${analysisId}/cancel`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}


export interface GeminiKeyItem {
  key_masked: string
  tier: 'paid' | 'free'
  status: 'active' | 'cooldown'
  remaining_seconds: number
  remaining_human: string
  cooldown_reason: string
  limits: {
    rpm: number
    rpd: string | number
    tpm: string
    label: string
  }
  total_jobs: number
  total_duration_sec: number
  total_duration_formatted: string
  total_cost_usd: number
  total_cost_uzs: number
  total_requests: number
  success_count: number
  rate_limit_count: number
  initial_balance_usd?: number
  remaining_balance_usd?: number
  remaining_balance_uzs?: number
  google_balance_note?: string
}

export interface GeminiKeysOverviewResponse {
  admin_mode: 'free' | 'paid'
  paid_key_initial_balance: number
  paid_key: GeminiKeyItem | null
  free_keys: GeminiKeyItem[]
  summary: {
    total_keys: number
    total_paid_keys: number
    total_free_keys: number
    total_active_keys: number
    total_cooldown_keys: number
    total_jobs_all: number
    total_cost_all_usd: number
  }
  groq?: GroqKeysOverviewResponse
}

export interface GroqKeyItem {
  key_masked: string
  tier: 'free'
  tier_label: string
  status: 'active' | 'cooldown'
  remaining_seconds: number
  remaining_human: string
  cooldown_reason: string
  models: string[]
  limits: {
    rpm: number
    rpd: number
    tpm: string
    label: string
  }
  total_jobs: number
  total_duration_sec: number
  total_cost_usd: number
  total_cost_uzs: number
  total_requests: number
  success_count: number
  rate_limit_count: number
}

export interface GroqKeysOverviewResponse {
  summary: {
    provider: string
    tier: string
    total_keys: number
    total_active_keys: number
    total_cooldown_keys: number
    total_jobs_all: number
    total_requests_all: number
    total_cost_all_usd: number
    total_cost_all_uzs: number
    cost_status_label: string
    description: string
  }
  keys: GroqKeyItem[]
}

export async function apiAdminGeminiKeysOverview(token: string): Promise<GeminiKeysOverviewResponse> {
  const res = await axios.get(`${API_URL}/admin/gemini-keys/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminGroqKeysOverview(token: string): Promise<GroqKeysOverviewResponse> {
  const res = await axios.get(`${API_URL}/admin/groq-keys/overview`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminResetGroqCooldown(token: string, key_masked: string): Promise<{ status: string }> {
  const res = await axios.post(`${API_URL}/admin/groq-keys/reset-cooldown`, { key_masked }, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminSetGeminiAdminMode(token: string, mode: 'free' | 'paid'): Promise<{ status: string; mode: string }> {
  const res = await axios.post(`${API_URL}/admin/gemini-keys/admin-mode`, { mode }, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminSetGeminiInitialBalance(token: string, initial_balance: number): Promise<{ status: string; initial_balance: number }> {
  const res = await axios.post(`${API_URL}/admin/gemini-keys/initial-balance`, { initial_balance }, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function apiAdminResetGeminiCooldown(token: string, key_masked: string, model?: string): Promise<{ status: string }> {
  const res = await axios.post(`${API_URL}/admin/gemini-keys/reset-cooldown`, { key_masked, model }, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}


// ── Saytga kirgan (faol) foydalanuvchilar ──────────────────────────────
export type ActiveUsersPeriod = '7d' | '30d' | '90d' | '12m'

export interface ActiveUsersReport {
  period: ActiveUsersPeriod
  timezone: string
  today: string
  data_since: string
  summary: {
    today: number
    yesterday: number
    last_7d: number
    last_30d: number
    this_month: number
    prev_month_same_period: number
    prev_month: number
    total: number
  }
  series: { date: string; active: number; new: number; returning: number }[]
}

export async function apiAdminActiveUsers(
  token: string,
  period: ActiveUsersPeriod = '30d',
  includeInternal: boolean = false
): Promise<ActiveUsersReport> {
  const res = await axios.get(`${API_URL}/admin/active-users`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { period, include_internal: includeInternal },
  })
  return res.data
}

// ─────────────────────────────────────────────────────────────
// Avtomatik xatlar (backend/api/email_routes.py): yangiliklar va statistika
// ─────────────────────────────────────────────────────────────
export interface SiteNewsItem {
  id: number
  title: string
  body: string
  link_url: string | null
  link_text: string | null
  created_at: string
}

export interface EmailAutomationStats {
  last_7_days: Record<string, { sent: number; failed: number }>
  opt_outs: number
  queued_now: number
  note: string
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } })

export async function apiEmailStats(token: string): Promise<EmailAutomationStats> {
  return (await axios.get(`${API_URL}/api/email/admin/stats`, auth(token))).data
}

export async function apiListNews(token: string): Promise<SiteNewsItem[]> {
  return (await axios.get(`${API_URL}/api/email/admin/news`, auth(token))).data
}

export async function apiCreateNews(
  token: string,
  payload: { title: string; body: string; link_url?: string; link_text?: string },
): Promise<SiteNewsItem> {
  return (await axios.post(`${API_URL}/api/email/admin/news`, payload, auth(token))).data
}

export async function apiDeleteNews(token: string, id: number): Promise<void> {
  await axios.delete(`${API_URL}/api/email/admin/news/${id}`, auth(token))
}
