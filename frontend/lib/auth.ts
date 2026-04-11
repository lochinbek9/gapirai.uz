import Cookies from 'js-cookie'
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface User {
  id: string
  name: string
  email: string
}

export interface AuthState {
  user: User | null
  token: string | null
}

export function getToken(): string | null {
  return Cookies.get('auth_token') || null
}

export function setToken(token: string) {
  Cookies.set('auth_token', token, { expires: 7, sameSite: 'lax' })
}

export function removeToken() {
  Cookies.remove('auth_token')
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem('auth_user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: User) {
  localStorage.setItem('auth_user', JSON.stringify(user))
}

export function clearAuth() {
  removeToken()
  localStorage.removeItem('auth_user')
}

export async function apiRegister(name: string, email: string, password: string) {
  const res = await axios.post(`${API_URL}/auth/register`, { name, email, password })
  return res.data
}

export async function apiLogin(email: string, password: string) {
  const res = await axios.post(`${API_URL}/auth/login`, { email, password })
  return res.data
}

export async function apiMe(token: string): Promise<User> {
  const res = await axios.get(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}
