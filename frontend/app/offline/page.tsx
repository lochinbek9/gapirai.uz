'use client'

import Link from 'next/link'
import { WifiOff, RotateCcw } from 'lucide-react'

// Oflayn sahifa: header/footer'siz -- tarmoqsiz ham to'liq ishlashi uchun minimal.
export default function OfflinePage() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-ui-surface px-4 py-12 text-ui-ink">
      <div className="max-w-md text-center">
        <WifiOff aria-hidden="true" className="mx-auto h-6 w-6 text-ui-muted" />
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em]">Internet aloqasi yoʻq</h1>
        <p className="mt-3 text-base leading-relaxed text-ui-muted">
          GapirAI.uz ishlashi uchun internet aloqasi talab etiladi. Tarmoqqa ulangach, qaytadan urinib koʻring.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => window.location.reload()} className="ui-btn ui-btn-primary">
            <RotateCcw aria-hidden="true" className="h-4 w-4" /> Qayta urinish
          </button>
          <Link href="/" className="ui-btn ui-btn-secondary">Bosh sahifa</Link>
        </div>
      </div>
    </main>
  )
}
