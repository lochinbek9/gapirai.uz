'use client'
import { useEffect, useState } from 'react'
import {
  getBillingOverview, bindCard, verifyCard, resendCardCode, setDefaultCard, deleteCard,
  setAutoRenew, setAutoTopup,
  type BillingOverview, type SavedCard,
} from '@/lib/api'
import {
  CreditCard, Plus, Trash2, Check, Loader2, ShieldCheck, AlertTriangle, X,
} from 'lucide-react'

const PACK_LABELS: Record<number, string> = {
  30: '+30 daq', 35: '+35 daq',
  60: '+60 daq', 70: '+70 daq',
  120: '+120 daq', 140: '+140 daq',
  300: '+300 daq', 350: '+350 daq',
}

function cardBrand(c: SavedCard) {
  if (c.card_type === 'humo') return 'Humo'
  if (c.card_type === 'uzcard') return 'UzCard'
  return c.provider === 'payme' ? 'Payme' : 'Click'
}

export default function BillingCard() {
  const [ov, setOv] = useState<BillingOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // add-card form
  const [adding, setAdding] = useState(false)
  const [provider, setProvider] = useState<'click' | 'payme'>('click')
  const [number, setNumber] = useState('')
  const [expire, setExpire] = useState('')
  const [consent, setConsent] = useState(false)
  const [pendingCard, setPendingCard] = useState<SavedCard | null>(null)
  const [phoneHint, setPhoneHint] = useState<string | null>(null)
  const [code, setCode] = useState('')

  async function refresh() {
    try {
      const data = await getBillingOverview()
      setOv(data)
      const enabled = Object.entries(data.providers).filter(([, v]) => v).map(([k]) => k) as ('click' | 'payme')[]
      if (enabled.length && !enabled.includes(provider)) setProvider(enabled[0])
    } catch {
      setOv(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null
  if (!ov) return null
  const anyProvider = ov.providers.click || ov.providers.payme
  if (!anyProvider) return null // karta API'lari serverda yoqilmagan — bo'lim ko'rsatilmaydi

  const prefs = ov.preferences
  const activeCards = ov.cards.filter((c) => c.is_active)

  async function doBind() {
    setErr('')
    if (!consent) { setErr("Avtomatik to'lovga rozilikni belgilang."); return }
    setBusy(true)
    try {
      const res = await bindCard(provider, number.replace(/\s/g, ''), expire.replace(/\s/g, ''))
      if (res.needs_code) {
        setPendingCard(res.card)
        setPhoneHint(res.phone_hint)
      } else {
        await refresh()
        resetForm()
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Kartani bog'lab bo'lmadi.")
    } finally {
      setBusy(false)
    }
  }

  async function doVerify() {
    if (!pendingCard) return
    setErr('')
    setBusy(true)
    try {
      await verifyCard(pendingCard.id, code.trim())
      await refresh()
      resetForm()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Kod tasdiqlanmadi.')
    } finally {
      setBusy(false)
    }
  }

  function resetForm() {
    setAdding(false); setNumber(''); setExpire(''); setConsent(false)
    setPendingCard(null); setPhoneHint(null); setCode(''); setErr('')
  }

  async function remove(id: string) {
    setBusy(true)
    try { await deleteCard(id); await refresh() } finally { setBusy(false) }
  }
  async function makeDefault(id: string) {
    setBusy(true)
    try { await setDefaultCard(id); await refresh() } finally { setBusy(false) }
  }
  async function toggleRenew() {
    setBusy(true); setErr('')
    try { await setAutoRenew(!prefs.auto_renew); await refresh() }
    catch (e: any) { setErr(e?.response?.data?.detail || 'Xatolik') }
    finally { setBusy(false) }
  }
  async function toggleTopup() {
    setBusy(true); setErr('')
    try { await setAutoTopup(!prefs.auto_topup_enabled, ov?.preferences.auto_topup_pack ?? null); await refresh() }
    catch (e: any) { setErr(e?.response?.data?.detail || 'Xatolik') }
    finally { setBusy(false) }
  }
  async function pickPack(pack: number | null) {
    setBusy(true)
    try { await setAutoTopup(true, pack); await refresh() } finally { setBusy(false) }
  }

  const canRenew = ov.current_plan_paid || prefs.auto_renew_plan != null

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6 border border-black/5 dark:border-white/5 shadow-inner mb-6 space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center">
          <CreditCard className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-black text-gray-900 dark:text-white">Avtomatik to'lov</h3>
          <p className="text-[11px] text-gray-500 dark:text-slate-400">Bog'langan karta bilan obunani va daqiqani avtomatik to'ldirish</p>
        </div>
      </div>

      {prefs.in_grace && (
        <div className="flex items-start gap-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Obunani uzaytirib bo'lmadi. Kartangizni tekshiring — biz yaqin kunlarda qayta urinib ko'ramiz, shu vaqt davomida tarif ishlaydi.</span>
        </div>
      )}

      {err && (
        <div className="flex items-center justify-between gap-2 text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 rounded-xl px-3 py-2">
          <span>{err}</span>
          <button onClick={() => setErr('')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Saqlangan kartalar */}
      <div className="space-y-2">
        {ov.cards.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-slate-500">Hali karta bog'lanmagan.</p>
        )}
        {ov.cards.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-black/5 dark:border-white/10 bg-white/50 dark:bg-white/[0.03] px-3 py-2.5">
            <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-800 dark:text-slate-200 truncate">
                {cardBrand(c)} · {c.card_mask || '••••'}
                {!c.is_active && <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">tasdiqlanmagan</span>}
              </p>
              {c.expire && <p className="text-[10px] text-gray-400">{c.expire}</p>}
            </div>
            {c.is_default && c.is_active && (
              <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full shrink-0">asosiy</span>
            )}
            {c.is_active && !c.is_default && (
              <button onClick={() => makeDefault(c.id)} disabled={busy}
                className="text-[10px] font-semibold text-gray-500 hover:text-violet-600 shrink-0">asosiy qilish</button>
            )}
            <button onClick={() => remove(c.id)} disabled={busy} className="text-gray-400 hover:text-red-500 shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Karta qo'shish */}
      {!adding && !pendingCard && (
        <button onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 dark:text-violet-400 hover:opacity-80">
          <Plus className="w-4 h-4" /> Karta bog'lash
        </button>
      )}

      {adding && !pendingCard && (
        <div className="rounded-xl border border-black/5 dark:border-white/10 p-4 space-y-3 bg-black/[0.015] dark:bg-white/[0.02]">
          {ov.providers.click && ov.providers.payme && (
            <div className="flex gap-2">
              {(['click', 'payme'] as const).map((p) => (
                <button key={p} onClick={() => setProvider(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                    provider === p ? 'bg-violet-500 text-white' : 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>
                  {p}
                </button>
              ))}
            </div>
          )}
          <input
            inputMode="numeric" autoComplete="cc-number" placeholder="Karta raqami"
            value={number} onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, ''))}
            className="w-full px-3 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 text-sm outline-none focus:border-violet-500"
          />
          <input
            inputMode="numeric" autoComplete="cc-exp" placeholder="Amal muddati (MM/YY)"
            value={expire} onChange={(e) => setExpire(e.target.value.replace(/[^\d/]/g, '').slice(0, 5))}
            className="w-full px-3 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 text-sm outline-none focus:border-violet-500"
          />
          <label className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-slate-400 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>
              Kartani bog'lashga va obunam/daqiqam tugaganda undan avtomatik to'lov yechilishiga rozilik beraman.
              Avtomatik to'lovni istalgan vaqtda shu yerdan o'chirishim mumkin. Karta ma'lumotlari to'lov tizimida
              (Click/Payme) saqlanadi, GapirAI.uz ularni ko'rmaydi.
            </span>
          </label>
          <div className="flex gap-2">
            <button onClick={doBind} disabled={busy || !number || !expire}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              SMS kod olish
            </button>
            <button onClick={resetForm} className="px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 text-xs font-bold text-gray-500">Bekor</button>
          </div>
        </div>
      )}

      {pendingCard && (
        <div className="rounded-xl border border-black/5 dark:border-white/10 p-4 space-y-3 bg-black/[0.015] dark:bg-white/[0.02]">
          <p className="text-xs text-gray-600 dark:text-slate-300">
            {phoneHint ? <><strong>{phoneHint}</strong> raqamiga</> : 'Telefoningizga'} yuborilgan SMS kodni kiriting.
          </p>
          <input
            inputMode="numeric" placeholder="SMS kod" value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 8))}
            className="w-full px-3 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-slate-900 text-sm outline-none focus:border-violet-500 tracking-widest text-center"
          />
          <div className="flex gap-2">
            <button onClick={doVerify} disabled={busy || code.length < 3}
              className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Tasdiqlash
            </button>
            <button onClick={() => pendingCard && resendCardCode(pendingCard.id).then((r) => setPhoneHint(r.phone_hint)).catch(() => {})}
              disabled={busy} className="px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 text-xs font-bold text-gray-500">Qayta</button>
            <button onClick={resetForm} className="px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-white/5 text-xs font-bold text-gray-500">Bekor</button>
          </div>
        </div>
      )}

      {/* Sozlamalar */}
      {activeCards.length > 0 && (
        <div className="space-y-3 pt-1 border-t border-black/5 dark:border-white/10">
          <Toggle
            label="Obunani avtomatik uzaytirish"
            hint={canRenew ? "Tarif muddati tugaganda kartadan avtomatik to'lanadi" : "Faol pullik obuna kerak"}
            on={prefs.auto_renew} disabled={busy || !canRenew} onToggle={toggleRenew}
          />
          <Toggle
            label="Daqiqani avtomatik to'ldirish"
            hint="Balans yetmasa, video to'xtamasligi uchun paket avtomatik sotib olinadi"
            on={prefs.auto_topup_enabled} disabled={busy} onToggle={toggleTopup}
          />
          {prefs.auto_topup_enabled && (
            <div className="flex flex-wrap gap-1.5 pl-1">
              <span className="text-[11px] text-gray-400 self-center mr-1">Paket:</span>
              {[null, 30, 60, 120, 300].map((p) => (
                <button key={p ?? 'auto'} onClick={() => pickPack(p)} disabled={busy}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                    (prefs.auto_topup_pack ?? null) === p
                      ? 'bg-violet-500 text-white'
                      : 'bg-gray-100 dark:bg-white/5 text-gray-500'}`}>
                  {p === null ? 'Avto' : PACK_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({ label, hint, on, disabled, onToggle }: {
  label: string; hint: string; on: boolean; disabled?: boolean; onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-gray-800 dark:text-slate-200">{label}</p>
        <p className="text-[11px] text-gray-400 dark:text-slate-500">{hint}</p>
      </div>
      <button
        onClick={onToggle} disabled={disabled} aria-pressed={on}
        className={`relative w-11 h-6 rounded-full shrink-0 transition ${on ? 'bg-violet-500' : 'bg-gray-300 dark:bg-white/15'} disabled:opacity-40`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}
