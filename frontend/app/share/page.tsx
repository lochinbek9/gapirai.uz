'use client'
import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'

const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)[\w-]{11}|youtube\.com\/watch\?[^\s]*v=[\w-]{11}/i

// Android share-target manzili (manifest.ts). YouTube ilovasidan "Share"
// qilinganda URL "url", "text" yoki "title"da kelishi mumkin — hammasidan
// YouTube havolasini ajratib, bosh sahifaga uzatamiz.
function ShareInner() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const blob = [params.get('url'), params.get('text'), params.get('title')]
      .filter(Boolean)
      .join(' ')
    const m = blob.match(/https?:\/\/[^\s]+/g)?.find((u) => YT_RE.test(u)) || (YT_RE.test(blob) ? blob.match(YT_RE)?.[0] : null)
    if (m) {
      router.replace(`/?shared=${encodeURIComponent(m.startsWith('http') ? m : `https://${m}`)}`)
    } else {
      router.replace('/')
    }
  }, [params, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      <p className="text-sm text-gray-500 dark:text-slate-400">Havola ochilmoqda…</p>
    </div>
  )
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <ShareInner />
    </Suspense>
  )
}
