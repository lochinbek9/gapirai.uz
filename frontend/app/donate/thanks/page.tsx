'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { markDonated } from '@/lib/donateModal'
import PageShell from '@/components/PageShell'

export default function DonateThanksPage() {
  useEffect(() => {
    markDonated()
  }, [])

  return (
    <PageShell>
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:py-32">
        <Heart aria-hidden="true" className="mx-auto h-6 w-6 text-ui-muted" />
        <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-ui-ink">Rahmat!</h1>
        <p className="mt-4 text-lg leading-relaxed text-ui-muted">
          Loyihani qoʻllab-quvvatlaganingiz uchun katta rahmat. Sizning yordamingiz videolarni koʻproq odamga, tezroq yetkazishga imkon beradi.
        </p>
        <p className="mt-2 text-sm text-ui-muted">Toʻlov tasdiqlanishi bir necha daqiqa vaqt olishi mumkin.</p>
        <Link href="/" className="ui-btn ui-btn-primary mt-8">Bosh sahifaga</Link>
      </div>
    </PageShell>
  )
}
