'use client'

import { useEffect, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { errorSummary, isChunkLoadError, reloadOnceForChunkError } from '@/lib/chunkReload'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// Next.js App Router error boundary -- ushbu segment ichida (yoki uning
// bolalarida) render vaqtida ushlanmagan xato yuz bersa shu ko'rsatiladi.
// Avval bunday holat Next.js'ning standart (brendlanmagan, dasturchiga
// mo'ljallangan) xato ekranini ko'rsatardi -- bu fayl mavjud bo'lmagani
// aniqlangan (2026-08-20).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const chunk = isChunkLoadError(error)

  useEffect(() => {
    // Brauzer konsoliga to'liq xatoni yozamiz (dasturchi debug uchun) --
    // foydalanuvchiga esa faqat xavfsiz umumiy matn ko'rsatiladi.
    console.error(error)
    // Deploy'dan keyingi eski chunk -- reset() yordam bermaydi, sahifani qayta yuklaymiz
    reloadOnceForChunkError(error)
  }, [error])

  // reset() o'zi server ma'lumotini qayta olmaydi -- avval router.refresh();
  // chunk xatosida esa faqat to'liq qayta yuklash yordam beradi.
  const retry = () => {
    if (chunk) return window.location.reload()
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <main id="main" className="flex min-h-[70vh] items-center justify-center bg-ui-surface px-4 py-16 text-ui-ink">
      <div className="max-w-md text-center">
        <AlertTriangle aria-hidden="true" className="mx-auto h-6 w-6 text-ui-muted" />
        <h1 className="mt-5 text-3xl font-semibold tracking-[-0.03em]">{chunk ? 'Sayt yangilandi' : 'Nimadir notoʻgʻri ketdi'}</h1>
        <p className="mt-3 text-base leading-relaxed text-ui-muted">
          {chunk
            ? 'Sahifaning yangi versiyasi chiqdi — qayta yuklanmoqda. Ochilmasa, «Qaytadan urinish»ni bosing.'
            : 'Sahifani yuklashda kutilmagan xatolik yuz berdi. Qaytadan urinib koʻring — muammo davom etsa, bosh sahifaga qayting.'}
        </p>
        {!chunk && (
          <p className="mt-2 break-words font-mono text-xs text-ui-muted">
            {error.digest ? `Xato ID: ${error.digest}` : errorSummary(error)}
          </p>
        )}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button type="button" onClick={retry} disabled={pending} className="ui-btn ui-btn-primary">
            <RotateCcw aria-hidden="true" className="h-4 w-4" /> Qaytadan urinish
          </button>
          <Link href="/" className="ui-btn ui-btn-secondary">Bosh sahifa</Link>
        </div>
      </div>
    </main>
  )
}
