--[[
GapirAI — DaVinci Resolve uchun oʻzbekcha dublaj va subtitr.

Workspace > Scripts > GapirAI menyusidan ishga tushadi (Free va Studio, Resolve 18.5+).
Playhead turgan klipning manba faylini GapirAI'ga yuboradi, natijani kutadi va
oʻzbekcha ovozni boʻsh audio trekka, subtitrni subtitr trekiga klip joyiga qoʻyadi.

Tarmoq uchun tizimdagi `curl` ishlatiladi (macOS va Windows 10/11 da bor).
Uzoq amallar (fayl yuklash, natijani olish) fonda bajariladi — Resolve qotmaydi.
]]

local G = {}
G.VERSION = '0.1.0'
G.API_BASE = 'https://api.gapirai.uz'
G.SITE_KEYS = 'https://gapirai.uz/dashboard#premiere'
G.MAX_BYTES = 1024 * 1024 * 1024
G.CONTENT_TYPES = { mp4 = 'video/mp4', m4v = 'video/mp4', mov = 'video/quicktime', mkv = 'video/x-matroska', webm = 'video/webm' }
G.STAGES = {
  PENDING = 'Navbatda', DOWNLOADING = 'Video qabul qilinmoqda', TRANSCRIBING = 'Nutq matnga oʻgirilmoqda',
  TRANSLATING = 'Oʻzbekchaga tarjima qilinmoqda', SYNTHESIZING = 'Ovoz yaratilmoqda', SYNCING = 'Ovoz vaqtga moslanmoqda',
  MERGING = 'Yakunlanmoqda', COMPLETED = 'Tayyor',
}

-- ---------------------------------------------------------------- tizim

G.WINDOWS = package.config:sub(1, 1) == '\\'

function G.home()
  return os.getenv('HOME') or os.getenv('USERPROFILE') or '.'
end

function G.join(a, b)
  local sep = G.WINDOWS and '\\' or '/'
  if a:sub(-1) == '/' or a:sub(-1) == '\\' then return a .. b end
  return a .. sep .. b
end

function G.basename(p)
  return (tostring(p):gsub('[/\\]+$', ''):match('([^/\\]+)$')) or p
end

function G.stem(p)
  local b = G.basename(p)
  return (b:gsub('%.[^.]*$', ''))
end

function G.ext(p)
  return (G.basename(p):match('%.([^.]+)$') or ''):lower()
end

function G.exists(p)
  local f = io.open(p, 'rb')
  if f then f:close() return true end
  return false
end

function G.readFile(p)
  local f = io.open(p, 'rb')
  if not f then return nil end
  local s = f:read('*a')
  f:close()
  return s
end

function G.writeFile(p, s)
  local f, err = io.open(p, 'wb')
  if not f then error('Faylga yozib boʻlmadi: ' .. p .. ' (' .. tostring(err) .. ')') end
  f:write(s)
  f:close()
end

function G.fileSize(p)
  local f = io.open(p, 'rb')
  if not f then return nil end
  local n = f:seek('end')
  f:close()
  return n
end

-- Buyruq satri argumenti
function G.q(s)
  s = tostring(s)
  if G.WINDOWS then return '"' .. s:gsub('"', '\\"') .. '"' end
  return "'" .. s:gsub("'", "'\\''") .. "'"
end

-- Windows'da cmd /c tashqi qo'shtirnoqlarni olib tashlaydi -- butun buyruqni o'raymiz
function G.shell(cmd)
  if G.WINDOWS then return '"' .. cmd .. '"' end
  return cmd
end

function G.capture(cmd)
  local p = io.popen(G.shell(cmd))
  if not p then return nil end
  local out = p:read('*a')
  p:close()
  return out
end

function G.mkdir(p)
  if G.WINDOWS then os.execute(G.shell('if not exist ' .. G.q(p) .. ' mkdir ' .. G.q(p)))
  else os.execute('mkdir -p ' .. G.q(p)) end
end

function G.remove(p) os.remove(p) end

