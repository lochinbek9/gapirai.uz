'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, Copy, Eye, KeyRound, Loader2, Plus } from 'lucide-react'
import PageShell, { PageTitle } from '@/components/PageShell'
import CodeBlock from '@/components/CodeBlock'
import { createApiKey, getApiBalance, getWebhookSecret, listApiKeys, revokeApiKey, type ApiKeyInfo } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatTashkentDate } from '@/lib/timestamp'

const QUICKSTART = `curl https://api.gapirai.uz/v1/dubs \\
  -H "Authorization: Bearer $GAPIRAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "source_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "mode": "dub",
    "webhook_url": "https://example.uz/gapirai-webhook"
  }'`

const SERVICES = [
  { name: 'Dublaj', path: 'POST /v1/dubs', text: 'YouTube havolasi yoki video fayl → oʻzbekcha ovozli video, audio va subtitr.', ready: true },
  { name: 'Subtitr', path: 'POST /v1/dubs  mode=subtitles', text: 'Chet tildagi yoki oʻzbekcha video → oʻzbekcha SRT/VTT subtitr.', ready: true },
  { name: 'Matndan ovoz (TTS)', path: 'POST /v1/tts', text: 'Oʻzbekcha matnni tabiiy ovozga aylantirish.', ready: false },
  { name: 'Nutqdan matn (STT)', path: 'POST /v1/stt', text: 'Audio yoki videodagi nutqni matnga aylantirish.', ready: false },
  { name: 'Tarjima', path: 'POST /v1/translate', text: 'Matn va subtitrlarni oʻzbekchaga tarjima qilish.', ready: false },
]

