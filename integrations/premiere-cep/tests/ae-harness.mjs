// After Effects rejimini sinash: jsdom paneli + host.jsx (vm) AE soxta modeli + soxta API.
// JSDOM_PATH=<jsdom> node integrations/premiere-cep/tests/ae-harness.mjs integrations/premiere-cep <dubbed.wav> <dub|subtitle|stretch|nolayer>
// (After Effects o'rnatilmagan mashinada AE rejimini boshidan oxirigacha sinash; jsdom: npm i jsdom)
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm'; import http from 'node:http'; import os from 'node:os'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { JSDOM } = require(process.env.JSDOM_PATH || 'jsdom')
const [dir, wavPath, scenario = 'dub'] = process.argv.slice(2)
const WAV = fs.readFileSync(wavPath)
const SRT = '1\n00:00:00,000 --> 00:00:04,000\nSalom va xush kelibsiz!\n\n2\n00:00:04,000 --> 00:00:08,640\nAvval suvni\nqaynatib oling.\n\n3\n00:00:08,640 --> 00:00:14,000\nIssiq suvni quying.\n'
const fail = []
const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? '  (' + x + ')' : ''}`); if (!c) fail.push(n) }

// ---- soxta API
let polls = 0, upload = null
const api = http.createServer((q, r) => {
  const u = q.url.split('?')[0]
  const send = (code, body, type = 'application/json') => { r.writeHead(code, { 'Content-Type': type }); r.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)) }
  if (u === '/auth/me') return send(200, { email: 'ae@gapirai.uz' })
  if (u === '/api/jobs/upload') { let n = 0; q.on('data', (c) => n += c.length); q.on('end', () => { upload = { url: q.url, n, ct: q.headers['content-type'] }; send(201, { job_id: 'ae-job-1', status: 'pending' }) }); return }
  if (u === '/api/jobs/ae-job-1') { polls++; return send(200, { job_id: 'ae-job-1', status: polls < 2 ? 'translating' : 'completed', progress: polls < 2 ? 50 : 100 }) }
  if (u === '/api/jobs/ae-job-1/subtitles.srt') return send(200, SRT, 'application/x-subrip')
  if (u === '/api/outputs/ae-job-1/audio') return send(200, WAV, 'audio/wav')
  send(404, { detail: 'yoq' })
})
await new Promise((ok) => api.listen(0, '127.0.0.1', ok))
const base = `http://127.0.0.1:${api.address().port}`

// ---- After Effects soxta modeli
class CompItem {} class FootageItem {} class FolderItem {}
const log = []
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gapirai-ae-'))
const video = path.join(tmp, 'Choy tayyorlash.mp4'); fs.writeFileSync(video, Buffer.alloc(200000, 1))
const footage = Object.assign(new FootageItem(), { name: 'Choy tayyorlash.mp4', file: { fsName: video } })
const items = []
const mkLayer = (props) => {
  const l = { _in: 0, _out: 0, ...props }
  Object.defineProperty(l, 'inPoint', { get: () => l._in, set: (v) => { if (v >= l._out) throw new Error('inPoint >= outPoint'); l._in = v } })
  Object.defineProperty(l, 'outPoint', { get: () => l._out, set: (v) => { if (v <= l._in) throw new Error('outPoint <= inPoint'); l._out = v } })
  return l
}
const comp = Object.assign(new CompItem(), { id: 42, name: 'Asosiy komp', width: 1920, height: 1080, duration: 60, layers: null, selectedLayers: [] })
const created = []
comp.layers = {
  add(item) { const l = mkLayer({ kind: 'av', source: item, startTime: 0, name: item.name, _in: 0, _out: 30 }); created.push(l); log.push(['layers.add', item.name]); return l },
  addText(text) {
    const doc = { text }
    const props = { 'Source Text': { value: doc, setValue(v) { this.value = v } }, Position: { value: null, setValue(v) { this.value = v } } }
    const l = mkLayer({ kind: 'text', text, _in: 0, _out: comp.duration, property: (n) => props[n], props })
    created.push(l); return l
  },
}
if (scenario !== 'nolayer') {
  const stretch = scenario === 'stretch' ? 200 : 100
  comp.selectedLayers = [mkLayer({ name: 'Video', source: footage, startTime: 5, stretch, _in: 8, _out: 16 })]
}
const project = {
  activeItem: comp, file: { fsName: path.join(tmp, 'Loyiha.aep') },
  get numItems() { return items.length }, item: (i) => items[i - 1], itemByID: (id) => (id === 42 ? comp : null),
  items: { addFolder(name) { const f = Object.assign(new FolderItem(), { name }); items.push(f); log.push(['addFolder', name]); return f } },
  importFile(io) { const it = Object.assign(new FootageItem(), { name: path.basename(io.file.path), file: { fsName: io.file.path }, parentFolder: null }); items.push(it); log.push(['importFile', path.basename(io.file.path)]); return it },
}
items.push(comp)
const ctx = vm.createContext({
  BridgeTalk: { appName: 'aftereffects' }, CompItem, FootageItem, FolderItem,
  File: function (p) { this.path = p }, ImportOptions: function (f) { this.file = f },
  ParagraphJustification: { CENTER_JUSTIFY: 7413 },
  app: { project, beginUndoGroup: (n) => log.push(['beginUndo', n]), endUndoGroup: () => log.push(['endUndo']) },
})
vm.runInContext(fs.readFileSync(path.join(dir, 'jsx/host.jsx'), 'utf8'), ctx)
const cep = {
  getHostEnvironment: () => JSON.stringify({ appName: 'AEFT', appVersion: '24.0' }),
  evalScript(script, cb) { let out; try { out = String(vm.runInContext(script, ctx)) } catch (e) { log.push(['jsx-throw', String(e)]); out = 'EvalScript error.' } setTimeout(() => cb(out), 5) },
}

