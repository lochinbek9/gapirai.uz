// Uch liniya: rang faqat xizmat turini bildiradi (DESIGN.md).
export type LineId = 'dub' | 'subtitle' | 'analyze'

// Tailwind klasslari to'liq yozilgan (JIT ularni manbadan topishi uchun)
export const LINES: Record<LineId, { name: string; bg: string; text: string; border: string; borderTop: string; borderBottom: string; fill: string; btn: string }> = {
  dub: { name: 'Dublyaj', bg: 'bg-metro-red', text: 'text-metro-red-ink', border: 'border-metro-red', borderTop: 'border-t-metro-red', borderBottom: 'border-b-metro-red', fill: 'fill-metro-red', btn: 'm-btn-red' },
  subtitle: { name: 'Subtitr', bg: 'bg-metro-blue', text: 'text-metro-blue-ink', border: 'border-metro-blue', borderTop: 'border-t-metro-blue', borderBottom: 'border-b-metro-blue', fill: 'fill-metro-blue', btn: 'm-btn-blue' },
  analyze: { name: 'Tahlil', bg: 'bg-metro-green', text: 'text-metro-green-ink', border: 'border-metro-green', borderTop: 'border-t-metro-green', borderBottom: 'border-b-metro-green', fill: 'fill-metro-green', btn: 'm-btn-green' },
}

// Dublaj yo'li: har bir bosqich bitta bekat
export const STATIONS = ['Havola', 'Nutq', 'Tarjima', 'Ovoz', 'Tayyor'] as const

/** Job holatini bekat indeksiga aylantiradi (backend JobStatus qiymatlari). */
export function stationForStatus(status?: string | null): number {
  switch ((status || '').toLowerCase()) {
    case 'transcribing':
      return 1
    case 'translating':
      return 2
    case 'syncing':
    case 'synthesizing':
    case 'merging':
      return 3
    case 'completed':
      return 4
    default:
      return 0
  }
}
