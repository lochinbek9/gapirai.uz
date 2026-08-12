import { apiClient } from '../../api/client';
import type { AuthResponse, PendingVerification, User } from './types';

// One function per backend/api/auth_routes.py endpoint — no extra client-side
// orchestration (no invented refresh/logout calls, see MOBILE_INTEGRATION_AUDIT.md §5.2).

export async function register(name: string, email: string, password: string): Promise<PendingVerification> {
  const res = await apiClient.post<PendingVerification>('/auth/register', { name, email, password });
  return res.data;
}

export async function login(email: string, password: string): Promise<PendingVerification> {
  const res = await apiClient.post<PendingVerification>('/auth/login', { email, password });
  return res.data;
}

export async function verifyCode(email: string, code: string): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/verify-code', { email, code });
  return res.data;
}

export async function resendCode(email: string): Promise<PendingVerification> {
  const res = await apiClient.post<PendingVerification>('/auth/resend-code', { email });
  return res.data;
}

export async function forgotPassword(email: string): Promise<PendingVerification> {
  const res = await apiClient.post<PendingVerification>('/auth/forgot-password', { email });
  return res.data;
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<AuthResponse> {
  const res = await apiClient.post<AuthResponse>('/auth/reset-password', {
    email,
    code,
    new_password: newPassword,
  });
  return res.data;
}

export async function me(): Promise<User> {
  const res = await apiClient.get<User>('/auth/me');
  return res.data;
}
