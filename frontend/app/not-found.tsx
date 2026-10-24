'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PageShell from '@/components/PageShell'

export default function NotFound() {
  const router = useRouter()

  return (
    <PageShell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center sm:py-32">
        <p className="text-sm font-medium text-ui-accent-ink tabular-nums">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-5xl">Bunday sahifa mavjud emas</h1>
        <p className="mt-4 text-lg leading-relaxed text-ui-muted">
          Siz qidirayotgan sahifa oʻchirilgan, nomi oʻzgargan yoki manzili notoʻgʻri kiritilgan boʻlishi mumkin.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/" className="ui-btn ui-btn-primary">Bosh sahifa</Link>
          <button type="button" onClick={() => router.back()} className="ui-btn ui-btn-secondary">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Ortga qaytish
          </button>
        </div>
      </div>
    </PageShell>
  )
}
