// Plaginning Premiere'siz tekshiriladigan qismlari:  node --test integrations/premiere-cep/tests/panel.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
globalThis.window = { require }
for (const f of ['js/srt.js', 'js/wav.js', 'js/api.js']) eval(fs.readFileSync(path.join(dir, f), 'utf8'))
const { GapirSrt, GapirWav, GapirApi } = window

function wav(seconds, rate = 8000, channels = 1, streamed = false) {
  const data = Buffer.alloc(seconds * rate * channels * 2)
  for (let i = 0; i < data.length / 2; i++) data.writeInt16LE(i % 32000, i * 2)
  const h = Buffer.alloc(44)
  h.write('RIFF', 0); h.writeUInt32LE(streamed ? 0xffffffff : 36 + data.length, 4); h.write('WAVE', 8)
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(channels, 22)
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * channels * 2, 28); h.writeUInt16LE(channels * 2, 32); h.writeUInt16LE(16, 34)
  h.write('data', 36); h.writeUInt32LE(streamed ? 0xffffffff : data.length, 40)
  return Buffer.concat([h, data])
}

test('SRT klipning [in, out] qismiga kesiladi va timeline vaqtiga suriladi', () => {
  const src = '1\n00:00:00,000 --> 00:00:04,000\nBir\n\n2\n00:00:04,000 --> 00:00:08,640\nIkki\nqator\n\n3\n00:00:14,000 --> 00:00:16,480\nUch\n'
  assert.equal(GapirSrt.shiftSrt(src, 20, 3, 12.5),
    '1\n00:00:20,000 --> 00:00:21,000\nBir\n\n2\n00:00:21,000 --> 00:00:25,640\nIkki\nqator\n')
})

test('WAV kesimi aynan [from, to) namunalari, oqimli (0xFFFFFFFF) sarlavha ham', () => {
  for (const streamed of [false, true]) {
    const src = wav(10, 8000, 2, streamed)
    const cut = GapirWav.sliceWav(src, 3, 7.5)
    assert.equal(cut.duration, 10)
    assert.equal(cut.seconds, 4.5)
    assert.deepEqual(cut.buffer.subarray(44), src.subarray(44 + 3 * 8000 * 4, 44 + 7.5 * 8000 * 4))
    assert.equal(cut.buffer.readUInt32LE(40), 4.5 * 8000 * 4)
  }
  assert.equal(GapirWav.sliceWav(wav(2), 5, 9).seconds, 0)   // klip audiodan keyin
})

test('API mijozi: kichik harfli holat, 401/402 xabarlari, redirect\'da kalit yuborilmaydi', async (t) => {
  const seen = []
  const s3 = http.createServer((q, r) => { seen.push(['s3', q.headers.authorization || null]); r.end('RIFF') })
  const api = http.createServer((q, r) => {
    seen.push([q.url, q.headers.authorization])
    if (q.url === '/api/jobs/j1') return r.end(JSON.stringify({ status: 'completed', progress: 100 }))
    if (q.url === '/api/outputs/j1/audio') { r.writeHead(307, { Location: `http://127.0.0.1:${s3.address().port}/a.wav` }); return r.end() }
    if (q.url.startsWith('/api/jobs/upload')) { r.statusCode = 402; return r.end(JSON.stringify({ detail: { message: 'Daqiqangiz qolmagan.' } })) }
    r.statusCode = 401; r.end('{}')
  })
  await new Promise((ok) => s3.listen(0, '127.0.0.1', ok))
  await new Promise((ok) => api.listen(0, '127.0.0.1', ok))
  t.after(() => { api.close(); s3.close() })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gapirai-'))
  const c = new GapirApi.Client(`http://127.0.0.1:${api.address().port}`, 'KEY')

  assert.equal((await c.job('j1')).status, 'completed')
  const out = await c.download('/api/outputs/j1/audio', path.join(tmp, 'a.wav'))
  assert.equal(fs.readFileSync(out, 'utf8'), 'RIFF')
  assert.deepEqual(seen.find((s) => s[0] === 's3'), ['s3', null])
  await assert.rejects(c.me(), (e) => e.status === 401 && /yaroqsiz/.test(e.message))

  const video = path.join(tmp, 'v.mp4')
  fs.writeFileSync(video, Buffer.alloc(1024))
  await assert.rejects(c.upload(video, { subtitle_only: 'false' }), (e) => e.status === 402 && e.message === 'Daqiqangiz qolmagan.')
  assert.throws(() => c.checkFile(path.join(tmp, 'v.avi')), /format/)
})

test('Server oʻchiq boʻlsa tushunarli xabar', async () => {
  const c = new GapirApi.Client('http://127.0.0.1:9', 'KEY')
  await assert.rejects(c.me(), /serveriga ulanib/)
})
