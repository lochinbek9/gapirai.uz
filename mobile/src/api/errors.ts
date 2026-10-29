import { isAxiosError } from 'axios';

// Backend error shape is always {"detail": "<Uzbek message>"} (FastAPI's
// default HTTPException body plus the global handler in backend/main.py).
// Mirrors frontend/*'s `err?.response?.data?.detail` pattern.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    // Masalan 402: { detail: { error: "insufficient_minutes", message: "..." } }
    if (detail && typeof detail === 'object' && typeof detail.message === 'string' && detail.message.trim()) return detail.message;
  }
  return fallback;
}
