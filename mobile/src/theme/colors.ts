// Saytning dizayn tokenlari (frontend/app/globals.css: --ui-* :root va .dark) bilan
// bir xil -- ilova sayt bilan bitta mahsulot bo'lib ko'rinsin. Sayt palitrasi
// o'zgarsa, ikkalasini birga yangilang.

export interface ThemeColors {
  /** Sahifa foni (sayt: main bg-ui-surface) */
  surface: string;
  /** Ikkinchi darajali fon: statistika qatori, segment izi, auth sahifalari */
  ground: string;
  ink: string;
  muted: string;
  /** Ingichka chiziqlar va chegaralar */
  rule: string;
  accent: string;
  accentInk: string;
  /** Asosiy tugma foni (sayt: ui-dark -- siyoh rang, ko'k emas) va uning matni */
  dark: string;
  darkInk: string;
  red: string;
  redInk: string;
  green: string;
  greenInk: string;

  // Eski nomlar -- hali ko'chirilmagan ekranlar uchun (yangi kodda yuqoridagilarni ishlating)
  background: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accentGlow: string;
  danger: string;
  success: string;
}

function withAliases(c: Omit<ThemeColors, 'background' | 'border' | 'textPrimary' | 'textSecondary' | 'accentGlow' | 'danger' | 'success'>): ThemeColors {
  return {
    ...c,
    background: c.surface,
    border: c.rule,
    textPrimary: c.ink,
    textSecondary: c.muted,
    accentGlow: alpha(c.accent, 0.1),
    danger: c.red,
    success: c.green,
  };
}

/** #RRGGBB + shaffoflik -> rgba(); saytdagi `bg-ui-accent/[0.06]` kabi yozuvlar uchun */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const lightColors: ThemeColors = withAliases({
  surface: '#FFFFFF',
  ground: '#F6F7F9',
  ink: '#0B0D12',
  muted: '#585E6A',
  rule: '#E5E7EB',
  accent: '#2B5CF0',
  accentInk: '#204CD6',
  dark: '#0B0D12',
  darkInk: '#FFFFFF',
  red: '#DC2626',
  redInk: '#B91C1C',
  green: '#16A34A',
  greenInk: '#15803D',
});

export const darkColors: ThemeColors = withAliases({
  surface: '#0B0B0D',
  ground: '#121215',
  ink: '#F4F5F7',
  muted: '#A0A5B0',
  rule: '#27282E',
  accent: '#567CFF',
  accentInk: '#85A3FF',
  dark: '#F4F5F7',
  darkInk: '#0B0D12',
  red: '#EF4444',
  redInk: '#FC8181',
  green: '#22C55E',
  greenInk: '#4ADE80',
});

/** Saytdagi radiuslar: kartalar 16, boshqaruv elementlari (input, tugma, plitka) 10, tablar 8 */
export const radius = { card: 16, control: 10, tab: 8 } as const;
