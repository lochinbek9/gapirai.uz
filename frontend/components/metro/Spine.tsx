import { ReactNode } from 'react'

/** Sahifaning umurtqasi: bo'limlar bitta uzluksiz liniyaga osiladi
 * (direction contract: bitta o'q butun sahifani boshqaradi). */
export function Spine({ children, tight = false }: { children: ReactNode; tight?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      <div aria-hidden className="absolute bottom-0 left-[calc(1rem+11px)] top-0 w-2 bg-metro-red sm:left-[calc(1.5rem+11px)] lg:left-[calc(2rem+11px)]" />
      <div className={`relative space-y-24 sm:space-y-32 ${tight ? 'pb-20 pt-10 sm:pb-28 sm:pt-12' : 'py-20 sm:py-28'}`}>{children}</div>
    </div>
  )
}

/** Umurtqadagi bitta bekat: marker + sarlavha + kontent */
export function SpineStop({ id, title, children, marker = 'default' }: { id: string; title: ReactNode; children: ReactNode; marker?: 'default' | 'end' }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="relative scroll-mt-24 pl-14 sm:pl-16">
      <span
        aria-hidden
        className={`absolute left-0 top-1.5 h-[30px] w-[30px] rounded-full border-[6px] border-metro-red ${marker === 'end' ? 'bg-metro-red' : 'bg-metro-ground'}`}
      />
      <h2 id={`${id}-title`} className="max-w-3xl font-sign text-3xl font-extrabold uppercase leading-[1.02] tracking-[-0.01em] text-metro-ink sm:text-5xl [text-wrap:balance]">
        {title}
      </h2>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  )
}
