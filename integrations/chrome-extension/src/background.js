/* GapirAI kengaytmasi -- fon skripti (MV3 service worker).
 * Kontent skript YouTube sahifasida ishlaydi va CORS'ga duch keladi, shuning
 * uchun barcha API so'rovlari shu yerdan (host_permissions bilan) yuboriladi.
 * Kirish: foydalanuvchi gapirai.uz'ga kirgan bo'lsa, saytning `auth_token`
 * cookie'si olinadi -- alohida login yoki kalit kerak emas. */

const SERVERS = {
  prod: { site: 'https://gapirai.uz', api: 'https://api.gapirai.uz' },
  local: { site: 'http://localhost:3000', api: 'http://localhost:8000' },
}

async function server() {
  const { server: name } = await chrome.storage.local.get('server')
  return SERVERS[name] || SERVERS.prod
}

async function token(site) {
  const c = await chrome.cookies.get({ url: site, name: 'auth_token' })
  return c && c.value ? decodeURIComponent(c.value) : null
}

function errorText(status, body) {
  const d = body && body.detail
  if (typeof d === 'string') return d
  if (d && (d.message || d.detail)) return d.message || d.detail
  if (status === 401) return 'Sessiya tugagan. gapirai.uz saytiga qayta kiring.'
  if (status === 429) return 'Juda koʻp soʻrov. Birozdan soʻng qayta urinib koʻring.'
  return `Server xatosi (${status}).`
}

async function api({ method = 'GET', path, body }) {
  const s = await server()
  const t = await token(s.site)
  if (!t) return { ok: false, status: 401, login: true, error: 'gapirai.uz saytiga kiring.' }
  let res
  try {
    res = await fetch(s.api + path, {
      method,
      headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    return { ok: false, status: 0, error: 'GapirAI serveriga ulanib boʻlmadi. Internetni tekshiring.' }
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) return { ok: false, status: res.status, login: res.status === 401, error: errorText(res.status, data) }
  return { ok: true, status: res.status, data }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = async () => {
    const s = await server()
    switch (msg.type) {
      case 'config':
        return { ok: true, data: { ...s, loggedIn: !!(await token(s.site)) } }
      case 'api':
        return api(msg)
      case 'text': {
        // Subtitr (VTT) -- auth talab qilmaydi, lekin CORS uchun fon orqali
        try {
          const r = await fetch(s.api + msg.path)
          return r.ok ? { ok: true, data: await r.text() } : { ok: false, status: r.status, error: `Subtitr topilmadi (${r.status}).` }
        } catch {
          return { ok: false, status: 0, error: 'Subtitrni yuklab boʻlmadi.' }
        }
      }
      case 'open':
        await chrome.tabs.create({ url: s.site + (msg.path || '/') })
        return { ok: true }
      default:
        return { ok: false, error: 'Nomaʼlum soʻrov.' }
    }
  }
  run().then(reply)
  return true // javob asinxron
})
