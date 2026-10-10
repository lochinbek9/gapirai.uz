'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Heart, ArrowRight } from 'lucide-react'
import { markDonated } from '@/lib/donateModal'

export default function DonateThanksPage() {
  useEffect(() => {
    markDonated()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-violet-50 to-white px-4 dark:from-[#15121f] dark:to-[#0f0f10]">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
          <Heart className="h-8 w-8" fill="currentColor" />
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">Rahmat! 🙏</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Loyihani qo‘llab-quvvatlaganingiz uchun katta rahmat. Sizning yordamingiz
          videolarni ko‘proq odamga, tezroq yetkazishga imkon beradi.
        </p>
        <p className="mt-2 text-xs text-gray-400">
          To‘lov tasdiqlanishi bir necha daqiqa vaqt olishi mumkin.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white active:scale-95"
        >
          Bosh sahifaga <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
