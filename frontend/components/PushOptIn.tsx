'use client'
import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2 } from 'lucide-react'
import { getPushState, enablePush, disablePush, type PushState } from '@/lib/push'

// Dashboard'да ko'rsatiladi. Push qo'llab-quvvatlanmasa yoki server VAPID'ni
// yoqmagan bo'lsa umuman ko'rinmaydi.
export default function PushOptIn() {
  const [state, setState] = useState<PushState | 'loading'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  if (state === 'loading' || state === 'unsupported') return null

  const toggle = async () => {
    setBusy(true)
    try {
      if (state === 'subscribed') {
        await disablePush()
        setState('default')
      } else {
        setState(await enablePush())
      }
    } finally {
      setBusy(false)
    }
  }

  const subscribed = state === 'subscribed'
  const denied = state === 'denied'

  return (
    <div className="glass-card rounded-2xl p-4 border border-ui-rule flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${subscribed ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
          {subscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ui-ink">Bildirishnomalar</p>
          <p className="text-xs text-ui-muted truncate">
            {denied
              ? "Brauzer sozlamalaridan ruxsat bering"
              : subscribed
              ? "Dublyaj tayyor bo'lganda xabar keladi"
              : "Dublyaj tayyor bo'lganda telefoningizga xabar oling"}
          </p>
        </div>
      </div>
      {!denied && (
        <button
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 text-xs font-semibold px-3.5 py-2 rounded-xl transition disabled:opacity-50 ${
            subscribed
              ? 'bg-ui-ground text-ui-muted'
              : ' bg-blue-500 text-white'
          }`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : subscribed ? "O'chirish" : 'Yoqish'}
        </button>
      )}
    </div>
  )
}