// ---- panel
let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace(/<link rel="stylesheet"[^>]*>/, '')
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, s) => {
  let code = fs.readFileSync(path.join(dir, s), 'utf8')
  if (s === 'js/main.js') code = code.replace("'https://api.gapirai.uz'", JSON.stringify(base)).replace('POLL_MS = 5000', 'POLL_MS = 300')
  return '<script>' + code.replace(/<\/script>/g, '<\\/script>') + '</script>'
})
const dom = new JSDOM(html, { url: 'http://panel.local/', runScripts: 'dangerously', beforeParse(w) { w.require = require; w.__adobe_cep__ = cep } })
const w = dom.window, $ = (id) => w.document.getElementById(id)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
check('AE: tugma matni', /Kompozitsiyada tanlangan qatlam/.test($('pick').textContent), $('pick').textContent)
$('api-key').value = 'k'; $('save-key').click()
for (let i = 0; i < 30 && !/Ulangan/.test($('auth-status').textContent); i++) await sleep(100)
$('pick').click(); await sleep(300)
const err = $('error').hidden ? '' : $('error').textContent
if (scenario === 'nolayer') {
  check('qatlam tanlanmagan -> tushunarli xato', /qatlamini tanlang/.test(err), err)
} else if (scenario === 'stretch') {
  check('tezligi o\'zgargan qatlam -> ogohlantirish', /tezligi oʻzgartirilgan/.test(err), err)
  check('manba oralig\'i stretch bilan (1.5–5.5 s)', /0:04 \(manbada 0:02–0:06\)/.test($('clip-dur').textContent), $('clip-dur').textContent)
} else {
  check('qatlam olindi: 8 s, manbada 3–11 s', /0:08 \(manbada 0:03–0:11\)/.test($('clip-dur').textContent), $('clip-dur').textContent)
  if (scenario === 'subtitle') { const r = w.document.querySelector('input[value="subtitle"]'); r.checked = true; r.dispatchEvent(new w.Event('change')) }
  $('start').click()
  for (let i = 0; i < 100 && !($('stage').textContent === 'Tayyor' && !$('pick').disabled) && $('error').hidden; i++) await sleep(150)
  check('oqim tugadi', $('stage').textContent === 'Tayyor', $('stage').textContent + ' | ' + $('detail').textContent + ' | ' + ($('error').hidden ? '' : $('error').textContent))
  check('upload: butun fayl, mp4', upload && upload.n === 200000 && upload.ct === 'video/mp4', JSON.stringify(upload))
  const audio = created.filter((l) => l.kind === 'av')
  const texts = created.filter((l) => l.kind === 'text')
  if (scenario === 'dub') {
    check('audio qatlam qatlam boshida (8 s)', audio.length === 1 && audio[0].startTime === 8 && /ovoz/.test(audio[0].name), JSON.stringify(audio.map((a) => [a.startTime, a.name])))
    const cut = fs.readdirSync(path.dirname(project.file.fsName) + '/GapirAI').find((f) => f.endsWith('.uz.wav') && !f.includes('full'))
    const cutBuf = fs.readFileSync(path.join(path.dirname(project.file.fsName), 'GapirAI', cut))
    const br = WAV.readUInt32LE(28), da = WAV.indexOf('data') + 8
    check('kesilgan WAV = manbaning 3–11 s qismi', cutBuf.subarray(44).equals(WAV.subarray(da + 3 * br, da + 11 * br)))
  } else {
    check('faqat subtitr: audio qatlam yo\'q', audio.length === 0)
  }
  // kuelar: manbada [3,11] -> kompozitsiyada [8,16]
  const spans = texts.map((t) => [+t._in.toFixed(2), +t._out.toFixed(2)])
  check('3 ta matn qatlami, vaqtlari kompozitsiyada', JSON.stringify(spans) === JSON.stringify([[8, 9], [9, 13.64], [13.64, 16]]), JSON.stringify(spans))
  const second = texts[1]
  const doc = second && second.props['Source Text'].value
  check('ko\'p qatorli matn \\r bilan, oq/qora chiziqli, markazda', doc && doc.text === 'Avval suvni\rqaynatib oling.' && doc.fillColor.join() === '1,1,1' && doc.applyStroke && doc.justification === 7413, JSON.stringify(doc))
  const pos = second && second.props.Position.value
  check('pozitsiya pastda, 2 qator uchun yuqoriroq', pos && pos[0] === 960 && pos[1] < 1080 * 0.9 && pos[1] > 1080 * 0.75, JSON.stringify(pos))
  check('nomlar "UZ n: ..."', texts.every((t, i) => t.name.startsWith(`UZ ${i + 1}: `)), texts.map((t) => t.name).join(' | '))
  check('bitta Undo guruhi', log.filter((l) => l[0] === 'beginUndo').length === 1 && log.filter((l) => l[0] === 'endUndo').length === 1)
  check('import GapirAI papkasiga', items.filter((i) => i instanceof FootageItem && i.name.endsWith('.wav')).every((i) => i.parentFolder && i.parentFolder.name === 'GapirAI'))
  check('jsx xatosiz', !log.some((l) => l[0] === 'jsx-throw'), JSON.stringify(log.filter((l) => l[0] === 'jsx-throw')))
}
console.log(fail.length ? `${fail.length} FAIL` : 'ALL PASS')
api.close(); fs.rmSync(tmp, { recursive: true, force: true })
process.exit(fail.length ? 1 : 0)
