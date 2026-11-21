import type { Metadata } from 'next'
import Link from 'next/link'
import PageShell from '@/components/PageShell'
import CodeBlock from '@/components/CodeBlock'

export const metadata: Metadata = {
  title: 'API hujjati — GapirAI',
  description: "GapirAI API v1: videolarni oʻzbekchaga dublaj va subtitr qilish, webhook, xato kodlari va kod namunalari (curl, Python, Node.js).",
  alternates: { canonical: '/developers/docs' },
}

const TOC = [
  ['kirish', 'Kirish'],
  ['narx', 'Narx'],
  ['dublaj-yaratish', 'Dublaj yaratish'],
  ['fayl-yuklash', 'Fayldan dublaj'],
  ['holat', 'Holatni olish'],
  ['royxat', 'Roʻyxat'],
  ['webhook', 'Webhook'],
  ['balans', 'Balans'],
  ['idempotency', 'Takroriy soʻrovlar'],
  ['xatolar', 'Xatolar'],
  ['limitlar', 'Limitlar'],
] as const

const CREATE = `curl https://api.gapirai.uz/v1/dubs \\
  -H "Authorization: Bearer $GAPIRAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: lesson-42" \\
  -d '{
    "source_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "mode": "dub",
    "voice_gender": "auto",
    "webhook_url": "https://example.uz/gapirai-webhook"
  }'`

const DUB_OBJECT = `{
  "id": "6f1c2a9e-1b7d-4c55-9a8e-3d2f0b6c1e42",
  "object": "dub",
  "mode": "dub",
  "status": "completed",
  "stage": "completed",
  "progress": 100.0,
  "title": "Introduction to Machine Learning",
  "source_url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "duration_seconds": 412.5,
  "voice_gender": "auto",
  "created_at": "2026-11-21T10:15:02Z",
  "completed_at": "2026-11-21T10:19:40Z",
  "outputs": {
    "video_url": "https://api.gapirai.uz/api/outputs/6f1c.../video",
    "audio_url": "https://api.gapirai.uz/api/outputs/6f1c.../audio",
    "srt_url": "https://api.gapirai.uz/api/jobs/6f1c.../subtitles.srt",
    "vtt_url": "https://api.gapirai.uz/api/jobs/6f1c.../subtitles.vtt?download=1",
    "text_url": "https://api.gapirai.uz/api/jobs/6f1c.../subtitles.txt"
  },
  "error": null,
  "webhook": { "url": "https://example.uz/gapirai-webhook", "status": "delivered", "attempts": 1 }
}`

const UPLOAD = `curl "https://api.gapirai.uz/v1/dubs/upload?mode=subtitles" \\
  -H "Authorization: Bearer $GAPIRAI_API_KEY" \\
  -H "Content-Type: video/mp4" \\
  -H "X-File-Name: dars-1.mp4" \\
  --data-binary @dars-1.mp4`

const POLL_PY = `import os, time, requests

API = "https://api.gapirai.uz/v1"
H = {"Authorization": f"Bearer {os.environ['GAPIRAI_API_KEY']}"}

dub = requests.post(f"{API}/dubs", headers=H, json={
    "source_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "mode": "subtitles",
}).json()

while dub["status"] in ("queued", "processing"):
    time.sleep(15)
    dub = requests.get(f"{API}/dubs/{dub['id']}", headers=H).json()

if dub["status"] == "completed":
    print(dub["outputs"]["srt_url"])
else:
    print("Xato:", dub["error"])`

const WEBHOOK_BODY = `POST https://example.uz/gapirai-webhook
Content-Type: application/json
GapirAI-Event: dub.completed
GapirAI-Signature: t=1795262380,v1=5f8e0c...

{
  "id": "evt_9b0c4e...",
  "event": "dub.completed",
  "created_at": "2026-11-21T10:19:41Z",
  "data": { ...dublaj obyekti... }
}`

const VERIFY_PY = `import hashlib, hmac, time

def verify(raw_body: bytes, header: str, secret: str, tolerance=300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t, sig = parts["t"], parts["v1"]
    if abs(time.time() - int(t)) > tolerance:
        return False  # eski so'rov -- qayta yuborish hujumi
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)`

