import type { ReactNode } from 'react'
import SiteHeader from '@/components/home/SiteHeader'
import Footer from '@/components/Footer'

/** Ichki sahifalar uchun umumiy qobiq: bosh sahifadagi header + footer. */
export default function PageShell({
  children,
  current,
  className = '',
}: {
  children: ReactNode
  current?: 'videos' | 'pricing'
  className?: string
}) {
  return (
    <>
      <SiteHeader current={current} />
      <main id="main" tabIndex={-1} className={`min-h-[60vh] bg-ui-surface text-ui-ink focus:outline-none ${className}`}>
        {children}
      </main>
      <Footer />
    </>
  )
}

/** Sahifa sarlavhasi: H1 + qisqa izoh, bosh sahifadagi tipografiya bilan. */
export function PageTitle({ title, lead, center = false, children }: { title: ReactNode; lead?: ReactNode; center?: boolean; children?: ReactNode }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-3xl'}>
      <h1 className="text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.035em] text-ui-ink sm:text-5xl [text-wrap:balance]">{title}</h1>
      {lead && <p className={`mt-4 max-w-[60ch] text-lg leading-relaxed text-ui-muted [text-wrap:pretty] ${center ? 'mx-auto' : ''}`}>{lead}</p>}
      {children}
    </div>
  )
}