export default function DevelopersPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    setLoggedIn(!!getToken())
  }, [])

  return (
    <PageShell>
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
        <PageTitle
          title="GapirAI API"
          lead="Videolarni oʻzbekchaga dublaj va subtitr qilishni oʻz saytingiz, kurs platformangiz yoki Telegram botingizga ulang. Narx saytdagi bilan bir xil: video daqiqasi hisobingizdagi daqiqalardan yechiladi."
        >
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/developers/docs" className="ui-btn ui-btn-primary">
              Hujjatni ochish <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <a href="#kalitlar" className="ui-btn ui-btn-secondary">
              <KeyRound aria-hidden="true" className="h-4 w-4" /> API kalit olish
            </a>
          </div>
        </PageTitle>

        <section aria-labelledby="tez-boshlash" className="mt-16">
          <h2 id="tez-boshlash" className="text-lg font-semibold text-ui-ink">3 qadamda boshlash</h2>
          <ol className="mt-4 grid gap-4 text-[15px] text-ui-muted sm:grid-cols-3">
            <li className="rounded-card border border-ui-rule p-5">
              <span className="text-sm font-semibold text-ui-ink">1. Kalit yarating</span>
              <p className="mt-1">Pastdagi „API kalitlar“ boʻlimida. Kalit bir marta koʻrsatiladi.</p>
            </li>
            <li className="rounded-card border border-ui-rule p-5">
              <span className="text-sm font-semibold text-ui-ink">2. Video yuboring</span>
              <p className="mt-1">YouTube havolasi yoki fayl. Javobda dublaj <code className="font-mono text-[13px]">id</code>si keladi.</p>
            </li>
            <li className="rounded-card border border-ui-rule p-5">
              <span className="text-sm font-semibold text-ui-ink">3. Natijani oling</span>
              <p className="mt-1">Tayyor boʻlganda webhook keladi yoki <code className="font-mono text-[13px]">GET /v1/dubs/&#123;id&#125;</code> bilan soʻraysiz.</p>
            </li>
          </ol>
          <CodeBlock code={QUICKSTART} label="curl" />
        </section>

        <section aria-labelledby="xizmatlar" className="mt-16">
          <h2 id="xizmatlar" className="text-lg font-semibold text-ui-ink">Xizmatlar</h2>
          <ul className="mt-4 divide-y divide-ui-rule border-y border-ui-rule">
            {SERVICES.map((s) => (
              <li key={s.name} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-6">
                <div className="flex shrink-0 items-center gap-2 sm:w-64">
                  <span className="text-[15px] font-medium text-ui-ink">{s.name}</span>
                  {!s.ready && (
                    <span className="rounded-full border border-ui-rule px-2 py-0.5 text-[11px] font-medium text-ui-muted">Tez orada</span>
                  )}
                </div>
                <p className="flex-1 text-sm text-ui-muted">{s.text}</p>
                <code className="shrink-0 font-mono text-xs text-ui-muted">{s.path}</code>
              </li>
            ))}
          </ul>
        </section>

        <section id="kalitlar" aria-labelledby="kalitlar-title" className="mt-16 scroll-mt-24">
          <h2 id="kalitlar-title" className="text-lg font-semibold text-ui-ink">API kalitlar</h2>
          {loggedIn === null ? null : loggedIn ? (
            <DeveloperAccount />
          ) : (
            <div className="mt-4 rounded-card border border-ui-rule p-5 sm:p-6">
              <p className="text-[15px] text-ui-muted">Kalit yaratish uchun GapirAI hisobingizga kiring. Roʻyxatdan oʻtish bepul.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/login" className="ui-btn ui-btn-primary">Kirish</Link>
                <Link href="/register" className="ui-btn ui-btn-secondary">Roʻyxatdan oʻtish</Link>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="hamkorlik" className="mt-16 rounded-card border border-ui-rule p-5 sm:p-6">
          <h2 id="hamkorlik" className="text-base font-semibold text-ui-ink">Katta hajm va hamkorlik</h2>
          <p className="mt-1 max-w-2xl text-sm text-ui-muted">
            Kurs platformasi, media yoki koʻp videoli kanal uchun alohida narx, yuqori limitlar va texnik yordam kerak boʻlsa, yozing.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="https://t.me/gapir_uz_muhokama" target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-secondary">Telegram orqali</a>
            <a href="mailto:lodexgroups@gmail.com?subject=GapirAI%20API%20hamkorlik" className="ui-btn ui-btn-secondary">Email orqali</a>
          </div>
        </section>
      </div>
    </PageShell>
  )
}

function DeveloperAccount() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null)
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState<'key' | 'secret' | null>(null)
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [unlimited, setUnlimited] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    listApiKeys().then(setKeys).catch(() => setKeys([]))
    getApiBalance()
      .then((b) => {
        setMinutes(b.minutes_available)
        setUnlimited(b.unlimited)
      })
      .catch(() => setMinutes(null))
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const k = await createApiKey(name.trim() || 'API')
      setFresh(k.token)
      setCopied(null)
      setName('')
      setKeys((prev) => [{ ...k, token: undefined }, ...(prev || [])])
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Kalit yaratib boʻlmadi.")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Kalit bekor qilinsinmi? Uni ishlatayotgan dasturlar darhol toʻxtaydi.")) return
    setRevoking(id)
    setErr('')
    try {
      await revokeApiKey(id)
      setKeys((prev) => (prev || []).filter((k) => k.id !== id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Kalitni bekor qilib boʻlmadi.")
    } finally {
      setRevoking(null)
    }
  }

  async function revealSecret() {
    setErr('')
    try {
      setSecret(await getWebhookSecret())
    } catch {
      setErr("Webhook sirini olib boʻlmadi.")
    }
  }

  async function copy(text: string, what: 'key' | 'secret') {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
    } catch {
      setErr("Nusxalab boʻlmadi — qoʻlda belgilab oling.")
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-card border border-ui-rule p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-ui-muted">Daqiqa balansi</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-ui-ink">
              {unlimited ? 'Cheksiz' : minutes === null ? '—' : `${minutes.toLocaleString('uz-UZ')} daqiqa`}
            </p>
          </div>
          <Link href="/pricing" className="text-sm font-medium text-ui-ink underline underline-offset-4">Daqiqa sotib olish</Link>
        </div>
      </div>

      <div className="rounded-card border border-ui-rule p-5 sm:p-6">
        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="key-name" className="sr-only">Kalit nomi</label>
          <input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Kalit nomi, masalan: Kurs sayti"
            className="ui-input min-h-11 min-w-0 flex-1 px-3.5 text-[15px]"
          />
          <button type="submit" disabled={busy} className="ui-btn ui-btn-primary shrink-0">
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            Kalit yaratish
          </button>
        </form>

        {fresh && (
          <div className="mt-5 rounded-control border border-ui-rule bg-ui-ground p-4">
            <p className="text-sm font-medium text-ui-ink">Kalitni hozir nusxalab oling — u boshqa koʻrsatilmaydi.</p>
            <div className="mt-3 flex gap-2">
              <input readOnly value={fresh} aria-label="Yangi API kalit" onFocus={(e) => e.currentTarget.select()}
                className="ui-input min-w-0 flex-1 px-3 font-mono text-xs" />
              <button type="button" onClick={() => copy(fresh, 'key')} className="ui-btn ui-btn-secondary shrink-0">
                {copied === 'key' ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
                {copied === 'key' ? 'Nusxalandi' : 'Nusxalash'}
              </button>
            </div>
            <p className="mt-2 text-xs text-ui-muted">Kalitni serveringizda saqlang (masalan, <code className="font-mono">GAPIRAI_API_KEY</code> muhit oʻzgaruvchisi). Brauzer yoki mobil ilova kodiga joylamang.</p>
          </div>
        )}

        {keys && keys.length > 0 ? (
          <ul className="mt-5 divide-y divide-ui-rule border-t border-ui-rule">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <KeyRound aria-hidden="true" className="h-4 w-4 shrink-0 text-ui-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ui-ink">{k.name}</p>
                    <p className="text-xs text-ui-muted">
                      Yaratilgan {formatTashkentDate(k.created_at)}
                      {' · '}
                      {k.last_used_at ? `oxirgi marta ${formatTashkentDate(k.last_used_at)}` : 'hali ishlatilmagan'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => revoke(k.id)} disabled={revoking === k.id}
                  className="shrink-0 text-sm font-medium text-ui-muted transition hover:text-red-600 disabled:opacity-50">
                  {revoking === k.id ? 'Bekor qilinmoqda…' : 'Bekor qilish'}
                </button>
              </li>
            ))}
          </ul>
        ) : keys ? (
          <p className="mt-4 text-sm text-ui-muted">Hali kalit yoʻq. Bitta hisobda 5 tagacha faol kalit boʻlishi mumkin. Premiere va DaVinci plaginlari kalitlari ham shu roʻyxatda.</p>
        ) : null}
      </div>

      <div className="rounded-card border border-ui-rule p-5 sm:p-6">
        <h3 className="text-base font-semibold text-ui-ink">Webhook siri</h3>
        <p className="mt-1 max-w-2xl text-sm text-ui-muted">
          Webhook soʻrovi haqiqatan GapirAI'dan kelganini tekshirish uchun. Har soʻrovda <code className="font-mono text-[13px]">GapirAI-Signature</code> sarlavhasi bor —{' '}
          <Link href="/developers/docs#webhook" className="text-ui-ink underline underline-offset-4">qanday tekshiriladi</Link>.
        </p>
        {secret ? (
          <div className="mt-4 flex gap-2">
            <input readOnly value={secret} aria-label="Webhook siri" onFocus={(e) => e.currentTarget.select()}
              className="ui-input min-w-0 flex-1 px-3 font-mono text-xs" />
            <button type="button" onClick={() => copy(secret, 'secret')} className="ui-btn ui-btn-secondary shrink-0">
              {copied === 'secret' ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {copied === 'secret' ? 'Nusxalandi' : 'Nusxalash'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={revealSecret} className="ui-btn ui-btn-secondary mt-4">
            <Eye aria-hidden="true" className="h-4 w-4" /> Sirni koʻrsatish
          </button>
        )}
      </div>

      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
    </div>
  )
}
