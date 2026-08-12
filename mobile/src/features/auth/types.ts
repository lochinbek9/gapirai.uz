// Mirrors backend/api/auth_routes.py exactly (see MOBILE_INTEGRATION_AUDIT.md §5.2, §6).
// login/register do NOT return a token — they send an email OTP. Only
// verify-code and reset-password return a real session (AuthResponse).

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface PendingVerification {
  pending_verification: true;
  email: string;
  message: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}
