// Learning Workspace tablari (transkript/chapter/quiz/AI-ustoz) bir xil
// "m:ss" / "h:mm:ss" formatida timestamp ko'rsatadi -- shu yerda yagona
// manba, har bir tab komponentida takrorlanmaydi.
export function formatTs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0
    ? `${h}:${mm.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    : `${mm}:${sec.toString().padStart(2, '0')}`
}

/**
 * Backend'dan kelgan sanani xavfsiz Parse qiladi.
 * Agar sana satrida timezone (Z yoki +05:00) bo'lmasa, uni UTC deb qabul qiladi
 * (chunki backend UTC'da saqlaydi), bu brauzer uni lokal vaqt deb noto'g'ri
 * 5 soat orqaga surishining oldini oladi.
 */
export function parseApiDate(dateStr?: string | null): Date | null {
  if (!dateStr) return null
  try {
    const trimmed = String(dateStr).trim()
    if (!trimmed) return null
    if (/[Z+-]\d\d:?\d\d?$/.test(trimmed) || trimmed.endsWith('Z')) {
      const d = new Date(trimmed)
      return isNaN(d.getTime()) ? null : d
    }
    // Naive ISO string (masalan: 2026-10-18T08:31:20) -> UTC deb o'qish
    const d = new Date(trimmed + 'Z')
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

export function formatTashkentDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  const d = parseApiDate(dateStr)
  if (!d) return ''
  try {
    return d.toLocaleDateString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return dateStr || ''
  }
}

export function formatTashkentDateTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  const d = parseApiDate(dateStr)
  if (!d) return ''
  try {
    return d.toLocaleString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return dateStr || ''
  }
}

export function formatTashkentTime(dateStr?: string | null, includeSeconds: boolean = true): string {
  if (!dateStr) return ''
  const d = parseApiDate(dateStr)
  if (!d) return ''
  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }
    if (includeSeconds) {
      opts.second = '2-digit'
    }
    return d.toLocaleTimeString('uz-UZ', opts)
  } catch {
    return dateStr || ''
  }
}

export function formatTashkentDateTimeObj(dateStr?: string | null): { date: string; time: string; full: string } {
  if (!dateStr) return { date: '—', time: '', full: '—' }
  const d = parseApiDate(dateStr)
  if (!d) return { date: '—', time: '', full: '—' }
  try {
    const dateFormatter = new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    const timeFormatter = new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    const date = dateFormatter.format(d)
    const time = timeFormatter.format(d)
    return {
      date,
      time,
      full: `${date} ${time}`,
    }
  } catch {
    return { date: '—', time: '', full: '—' }
  }
}

export function getTashkentRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  const d = parseApiDate(dateStr)
  if (!d) return ''
  try {
    const diffMs = Date.now() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'Hozirgina'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} daq oldin`
    const diffHours = Math.floor(diffMin / 60)
    if (diffHours < 24) return `${diffHours} soat oldin`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays} kun oldin`
    return ''
  } catch {
    return ''
  }
}
