'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Uzum'da checkout havolasi yo'q -- foydalanuvchi Uzum ilovasida shu
 *  "account" raqamini kiritib to'laydi. Barcha to'lov turlarida (donat,
 *  tarif, daqiqa) bir xil, shuning uchun ajratib qo'yildi. */
export default function UzumAccountCard({ account, amount }: { account: number; amount: number }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(String(account)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4 text-left">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
        Uzum ilovasida <b>To‘lovlar</b> bo‘limidan quyidagi hisob raqamini kiriting va{' '}
        {amount.toLocaleString('uz-UZ')} so‘m to‘lang:
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-lg bg-black/5 px-3 py-2 text-center font-mono text-lg font-bold tracking-wider text-gray-900 dark:bg-black/30 dark:text-white">
          {account}
        </span>
        <button
          onClick={copy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/5 text-gray-700 transition hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          aria-label="Hisob raqamini nusxalash"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">To‘lov tasdiqlangach sahifa avtomatik yangilanadi.</p>
    </div>
  )
}
