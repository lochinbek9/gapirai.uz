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
    by_error_code: Record<string, number>
    last_7d: number
    last_24h: number
  }
  payments: { approved_count: number; revenue_total_uzs: number }
  recent_users: { email: string; created_at: string | null; is_verified: boolean }[]
}

export async function apiAdminStats(token: string): Promise<AdminStats> {
  const res = await axios.get(`${API_URL}/admin/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}
