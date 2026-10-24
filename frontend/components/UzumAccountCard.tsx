'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'

/** Uzum to'lovi. 2026-09-10 dan boshlab Uzum deeplink beradi (`deeplink`) --
 *  u ilovadagi to'lov formasini ochib "account"ni oldindan to'ldiradi.
 *  `account` raqami esa deeplink ochilmagan holat (masalan desktop) uchun
 *  qo'lda kiritish fallback'i sifatida ko'rsatiladi. Barcha to'lov turlarida
 *  (donat, tarif, daqiqa) bir xil, shuning uchun ajratib qo'yildi. */
export default function UzumAccountCard({
  account,
  amount,
  deeplink,
}: {
  account: number
  amount: number
  deeplink?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(String(account)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.05] p-4 text-left">
      {deeplink && (
        <>
          <p className="text-xs font-semibold text-ui-muted">
            {amount.toLocaleString('uz-UZ')} so‘m to‘lash uchun Uzum ilovasini oching:
          </p>
          <a
            href={deeplink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98]"
          >
            <ExternalLink className="h-4 w-4" /> Uzum ilovasida to‘lash
          </a>
        </>
      )}

      <p className="text-xs font-semibold text-ui-muted">
        {deeplink ? (
          <>
            Ilova ochilmasa, Uzum’da <b>To‘lovlar</b> bo‘limidan quyidagi hisob raqamini qo‘lda kiriting:
          </>
        ) : (
          <>
            Uzum ilovasida <b>To‘lovlar</b> bo‘limidan quyidagi hisob raqamini kiriting va{' '}
            {amount.toLocaleString('uz-UZ')} so‘m to‘lang:
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <span className="flex-1 rounded-lg bg-black/5 px-3 py-2 text-center font-mono text-lg font-semibold tracking-wider text-gray-900 dark:bg-black/30 dark:text-white">
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
      <p className="text-xs text-ui-muted">To‘lov tasdiqlangach sahifa avtomatik yangilanadi.</p>
    </div>
  )
}
