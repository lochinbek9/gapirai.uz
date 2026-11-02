'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MailCheck, Trash2 } from 'lucide-react'
import {
  apiCreateNews,
  apiDeleteNews,
  apiEmailStats,
  apiListNews,
  type EmailAutomationStats,
  type SiteNewsItem,
} from '@/lib/admin'
import { formatTashkentDateTime } from '@/lib/timestamp'

const KIND_LABEL: Record<string, string> = {
  activate_1: "Faollashtirish · 1-kun",
  activate_2: "Faollashtirish · 3-kun",
  activate_3: "Faollashtirish · 7-kun",
  quota: "Bepul daqiqa tugadi",
  news: "Haftalik yangiliklar",
}

/** Avtomatik xatlar (2026-11-02): cron har soatda o'zi yuboradi -- bu yerda faqat
 * haftalik xatga yangilik qo'shiladi va natija kuzatiladi. */
export default function AdminEmailAutomation({ token }: { token: string }) {
  const [stats, setStats] = useState<EmailAutomationStats | null>(null)
  const [news, setNews] = useState<SiteNewsItem[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, n] = await Promise.all([apiEmailStats(token), apiListNews(token)])
      setStats(s)
      setNews(n)
    } catch {
      setError("Ma'lumotni yuklab bo'lmadi.")
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await apiCreateNews(token, {
        title: title.trim(),
        body: body.trim(),
        link_url: linkUrl.trim() || undefined,
        link_text: linkText.trim() || undefined,
      })
      setTitle(''); setBody(''); setLinkUrl(''); setLinkText('')
      await load()
    } catch (err: any) {
      setError(err?.response?.data?.detail?.[0]?.msg || err?.response?.data?.detail || "Saqlab bo'lmadi.")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm("Bu yangilikni o'chirasizmi?")) return
    await apiDeleteNews(token, id)
    await load()
  }

  const input = 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-blue-400 focus:outline-none'

  return (
    <div className="space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
        <div>
          <h3 className="font-semibold text-white">Avtomatik email xatlar</h3>
          <p className="mt-1 text-sm text-white/60">
            Har soatda o&apos;zi ishlaydi (Toshkent 09:00–21:00): video yubormaganlarga 1-, 3-, 7-kuni eslatma, bepul
            daqiqasi tugaganlarga taklif va har hafta yangiliklar. Bir odamga 3 kunda ko&apos;pi bilan 1 ta xat.
          </p>
        </div>
      </div>

      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-xs text-white/50">Navbatda (hozir yuborilishi kerak)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{stats.queued_now}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-xs text-white/50">Obunadan chiqqanlar</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{stats.opt_outs}</p>
          </div>
          <div className="rounded-xl border border-white/10 p-3">
            <p className="text-xs text-white/50">Oxirgi 7 kunda yuborildi</p>
            <ul className="mt-1 space-y-0.5 text-sm text-white/80">
              {Object.keys(stats.last_7_days).length === 0 && <li className="text-white/50">Hali yo&apos;q</li>}
              {Object.entries(stats.last_7_days).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2 tabular-nums">
                  <span>{KIND_LABEL[k] || k}</span>
                  <span>{v.sent}{v.failed ? <span className="text-rose-400"> · {v.failed} xato</span> : null}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form onSubmit={add} className="space-y-3 border-t border-white/10 pt-5">
        <p className="text-sm font-medium text-white">Haftalik xatga yangilik qo&apos;shish</p>
        <p className="text-xs text-white/50">
          Oxirgi 7 kundagi yangiliklar va yangi ommaviy videolar shu haftaning xatiga kiradi. Yangilik bo&apos;lmasa, xat yuborilmaydi.
        </p>
        <input className={input} placeholder="Sarlavha (masalan: Hujjat tahlili)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
        <textarea className={`${input} min-h-[90px]`} placeholder="Qisqa matn — 1-3 jumla" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} required />
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <input className={input} placeholder="Havola (ixtiyoriy): https://gapirai.uz/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <input className={input} placeholder="Havola matni: Sinab ko'rish" value={linkText} onChange={(e) => setLinkText(e.target.value)} maxLength={60} />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Yangilik qo&apos;shish
        </button>
      </form>

      {news.length > 0 && (
        <ul className="space-y-2 border-t border-white/10 pt-5">
          {news.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/10 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{n.title}</p>
                <p className="mt-0.5 text-sm text-white/60">{n.body}</p>
                <p className="mt-1 text-xs text-white/40">{formatTashkentDateTime(n.created_at)}</p>
              </div>
              <button onClick={() => remove(n.id)} aria-label="O'chirish" className="rounded-lg p-2 text-white/50 hover:bg-rose-500/10 hover:text-rose-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
