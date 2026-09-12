'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** Paynet'da checkout havolasi yo'q -- foydalanuvchi **Paynet ilovasi**
 *  yoki **bankomat**da "GapirAI"ni topib shu "order_id" raqamini kiritib
 *  to'laydi (2026-09-12, loyiha egasi shaxsan sinab tasdiqladi). Barcha
 *  to'lov turlarida (donat, tarif, daqiqa) bir xil, shuning uchun
 *  ajratib qo'yildi (Uzum'ning UzumAccountCard'i bilan bir xil naqsh). */
export default function PaynetOrderCard({ orderId, amount }: { orderId: string; amount: number }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(orderId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-teal-500/25 bg-teal-500/[0.05] p-4 text-left">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
        <b>Paynet</b> ilovasida yoki bankomatda <b>GapirAI</b>ni toping va quyidagi buyurtma raqamini kiriting,{' '}
        {amount.toLocaleString('uz-UZ')} so‘m to‘lang:
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/5 px-3 py-2 text-center font-mono text-sm font-bold tracking-wider text-gray-900 dark:bg-black/30 dark:text-white">
          {orderId}
        </span>
        <button
          onClick={copy}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/5 text-gray-700 transition hover:bg-black/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          aria-label="Buyurtma raqamini nusxalash"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-[11px] text-gray-400">To‘lov tasdiqlangach sahifa avtomatik yangilanadi.</p>
    </div>
  )
}
