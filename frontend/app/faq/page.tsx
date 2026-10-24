'use client'
import { Plus } from 'lucide-react'
import PageShell, { PageTitle } from '@/components/PageShell'
import { FAQS } from './faqs'

export default function FAQPage() {
  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.6fr]">
        <PageTitle title="Yordam va savollar" lead="Eng koʻp beriladigan savollarga javoblar." />
        {/* Javob matni SSR HTML'da bo'lishi kerak (FAQPage schema va qidiruv tizimlari uchun) -- <details> buni ta'minlaydi */}
        <div className="divide-y divide-ui-rule border-y border-ui-rule">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ui-ink [&::-webkit-details-marker]:hidden">
                {faq.q}
                <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-ui-muted transition-transform group-open:rotate-45" />
              </summary>
              <div className="mt-2 max-w-[65ch] text-[15px] leading-relaxed text-ui-muted">{faq.a}</div>
            </details>
          ))}
        </div>
      </div>
    </PageShell>
  )
}
