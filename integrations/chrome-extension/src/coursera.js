/* GapirAI kengaytmasi -- Coursera dars sahifasidagi qism.
 * Video serverga YUKLANMAYDI: sahifadagi inglizcha subtitr (<track> / video.textTracks)
 * brauzerda o'qilib GapirAI'ga matn sifatida yuboriladi; tayyor o'zbekcha ovoz video bilan
 * sinxron ijro etiladi (asl ovoz pasaytiriladi), o'zbekcha subtitr pleyer ustida chiqadi.
 * YouTube qismi (content.js) bilan bir xil UI va sinxron mantiq. API -- fon skripti orqali. */
(() => {
  const instance = {}
  window.__gapiraiCourseraInstance = instance
  document.querySelectorAll('#gapirai-root').forEach((el) => el.remove())
  const alive = () => window.__gapiraiCourseraInstance === instance && !!(chrome.runtime && chrome.runtime.id)

  const PLATFORM = 'coursera'
  const POLL_MS = 4000
  const DRIFT_S = 0.3
  const STAGES = { pending: 'Navbatda', translating: 'Oʻzbekchaga tarjima qilinmoqda', synthesizing: 'Ovoz yaratilmoqda' }

  const state = {
    pageKey: null, cfg: null, mode: 'idle', dub: null, error: '', balance: null,
    panelOpen: false, dubOn: false, subsOn: true, origVolume: 0.15, voice: 'auto',
    srcCues: [], cues: [], audio: null, savedVolume: null, pollTimer: null, gen: 0, retries: 0, tickCount: 0,
  }

  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || 'Kengaytma javob bermadi.' }))
    } catch (e) {
      resolve({ ok: false, error: 'Kengaytma yangilandi — sahifani yangilang.' })
    }
  })

  // ---------- Coursera ----------

  // /learn/<kurs>/lecture/<id>/<nom> -- dars kaliti nomsiz (nom o'zgarsa ham o'sha dars)
  function currentPageKey() {
    const m = location.pathname.match(/^\/learn\/[^/]+\/lecture\/[^/]+/)
    return m ? m[0] : null
  }

  const video = () => document.querySelector('video.vjs-tech') || document.querySelector('main video') || document.querySelector('video')
  const container = () => { const v = video(); return v ? (v.closest('.video-js') || v.parentElement) : null }
  const lessonTitle = () => (document.title || '').replace(/\s*\|\s*Coursera\s*$/, '').trim().slice(0, 300)

  function parseVtt(text) {
    const toSec = (t) => {
      const p = t.trim().replace(',', '.').split(':').map(Number)
      return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]
    }
    const cues = []
    for (const block of String(text).replace(/\r/g, '').split(/\n\s*\n/)) {
      const lines = block.split('\n')
      const i = lines.findIndex((l) => l.includes('-->'))
      if (i === -1) continue
      const [a, b] = lines[i].split('-->')
      const txt = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (txt) cues.push({ start: toSec(a), end: toSec(b.trim().split(/\s+/)[0]), text: txt })
    }
    return cues
  }

  const isEnglish = (lang, label) => /^en\b|^en-/i.test(lang || '') || /english/i.test(label || '')

  // Avval <track src> (to'liq fayl), bo'lmasa video.textTracks (mode=hidden qilib cue'lar yuklanadi)
  async function readEnglishCues() {
    const v = video()
    if (!v) return []
    const tracks = [...v.querySelectorAll('track')].filter((t) => isEnglish(t.srclang, t.label) && t.src)
    for (const t of tracks) {
      try {
        const r = await fetch(t.src, { credentials: 'include' })
        if (r.ok) {
          const cues = parseVtt(await r.text())
          if (cues.length) return cues
        }
      } catch {}
    }
    const tt = [...v.textTracks].find((t) => (t.kind === 'captions' || t.kind === 'subtitles') && isEnglish(t.language, t.label))
    if (!tt) return []
    if (tt.mode === 'disabled') tt.mode = 'hidden'
    for (let i = 0; i < 25 && !(tt.cues && tt.cues.length); i++) await new Promise((r) => setTimeout(r, 200))
    return [...(tt.cues || [])].map((c) => ({
      start: c.startTime, end: c.endTime,
      text: String(c.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    })).filter((c) => c.text && c.end > c.start)
  }

  // ---------- UI (Shadow DOM) ----------

  const host = document.createElement('div')
  host.id = 'gapirai-root'
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483000;'
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
    .pill { position: absolute; top: 12px; left: 12px; pointer-events: auto; display: flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px; border-radius: 16px; border: 0; cursor: pointer; font-size: 13px; font-weight: 600;
      color: #fff; background: rgba(15,15,15,.72); transition: background .2s; }
    .pill:hover { background: rgba(15,15,15,.9); }
    .pill.on { background: #2f6bff; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa0a6; }
    .dot.ready { background: #3ddc84; } .dot.busy { background: #ffb020; animation: pulse 1s infinite; }
    @keyframes pulse { 50% { opacity: .35; } }
    .panel { position: absolute; top: 52px; left: 12px; width: 300px; max-width: calc(100% - 24px); pointer-events: auto;
      background: rgba(28,28,28,.96); color: #f1f1f1; border-radius: 12px; padding: 14px; font-size: 13px; line-height: 1.45;
      box-shadow: 0 8px 24px rgba(0,0,0,.4); }
    .panel[hidden] { display: none; }
    h3 { margin: 0 0 6px; font-size: 14px; font-weight: 600; }
    p { margin: 0 0 10px; color: #c7c7c7; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 8px 0; }
    .voices { display: flex; gap: 6px; margin: 4px 0 12px; }
    .voices button { flex: 1; height: 30px; border-radius: 8px; border: 1px solid #3f3f3f; background: transparent; color: #f1f1f1; cursor: pointer; font-size: 12px; }
    .voices button.sel { border-color: #f1f1f1; background: #3a3a3a; }
    .btn { width: 100%; height: 36px; border-radius: 18px; border: 0; cursor: pointer; font-size: 13px; font-weight: 600; background: #f1f1f1; color: #0f0f0f; }
    .btn.secondary { background: #3a3a3a; color: #f1f1f1; margin-top: 8px; }
    .bar { height: 4px; border-radius: 2px; background: #3f3f3f; overflow: hidden; margin: 8px 0; }
    .bar > div { height: 100%; background: #2f6bff; transition: width .4s; }
    .err { color: #ff8a80; }
    .muted { color: #9aa0a6; font-size: 12px; }
    input[type=range] { width: 130px; accent-color: #2f6bff; }
    .switch { position: relative; width: 36px; height: 20px; border-radius: 10px; border: 0; cursor: pointer; background: #555; }
    .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
    .switch.on { background: #2f6bff; } .switch.on::after { left: 18px; }
    a { color: #8ab4f8; cursor: pointer; text-decoration: none; font-size: 12px; }
    .subs { position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%); width: max-content; max-width: 86%;
      text-align: center; pointer-events: none; }
    .subs span { display: inline; padding: 2px 8px; line-height: 1.5; color: #fff; background: rgba(8,8,8,.75);
      font-size: var(--subs-size, 20px); box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  `
  root.append(style)

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
      else if (k === 'class') el.className = v
      else if (v === true) el.setAttribute(k, '')
      else if (v !== false && v != null) el.setAttribute(k, v)
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c)
    return el
  }

  const pill = h('button', { class: 'pill', title: 'GapirAI — oʻzbekcha dublaj', onclick: () => { state.panelOpen = !state.panelOpen; render() } })
  const panel = h('div', { class: 'panel', hidden: true })
  const subs = h('div', { class: 'subs' })
  root.append(subs, pill, panel)

  const spanOf = (cues) => (cues.length ? cues[cues.length - 1].end - cues[0].start : 0)

  function minutesOf(seconds) {
    const m = Math.max(0.1, seconds / 60)
    return m < 10 ? (Math.round(m * 10) / 10).toString().replace('.', ',') : String(Math.round(m))
  }

  function render() {
    const m = state.mode
    const dotClass = m === 'ready' ? 'dot ready' : m === 'processing' ? 'dot busy' : 'dot'
    pill.replaceChildren(h('span', { class: dotClass }), state.dubOn ? 'UZ ovoz' : 'UZ')
    pill.classList.toggle('on', state.dubOn)
    panel.hidden = !state.panelOpen
    if (!state.panelOpen) return

    const body = []
    if (m === 'idle') body.push(h('p', {}, 'Tekshirilmoqda…'))
    if (m === 'login') {
      body.push(h('h3', {}, 'GapirAI hisobiga kiring'),
        h('p', {}, 'Dublaj sizning GapirAI hisobingiz orqali qilinadi. Saytga kirganingizdan soʻng shu yerga qayting.'),
        h('button', { class: 'btn', onclick: () => send({ type: 'open', path: '/login' }) }, 'gapirai.uz’ga kirish'),
        h('button', { class: 'btn secondary', onclick: () => refresh() }, 'Kirdim, qayta tekshirish'))
    }
    if (m === 'nocaptions') {
      body.push(h('h3', {}, 'Inglizcha subtitr topilmadi'),
        h('p', {}, 'GapirAI darsni uning inglizcha subtitri orqali ovozlashtiradi. Bu darsda subtitr yoʻq yoki hali yuklanmagan.'),
        h('button', { class: 'btn secondary', onclick: () => refresh() }, 'Qayta tekshirish'))
    }
    if (m === 'none') {
      const dur = spanOf(state.srcCues)
      const cost = dur ? `≈ ${minutesOf(dur)} daqiqa` : ''
      body.push(h('h3', {}, 'Darsni oʻzbekchaga ovozlashtirish'),
        h('p', {}, 'Darsning inglizcha subtitri oʻzbekchaga tarjima qilinib, ovozlashtiriladi. Video hech qayerga yuklanmaydi.'),
        h('div', { class: 'muted' }, 'Ovoz'),
        h('div', { class: 'voices' },
          [['auto', 'Avtomatik'], ['male', 'Erkak'], ['female', 'Ayol']].map(([val, label]) =>
            h('button', { class: state.voice === val ? 'sel' : '', onclick: () => { state.voice = val; render() } }, label))))
      const bal = state.balance != null ? `Hisobingizda: ${Math.floor(state.balance)} daqiqa` : ''
      if (cost || bal) body.push(h('p', { class: 'muted' }, [cost && `Narxi: ${cost}`, bal].filter(Boolean).join(' · ')))
      body.push(h('button', { class: 'btn', onclick: startDub }, cost ? `Ovozlashtirish (${cost})` : 'Ovozlashtirish'))
      if (state.error) body.push(h('p', { class: 'err', style: 'margin:10px 0 0' }, state.error))
      if (state.error && /daqiqa/i.test(state.error)) body.push(h('a', { onclick: () => send({ type: 'open', path: '/pricing' }) }, 'Daqiqa sotib olish →'))
    }
    if (m === 'processing') {
      const d = state.dub || {}
      body.push(h('h3', {}, STAGES[d.status] || 'Tayyorlanmoqda'),
        h('div', { class: 'bar' }, h('div', { style: `width:${Math.max(3, Math.min(100, d.progress || 0))}%` })),
        h('p', { class: 'muted' }, 'Tayyor boʻlgach ovoz avtomatik yoqiladi. Sahifadan chiqib ketsangiz ham ish davom etadi.'))
    }
    if (m === 'ready') {
      const sw = (on, fn) => h('button', { class: on ? 'switch on' : 'switch', role: 'switch', 'aria-checked': String(on), onclick: fn })
      body.push(h('h3', {}, 'Oʻzbekcha ovoz tayyor'),
        h('div', { class: 'row' }, h('span', {}, 'Oʻzbekcha ovoz'), sw(state.dubOn, () => setDub(!state.dubOn))),
        h('div', { class: 'row' }, h('span', {}, 'Subtitr'), sw(state.subsOn, () => { state.subsOn = !state.subsOn; savePrefs(); render() })),
        h('div', { class: 'row' }, h('span', {}, 'Asl ovoz'),
          h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(state.origVolume * 100)),
            oninput: (e) => { state.origVolume = e.target.value / 100; applyVolume() },
            onchange: savePrefs })))
      if (state.error) body.push(h('p', { class: 'err', style: 'margin:10px 0 0' }, state.error))
    }
    if (m === 'error') {
      body.push(h('h3', {}, 'Xatolik'), h('p', { class: 'err' }, state.error),
        h('button', { class: 'btn secondary', onclick: () => refresh() }, 'Qayta urinish'))
    }
    panel.replaceChildren(...body)
  }

  // ---------- Holat ----------

  async function loadPrefs() {
    const p = await chrome.storage.local.get(['origVolume', 'subsOn', 'voice'])
    if (typeof p.origVolume === 'number') state.origVolume = p.origVolume
    if (typeof p.subsOn === 'boolean') state.subsOn = p.subsOn
    if (p.voice) state.voice = p.voice
  }

  function savePrefs() {
    chrome.storage.local.set({ origVolume: state.origVolume, subsOn: state.subsOn, voice: state.voice })
  }

  function stopPolling() {
    clearTimeout(state.pollTimer)
    state.pollTimer = null
  }

  function teardown() {
    stopPolling()
    setDub(false, true)
    if (state.audio) { state.audio.removeAttribute('src'); state.audio.load(); state.audio = null }
    state.cues = []
    state.srcCues = []
    state.dub = null
    state.error = ''
    subs.replaceChildren()
  }

  async function refresh() {
    const gen = ++state.gen
    teardown()
    state.mode = 'idle'
    state.pageKey = currentPageKey()
    render()
    if (!state.pageKey) return
    const cfg = await send({ type: 'config' })
    if (gen !== state.gen) return
    state.cfg = cfg.data || null
    if (!cfg.ok || !cfg.data.loggedIn) { state.mode = 'login'; return render() }
    const r = await send({ type: 'api', path: `/api/caption-dubs/by-page?platform=${PLATFORM}&page_key=${encodeURIComponent(state.pageKey)}` })
    if (gen !== state.gen) return
    if (!r.ok) {
      state.mode = r.login ? 'login' : 'error'
      state.error = r.error
      return render()
    }
    if (r.data.dub && r.data.dub.status !== 'failed') return onDub(r.data.dub, gen, false)
    const cues = await readEnglishCues()
    if (gen !== state.gen) return
    state.srcCues = cues
    state.mode = cues.length ? 'none' : 'nocaptions'
    if (r.data.dub && r.data.dub.status === 'failed') state.error = r.data.dub.error_message || ''
    render()
    if (cues.length) loadBalance(gen)
  }

  function onDub(dub, gen, autoplay) {
    if (gen !== state.gen) return
    state.dub = dub
    if (dub.status === 'completed') {
      state.mode = 'ready'
      state.cues = dub.cues_uz || []
      prepareMedia(dub)
      if (autoplay) setDub(true)
    } else if (dub.status === 'failed') {
      state.mode = 'none'
      state.error = dub.error_message || 'Dublaj amalga oshmadi. Qayta urinib koʻring.'
    } else {
      state.mode = 'processing'
      stopPolling()
      state.pollTimer = setTimeout(() => poll(dub.id, gen), POLL_MS)
    }
    render()
  }

  async function poll(id, gen) {
    const r = await send({ type: 'api', path: `/api/caption-dubs/${id}` })
    if (gen !== state.gen) return
    if (!r.ok) {
      if (r.login) { state.mode = 'login'; return render() }
      state.pollTimer = setTimeout(() => poll(id, gen), POLL_MS * 2)
      return
    }
    onDub(r.data, gen, true)
  }

  async function loadBalance(gen) {
    const r = await send({ type: 'api', path: '/api/plans' })
    if (gen !== state.gen || !r.ok) return
    const total = r.data?.current?.minutes?.total_available
    if (typeof total === 'number') { state.balance = total; render() }
  }

  async function startDub() {
    const gen = state.gen
    state.error = ''
    savePrefs()
    if (!state.srcCues.length) state.srcCues = await readEnglishCues()
    if (gen !== state.gen) return
    if (!state.srcCues.length) { state.mode = 'nocaptions'; return render() }
    state.mode = 'processing'
    state.dub = { status: 'pending', progress: 0 }
    render()
    const r = await send({ type: 'api', method: 'POST', path: '/api/caption-dubs', body: {
      platform: PLATFORM, page_key: state.pageKey, page_url: location.href.split('?')[0],
      title: lessonTitle(), voice_gender: state.voice, cues: state.srcCues,
    } })
    if (gen !== state.gen) return
    if (!r.ok) {
      state.mode = r.login ? 'login' : 'none'
      state.error = r.error
      return render()
    }
    onDub(r.data, gen, true)
  }

  // ---------- Ijro ----------

  function prepareMedia(dub) {
    if (state.audio) return
    state.audio = new Audio(`${state.cfg.api}${dub.audio_url}`)
    state.audio.preload = 'auto'
    state.audio.addEventListener('error', () => {
      if (!state.audio) return
      state.error = 'Audioni yuklab boʻlmadi.'
      setDub(false)
      render()
    })
  }

  function applyVolume() {
    const v = video()
    if (!v || !state.dubOn) return
    if (Math.abs(v.volume - state.origVolume) > 0.01) v.volume = state.origVolume
  }

  function setDub(on, silent) {
    const v = video()
    if (on && !state.audio) return
    if (on && !state.dubOn && v) state.savedVolume = v.volume
    if (!on && state.dubOn && v && state.savedVolume != null) v.volume = state.savedVolume
    state.dubOn = on
    if (!on && state.audio) state.audio.pause()
    if (on) tick()
    if (!silent) render()
  }

  function tick() {
    if (!alive()) return shutdown()
    const v = video()
    const a = state.audio
    if (v && state.subsOn && state.cues.length && state.mode === 'ready') {
      const t = v.currentTime
      const cue = state.cues.find((c) => t >= c.start && t < c.end)
      const text = cue ? cue.text : ''
      if (subs.dataset.text !== text) {
        subs.dataset.text = text
        subs.replaceChildren(...(text ? [h('span', {}, text)] : []))
      }
      const ch = container()?.clientHeight || 360
      subs.style.setProperty('--subs-size', `${Math.round(Math.max(14, Math.min(34, ch / 22)))}px`)
    } else if (subs.dataset.text) {
      subs.dataset.text = ''
      subs.replaceChildren()
    }

    const c = container()
    if (c && !c.contains(host)) c.append(host)

    if (!state.dubOn || !v || !a) return
    if (v.paused || v.seeking || v.readyState < 3 || (a.duration && v.currentTime >= a.duration)) {
      if (!a.paused) a.pause()
      return
    }
    applyVolume()
    if (a.playbackRate !== v.playbackRate) a.playbackRate = v.playbackRate
    if (Math.abs(a.currentTime - v.currentTime) > DRIFT_S) a.currentTime = v.currentTime
    if (a.paused) {
      a.play().catch(() => {
        state.error = 'Brauzer ovozni bloklab qoʻydi — videoni bir marta bosing.'
        render()
      })
    }
  }

  // ---------- Hayot sikli ----------

  function attach() {
    if (!alive()) return shutdown()
    const c = container()
    const key = currentPageKey()
    if (c && !c.contains(host)) {
      if (getComputedStyle(c).position === 'static') c.style.position = 'relative'
      c.append(host)
    }
    host.style.display = key && c ? '' : 'none'
    // Coursera SPA: dars almashganda qayta tekshiramiz; video/subtitr keyinroq yuklansa --
    // "subtitr yo'q" holatida har 5 soniyada (ko'pi bilan 6 marta) qayta urinamiz
    if (key !== state.pageKey) {
      state.retries = 0
      return refresh()
    }
    if (key && c && state.mode === 'nocaptions' && (state.retries || 0) < 6 && ++state.tickCount % 5 === 0) {
      state.retries = (state.retries || 0) + 1
      refresh()
    }
  }

  const MEDIA_EVENTS = ['play', 'pause', 'seeked', 'ratechange']
  const onMediaEvent = (e) => { if (e.target === video()) tick() }
  const onStorage = (ch) => { if (ch.server) refresh() }
  const timers = [setInterval(attach, 1000), setInterval(tick, 200)]

  let stopped = false
  function shutdown() {
    if (stopped) return
    stopped = true
    timers.forEach(clearInterval)
    for (const ev of MEDIA_EVENTS) document.removeEventListener(ev, onMediaEvent, true)
    try { chrome.storage.onChanged.removeListener(onStorage) } catch {}
    teardown()
    host.remove()
  }

  for (const ev of MEDIA_EVENTS) document.addEventListener(ev, onMediaEvent, true)
  chrome.storage.onChanged.addListener(onStorage)

  loadPrefs().then(attach)
})()
