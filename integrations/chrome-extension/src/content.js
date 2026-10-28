/* GapirAI kengaytmasi -- YouTube sahifasidagi qism.
 * Pleyerga "UZ" tugmasi va panel qo'shadi; tayyor dublajni video bilan
 * sinxron ijro etadi (YouTube ovozi pasaytiriladi), o'zbekcha subtitrni
 * pleyer ustida ko'rsatadi. Barcha API so'rovlari fon skripti orqali. */
(() => {
  // Kengaytma o'rnatilganda/yangilanganda fon skripti ochiq YouTube tablariga shu
  // skriptni qayta joylaydi. Tabdagi eski nusxa "yetim" bo'lib qoladi (chrome.runtime
  // uziladi) -- u o'zini to'xtatadi, yangisi uning tugmasini olib tashlaydi.
  const instance = {}
  window.__gapiraiInstance = instance
  document.querySelectorAll('#gapirai-root').forEach((el) => el.remove())
  const alive = () => window.__gapiraiInstance === instance && !!(chrome.runtime && chrome.runtime.id)

  const POLL_MS = 4000
  const DRIFT_S = 0.3
  const STAGES = {
    pending: 'Navbatda', downloading: 'Video yuklanmoqda', transcribing: 'Nutq matnga oʻgirilmoqda',
    translating: 'Oʻzbekchaga tarjima qilinmoqda', synthesizing: 'Ovoz yaratilmoqda',
    syncing: 'Ovoz vaqtga moslanmoqda', merging: 'Yakunlanmoqda',
  }

  const state = {
    videoId: null, cfg: null, mode: 'idle', job: null, error: '', balance: null,
    panelOpen: false, dubOn: false, subsOn: true, origVolume: 0.15, voice: 'auto',
    cues: [], audio: null, savedVolume: null, pollTimer: null, gen: 0,
  }

  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => resolve(r || { ok: false, error: chrome.runtime.lastError?.message || 'Kengaytma javob bermadi.' }))
    } catch (e) {
      resolve({ ok: false, error: 'Kengaytma yangilandi — sahifani yangilang.' })
    }
  })

  // ---------- YouTube ----------

  const player = () => document.getElementById('movie_player')
  const video = () => player()?.querySelector('video.html5-main-video') || player()?.querySelector('video')
  const adShowing = () => !!player()?.classList.contains('ad-showing')

  function currentVideoId() {
    if (location.pathname !== '/watch') return null
    const id = new URLSearchParams(location.search).get('v')
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  }

  // ---------- UI (Shadow DOM -- YouTube CSS'i ta'sir qilmaydi) ----------

  const host = document.createElement('div')
  host.id = 'gapirai-root'
  host.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:61;'
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "YouTube Sans", Roboto, Arial, sans-serif; }
    .pill { position: absolute; top: 12px; left: 12px; pointer-events: auto; display: flex; align-items: center; gap: 6px;
      height: 32px; padding: 0 12px; border-radius: 16px; border: 0; cursor: pointer; font-size: 13px; font-weight: 600;
      color: #fff; background: rgba(15,15,15,.72); transition: opacity .2s, background .2s; }
    .pill:hover { background: rgba(15,15,15,.9); }
    .pill.on { background: #2f6bff; }
    .pill.hidden { opacity: 0; }
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
    .btn:disabled { opacity: .5; cursor: default; }
    .bar { height: 4px; border-radius: 2px; background: #3f3f3f; overflow: hidden; margin: 8px 0; }
    .bar > div { height: 100%; background: #2f6bff; transition: width .4s; }
    .err { color: #ff8a80; }
    .muted { color: #9aa0a6; font-size: 12px; }
    input[type=range] { width: 130px; accent-color: #2f6bff; }
    input[type=checkbox] { accent-color: #2f6bff; width: 16px; height: 16px; }
    .switch { position: relative; width: 36px; height: 20px; border-radius: 10px; border: 0; cursor: pointer; background: #555; }
    .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
    .switch.on { background: #2f6bff; } .switch.on::after { left: 18px; }
    a { color: #8ab4f8; cursor: pointer; text-decoration: none; font-size: 12px; }
    .subs { position: absolute; left: 50%; bottom: 72px; transform: translateX(-50%); width: max-content; max-width: 86%;
      text-align: center; pointer-events: none; }
    .subs span { display: inline; padding: 2px 8px; line-height: 1.5; color: #fff; background: rgba(8,8,8,.75);
      font-size: var(--subs-size, 20px); box-decoration-break: clone; -webkit-box-decoration-break: clone; white-space: pre-line; }
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

  function minutesOf(seconds) {
    return Math.max(1, Math.ceil(seconds / 60))
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
    if (m === 'none') {
      const v = video()
      const dur = v && !adShowing() && isFinite(v.duration) ? v.duration : null
      body.push(h('h3', {}, 'Oʻzbekcha dublaj'),
        h('p', {}, 'Videoni oʻzbek tiliga ovozlashtiramiz. Odatda bir necha daqiqa davom etadi.'),
        h('div', { class: 'muted' }, 'Ovoz'),
        h('div', { class: 'voices' },
          [['auto', 'Avtomatik'], ['male', 'Erkak'], ['female', 'Ayol']].map(([val, label]) =>
            h('button', { class: state.voice === val ? 'sel' : '', onclick: () => { state.voice = val; render() } }, label))))
      const cost = dur ? `≈ ${minutesOf(dur)} daqiqa` : ''
      const bal = state.balance != null ? `Hisobingizda: ${Math.floor(state.balance)} daqiqa` : ''
      if (cost || bal) body.push(h('p', { class: 'muted' }, [cost && `Narxi: ${cost}`, bal].filter(Boolean).join(' · ')))
      body.push(h('button', { class: 'btn', onclick: startDub }, cost ? `Dublaj qilish (${cost})` : 'Dublaj qilish'))
      if (state.error) body.push(h('p', { class: 'err', style: 'margin:10px 0 0' }, state.error))
      if (state.error && /daqiqa/i.test(state.error)) body.push(h('a', { onclick: () => send({ type: 'open', path: '/pricing' }) }, 'Daqiqa sotib olish →'))
    }
    if (m === 'processing') {
      const j = state.job || {}
      body.push(h('h3', {}, STAGES[j.status] || 'Tayyorlanmoqda'),
        h('div', { class: 'bar' }, h('div', { style: `width:${Math.max(3, Math.min(100, j.progress || 0))}%` })),
        h('p', { class: 'muted' }, j.status_message || 'Tayyor boʻlgach ovoz avtomatik yoqiladi. Sahifadan chiqib ketsangiz ham ish davom etadi.'))
    }
    if (m === 'ready') {
      const sw = (on, fn) => h('button', { class: on ? 'switch on' : 'switch', role: 'switch', 'aria-checked': String(on), onclick: fn })
      body.push(h('h3', {}, 'Oʻzbekcha dublaj tayyor'),
        h('div', { class: 'row' }, h('span', {}, 'Oʻzbekcha ovoz'), sw(state.dubOn, () => setDub(!state.dubOn))),
        h('div', { class: 'row' }, h('span', {}, 'Subtitr'), sw(state.subsOn, () => { state.subsOn = !state.subsOn; savePrefs(); render() })),
        h('div', { class: 'row' }, h('span', {}, 'Asl ovoz'),
          h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(state.origVolume * 100)),
            oninput: (e) => { state.origVolume = e.target.value / 100; applyVolume() },
            onchange: savePrefs })),
        h('a', { onclick: () => send({ type: 'open', path: `/video/${state.job.job_id}` }) }, 'Saytda ochish →'))
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
    state.job = null
    state.error = ''
    subs.replaceChildren()
  }

  async function refresh() {
    const gen = ++state.gen
    teardown()
    state.mode = 'idle'
    state.videoId = currentVideoId()
    render()
    if (!state.videoId) return
    const cfg = await send({ type: 'config' })
    if (gen !== state.gen) return
    state.cfg = cfg.data || null
    if (!cfg.ok || !cfg.data.loggedIn) { state.mode = 'login'; return render() }
    const r = await send({ type: 'api', path: `/api/jobs/by-video/${state.videoId}` })
    if (gen !== state.gen) return
    if (!r.ok) {
      state.mode = r.login ? 'login' : 'error'
      state.error = r.error
      return render()
    }
    onJob(r.data.job, gen, false)
  }

  function onJob(job, gen, autoplay) {
    if (gen !== state.gen) return
    state.job = job
    if (!job) {
      state.mode = 'none'
      loadBalance(gen)
    } else if (job.status === 'completed') {
      state.mode = 'ready'
      prepareMedia(job.job_id)
      if (autoplay) setDub(true)
    } else if (job.status === 'failed') {
      state.mode = 'none'
      state.error = job.error_message || 'Dublaj amalga oshmadi. Qayta urinib koʻring.'
    } else {
      state.mode = 'processing'
      stopPolling()
      state.pollTimer = setTimeout(() => poll(job.job_id, gen), POLL_MS)
    }
    render()
  }

  async function poll(jobId, gen) {
    const r = await send({ type: 'api', path: `/api/jobs/${jobId}` })
    if (gen !== state.gen) return
    if (!r.ok) {
      if (r.login) { state.mode = 'login'; return render() }
      state.pollTimer = setTimeout(() => poll(jobId, gen), POLL_MS * 2)   // tarmoq uzilishi -- kutamiz
      return
    }
    onJob(r.data, gen, true)
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
    state.mode = 'processing'
    state.job = { status: 'pending', progress: 0, status_message: 'Yuborilmoqda…' }
    render()
    const r = await send({ type: 'api', method: 'POST', path: '/api/jobs', body: {
      youtube_url: `https://www.youtube.com/watch?v=${state.videoId}`, voice_gender: state.voice,
    } })
    if (gen !== state.gen) return
    if (!r.ok) {
      state.mode = r.login ? 'login' : 'none'
      state.error = r.error
      return render()
    }
    if (r.data.status === 'completed') {
      const j = await send({ type: 'api', path: `/api/jobs/${r.data.job_id}` })
      return onJob(j.ok ? j.data : { job_id: r.data.job_id, status: 'completed' }, gen, true)
    }
    onJob({ job_id: r.data.job_id, status: 'pending', progress: 0 }, gen, true)
  }

  // ---------- Ijro ----------

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
      const txt = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim()
      if (txt) cues.push({ start: toSec(a), end: toSec(b.trim().split(/\s+/)[0]), text: txt })
    }
    return cues
  }

  function prepareMedia(jobId) {
    if (!state.audio) {
      state.audio = new Audio(`${state.cfg.api}/api/outputs/${jobId}/audio`)
      state.audio.preload = 'auto'
      state.audio.addEventListener('error', () => {
        if (!state.audio) return
        state.error = state.audio.error && state.audio.error.code === 4
          ? 'Audio fayl topilmadi (saqlash muddati tugagan boʻlishi mumkin).'
          : 'Audioni yuklab boʻlmadi.'
        setDub(false)
        render()
      })
    }
    if (!state.cues.length) {
      const gen = state.gen
      send({ type: 'text', path: `/api/jobs/${jobId}/subtitles.vtt` }).then((r) => {
        if (gen === state.gen && r.ok) state.cues = parseVtt(r.data)
      })
    }
  }

  function applyVolume() {
    const v = video()
    if (!v || !state.dubOn || adShowing()) return
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
    // Subtitr dublajdan mustaqil ko'rsatilishi mumkin
    if (v && state.subsOn && state.cues.length && state.mode === 'ready' && !adShowing()) {
      const t = v.currentTime
      const cue = state.cues.find((c) => t >= c.start && t < c.end)
      const text = cue ? cue.text : ''
      if (subs.dataset.text !== text) {
        subs.dataset.text = text
        subs.replaceChildren(...(text ? [h('span', {}, text)] : []))
      }
      const ph = player()?.clientHeight || 360
      subs.style.setProperty('--subs-size', `${Math.round(Math.max(14, Math.min(34, ph / 22)))}px`)
    } else if (subs.dataset.text) {
      subs.dataset.text = ''
      subs.replaceChildren()
    }

    const p = player()
    pill.classList.toggle('hidden', !!p && p.classList.contains('ytp-autohide') && !state.panelOpen)
    if (p && !p.contains(host)) p.append(host)

    if (!state.dubOn || !v || !a) return
    if (adShowing() || v.paused || v.seeking || v.readyState < 3 || (a.duration && v.currentTime >= a.duration)) {
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
    const p = player()
    if (p && !p.contains(host)) p.append(host)
    const id = currentVideoId()
    host.style.display = id ? '' : 'none'
    if (id !== state.videoId) refresh()
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
    document.removeEventListener('yt-navigate-finish', attach)
    for (const ev of MEDIA_EVENTS) document.removeEventListener(ev, onMediaEvent, true)
    try { chrome.storage.onChanged.removeListener(onStorage) } catch {}
    teardown()
    host.remove()
  }

  document.addEventListener('yt-navigate-finish', attach)
  for (const ev of MEDIA_EVENTS) document.addEventListener(ev, onMediaEvent, true)
  chrome.storage.onChanged.addListener(onStorage)

  loadPrefs().then(attach)
})()
