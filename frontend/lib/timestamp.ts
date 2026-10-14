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

export function formatTashkentDate(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
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
  try {
    const d = new Date(dateStr)
    return d.toLocaleString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr || ''
  }
}

export function formatTashkentTime(dateStr?: string | null, includeSeconds: boolean = true): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Tashkent',
      hour: '2-digit',
      minute: '2-digit',
    }
    if (includeSeconds) {
      opts.second = '2-digit'
    }
    return d.toLocaleTimeString('uz-UZ', opts)
  } catch {
    return dateStr || ''
  }
}

