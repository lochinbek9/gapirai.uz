// Mirrors the web app's design tokens (frontend/app/globals.css :root / .dark)
// so the mobile app reads as the same product, not a reskin. Update both
// together if the web palette changes.

export interface ThemeColors {
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentGlow: string;
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;
  danger: string;
  success: string;
}

export const lightColors: ThemeColors = {
  background: '#f8fafc',
  surface: 'rgba(255, 255, 255, 0.88)',
  border: 'rgba(226, 232, 240, 0.9)',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  accent: '#7c3aed',
  accentGlow: 'rgba(124, 58, 237, 0.15)',
  gradientStart: '#8b5cf6',
  gradientMid: '#6366f1',
  gradientEnd: '#0ea5e9',
  danger: '#dc2626',
  success: '#059669',
};

export const darkColors: ThemeColors = {
  background: '#090d16',
  surface: 'rgba(15, 23, 42, 0.75)',
  border: 'rgba(255, 255, 255, 0.08)',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  accent: '#8b5cf6',
  accentGlow: 'rgba(139, 92, 246, 0.25)',
  gradientStart: '#8b5cf6',
  gradientMid: '#6366f1',
  gradientEnd: '#0ea5e9',
  danger: '#f87171',
  success: '#34d399',
};
