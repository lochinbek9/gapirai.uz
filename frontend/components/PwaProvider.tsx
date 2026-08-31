'use client'
import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

// Service worker registratsiyasi + "Ilovani o'rnatish" banneri (Android/Chrome
// beforeinstallprompt). iOS Safari beforeinstallprompt bermaydi — u yerda
// foydalanuvchi "Share -> Add to Home Screen" orqali o'rnatadi (banner ko'rsatilmaydi).
export default function PwaProvider() {
  const [deferred, setDeferred] = useState<any>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    const dismissed = (() => {
      try { return localStorage.getItem('pwa_install_dismissed') === '1' } catch { return false }
    })()
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e)
      if (!dismissed && !standalone) setShow(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setShow(false))
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!show) return null

  const install = async () => {
    if (!deferred) return
    deferred.prompt()
    await deferred.userChoice.catch(() => {})
    setDeferred(null)
    setShow(false)
  }
  const dismiss = () => {
    try { localStorage.setItem('pwa_install_dismissed', '1') } catch {}
    setShow(false)
  }

  return (
    <div className="fixed bottom-4 inset-x-4 z-[60] sm:left-auto sm:right-4 sm:max-w-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-black/10 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 shadow-xl">
        <img src="/icons/icon-192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-white">GapirAI ilovasini o&apos;rnating</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400">Bosh ekrandan bir bosishда oching</p>
        </div>
        <button onClick={install} className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white">
          <Download className="w-3.5 h-3.5" /> O&apos;rnatish
        </button>
        <button onClick={dismiss} aria-label="Yopish" className="shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
