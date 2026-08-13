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
