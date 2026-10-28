'use client'
import { useEffect, useState } from 'react'
import { Check, Copy, Download, KeyRound, Loader2, Plus } from 'lucide-react'
import { listApiKeys, createApiKey, revokeApiKey, type ApiKeyInfo } from '@/lib/api'
import { formatTashkentDate } from '@/lib/timestamp'

const ZIP_URL = '/downloads/gapirai-premiere.zip'

// Dashboard'da: Premiere Pro plaginini yuklab olish va uning API kalitlarini boshqarish.
// Kalit faqat yaratilgan zahoti bir marta ko'rsatiladi (serverda saqlanmaydi).
export default function PremierePluginCard() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    listApiKeys().then(setKeys).catch(() => setKeys([]))
  }, [])

  async function create() {
    setBusy(true)
    setErr('')
    try {
      const k = await createApiKey('Premiere Pro')
      setFresh(k.token)
      setCopied(false)
      setKeys((prev) => [{ ...k, token: undefined }, ...(prev || [])])
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Kalit yaratib bo'lmadi.")
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    setRevoking(id)
    setErr('')
    try {
      await revokeApiKey(id)
      setKeys((prev) => (prev || []).filter((k) => k.id !== id))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Kalitni bekor qilib bo'lmadi.")
    } finally {
      setRevoking(null)
    }
  }

  async function copy() {
    if (!fresh) return
    try {
      await navigator.clipboard.writeText(fresh)
      setCopied(true)
    } catch {
      setErr("Nusxalab bo'lmadi — kalitni qo'lda belgilab oling.")
    }
  }

  return (
    <section id="premiere" aria-labelledby="premiere-title" className="mb-6 scroll-mt-24 rounded-card border border-ui-rule p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="premiere-title" className="text-base font-semibold text-ui-ink">Premiere Pro plagini</h2>
          <p className="mt-1 max-w-xl text-sm text-ui-muted">
            Timeline'dagi klipni toʻgʻridan-toʻgʻri GapirAI'ga yuboring: oʻzbekcha ovoz va subtitr oʻsha joyga alohida trek boʻlib qaytadi. Premiere Pro 2020 va yangilari, macOS va Windows.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={ZIP_URL} download className="ui-btn ui-btn-secondary">
            <Download aria-hidden="true" className="h-4 w-4" /> Plaginni yuklab olish
          </a>
          <button type="button" onClick={create} disabled={busy} className="ui-btn ui-btn-primary">
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            Kalit yaratish
          </button>
        </div>
      </div>

      {fresh && (
        <div className="mt-5 rounded-control border border-ui-rule bg-ui-ground p-4">
          <p className="text-sm font-medium text-ui-ink">Kalitni hozir nusxalab oling — u boshqa koʻrsatilmaydi.</p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={fresh}
              aria-label="Yangi API kalit"
              onFocus={(e) => e.currentTarget.select()}
              className="ui-input min-w-0 flex-1 font-mono text-xs"
            />
            <button type="button" onClick={copy} className="ui-btn ui-btn-secondary shrink-0">
              {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
              {copied ? 'Nusxalandi' : 'Nusxalash'}
            </button>
          </div>
          <p className="mt-2 text-xs text-ui-muted">Premiere'da: Window → Extensions → GapirAI → kalitni joylab „Saqlash“.</p>
        </div>
      )}

      {err && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{err}</p>}

      {keys && keys.length > 0 && (
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
              <button
                type="button"
                onClick={() => revoke(k.id)}
                disabled={revoking === k.id}
                className="shrink-0 text-sm font-medium text-ui-muted transition hover:text-red-600 disabled:opacity-50"
              >
                {revoking === k.id ? 'Bekor qilinmoqda…' : 'Bekor qilish'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
