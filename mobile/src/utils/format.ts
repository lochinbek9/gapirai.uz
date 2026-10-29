export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Mirrors frontend/app/video-analysis/[id]/page.tsx's formatTs — timestamps
// for chapters/key-points/transcript, which may exceed an hour.
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0
    ? `${h}:${mm.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${mm}:${sec.toString().padStart(2, '0')}`;
}

// Mirrors frontend/app/video/[id]/page.tsx's formatRemainingTime — used for
// the server-computed (heuristic, not guaranteed) expected_end_time.
export function formatRemainingTime(seconds: number): string {
  if (seconds <= 0) return 'kam qoldi...';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m} daqiqa ${s} soniya` : `${s} soniya`;
}

// Hermes'da uz-UZ lokali yo'q (toLocaleString inglizcha chiqaradi) -- saytdagi
// formatTashkentDate/DateTime kabi qo'lda: 29.10.2026 va 29.10.2026, 09:17 (Toshkent vaqti).
function tashkentParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
  };
}

export function formatDate(iso: string): string {
  return tashkentParts(iso).date;
}

export function formatDateTime(iso: string): string {
  const { date, time } = tashkentParts(iso);
  return `${date}, ${time}`;
}

/** 1 234 567 -- saytdagidek bo'sh joy bilan guruhlash (Hermes toLocaleString'ga tayanmaymiz) */
export function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
