'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, Loader2, ShieldCheck, X } from 'lucide-react'
import { startPayment, type PayProvider, type PayStart, type PayTarget } from '@/lib/api'
import UzumAccountCard from '@/components/UzumAccountCard'
import PaynetOrderCard from '@/components/PaynetOrderCard'

/** To'lov usulini tanlash (2026-11-02): tarif, daqiqa paketi yoki video uchun "To'lash"
 * bosilganda 4 ta tizim logotipi bilan ochiladi. Ilgari sahifa tepasidagi kichik
 * tanlagich ko'zdan qochib, ko'pchilik standart Click bilan ketardi.
 * Telefonda pastdan chiqadigan varaq, kompyuterda markazdagi oyna. */

export const PAY_METHODS: { id: PayProvider; name: string; logo: string; hint: string }[] = [
  { id: 'click', name: 'Click', logo: '/logos/click.png', hint: 'Click ilovasi yoki bank kartasi' },
  { id: 'payme', name: 'Payme', logo: '/logos/payme.png', hint: 'Payme ilovasi yoki bank kartasi' },
  { id: 'uzum', name: 'Uzum', logo: '/logos/uzum.png', hint: 'Uzum Bank ilovasida' },
  { id: 'paynet', name: 'Paynet', logo: '/logos/paynetlogo.png', hint: "Paynet ilovasi yoki to'lov shoxobchasida" },
]

type CodeStart = Extract<PayStart, { kind: 'uzum' | 'paynet' }>

/** Uzum hisob raqami / Paynet buyurtma raqami oynasi -- to'lov ilova ichida shu raqam bilan qilinadi. */
export function PaymentCodeDialog({ start, onClose }: { start: CodeStart | null; onClose: () => void }) {
  useEscape(!!start, onClose)
  if (!start) return null
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={start.kind === 'uzum' ? "Uzum orqali to'lov" : "Paynet orqali to'lov"}
        className="w-full max-w-sm rounded-card border border-ui-rule bg-ui-surface p-5 shadow-[0_24px_64px_rgb(0_0_0/0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {start.kind === 'uzum' ? (
          <UzumAccountCard account={start.account} amount={start.amount} deeplink={start.deeplink} />
        ) : (
          <PaynetOrderCard orderId={start.orderId} amount={start.amount} />
        )}
        <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary mt-3 w-full">Yopish</button>
      </div>
    </div>
  )
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])
}

interface Request {
  target: PayTarget
  /** Nima uchun to'lanyapti: "Standart tarif · 1 oy" */
  title: string
  /** "49 000 so'm" -- berilmasa ko'rsatilmaydi */
  amount?: string
}

/** Ishlatish: `const pay = usePaymentChooser()` ... `pay.open({ target, title, amount })` ... `{pay.ui}` */
export function usePaymentChooser() {
  const [request, setRequest] = useState<Request | null>(null)
  const [busy, setBusy] = useState<PayProvider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<CodeStart | null>(null)

  const close = () => {
    if (busy) return
    setRequest(null)
    setError(null)
  }
  useEscape(!!request, close)

  const choose = async (provider: PayProvider) => {
    if (!request || busy) return
    setBusy(provider)
    setError(null)
    try {
      const start = await startPayment(request.target, provider)
      if (start.kind === 'url') {
        window.location.assign(start.url)
        return // sahifa to'lov tizimiga o'tadi -- tugma "kutilmoqda" holatida qoladi
      }
      setRequest(null)
      if (start.kind === 'none') window.location.reload()
      else setCode(start)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "To'lovni boshlab bo'lmadi. Boshqa usulni tanlang yoki birozdan keyin urinib ko'ring.")
    } finally {
      setBusy(null)
    }
  }

  const ui = (
    <>
      {request && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-title"
            className="w-full rounded-t-card border border-ui-rule bg-ui-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_24px_64px_rgb(0_0_0/0.25)] sm:max-w-md sm:rounded-card sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="pay-title" className="text-lg font-semibold tracking-[-0.02em] text-ui-ink">To&apos;lov usulini tanlang</h2>
                <p className="mt-1 text-sm text-ui-muted">
                  {request.title}
                  {request.amount && <> · <span className="font-medium text-ui-ink tabular-nums">{request.amount}</span></>}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Yopish"
                className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ui-muted transition hover:bg-ui-ground hover:text-ui-ink"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <ul className="mt-5 space-y-2">
              {PAY_METHODS.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => choose(m.id)}
                    disabled={!!busy}
                    className="flex w-full items-center gap-4 rounded-control border border-ui-rule px-3 py-3 text-left transition hover:border-ui-muted/60 hover:bg-ui-ground disabled:opacity-60"
                  >
                    <span className="flex h-11 w-20 shrink-0 items-center justify-center rounded-lg border border-ui-rule bg-white px-2">
                      <img src={m.logo} alt="" className="max-h-6 w-auto max-w-full object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-ui-ink">{m.name}</span>
                      <span className="block text-sm text-ui-muted">{m.hint}</span>
                    </span>
                    {busy === m.id ? (
                      <Loader2 aria-label="Kutilmoqda" className="h-5 w-5 shrink-0 animate-spin text-ui-muted" />
                    ) : (
                      <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ui-muted" />
                    )}
                  </button>
                </li>
              ))}
            </ul>

            {error && (
              <p role="alert" className="mt-4 rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-3 py-2.5 text-sm font-medium text-ui-red-ink">
                {error}
              </p>
            )}

            <p className="mt-4 flex items-center gap-1.5 text-xs text-ui-muted">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
              Karta ma&apos;lumotlari to&apos;lov tizimining o&apos;zida kiritiladi — biz ularni ko&apos;rmaymiz.
            </p>
          </div>
        </div>
      )}
      <PaymentCodeDialog start={code} onClose={() => setCode(null)} />
    </>
  )

  return { open: (r: Request) => { setError(null); setRequest(r) }, ui, busy }
}