-- ---------------------------------------------------------------- JSON (faqat o'qish)

function G.jsonDecode(s)
  local i = 1
  local function ws() i = s:find('[^ \t\r\n]', i) or (#s + 1) end
  local function err(m) error('JSON: ' .. m .. ' (' .. i .. ')') end
  local value
  local function utf8char(c)
    if c < 0x80 then return string.char(c) end
    if c < 0x800 then return string.char(0xC0 + math.floor(c / 64), 0x80 + c % 64) end
    if c < 0x10000 then return string.char(0xE0 + math.floor(c / 4096), 0x80 + math.floor(c / 64) % 64, 0x80 + c % 64) end
    return string.char(0xF0 + math.floor(c / 262144), 0x80 + math.floor(c / 4096) % 64, 0x80 + math.floor(c / 64) % 64, 0x80 + c % 64)
  end
  local function str()
    i = i + 1
    local buf = {}
    while true do
      local c = s:sub(i, i)
      if c == '' then err('tugallanmagan satr') end
      if c == '"' then i = i + 1 break end
      if c == '\\' then
        local e = s:sub(i + 1, i + 1)
        local map = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t', ['"'] = '"', ['\\'] = '\\', ['/'] = '/' }
        if map[e] then buf[#buf + 1] = map[e]; i = i + 2
        elseif e == 'u' then
          local cp = tonumber(s:sub(i + 2, i + 5), 16) or 63
          i = i + 6
          if cp >= 0xD800 and cp <= 0xDBFF and s:sub(i, i + 1) == '\\u' then
            local lo = tonumber(s:sub(i + 2, i + 5), 16) or 0
            cp = 0x10000 + (cp - 0xD800) * 0x400 + (lo - 0xDC00)
            i = i + 6
          end
          buf[#buf + 1] = utf8char(cp)
        else err('notoʻgʻri escape') end
      else
        local j = s:find('["\\]', i)
        if not j then err('tugallanmagan satr') end
        buf[#buf + 1] = s:sub(i, j - 1)
        i = j
      end
    end
    return table.concat(buf)
  end
  function value()
    ws()
    local c = s:sub(i, i)
    if c == '{' then
      i = i + 1
      local t = {}
      ws()
      if s:sub(i, i) == '}' then i = i + 1 return t end
      while true do
        ws()
        if s:sub(i, i) ~= '"' then err('kalit kutilgan') end
        local k = str()
        ws()
        if s:sub(i, i) ~= ':' then err(': kutilgan') end
        i = i + 1
        t[k] = value()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == '}' then return t end
        if d ~= ',' then err(', kutilgan') end
      end
    elseif c == '[' then
      i = i + 1
      local t = {}
      ws()
      if s:sub(i, i) == ']' then i = i + 1 return t end
      while true do
        t[#t + 1] = value()
        ws()
        local d = s:sub(i, i)
        i = i + 1
        if d == ']' then return t end
        if d ~= ',' then err(', kutilgan') end
      end
    elseif c == '"' then return str()
    elseif s:sub(i, i + 3) == 'true' then i = i + 4 return true
    elseif s:sub(i, i + 4) == 'false' then i = i + 5 return false
    elseif s:sub(i, i + 3) == 'null' then i = i + 4 return nil
    else
      local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', i)
      if not num or num == '' then err('kutilmagan belgi') end
      i = i + #num
      return tonumber(num)
    end
  end
  local ok, res = pcall(value)
  if ok then return res end
  return nil, res
end

-- %w lokalga bog'liq (ba'zi lokallarda 0xCA "harf") -- faqat ASCII sinflar
function G.urlencode(s)
  return (tostring(s):gsub('[^A-Za-z0-9%-%._~]', function(c) return string.format('%%%02X', c:byte()) end))
end

-- Server xato javobidan odamga tushunarli matn
function G.apiError(status, body)
  local data = body and G.jsonDecode(body)
  local d = type(data) == 'table' and data.detail
  if type(d) == 'string' then return d end
  if type(d) == 'table' and (d.message or d.detail) then return d.message or d.detail end
  if status == 401 then return 'API kalit yaroqsiz yoki bekor qilingan. gapirai.uz → Mening videolarim → Montaj dasturlari uchun plaginlar boʻlimidan yangisini oling.' end
  if status == 413 then return 'Fayl 1 GB dan katta.' end
  if status == 429 then return 'Juda koʻp soʻrov. Birozdan soʻng qayta urinib koʻring.' end
  if status == 0 then return 'GapirAI serveriga ulanib boʻlmadi. Internet aloqasini tekshiring.' end
  return 'Server xatosi (' .. tostring(status) .. ').'
end

-- ---------------------------------------------------------------- SRT

function G.srtTime(s)
  local h, m, sec, ms = tostring(s):match('(%d+):(%d+):(%d+)[,.](%d+)')
  if not h then return 0 end
  return tonumber(h) * 3600 + tonumber(m) * 60 + tonumber(sec) + tonumber(ms) / (10 ^ #ms)
end

function G.srtStamp(t)
  local ms = math.floor(math.max(0, t) * 1000 + 0.5)
  return string.format('%02d:%02d:%02d,%03d', math.floor(ms / 3600000), math.floor(ms / 60000) % 60, math.floor(ms / 1000) % 60, ms % 1000)
end

-- Manba vaqtidagi SRT -> faqat [inSec, outSec] ichidagi kuelar, (offset - inSec) ga surilgan
function G.shiftSrt(text, inSec, outSec, offset)
  text = tostring(text):gsub('\r', '') .. '\n\n'
  local out, n = {}, 0
  for block in text:gmatch('(.-)\n%s*\n') do
    local a, b, rest = block:match('([%d:,%.]+)%s*%-%->%s*([%d:,%.]+)[^\n]*\n?(.*)')
    if a then
      local s, e = G.srtTime(a), G.srtTime(b)
      if e > inSec and s < outSec then
        s, e = math.max(s, inSec), math.min(e, outSec)
        n = n + 1
        out[#out + 1] = n .. '\n' .. G.srtStamp(s - inSec + offset) .. ' --> ' .. G.srtStamp(e - inSec + offset) .. '\n' .. rest:gsub('%s+$', '')
      end
    end
  end
  return table.concat(out, '\n\n') .. '\n', n
end

-- ---------------------------------------------------------------- WAV

local function u16(s, p) local a, b = s:byte(p, p + 1) return a + b * 256 end
local function u32(s, p) local a, b, c, d = s:byte(p, p + 3) return a + b * 256 + c * 65536 + d * 16777216 end
local function le32(n)
  n = math.floor(n)
  return string.char(n % 256, math.floor(n / 256) % 256, math.floor(n / 65536) % 256, math.floor(n / 16777216) % 256)
end

-- PCM WAV'dan [fromSec, toSec) oralig'ini kesadi -> yangi WAV baytlari, davomiylik (s)
function G.sliceWav(data, fromSec, toSec)
  if data:sub(1, 4) ~= 'RIFF' or data:sub(9, 12) ~= 'WAVE' then error('Audio WAV formatida emas.') end
  local pos, fmtStart, fmtSize, dataStart, dataSize = 13
  while pos + 8 <= #data + 1 do
    local id, size = data:sub(pos, pos + 3), u32(data, pos + 4)
    local body = pos + 8
    if id == 'fmt ' then fmtStart, fmtSize = body, size end
    if id == 'data' then
      if size == 0 or size == 0xFFFFFFFF or body + size - 1 > #data then size = #data - body + 1 end
      dataStart, dataSize = body, size
      break
    end
    pos = body + size + (size % 2)
  end
  if not fmtStart or not dataStart then error('WAV fayl buzilgan.') end
  local byteRate, blockAlign = u32(data, fmtStart + 8), u16(data, fmtStart + 12)
  if byteRate == 0 or blockAlign == 0 then error('WAV formati qoʻllab-quvvatlanmaydi.') end
  local total = dataSize / byteRate
  fromSec = math.max(0, math.min(fromSec, total))
  toSec = math.max(fromSec, math.min(toSec, total))
  local a = math.floor(fromSec * byteRate / blockAlign) * blockAlign
  local z = math.floor(toSec * byteRate / blockAlign) * blockAlign
  local pcm = data:sub(dataStart + a, dataStart + z - 1)
  local fmt = data:sub(fmtStart, fmtStart + fmtSize - 1)
  if fmtSize % 2 == 1 then fmt = fmt .. '\0' end
  local out = 'RIFF' .. le32(4 + 8 + #fmt + 8 + #pcm) .. 'WAVE' .. 'fmt ' .. le32(fmtSize) .. fmt .. 'data' .. le32(#pcm) .. pcm
  return out, #pcm / byteRate, total
end

-- ---------------------------------------------------------------- Resolve

function G.fps(v)
  return tonumber(tostring(v or ''):match('[%d%.]+')) or 0
end

-- Versiyaga qarab bo'lmasligi mumkin bo'lgan metod: yo'q bo'lsa (yoki xato bersa) nil
local function call(o, name, ...)
  if o == nil then return nil end
  local okIdx, fn = pcall(function() return o[name] end)
  if not okIdx or fn == nil then return nil end
  local ok, r = pcall(fn, o, ...)
  if ok then return r end
  return nil
end

-- Playhead turgan video klip haqida hamma kerakli ma'lumot
function G.selection(resolve)
  local project = resolve:GetProjectManager():GetCurrentProject()
  if not project then return nil, 'Loyiha ochilmagan.' end
  local tl = project:GetCurrentTimeline()
  if not tl then return nil, 'Timeline ochilmagan.' end
  local item = tl:GetCurrentVideoItem()
  if not item then return nil, "Playhead'ni video klip ustiga qoʻying (V treklardagi klip)." end
  local mpi = item:GetMediaPoolItem()
  if not mpi then return nil, 'Bu klipning manba fayli yoʻq (generator, matn yoki compound clip).' end
  local path = mpi:GetClipProperty('File Path')
  if not path or path == '' then return nil, 'Klipning manba fayli topilmadi.' end
  local tlFps = G.fps(tl:GetSetting('timelineFrameRate'))
  if tlFps <= 0 then tlFps = G.fps(project:GetSetting('timelineFrameRate')) end
  if tlFps <= 0 then return nil, 'Timeline kadr tezligini aniqlab boʻlmadi.' end
  local clipFps = G.fps(mpi:GetClipProperty('FPS'))
  if clipFps <= 0 then clipFps = tlFps end
  local start, finish = item:GetStart(), item:GetEnd()
  -- Resolve 19+: GetSourceStartFrame (manba kadrlari); eskilarida GetLeftOffset (timeline kadrlari)
  local inSec
  local srcStart = call(item, 'GetSourceStartFrame')
  if srcStart ~= nil then inSec = srcStart / clipFps else inSec = (item:GetLeftOffset() or 0) / tlFps end
  local durSec = (finish - start) / tlFps
  return {
    project = project, timeline = tl, item = item, mediaPoolItem = mpi,
    name = item:GetName(), path = path, timelineName = tl:GetName(),
    startFrame = start, endFrame = finish, timelineStart = tl:GetStartFrame() or 0,
    fps = tlFps, clipFps = clipFps, inSec = inSec, outSec = inSec + durSec, durSec = durSec,
  }
end

-- [startFrame, endFrame) oralig'ida bo'sh audio trek (1 dan); bo'lmasa yangisini qo'shadi
function G.freeAudioTrack(tl, startFrame, endFrame)
  local count = tl:GetTrackCount('audio') or 0
  for idx = 1, count do
    local busy = false
    for _, it in pairs(tl:GetItemListInTrack('audio', idx) or {}) do
      if it:GetStart() < endFrame and it:GetEnd() > startFrame then busy = true break end
    end
    if not busy then return idx end
  end
  if call(tl, 'AddTrack', 'audio', 'mono') or call(tl, 'AddTrack', 'audio') then return count + 1 end
  return nil
end

function G.gapiraiFolder(mp)
  local root = mp:GetRootFolder()
  for _, f in pairs(root:GetSubFolderList() or {}) do
    if f:GetName() == 'GapirAI' then return f end
  end
  return mp:AddSubFolder(root, 'GapirAI') or root
end

function G.importOne(mp, path)
  local items = mp:ImportMedia({ path })
  return items and items[1]
end

-- Natijani timeline'ga qo'yish. sel -- G.selection() natijasi; wavPath bo'sh bo'lishi mumkin.
function G.place(sel, wavPath, srtClipPath, srtTimelinePath)
  local mp = sel.project:GetMediaPool()
  local prev = mp:GetCurrentFolder()
  mp:SetCurrentFolder(G.gapiraiFolder(mp))
  local res = { audio = false, captions = false, notes = {} }

  if wavPath then
    local wavItem = G.importOne(mp, wavPath)
    if not wavItem then
      res.notes[#res.notes + 1] = "Audio Media Pool'ga import boʻlmadi."
    else
      local track = G.freeAudioTrack(sel.timeline, sel.startFrame, sel.endFrame)
      local placed = track and mp:AppendToTimeline({ {
        mediaPoolItem = wavItem, mediaType = 2, trackIndex = track, recordFrame = sel.startFrame,
      } })
      if placed and placed[1] then
        res.audio, res.audioTrack = true, track
      else
        res.notes[#res.notes + 1] = "Boʻsh audio trek topilmadi — audio Media Pool'dagi 'GapirAI' papkasida, uni klip boshiga torting."
      end
    end
  end

  if srtClipPath then
    local srtItem = G.importOne(mp, srtClipPath)
    local before = sel.timeline:GetTrackCount('subtitle') or 0
    local placed = srtItem and mp:AppendToTimeline({ { mediaPoolItem = srtItem, recordFrame = sel.startFrame } })
    if placed and placed[1] and (sel.timeline:GetTrackCount('subtitle') or 0) >= math.max(1, before) then
      res.captions = true
    else
      res.notes[#res.notes + 1] = "Subtitrni avtomatik qoʻyib boʻlmadi: File → Import → Subtitle… orqali '"
        .. G.basename(srtTimelinePath or srtClipPath) .. "' faylini import qiling (vaqtlari timeline'ga moslangan)."
    end
  end

  if prev then mp:SetCurrentFolder(prev) end
  return res
end

-- ---------------------------------------------------------------- HTTP (curl)

G.CURL = G.WINDOWS and 'curl.exe' or 'curl'

function G.request(method, url, key, outFile)
  local cmd = G.CURL .. ' -sS -m 30 -X ' .. method .. ' -o ' .. G.q(outFile) .. ' -w "%{http_code}"'
  if key and key ~= '' then cmd = cmd .. ' -H ' .. G.q('Authorization: Bearer ' .. key) end
  cmd = cmd .. ' ' .. G.q(url) .. (G.WINDOWS and ' 2>nul' or ' 2>/dev/null')
  local code = tonumber((G.capture(cmd) or ''):match('(%d%d%d)%s*$')) or 0
  local body = G.readFile(outFile) or ''
  G.remove(outFile)
  return code, body
end

-- Fonda bajariladigan buyruq: tugaganda `done` fayli paydo bo'ladi
function G.background(lines, dir, tag)
  local done = G.join(dir, tag .. '.done')
  G.remove(done)
  if G.WINDOWS then
    local bat = G.join(dir, tag .. '.bat')
    G.writeFile(bat, '@echo off\r\nchcp 65001 >nul\r\n' .. table.concat(lines, '\r\n') .. '\r\necho ok> ' .. G.q(done) .. '\r\n')
    os.execute('start "" /b cmd /c ' .. G.q(bat))
  else
    local sh = G.join(dir, tag .. '.sh')
    G.writeFile(sh, table.concat(lines, '\n') .. '\necho ok > ' .. G.q(done) .. '\n')
    os.execute('sh ' .. G.q(sh) .. ' >/dev/null 2>&1 &')
  end
  return done
end

function G.uploadCommand(base, key, path, params, respFile, codeFile, progFile)
  local ct = G.CONTENT_TYPES[G.ext(path)]
  local qs = {}
  for _, k in ipairs({ 'subtitle_only', 'voice_gender', 'source_language' }) do qs[#qs + 1] = k .. '=' .. G.urlencode(params[k]) end
  return G.CURL .. ' -S --progress-bar -X POST -T ' .. G.q(path)
    .. ' -H ' .. G.q('Authorization: Bearer ' .. key)
    .. ' -H ' .. G.q('Content-Type: ' .. ct)
    .. ' -H ' .. G.q('X-File-Name: ' .. G.urlencode(G.basename(path)))
    .. ' -H "Expect:"'
    .. ' -o ' .. G.q(respFile) .. ' -w "%{http_code}" ' .. G.q(base .. '/api/jobs/upload?' .. table.concat(qs, '&'))
    .. ' > ' .. G.q(codeFile) .. ' 2> ' .. G.q(progFile)
end

function G.downloadCommand(url, outFile, codeFile)
  return G.CURL .. ' -sS -L -o ' .. G.q(outFile) .. ' -w "%{http_code}" ' .. G.q(url) .. ' > ' .. G.q(codeFile)
end

-- curl --progress-bar oxirgi foizi
function G.progress(text)
  local last
  for p in tostring(text or ''):gmatch('(%d+[%.,]?%d*)%%') do last = p end
  return last and tonumber((last:gsub(',', '.'))) or nil
end

function G.checkFile(path)
  local ct = G.CONTENT_TYPES[G.ext(path)]
  if not ct then return nil, 'Bu format qoʻllab-quvvatlanmaydi (.' .. G.ext(path) .. '). MP4, MOV, MKV yoki WebM kerak.' end
  local size = G.fileSize(path)
  if not size and G.WINDOWS and path:find('[\128-\255]') then return -1 end   -- hajmini server tekshiradi
  if not size then return nil, 'Manba fayl topilmadi: ' .. path end
  if size == 0 then return nil, 'Fayl boʻsh.' end
  if size > G.MAX_BYTES then return nil, string.format('Fayl 1 GB dan katta (%d MB).', math.floor(size / 1048576)) end
  return size
end

-- ---------------------------------------------------------------- sozlamalar

-- Windows'da Lua fayl funksiyalari faqat ANSI yo'llar bilan ishlaydi: foydalanuvchi
-- papkasi kirillcha bo'lsa (C:\Users\Алишер) umumiy lotincha papkaga o'tamiz.
local function asciiDir(p) return p and not p:find('[\128-\255]') and p or nil end

function G.configPath()
  if G.WINDOWS then
    return G.join(asciiDir(os.getenv('APPDATA')) or os.getenv('PUBLIC') or 'C:\\Users\\Public', 'GapirAI-resolve.cfg')
  end
  return G.join(G.home(), '.gapirai-resolve')
end

function G.loadConfig()
  local cfg = {}
  for line in (G.readFile(G.configPath()) or ''):gmatch('[^\r\n]+') do
    local k, v = line:match('^([%w_]+)=(.*)$')
    if k then cfg[k] = v end
  end
  return cfg
end

function G.saveConfig(cfg)
  local lines = {}
  for k, v in pairs(cfg) do if v ~= nil and v ~= '' then lines[#lines + 1] = k .. '=' .. tostring(v) end end
  table.sort(lines)
  G.writeFile(G.configPath(), table.concat(lines, '\n') .. '\n')
end

function G.workDir()
  local home = G.home()
  if G.WINDOWS then home = asciiDir(home) or os.getenv('PUBLIC') or 'C:\\Users\\Public' end
  local docs = G.join(home, 'Documents')
  local dir = G.join(docs, 'GapirAI')
  G.mkdir(dir)
  return dir
end

-- ---------------------------------------------------------------- oyna

function G.run(resolve, fu, bmd)
  local ui = fu.UIManager
  local disp = bmd.UIDispatcher(ui)
  local winID = 'uz.gapirai.resolve'
  local existing = ui:FindWindow(winID)
  if existing then existing:Show() existing:Raise() return end

  local cfg = G.loadConfig()
  local base = (cfg.base and cfg.base ~= '') and cfg.base or G.API_BASE
  local state = { phase = 'idle' }

  local win = disp:AddWindow({ ID = winID, WindowTitle = 'GapirAI — oʻzbekcha dublaj', Geometry = { 200, 160, 460, 470 } },
    ui:VGroup({ Spacing = 8 }, {
      ui:Label({ Text = '<b>GapirAI</b> — oʻzbekcha dublaj va subtitr', Weight = 0 }),
      ui:Label({ ID = 'Auth', Text = 'Kalit kiritilmagan.', Weight = 0, WordWrap = true }),
      ui:HGroup({ Weight = 0 }, {
        ui:LineEdit({ ID = 'Key', PlaceholderText = 'API kalit (gapirai.uz → Mening videolarim)', EchoMode = 'Password' }),
        ui:Button({ ID = 'SaveKey', Text = 'Saqlash', Weight = 0 }),
      }),
      ui:Button({ ID = 'GetKey', Text = 'Kalitni olish (saytda)', Weight = 0, Flat = true }),
      ui:VGap(4),
      ui:Label({ ID = 'Clip', Text = "Playhead'ni klip ustiga qoʻyib, «Klipni olish»ni bosing.", Weight = 0, WordWrap = true }),
      ui:Button({ ID = 'Pick', Text = 'Klipni olish (playhead ostidagi)', Weight = 0 }),
      ui:HGroup({ Weight = 0 }, {
        ui:Label({ Text = 'Natija:', Weight = 0 }),
        ui:ComboBox({ ID = 'Mode' }),
        ui:Label({ Text = 'Ovoz:', Weight = 0 }),
        ui:ComboBox({ ID = 'Voice' }),
      }),
      ui:Button({ ID = 'Start', Text = "GapirAI'ga yuborish", Weight = 0, Enabled = false }),
      ui:Label({ ID = 'Status', Text = '', Weight = 1, WordWrap = true, Alignment = { AlignTop = true } }),
    }))

  local itm = win:GetItems()
  itm.Mode:AddItem('Dublaj + subtitr')
  itm.Mode:AddItem('Faqat subtitr')
  itm.Voice:AddItem('Avtomatik')
  itm.Voice:AddItem('Erkak')
  itm.Voice:AddItem('Ayol')
  local timer = ui:Timer({ ID = 'Tick', Interval = 1000 })

  local function status(text) itm.Status.Text = text end
  local function setBusy(b)
    state.busy = b
    itm.Start.Enabled = (not b) and state.sel ~= nil and state.authed == true
    itm.Pick.Enabled = not b
  end

  local function checkKey()
    state.authed = false
    if not cfg.key or cfg.key == '' then itm.Auth.Text = 'Kalit kiritilmagan.' setBusy(state.busy) return end
    local code, body = G.request('GET', base .. '/auth/me', cfg.key, G.join(G.workDir(), '.me.json'))
    if code == 200 then
      local me = G.jsonDecode(body) or {}
      state.authed = true
      itm.Auth.Text = '<font color="#3ddc84">Ulangan: ' .. tostring(me.email or me.name or '') .. '</font>'
    else
      itm.Auth.Text = '<font color="#ff8a80">' .. G.apiError(code, body) .. '</font>'
    end
    setBusy(state.busy)
  end

  local function fail(msg)
    status('<font color="#ff8a80">' .. msg .. '</font>')
    state.phase = 'idle'
    timer:Stop()
    setBusy(false)
  end

  local function finishJob()
    local job, dir = state.job, G.workDir()
    local stem = G.stem(job.path) .. '.' .. job.id:sub(1, 8)
    local srtFull = G.join(dir, stem .. '.full.uz.srt')
    local wavFull = job.mode == 'dub' and G.join(dir, stem .. '.full.uz.wav') or nil
    state.files = { srtFull = srtFull, wavFull = wavFull, dir = dir, stem = stem }
    local lines = { G.downloadCommand(base .. '/api/jobs/' .. job.id .. '/subtitles.srt', srtFull, G.join(dir, '.srt.code')) }
    if wavFull then lines[#lines + 1] = G.downloadCommand(base .. '/api/outputs/' .. job.id .. '/audio', wavFull, G.join(dir, '.wav.code')) end
    state.done = G.background(lines, dir, '.download')
    state.phase = 'download'
    status('Natija yuklab olinmoqda…')
  end

  local function placeResult()
    local job, f = state.job, state.files
    local sel = state.sel
    -- klip hali o'sha joydami? (panel ochiq turganda foydalanuvchi uni surgan bo'lishi mumkin)
    local now = G.selection(resolve)
    if now and now.path == job.path and now.timelineName == job.timelineName then sel = now end
    if not sel or not sel.timeline or sel.timelineName ~= job.timelineName then
      state.phase = 'waitpick'
      timer:Stop()
      setBusy(false)
      itm.Start.Enabled = false
      status("<b>Natija tayyor.</b> '" .. tostring(job.timelineName) .. "' timeline'ini oching, playhead'ni '"
        .. G.basename(job.path) .. "' klipi ustiga qoʻyib, «Klipni olish»ni bosing — natija oʻsha joyga qoʻyiladi.")
      return
    end

    local srt = G.readFile(f.srtFull)
    if not srt or srt == '' then return fail('Subtitrni yuklab boʻlmadi.') end
    local srtClip = G.join(f.dir, f.stem .. '.uz.srt')
    local srtTimeline = G.join(f.dir, f.stem .. '.timeline.uz.srt')
    G.writeFile(srtClip, (G.shiftSrt(srt, sel.inSec, sel.outSec, 0)))
    G.writeFile(srtTimeline, (G.shiftSrt(srt, sel.inSec, sel.outSec, (sel.startFrame - sel.timelineStart) / sel.fps)))

    local wavClip
    if f.wavFull then
      local data = G.readFile(f.wavFull)
      if not data or data:sub(1, 4) ~= 'RIFF' then return fail('Dublaj audiosini yuklab boʻlmadi.') end
      local cut, secs = G.sliceWav(data, sel.inSec, sel.outSec)
      if secs >= 0.1 then
        wavClip = G.join(f.dir, f.stem .. '.uz.wav')
        G.writeFile(wavClip, cut)
      end
    end

    status("Timeline'ga qoʻyilmoqda…")
    local res = G.place(sel, wavClip, srtClip, srtTimeline)
    local done = {}
    if res.audio then done[#done + 1] = 'oʻzbekcha ovoz A' .. tostring(res.audioTrack) .. ' trekka' end
    if res.captions then done[#done + 1] = 'subtitr subtitr trekiga' end
    cfg.pending = nil
    G.saveConfig(cfg)
    state.phase = 'idle'
    timer:Stop()
    setBusy(false)
    status('<font color="#3ddc84"><b>Tayyor.</b></font> ' .. (#done > 0 and (table.concat(done, ' va ') .. ' qoʻyildi. ') or '')
      .. table.concat(res.notes, ' ') .. '<br>Fayllar: ' .. f.dir)
  end

  local function poll()
    local code, body = G.request('GET', base .. '/api/jobs/' .. state.job.id, cfg.key, G.join(G.workDir(), '.job.json'))
    if code == 0 then status('Tarmoq uzildi, qayta urinilmoqda…') return end
    if code ~= 200 then return fail(G.apiError(code, body)) end
    local j = G.jsonDecode(body) or {}
    local st = tostring(j.status or ''):upper()
    if st == 'COMPLETED' then return finishJob() end
    if st == 'FAILED' then return fail(j.error_message or j.status_message or 'Video qayta ishlanmadi.') end
    if st == 'AWAITING_PAYMENT' then return fail("Bu video uchun daqiqangiz yetmaydi. gapirai.uz'da daqiqa sotib olib, qayta yuboring.") end
    status(string.format('%s — %d%%<br><font color="#9aa0a6">%s</font>', G.STAGES[st] or st, math.floor(tonumber(j.progress) or 0), tostring(j.status_message or '')))
  end

  local function startPolling(job)
    state.job = job
    cfg.pending = table.concat({ job.id, job.mode, job.path, job.timelineName }, '|')
    G.saveConfig(cfg)
    state.phase = 'poll'
    state.nextPoll = 0
    setBusy(true)
    timer:Start()
  end

  function disp.On.Tick.Timeout(ev)
    if state.phase == 'upload' then
      if G.exists(state.done) then
        local dir = G.workDir()
        local code = tonumber((G.readFile(G.join(dir, '.upload.code')) or ''):match('(%d%d%d)')) or 0
        local body = G.readFile(G.join(dir, '.upload.json')) or ''
        if code ~= 201 and code ~= 200 then return fail(G.apiError(code, body)) end
        local r = G.jsonDecode(body) or {}
        if not r.job_id then return fail('Server javobi tushunarsiz.') end
        startPolling({ id = r.job_id, mode = state.mode, path = state.sel.path, timelineName = state.sel.timelineName })
        status('Yuborildi. Navbatga qoʻyildi…')
      else
        local p = G.progress(G.readFile(G.join(G.workDir(), '.upload.progress')))
        status(string.format('Fayl yuborilmoqda… %s', p and (string.format('%.0f', p) .. '%') or ''))
      end
    elseif state.phase == 'poll' then
      state.nextPoll = state.nextPoll - 1
      if state.nextPoll <= 0 then state.nextPoll = 4 poll() end
    elseif state.phase == 'download' then
      if G.exists(state.done) then
        local ok, err = pcall(placeResult)
        if not ok then fail('Xatolik: ' .. tostring(err)) end
      end
    end
  end

  function win.On.SaveKey.Clicked(ev)
    local v = (itm.Key.Text or ''):gsub('^%s+', ''):gsub('%s+$', '')
    if v == '' then return status('Kalitni kiriting.') end
    cfg.key = v
    G.saveConfig(cfg)
    itm.Key.Text = ''
    checkKey()
  end

  function win.On.GetKey.Clicked(ev)
    os.execute(G.WINDOWS and ('start "" ' .. G.q(G.SITE_KEYS)) or ('open ' .. G.q(G.SITE_KEYS)))
  end

  function win.On.Pick.Clicked(ev)
    if not state.authed and cfg.key then checkKey() end
    local sel, err = G.selection(resolve)
    if not sel then state.sel = nil setBusy(false) itm.Clip.Text = '<font color="#ff8a80">' .. err .. '</font>' return end
    local size, ferr = G.checkFile(sel.path)
    if not size then state.sel = nil setBusy(false) itm.Clip.Text = '<font color="#ff8a80">' .. ferr .. '</font>' return end
    state.sel = sel
    if state.phase == 'waitpick' then
      if sel.path ~= state.job.path then itm.Clip.Text = '<font color="#ff8a80">Bu boshqa klip. Natija \'' .. G.basename(state.job.path) .. '\' uchun.</font>' return end
      local ok, err2 = pcall(placeResult)
      if not ok then fail('Xatolik: ' .. tostring(err2)) end
      return
    end
    itm.Clip.Text = string.format('<b>%s</b><br>%s · %.1f s (manbada %.1f–%.1f s) · %d MB',
      sel.name, G.basename(sel.path), sel.durSec, sel.inSec, sel.outSec, math.max(0, math.floor(size / 1048576 + 0.5)))
    setBusy(false)
  end

  function win.On.Start.Clicked(ev)
    if not state.sel or state.busy then return end
    local dir = G.workDir()
    state.mode = itm.Mode.CurrentIndex == 1 and 'subtitle' or 'dub'
    local voices = { [0] = 'auto', [1] = 'male', [2] = 'female' }
    local cmd = G.uploadCommand(base, cfg.key, state.sel.path, {
      subtitle_only = state.mode == 'subtitle' and 'true' or 'false',
      voice_gender = voices[itm.Voice.CurrentIndex] or 'auto',
      source_language = 'auto',
    }, G.join(dir, '.upload.json'), G.join(dir, '.upload.code'), G.join(dir, '.upload.progress'))
    state.done = G.background({ cmd }, dir, '.upload')
    state.phase = 'upload'
    setBusy(true)
    status('Fayl yuborilmoqda…')
    timer:Start()
  end

  win.On[winID].Close = function(ev)
    timer:Stop()
    disp:ExitLoop()
  end

  -- Avvalgi (oyna yopilgan) ish bo'lsa -- davom etamiz
  checkKey()
  if cfg.pending and cfg.key then
    local id, mode, path, tlName = cfg.pending:match('^([^|]+)|([^|]+)|([^|]*)|(.*)$')
    if id then
      local sel = G.selection(resolve)
      if sel and sel.path == path then state.sel = sel end
      state.sel = state.sel or { path = path, timelineName = tlName }
      status('Avvalgi ish davom etmoqda…')
      startPolling({ id = id, mode = mode, path = path, timelineName = tlName })
    end
  end

  win:Show()
  disp:RunLoop()
  win:Hide()
end

-- Resolve ichida ishga tushirilganda (sinovda emas)
if not GAPIRAI_TEST then
  local fusionObj = fu or fusion
  if not resolve or not fusionObj then
    print('GapirAI: bu skript DaVinci Resolve ichida (Workspace > Scripts) ishga tushiriladi.')
  else
    local ok, err = pcall(G.run, resolve, fusionObj, bmd)
    if not ok then print('GapirAI xatosi: ' .. tostring(err)) end
  end
end

return G
