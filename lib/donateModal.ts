'use client'

// Davriy "qo'llab-quvvatlash" modali uchun throttle holati (localStorage).
// Foydalanuvchini bezdirmaslik uchun: birinchi tashrifdan keyin bir necha
// kun jim, keyin kamdan-kam, yopilsa tobora kamroq, donat qilinsa yoki
// ko'p marta yopilsa butunlay to'xtaydi.
const KEY = 'gapirai_donate_modal'
const DAY = 86_400_000
const WARMUP_MS = 2 * DAY   // birinchi yuklanish -> birinchi taklif
const REPEAT_MS = 5 * DAY   // keyingi takliflar orasida
const MAX_DISMISSES = 3

interface State {
  firstSeen: number
  lastShown: number
  dismisses: number
  donated: boolean
}

function read(): State {
  const base: State = { firstSeen: 0, lastShown: 0, dismisses: 0, donated: false }
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...base, ...JSON.parse(raw) } : base
  } catch {
    return base
  }
}

function write(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

/** Modal hozir ko'rsatilsinmi. Birinchi chaqiruvда faqat firstSeen'ni
 *  yozadi va false qaytaradi. */
export function shouldShowDonateModal(): boolean {
  const s = read()
  const now = Date.now()
  if (!s.firstSeen) {
    write({ ...s, firstSeen: now })
    return false
  }
  if (s.donated || s.dismisses >= MAX_DISMISSES) return false
  if (!s.lastShown) return now - s.firstSeen > WARMUP_MS
  return now - s.lastShown > REPEAT_MS
}

export function recordDonateModalShown() {
  write({ ...read(), lastShown: Date.now() })
}

export function dismissDonateModal() {
  const s = read()
  write({ ...s, dismisses: s.dismisses + 1, lastShown: Date.now() })
}

/** /donate/thanks sahifasi chaqiradi — modal boshqa ko'rsatilmaydi. */
export function markDonated() {
  write({ ...read(), donated: true })
}
