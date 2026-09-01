'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Download, Loader2, Share, PlusSquare, MoreVertical, Smartphone, Apple } from 'lucide-react'
import {
  canInstall, isStandalone, onInstallChange, triggerInstall, detectPlatform, type Platform,
} from '@/lib/pwaInstall'

const STEPS = {
  android: {
    icon: Smartphone,
    label: 'Android',
    steps: [
      { t: 'Chrome brauzerida gapirai.uz ni oching' },
      { t: 'Yuqori o’ng burchakdagi ⋮ menyusiga bosing', ic: MoreVertical },
      { t: '“Ilovani o’rnatish” yoki “Bosh ekranga qo’shish” ni tanlang', ic: PlusSquare },
      { t: '“O’rnatish” tugmasini bosing — ilova bosh ekranga qo’shiladi' },
    ],
  },
  ios: {
    icon: Apple,
    label: 'iPhone / iPad',
    steps: [
      { t: 'Safari brauzerida gapirai.uz ni oching (Chrome emas)' },
      { t: 'Pastdagi “Share” (yuqoriga o’q) tugmasiga bosing', ic: Share },
      { t: 'Ro’yxatdan “Bosh ekranga qo’shish” (Add to Home Screen) ni tanlang', ic: PlusSquare },
      { t: 'O’ng yuqoridagi “Qo’shish” (Add) ni bosing' },
    ],
    note: 'Bildirishnomalar iPhone’da faqat iOS 16.4+ da va ilova bosh ekrandan ochilganda ishlaydi.',
  },
} as const

function Guide({ p }: { p: 'android' | 'ios' }) {
  const g = STEPS[p]
  const Icon = g.icon
  return (
    <div id={p} className="rounded-3xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] backdrop-blur p-5 sm:p-6 space-y-4 scroll-mt-24">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-black text-gray-900 dark:text-white">{g.label}</h2>
      </div>
      <ol className="space-y-3">
        {g.steps.map((s, i) => {
          const StepIc = (s as any).ic
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-violet-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
              <span className="text-sm text-gray-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                {s.t}
                {StepIc && <StepIc className="w-4 h-4 text-gray-400 inline shrink-0" />}
              </span>
            </li>
          )
        })}
      </ol>
      {'note' in g && g.note && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          {g.note}
        </p>
      )}
    </div>
  )
}

export default function InstallPage() {
  const [platform, setPlatform] = useState<Platform>('other')
  const [installable, setInstallable] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPlatform(detectPlatform())
    setStandalone(isStandalone())
    setInstallable(canInstall())
    return onInstallChange(() => {
      setInstallable(canInstall())
      setStandalone(isStandalone())
    })
  }, [])

  const install = async () => {
    setBusy(true)
    await triggerInstall()
    setBusy(false)
  }

  return (
    <div className="min-h-screen relative flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl z-10 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition">
          <ArrowLeft className="w-4 h-4" /> Bosh sahifaga qaytish
        </Link>

        <div className="text-center space-y-3">
          <img src="/icons/icon-192.png" alt="GapirAI" className="w-16 h-16 rounded-2xl mx-auto shadow-lg" />
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">Ilovani o&apos;rnatish</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto">
            GapirAI.uz — alohida yuklab olinadigan ilova emas, u to&apos;g&apos;ridan-to&apos;g&apos;ri
            brauzerdan bosh ekranga o&apos;rnatiladi. Ochilishi tez, joy egallamaydi, bildirishnoma keladi.
          </p>
        </div>

        {standalone ? (
          <p className="text-center text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3 flex items-center justify-center gap-2">
            <Check className="w-4 h-4" /> Ilova allaqachon o&apos;rnatilgan
          </p>
        ) : installable ? (
          <button
            onClick={install}
            disabled={busy}
            className="w-full py-3.5 rounded-2xl font-bold text-sm bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Hoziroq o&apos;rnatish
          </button>
        ) : null}

        <div className="space-y-4">
          {(platform === 'ios' ? ['ios', 'android'] : ['android', 'ios']).map((p) => (
            <Guide key={p} p={p as 'android' | 'ios'} />
          ))}
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-slate-500">
          Kompyuterda: Chrome manzil qatorining o&apos;ng tomonidagi o&apos;rnatish belgisini bosing.
        </p>
      </div>
    </div>
  )
}
