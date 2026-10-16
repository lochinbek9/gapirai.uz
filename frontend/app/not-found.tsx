'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileQuestion, Home, ArrowLeft } from 'lucide-react'

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  )
}

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-12 transition-colors duration-300">
      <MeshBackground />

      <div className="glass-card rounded-[28px] p-8 sm:p-10 max-w-md w-full text-center space-y-6 z-10 border border-gray-200/60 dark:border-white/10 shadow-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 mx-auto shadow-inner">
          <FileQuestion className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400 bg-violet-500/10 px-3 py-1 rounded-full">
            404 — Sahifa topilmadi
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white pt-1">
            Bunday sahifa mavjud emas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Siz qidirayotgan sahifa o&apos;chirilgan, nomi o&apos;zgargan yoki manzili noto&apos;g&apos;ri kiritilgan bo&apos;lishi mumkin.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            href="/"
            className="btn-premium flex-1 py-3 px-5 rounded-2xl font-bold text-sm inline-flex items-center justify-center gap-2 shadow-lg"
          >
            <Home className="w-4 h-4" /> Bosh sahifa
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 py-3 px-5 glass-input rounded-2xl font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all text-sm inline-flex items-center justify-center gap-2 border border-gray-200/60 dark:border-white/10"
          >
            <ArrowLeft className="w-4 h-4" /> Ortga qaytish
          </button>
        </div>
      </div>
    </div>
  )
}