const VERIFY_JS = `import crypto from 'node:crypto'

export function verify(rawBody, header, secret, tolerance = 300) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > tolerance) return false
  const expected = crypto.createHmac('sha256', secret)
    .update(\`\${parts.t}.\`).update(rawBody).digest('hex')
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}`

const ERROR = `{
  "error": {
    "code": "insufficient_minutes",
    "message": "Daqiqa balansi yetarli emas.",
    "minutes_short": 3
  }
}`

const ERRORS: [string, string, string][] = [
  ['400', 'invalid_request', 'Maydon notoʻgʻri (masalan, source_language=uz faqat subtitr rejimida).'],
  ['400', 'invalid_source_url', 'Hozircha faqat YouTube havolasi qabul qilinadi.'],
  ['400', 'invalid_webhook_url', 'webhook_url https emas yoki ichki manzilga ishora qiladi.'],
  ['400', 'video_too_long', 'Video ruxsat etilgan davomiylikdan uzun.'],
  ['400', 'source_unavailable / invalid_file', 'Video ochilmadi yoki fayl buzilgan.'],
  ['401', 'unauthorized', 'Kalit yoʻq, notoʻgʻri yoki bekor qilingan.'],
  ['402', 'insufficient_minutes', 'Daqiqa yetarli emas. minutes_short — yetishmayotgan daqiqa.'],
  ['403', 'content_blocked', 'Video kontent siyosatiga mos kelmadi.'],
  ['404', 'not_found', 'Dublaj topilmadi yoki sizniki emas.'],
  ['409', 'not_finished', 'Amal faqat tugagan dublajga qoʻllanadi.'],
  ['413 / 415', 'file_too_large / unsupported_media_type', 'Fayl juda katta yoki formati qoʻllanmaydi (MP4, MOV, MKV, WebM).'],
  ['429', 'rate_limited / daily_limit / too_many_active_jobs', 'Juda koʻp soʻrov. Retry-After sarlavhasiga qarang.'],
  ['503', 'server_busy', 'Navbat toʻla. Retry-After soniyadan keyin qayta urining.'],
]

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-24 pt-12 text-xl font-semibold tracking-[-0.01em] text-ui-ink">{children}</h2>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ui-muted">{children}</p>
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-ui-ground px-1 py-0.5 font-mono text-[13px] text-ui-ink">{children}</code>
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <p className="mt-4 flex flex-wrap items-center gap-2 font-mono text-sm">
      <span className="rounded-md bg-ui-ink px-2 py-0.5 text-xs font-semibold text-ui-surface">{method}</span>
      <span className="text-ui-ink">{path}</span>
    </p>
  )
}

