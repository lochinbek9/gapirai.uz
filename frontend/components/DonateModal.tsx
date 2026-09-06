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
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-[#1b1b20]"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={close} className="ml-auto block text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Yopish">
          <X className="h-5 w-5" />
        </button>
        <div className="mx-auto -mt-2 mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
          <Heart className="h-7 w-7" fill="currentColor" />
        </div>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">GapirAI.uz sizga yordam beryaptimi?</h2>
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
          Biz mustaqil loyihamiz. Kichik hissangiz videolarni ko‘proq odamga, tezroq yetkazishga imkon beradi.
        </p>
        <Link
          href="/donate"
          onClick={() => setOpen(false)}
          className="mt-4 block rounded-xl bg-gradient-to-r from-rose-500 to-violet-600 py-3 text-sm font-bold text-white active:scale-[0.98]"
        >
          Loyihani qo‘llab-quvvatlash
        </Link>
        <button onClick={close} className="mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          Keyinroq
        </button>
      </div>
    </div>
  )
}
