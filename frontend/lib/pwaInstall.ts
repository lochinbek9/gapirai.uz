// beforeinstallprompt hodisasini modul darajasida ushlaydi — bir nechta
// komponent (PwaProvider banneri, /install sahifasi) undan foydalanadi.
let deferredPrompt: any = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((l) => l())
  })
}

export function canInstall(): boolean {
  return deferredPrompt !== null
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function triggerInstall(): Promise<boolean> {
  if (!deferredPrompt) return false
  deferredPrompt.prompt()
  const res = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }))
  deferredPrompt = null
  listeners.forEach((l) => l())
  return res.outcome === 'accepted'
}

export type Platform = 'android' | 'ios' | 'desktop' | 'other'

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return 'ios'
  if (/Windows|Macintosh|Linux/i.test(ua)) return 'desktop'
  return 'other'
}
