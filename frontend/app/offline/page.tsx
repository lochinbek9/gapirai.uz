'use client'

import Link from 'next/link'
import { WifiOff, RotateCcw, Home } from 'lucide-react'

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  )
}

export default function OfflinePage() {
  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-12 transition-colors duration-300">
      <MeshBackground />

      <div className="glass-card rounded-[28px] p-8 sm:p-10 max-w-md w-full text-center space-y-6 z-10 border border-gray-200/60 dark:border-white/10 shadow-2xl">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-500 mx-auto shadow-inner">
          <WifiOff className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full">
            Aloqa uzildi
          </span>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white pt-1">
            Internet aloqasi yo&apos;q
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            GapirAI.uz ishlashi uchun internet aloqasi talab etiladi. Tarmoqqa ulangach, qaytadan urinib ko&apos;ring.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-premium flex-1 py-3 px-5 rounded-2xl font-bold text-sm inline-flex items-center justify-center gap-2 shadow-lg"
          >
            <RotateCcw className="w-4 h-4" /> Qayta urinish
          </button>
          <Link
            href="/"
            className="flex-1 py-3 px-5 glass-input rounded-2xl font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all text-sm inline-flex items-center justify-center gap-2 border border-gray-200/60 dark:border-white/10"
          >
            <Home className="w-4 h-4" /> Bosh sahifa
          </Link>
        </div>
      </div>
    </div>
  )
}
