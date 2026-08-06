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
}

const ADMIN_KEY_STORAGE = 'admin_key'

export function getAdminKey(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(ADMIN_KEY_STORAGE)
}

export function setAdminKey(key: string) {
  sessionStorage.setItem(ADMIN_KEY_STORAGE, key)
}

export function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE)
}

export async function apiAdminLogin(key: string): Promise<void> {
  await axios.post(`${API_URL}/admin/login`, {}, { headers: { 'X-Admin-Key': key } })
}

export async function apiAdminStats(key: string): Promise<AdminStats> {
  const res = await axios.get(`${API_URL}/admin/stats`, { headers: { 'X-Admin-Key': key } })
  return res.data
}
