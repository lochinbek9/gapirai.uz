'use client'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

// API hujjati va /developers sahifasidagi kod namunalari: nusxalash tugmasi bilan, gorizontal aylantiriladi.
export default function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* brauzer ruxsat bermasa -- foydalanuvchi qo'lda belgilaydi */
    }
  }

  return (
    <div className="relative mt-3 overflow-hidden rounded-control border border-ui-rule bg-ui-ground">
      {label && <div className="border-b border-ui-rule px-4 py-2 text-xs font-medium text-ui-muted">{label}</div>}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Nusxalandi' : 'Kodni nusxalash'}
        className="absolute right-2 top-2 rounded-md p-1.5 text-ui-muted transition hover:bg-ui-surface hover:text-ui-ink"
      >
        {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
      </button>
      <pre className="overflow-x-auto p-4 pr-12 text-[13px] leading-relaxed text-ui-ink">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
