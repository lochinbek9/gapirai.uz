'use client'
import { useEffect, useState } from 'react'
import PageShell, { PageTitle } from '@/components/PageShell'
import { Check, Download, Loader2, Share, PlusSquare, MoreVertical, Smartphone, Apple } from 'lucide-react'
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
    <section id={p} aria-labelledby={`${p}-title`} className="ui-card scroll-mt-24 p-5 sm:p-6">
      <h2 id={`${p}-title`} className="flex items-center gap-2.5 text-lg font-semibold text-ui-ink">
        <Icon aria-hidden="true" className="h-5 w-5 text-ui-muted" />
        {g.label}
      </h2>
      <ol className="mt-5 space-y-3.5">
        {g.steps.map((s, i) => {
          const StepIc = (s as any).ic
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ui-rule text-xs font-semibold text-ui-ink tabular-nums">{i + 1}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-[15px] text-ui-muted">
                {s.t}
                {StepIc && <StepIc aria-hidden="true" className="inline h-4 w-4 shrink-0 text-ui-muted" />}
              </span>
            </li>
          )
        })}
      </ol>
      {'note' in g && g.note && (
        <p className="mt-5 rounded-control border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-[13px] text-ui-ink">
          {g.note}
        </p>
      )}
    </section>
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
    <PageShell>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
        <PageTitle
          center
          title="Ilovani oʻrnatish"
          lead="GapirAI.uz alohida yuklab olinadigan ilova emas — u toʻgʻridan-toʻgʻri brauzerdan bosh ekranga oʻrnatiladi. Tez ochiladi, joy egallamaydi, bildirishnoma keladi."
        />

        <div className="mx-auto mt-8 max-w-sm">
          {standalone ? (
            <p className="flex items-center justify-center gap-2 rounded-control border border-ui-green/30 bg-ui-green/[0.07] px-4 py-3 text-[15px] text-ui-green-ink">
              <Check aria-hidden="true" className="h-4 w-4" /> Ilova allaqachon oʻrnatilgan
            </p>
          ) : installable ? (
            <button type="button" onClick={install} disabled={busy} className="ui-btn ui-btn-primary w-full">
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Download aria-hidden="true" className="h-4 w-4" />}
              Hoziroq oʻrnatish
            </button>
          ) : null}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {(platform === 'ios' ? ['ios', 'android'] : ['android', 'ios']).map((p) => (
            <Guide key={p} p={p as 'android' | 'ios'} />
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-ui-muted">
          Kompyuterda: Chrome manzil qatorining oʻng tomonidagi oʻrnatish belgisini bosing.
        </p>
      </div>
    </PageShell>
  )
}
