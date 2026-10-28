-- Testlar uchun DaVinci Resolve va Fusion UIManager'ning soxta nusxalari.
-- Haqiqiy API'dan faqat GapirAI.lua ishlatadigan qismi; har chaqiruv `calls` ga yoziladi.

local M = { calls = {} }
local function log(...) M.calls[#M.calls + 1] = { ... } end

local function obj(t)
  return setmetatable(t, { __index = function(_, k) error('mock: ' .. tostring(k) .. ' metodi yoʻq', 2) end })
end

-- ---------------------------------------------------------------- Resolve

function M.resolve(opts)
  local tlStart = opts.timelineStart or 86400
  local fps = opts.fps or '25'
  local audioTracks = opts.audioTracks or { { { 0, 0 } } } -- har trekdagi [start, end) lar (timeline boshiga nisbatan)
  local subtitleTracks = 0

  local mpItems = {}
  local function mediaPoolItem(path, props)
    return obj({
      path = path,
      GetClipProperty = function(_, k) return (props or {})[k] or (k == 'File Path' and path or '') end,
      GetName = function() return path:match('([^/\\]+)$') end,
    })
  end

  local source = mediaPoolItem(opts.path, { ['File Path'] = opts.path, FPS = opts.clipFps or fps })
  local item = obj({
    GetMediaPoolItem = function() return opts.noMediaPoolItem and nil or source end,
    GetStart = function() return tlStart + opts.start end,
    GetEnd = function() return tlStart + opts.start + opts.duration end,
    GetLeftOffset = function() return opts.leftOffset or 0 end,
    GetName = function() return 'Klip 1' end,
  })
  if opts.sourceStartFrame then item.GetSourceStartFrame = function() return opts.sourceStartFrame end end

  local function trackItems(idx)
    local list = {}
    for _, r in ipairs(audioTracks[idx] or {}) do
      if r[2] > r[1] then
        list[#list + 1] = obj({ GetStart = function() return tlStart + r[1] end, GetEnd = function() return tlStart + r[2] end })
      end
    end
    return list
  end

  local timeline = obj({
    GetName = function() return opts.timelineName or 'Timeline 1' end,
    GetStartFrame = function() return tlStart end,
    GetSetting = function(_, k) if k == 'timelineFrameRate' then return fps end end,
    GetCurrentVideoItem = function() return not opts.noItem and item or nil end,
    GetTrackCount = function(_, t)
      if t == 'audio' then return #audioTracks end
      if t == 'subtitle' then return subtitleTracks end
      return 1
    end,
    GetItemListInTrack = function(_, t, idx) return trackItems(idx) end,
    AddTrack = function(_, t, sub) log('AddTrack', t, sub) audioTracks[#audioTracks + 1] = {} return true end,
  })

  local folder = obj({ GetName = function() return 'Master' end, GetSubFolderList = function() return {} end })
  local gapiraiFolder = obj({ GetName = function() return 'GapirAI' end })
  local current = folder
  local mediaPool = obj({
    GetRootFolder = function() return folder end,
    AddSubFolder = function(_, parent, name) log('AddSubFolder', name) return gapiraiFolder end,
    GetCurrentFolder = function() return current end,
    SetCurrentFolder = function(_, f) current = f return true end,
    ImportMedia = function(_, paths)
      local p = paths[1]
      log('ImportMedia', p, current:GetName())
      local it = mediaPoolItem(p)
      mpItems[#mpItems + 1] = it
      return { it }
    end,
    AppendToTimeline = function(_, infos)
      local info = infos[1]
      local isSrt = info.mediaPoolItem.path:match('%.srt$') ~= nil
      log('AppendToTimeline', info.mediaPoolItem.path, info.mediaType, info.trackIndex, info.recordFrame)
      if isSrt then
        if not opts.subtitleAppend then return {} end
        subtitleTracks = math.max(subtitleTracks, 1)
      end
      return { obj({}) }
    end,
  })

  local project = obj({
    GetCurrentTimeline = function() return not opts.noTimeline and timeline or nil end,
    GetMediaPool = function() return mediaPool end,
    GetSetting = function(_, k) if k == 'timelineFrameRate' then return fps end end,
  })

  return obj({
    GetProjectManager = function() return obj({ GetCurrentProject = function() return project end }) end,
  })
end

-- ---------------------------------------------------------------- Fusion UIManager

local function widget(kind, props, children)
  local w = { kind = kind, children = children or {} }
  for k, v in pairs(props or {}) do w[k] = v end
  if w.Enabled == nil then w.Enabled = true end
  if kind == 'ComboBox' then
    w.items, w.CurrentIndex = {}, 0
    w.AddItem = function(self, text) self.items[#self.items + 1] = text end
  end
  return w
end

local function autotable()
  return setmetatable({}, { __index = function(t, k) local v = {} rawset(t, k, v) return v end })
end

function M.fusion()
  local ui = {}
  for _, kind in ipairs({ 'Label', 'LineEdit', 'Button', 'ComboBox' }) do
    ui[kind] = function(_, props) return widget(kind, props) end
  end
  ui.VGroup = function(_, props, children) return widget('VGroup', props, children) end
  ui.HGroup = function(_, props, children) return widget('HGroup', props, children) end
  ui.VGap = function() return widget('Gap') end
  ui.FindWindow = function() return nil end
  ui.Timer = function(_, props)
    local t = { ID = props.ID, running = false }
    t.Start = function(self) self.running = true end
    t.Stop = function(self) self.running = false end
    M.timer = t
    return t
  end

  local bmd = {}
  bmd.UIDispatcher = function(u)
    local disp = { On = autotable() }
    disp.AddWindow = function(_, props, root)
      local items = {}
      local function collect(w) if w.ID then items[w.ID] = w end for _, c in ipairs(w.children or {}) do collect(c) end end
      collect(root)
      local win = { On = autotable(), items = items, props = props }
      win.GetItems = function() return items end
      win.Show = function() end
      win.Hide = function() end
      win.Raise = function() end
      M.window = win
      return win
    end
    disp.RunLoop = function() end   -- testda tsikl yo'q: hodisalarni test o'zi chaqiradi
    disp.ExitLoop = function() M.exited = true end
    M.dispatcher = disp
    return disp
  end
  return { UIManager = ui }, bmd
end

return M