function Params({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ui-rule text-ui-muted">
            <th className="py-2 pr-4 font-medium">Maydon</th>
            <th className="py-2 pr-4 font-medium">Turi</th>
            <th className="py-2 font-medium">Tavsif</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ui-rule">
          {rows.map(([name, type, desc]) => (
            <tr key={name} className="align-top">
              <td className="py-2.5 pr-4 font-mono text-[13px] text-ui-ink">{name}</td>
              <td className="py-2.5 pr-4 text-ui-muted">{type}</td>
              <td className="py-2.5 text-ui-muted">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ApiDocsPage() {
  return (
    <PageShell>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Hujjat boʻlimlari" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1.5 text-sm">
            {TOC.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="text-ui-muted transition hover:text-ui-ink">{label}</a></li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0">
          <p className="text-sm text-ui-muted"><Link href="/developers" className="hover:text-ui-ink">GapirAI API</Link> / Hujjat</p>
          <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.03em] text-ui-ink sm:text-4xl">API v1 hujjati</h1>
          <P>
            Videolarni oʻzbekchaga dublaj va subtitr qilish uchun REST API. Soʻrov va javoblar JSON. Ish fon rejimida bajariladi:
            soʻrov darhol <C>id</C> qaytaradi, natija tayyor boʻlganda webhook keladi yoki holatni soʻrab turasiz.
            Matndan ovoz (TTS), nutqdan matn (STT) va tarjima endpointlari tez orada qoʻshiladi.
          </P>

          <H2 id="kirish">Kirish</H2>
          <P>
            Asosiy manzil: <C>https://api.gapirai.uz/v1</C>. Har soʻrovda API kalitni <C>Authorization</C> sarlavhasida yuboring.
            Kalitni <Link href="/developers#kalitlar" className="text-ui-ink underline underline-offset-4">dasturchilar sahifasida</Link> yarating.
            Kalitni faqat serveringizda saqlang. Brauzer yoki mobil ilova kodiga joylamang.
          </P>
          <CodeBlock code={'Authorization: Bearer <API_KALIT>'} />

          <H2 id="narx">Narx</H2>
          <P>
            Narx saytdagi bilan bir xil: video davomiyligi (daqiqa) hisobingizdagi daqiqalardan yechiladi. Dublaj va subtitr bir xil narxda.
            Daqiqa yetmasa, <C>402 insufficient_minutes</C> qaytadi va pul yechilmaydi. Xato bilan tugagan ish uchun daqiqa qaytariladi.
            Daqiqalarni <Link href="/pricing" className="text-ui-ink underline underline-offset-4">tariflar sahifasida</Link> sotib olasiz.
          </P>

          <H2 id="dublaj-yaratish">Dublaj yaratish</H2>
          <Endpoint method="POST" path="/v1/dubs" />
          <P>YouTube videosini oʻzbekchaga dublaj (<C>mode: "dub"</C>) yoki subtitr (<C>mode: "subtitles"</C>) qiladi.</P>
          <Params rows={[
            ['source_url', 'string, majburiy', 'YouTube havolasi.'],
            ['mode', '"dub" | "subtitles"', 'dub: oʻzbekcha ovozli video, audio va subtitr. subtitles: faqat subtitr. Standart: dub.'],
            ['voice_gender', '"auto" | "male" | "female"', 'Diktor ovozi. auto: gapiruvchiga qarab aniqlanadi.'],
            ['source_language', '"auto" | "uz"', 'uz: video oʻzbekcha (faqat subtitles rejimida, tarjimasiz).'],
            ['webhook_url', 'string, ixtiyoriy', 'Tayyor boʻlganda xabar yuboriladigan https manzil.'],
          ]} />
          <CodeBlock code={CREATE} label="curl" />
          <P>Javob: <C>201</C> va dublaj obyekti (<C>status: "queued"</C>). Agar bu video avval dublaj qilingan boʻlsa, javob darhol <C>completed</C> boʻlishi mumkin.</P>

          <H2 id="fayl-yuklash">Fayldan dublaj</H2>
          <Endpoint method="POST" path="/v1/dubs/upload" />
          <P>
            Video faylni yuboradi. Tana — faylning xom baytlari (multipart emas). <C>Content-Type</C> (video/mp4, video/quicktime,
            video/x-matroska, video/webm) va <C>Content-Length</C> majburiy, <C>X-File-Name</C> ixtiyoriy.
            <C> mode</C>, <C>voice_gender</C>, <C>source_language</C>, <C>webhook_url</C> — query parametrlar.
          </P>
          <CodeBlock code={UPLOAD} label="curl" />

          <H2 id="holat">Holatni olish</H2>
          <Endpoint method="GET" path="/v1/dubs/{id}" />
          <Params rows={[
            ['status', 'string', 'queued — navbatda, processing — ishlanmoqda, completed — tayyor, failed — xato.'],
            ['stage', 'string', 'Batafsil bosqich: pending, downloading, transcribing, translating, synthesizing, merging, completed, failed.'],
            ['progress', 'number', '0–100.'],
            ['outputs', 'object | null', 'Faqat completed holatda. Subtitr rejimida video_url va audio_url boʻlmaydi.'],
            ['error', 'object | null', 'Faqat failed holatda: code va message.'],
          ]} />
          <CodeBlock code={DUB_OBJECT} label="Javob" />
          <P>
            Fayl havolalari maxfiy ID orqali ishlaydi va kalit talab qilmaydi — ularni foydalanuvchilaringizga bersangiz boʻladi
            yoki oʻz serveringizga yuklab oling. Holatni 10–30 soniyada bir marta soʻrash yetarli; webhook ishlatsangiz, umuman shart emas.
          </P>
          <CodeBlock code={POLL_PY} label="Python" />

          <H2 id="royxat">Roʻyxat</H2>
          <Endpoint method="GET" path="/v1/dubs?limit=20&offset=0" />
          <P>API orqali yaratilgan dublajlaringiz, yangisi birinchi. Javob: <C>{'{ "object": "list", "data": [...] }'}</C>.</P>

          <H2 id="webhook">Webhook</H2>
          <P>
            <C>webhook_url</C> berilgan boʻlsa, dublaj tugaganda shu manzilga POST yuboriladi. Hodisalar: <C>dub.completed</C> va <C>dub.failed</C>.
            Serveringiz 10 soniya ichida 2xx bilan javob bersin. Aks holda yana 2 marta urinamiz (30 soniya va 5 daqiqadan keyin).
            Bir hodisa bir necha marta kelishi mumkin — <C>data.id</C> bo&apos;yicha takrorlarni oʻtkazib yuboring.
          </P>
          <CodeBlock code={WEBHOOK_BODY} label="Soʻrov" />
          <P>
            Imzoni tekshiring: <C>GapirAI-Signature</C> sarlavhasida <C>t</C> (Unix vaqt) va <C>v1</C> = HMAC-SHA256(sir, <C>t + &quot;.&quot; + xom_tana</C>).
            Sir — <Link href="/developers#kalitlar" className="text-ui-ink underline underline-offset-4">dasturchilar sahifasidagi</Link> „Webhook siri“ yoki <C>GET /v1/webhook-secret</C>.
            Tanani JSON qilib qayta yigʻmasdan, kelgan baytlarning oʻzi bilan tekshiring.
          </P>
          <CodeBlock code={VERIFY_PY} label="Python" />
          <CodeBlock code={VERIFY_JS} label="Node.js" />
          <Endpoint method="POST" path="/v1/dubs/{id}/webhook/redeliver" />
          <P>Webhook yetib bormagan boʻlsa, qayta yuborishni soʻraydi (faqat tugagan dublaj uchun). Javob: <C>202</C>.</P>

          <H2 id="balans">Balans</H2>
          <Endpoint method="GET" path="/v1/balance" />
          <CodeBlock code={'{\n  "object": "balance",\n  "minutes_available": 342.5,\n  "monthly_remaining": 300.0,\n  "purchased_minutes": 42.5,\n  "unlimited": false\n}'} label="Javob" />

          <H2 id="idempotency">Takroriy soʻrovlar</H2>
          <P>
            Tarmoq uzilib, soʻrovni qayta yuborsangiz, daqiqa ikki marta yechilmasligi uchun <C>Idempotency-Key</C> sarlavhasini qoʻshing
            (1–128 belgi, masalan buyurtma yoki dars ID). Bir xil kalit bilan kelgan takroriy soʻrov yangi ish yaratmaydi — oldingi dublajni <C>200</C> bilan qaytaradi.
          </P>

          <H2 id="xatolar">Xatolar</H2>
          <P>Xato javoblari bir xil koʻrinishda. <C>code</C> — dastur uchun (oʻzgarmaydi), <C>message</C> — odam uchun (oʻzbekcha).</P>
          <CodeBlock code={ERROR} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ui-rule text-ui-muted">
                  <th className="py-2 pr-4 font-medium">HTTP</th>
                  <th className="py-2 pr-4 font-medium">code</th>
                  <th className="py-2 font-medium">Maʼnosi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ui-rule">
                {ERRORS.map(([http, code, desc]) => (
                  <tr key={code} className="align-top">
                    <td className="py-2.5 pr-4 tabular-nums text-ui-ink">{http}</td>
                    <td className="py-2.5 pr-4 font-mono text-[13px] text-ui-ink">{code}</td>
                    <td className="py-2.5 text-ui-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H2 id="limitlar">Limitlar</H2>
          <Params rows={[
            ['POST /v1/dubs', '60 / 10 daqiqa', 'Bitta IP manzildan.'],
            ['POST /v1/dubs/upload', '30 / 10 daqiqa', 'Fayl hajmi 1 GB gacha.'],
            ['GET /v1/dubs/{id}', '600 / daqiqa', ''],
            ['Bir vaqtda ishlanadigan', 'tarifga bogʻliq', 'Oshsa 429 too_many_active_jobs.'],
          ]} />
          <P>
            Koʻproq kerak boʻlsa, <Link href="/developers" className="text-ui-ink underline underline-offset-4">hamkorlik</Link> boʻyicha yozing.
          </P>
        </article>
      </div>
    </PageShell>
  )
}
