'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Heart, X } from 'lucide-react'
import { shouldShowDonateModal, recordDonateModalShown, dismissDonateModal } from '@/lib/donateModal'
import { useIsTmaMode } from '@/hooks/useIsTmaMode'

// Ish jarayonini bo'lmaslik uchun bu yo'llarda modal chiqmaydi.
const SKIP_PREFIXES = ['/donate', '/tma', '/login', '/register', '/auth', '/forgot-password', '/video', '/learn']
// Sahifa ochilgach shu qadar kutadi — nimadur qilinayotgan bo'lsa xalaqit bermaydi.
const DWELL_MS = 20_000

export default function DonateModal() {
  const pathname = usePathname()
  const isTma = useIsTmaMode()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (isTma) return
    if (SKIP_PREFIXES.some((p) => pathname?.startsWith(p))) return
    const t = setTimeout(() => {
      if (shouldShowDonateModal()) {
        recordDonateModalShown()
        setOpen(true)
      }
    }, DWELL_MS)
    return () => clearTimeout(t)
  }, [pathname, isTma])

  if (!open) return null

  const close = () => {
    dismissDonateModal()
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 transition-opacity duration-300"
      onClick={close}
    >
      <div
        className="glass-card w-full max-w-md rounded-2xl p-8 text-center space-y-5 border border-ui-rule shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-5 right-5 text-ui-muted hover:text-gray-700 dark:hover:text-gray-200 transition p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="Yopish"
        >
          <X aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 ">
          <Heart aria-hidden="true" className="h-8 w-8" fill="currentColor" />
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full">
            Loyiha rivoji
          </span>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-ui-ink pt-1">
            GapirAI.uz sizga foyda keltiryaptimi?
          </h2>
          <p className="text-sm text-ui-muted leading-relaxed">
            Biz mustaqil loyihamiz. Kichik ehsoningiz yangi ovoz modellari va serverlarni ushlab turishga bevosita yordam beradi.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/donate"
            onClick={() => setOpen(false)}
            className="btn-premium flex-1 py-3 px-5 rounded-2xl font-semibold text-sm inline-flex items-center justify-center gap-2"
          >
            Qo&apos;llab-quvvatlash
          </Link>
          <button
            type="button"
            onClick={close}
            className="flex-1 py-3 px-5 glass-input rounded-2xl font-semibold text-ui-muted hover:text-gray-900 dark:hover:text-white transition-all text-sm inline-flex items-center justify-center border border-ui-rule"
          >
            Keyinroq
          </button>
        </div>
      </div>
    </div>
  )
}
