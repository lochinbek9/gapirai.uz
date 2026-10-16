"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle
} from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, RectangleHorizontal, Rows3, Check, Loader2, Sparkles, Lock, SkipForward
} from "lucide-react";
import { getJobResolutions, requestResolution, ResolutionOption, getVideoUrl } from "@/lib/api";

/* ── VTT ──────────────────────────────────────────── */
interface Cue { start: number; end: number; text: string }
const vttToSec = (t: string) =>
  t.trim().split(":").reduce((a, p) => a * 60 + parseFloat(p.replace(",", ".")), 0);

function parseVTT(vtt: string): Cue[] {
  const out: Cue[] = [];
  for (const blk of vtt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = blk.trim().split("\n");
    const ti = lines.findIndex(l => l.includes("-->"));
    if (ti < 0) continue;
    const [s, e] = lines[ti].split(" --> ");
    const text = lines.slice(ti + 1).filter(l => l.trim()).join(" ");
    if (text) out.push({ start: vttToSec(s), end: vttToSec(e), text });
  }
  return out;
}

/* ── Subtitle settings ────────────────────────────── */
interface SubSettings {
  fontSize: number;     // rem: 0.75 / 0.95 / 1.15 / 1.4
  bgOpacity: number;    // 0 – 1
  textColor: string;    // hex
  textOpacity: number;  // 0.7 / 0.85 / 1
}
const DEFAULT_SUB: SubSettings = {
  fontSize: 0.95, bgOpacity: 0.8, textColor: "#ffffff", textOpacity: 1,
};
const SUB_KEY = "dubber_sub_settings";

function loadSubSettings(): SubSettings {
  if (typeof window === "undefined") return DEFAULT_SUB;
  try { return { ...DEFAULT_SUB, ...JSON.parse(localStorage.getItem(SUB_KEY) || "{}") }; }
  catch { return DEFAULT_SUB; }
}

/* ── Icons ────────────────────────────────────────── */
function CcIcon({ on }: { on: boolean }) {
  return (
    <span
      className={`text-[9px] font-extrabold border rounded px-[4px] py-[1.5px] leading-none tracking-tight select-none transition-colors uppercase ${
        on ? "border-red-500 bg-red-500/20 text-red-400" : "border-white/40 text-white/60 hover:text-white hover:border-white"
      }`}
    >
      sub
    </span>
  );
}

function HeadphonesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
      <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
  );
}

/* ── Subtitle settings panel ──────────────────────── */
function SubPanel({
  settings, onChange, onClose,
}: {
  settings: SubSettings;
  onChange: (s: SubSettings) => void;
  onClose: () => void;
}) {
  const update = (partial: Partial<SubSettings>) => {
    const next = { ...settings, ...partial };
    onChange(next);
    localStorage.setItem(SUB_KEY, JSON.stringify(next));
  };

  const SIZES   = [{ v: 0.75, l: "S" }, { v: 0.95, l: "M" }, { v: 1.15, l: "L" }, { v: 1.4, l: "XL" }];
  const BGOPTS  = [{ v: 0,   l: "Yo'q" }, { v: 0.35, l: "25%" }, { v: 0.6, l: "50%" }, { v: 0.8, l: "75%" }, { v: 0.95, l: "100%" }];
  const COLORS  = [
    { v: "#ffffff", label: "Oq" },
    { v: "#ffd700", label: "Sariq" },
    { v: "#00e5ff", label: "Moviy" },
    { v: "#a3e635", label: "Yashil" },
  ];
  const OPACITIES = [{ v: 0.65, l: "Past" }, { v: 0.85, l: "O'rta" }, { v: 1.0, l: "To'liq" }];

  return (
    <div className="absolute bottom-[72px] right-2 z-50 bg-black/95 border border-white/10 rounded-2xl p-4 w-72 shadow-2xl text-white text-xs">
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-sm">Subtitr sozlamalari</span>
        <button onClick={onClose} className="text-white/40 hover:text-white transition">✕</button>
      </div>

      {/* Font size */}
      <div className="mb-3">
        <p className="text-white/50 mb-1.5 uppercase tracking-wider text-[10px]">Shrift o'lchami</p>
        <div className="flex gap-1.5">
          {SIZES.map(s => (
            <button key={s.v} onClick={() => update({ fontSize: s.v })}
              className={`flex-1 py-1.5 rounded-lg font-bold transition text-sm ${
                settings.fontSize === s.v
                  ? "bg-blue-500 text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >{s.l}</button>
          ))}
        </div>
      </div>

      {/* Background opacity */}
      <div className="mb-3">
        <p className="text-white/50 mb-1.5 uppercase tracking-wider text-[10px]">Fon shaffoflik</p>
        <div className="flex gap-1.5">
          {BGOPTS.map(o => (
            <button key={o.v} onClick={() => update({ bgOpacity: o.v })}
              className={`flex-1 py-1.5 rounded-lg transition text-[10px] font-semibold ${
                settings.bgOpacity === o.v
                  ? "bg-blue-500 text-white"
                  : "bg-white/10 text-white/50 hover:bg-white/20"
              }`}
            >{o.l}</button>
          ))}
        </div>
      </div>

      {/* Text color */}
      <div className="mb-3">
        <p className="text-white/50 mb-1.5 uppercase tracking-wider text-[10px]">Matn rangi</p>
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button key={c.v} onClick={() => update({ textColor: c.v })}
              title={c.label}
              className={`w-8 h-8 rounded-full transition border-2 ${
                settings.textColor === c.v ? "border-blue-400 scale-110" : "border-transparent hover:border-white/30"
              }`}
              style={{ backgroundColor: c.v }}
            />
          ))}
        </div>
      </div>

      {/* Text opacity */}
      <div>
        <p className="text-white/50 mb-1.5 uppercase tracking-wider text-[10px]">Matn aniqligi</p>
        <div className="flex gap-1.5">
          {OPACITIES.map(o => (
            <button key={o.v} onClick={() => update({ textOpacity: o.v })}
              className={`flex-1 py-1.5 rounded-lg transition text-[10px] font-semibold ${
                settings.textOpacity === o.v
                  ? "bg-blue-500 text-white"
                  : "bg-white/10 text-white/50 hover:bg-white/20"
              }`}
            >{o.l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Props ────────────────────────────────────────── */
export interface VideoPlayerProps {
  src: string;
  jobId?: string;
  videoTitle?: string;
  channelName?: string;
  youtubeUrl?: string;
  initialQuality?: string;
  subtitlesContent?: string;
  audioDownloadUrl?: string;
  className?: string;
  theaterMode?: boolean;
  onTheaterToggle?: () => void;
}

// YouTubePlayerHandle (frontend/components/YouTubePlayer.tsx) bilan bir xil
// shakl -- frontend/app/learn/[id] Video tabida qaysi pleer ko'rsatilishidan
// (original YouTube yoki dublyaj videosi) qat'i nazar bitta seek() interfeysi
// orqali ishlatiladi (transkript/quiz/AI-ustoz timestamp tugmalari).
export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
}

/* ── VideoPlayer ──────────────────────────────────── */
const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  src, jobId, videoTitle, channelName, youtubeUrl, initialQuality, subtitlesContent, audioDownloadUrl,
  className = "", theaterMode = false, onTheaterToggle,
}, ref) => {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [resolvedTitle, setResolvedTitle] = useState<string>(videoTitle || "");
  const [resolvedChannel, setResolvedChannel] = useState<string>(channelName || "");

  useEffect(() => {
    if (videoTitle) setResolvedTitle(videoTitle);
  }, [videoTitle]);

  useEffect(() => {
    if (channelName) {
      setResolvedChannel(channelName);
      return;
    }
    if (!youtubeUrl) return;

    const m = youtubeUrl.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/);
    if (!m || !m[1]) return;
    const videoId = m[1];

    try {
      const cached = typeof window !== "undefined" ? sessionStorage.getItem(`yt_meta_${videoId}`) : null;
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.channel) setResolvedChannel(parsed.channel);
        if (parsed.title && !videoTitle) setResolvedTitle(parsed.title);
        return;
      }
    } catch {}

    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.author_name) setResolvedChannel(data.author_name);
        if (data.title && !videoTitle) setResolvedTitle(data.title);
        try {
          sessionStorage.setItem(`yt_meta_${videoId}`, JSON.stringify({
            channel: data.author_name,
            title: data.title,
          }));
        } catch {}
      })
      .catch(() => {});
  }, [channelName, videoTitle, youtubeUrl]);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = seconds;
      el.play().catch(() => {});
    },
  }));

  const [playing,          setPlaying]          = useState(false);
  const [muted,            setMuted]            = useState(false);
  const [volume,           setVolume]           = useState(1);
  const [progress,         setProgress]         = useState(0);
  const [duration,         setDuration]         = useState(0);
  const [buffered,         setBuffered]         = useState(0);
  const [fullscreen,       setFullscreen]       = useState(false);
  const [showControls,     setShowControls]     = useState(true);
  const [showSubs,         setShowSubs]         = useState(true);
  const [showPanel,        setShowPanel]        = useState(false);
  const [subSettings,      setSubSettings]      = useState<SubSettings>(loadSubSettings);

  /* ── Resolution / Quality State ──────────────── */
  const [currentQuality,   setCurrentQuality]   = useState<string>(initialQuality || "720p");
  const [resolutions,      setResolutions]      = useState<ResolutionOption[]>([]);
  const [showQualityMenu,  setShowQualityMenu]  = useState(false);
  const [qualityToast,     setQualityToast]     = useState<string | null>(null);
  const [requestingRes,    setRequestingRes]    = useState<string | null>(null);
  const savedTimeRef   = useRef<number | null>(null);
  const wasPlayingRef  = useRef<boolean>(false);
  const toastTimerRef  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(toastTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!jobId) return;
    getJobResolutions(jobId)
      .then(res => {
        if (res?.resolutions) {
          setResolutions(res.resolutions);
          const curOpt = res.resolutions.find(r => r.resolution === (initialQuality || "720p"));
          if (curOpt && !curOpt.available) {
            const fallback = [...res.resolutions].reverse().find(r => r.available);
            if (fallback) {
              setCurrentQuality(fallback.resolution);
            }
          }
          if (res.resolutions.some(r => r.status === "processing")) {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = setInterval(async () => {
              const fresh = await getJobResolutions(jobId);
              if (fresh?.resolutions) {
                setResolutions(fresh.resolutions);
                if (!fresh.resolutions.some(r => r.status === "processing")) {
                  if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                }
              }
            }, 3000);
          }
        }
      })
      .catch(() => {});
  }, [jobId, initialQuality]);

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimerRef.current);
    setQualityToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setQualityToast(null);
    }, 2800);
  }, []);

  const doSwitchQuality = useCallback((targetRes: string) => {
    const v = videoRef.current;
    if (v) {
      savedTimeRef.current = v.currentTime;
      wasPlayingRef.current = !v.paused;
    }
    setCurrentQuality(targetRes);
    setShowQualityMenu(false);
    const label = targetRes === "1080p" ? "1080p (Full HD)" : targetRes === "720p" ? "720p (HD)" : "360p (SD)";
    showToast(`${label} ga o'tkazildi`);
  }, [showToast]);

  const handleSelectQuality = useCallback(async (targetRes: string) => {
    if (targetRes === currentQuality) {
      setShowQualityMenu(false);
      return;
    }

    const opt = resolutions.find(r => r.resolution === targetRes);
    if (opt && !opt.available) {
      showToast(`${targetRes} faqat yuqoriroq tarifda mavjud`);
      return;
    }

    if (opt && opt.status !== "ready" && targetRes !== "720p" && jobId) {
      setRequestingRes(targetRes);
      showToast(`${targetRes} tayyorlanmoqda, iltimos kuting...`);
      try {
        const res = await requestResolution(jobId, targetRes);
        if (res.status === "ready") {
          setRequestingRes(null);
          doSwitchQuality(targetRes);
          return;
        }

        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          try {
            const fresh = await getJobResolutions(jobId);
            if (fresh?.resolutions) {
              setResolutions(fresh.resolutions);
              const found = fresh.resolutions.find(r => r.resolution === targetRes);
              if (found?.status === "ready") {
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                setRequestingRes(null);
                doSwitchQuality(targetRes);
              } else if (found?.status === "failed") {
                if (pollTimerRef.current) clearInterval(pollTimerRef.current);
                setRequestingRes(null);
                showToast(`${targetRes} tayyorlashda xatolik yuz berdi`);
              }
            }
          } catch {
            // Ignore polling errors
          }
        }, 3000);
      } catch {
        setRequestingRes(null);
        showToast(`${targetRes} so'rovida xatolik yuz berdi`);
      }
      return;
    }

    doSwitchQuality(targetRes);
  }, [currentQuality, resolutions, jobId, doSwitchQuality, showToast]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    if (savedTimeRef.current !== null) {
      v.currentTime = savedTimeRef.current;
      if (wasPlayingRef.current) {
        v.play().catch(() => {});
      }
      savedTimeRef.current = null;
    }
  };

  const effectiveSrc = useMemo(() => {
    if (jobId) {
      return getVideoUrl(jobId, currentQuality);
    }
    return src;
  }, [jobId, currentQuality, src]);

  /* ── Cues ─────────────────────────────────────── */
  const cues = useMemo<Cue[]>(() => {
    if (!subtitlesContent) return [];
    return parseVTT(subtitlesContent);
  }, [subtitlesContent]);

  const currentCue = useMemo(
    () => cues.find(c => progress >= c.start && progress <= c.end) ?? null,
    [cues, progress]
  );

  /* ── Events ───────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime  = () => setProgress(v.currentTime);
    const onDur   = () => setDuration(v.duration);
    const onBuf   = () => v.buffered.length > 0 && setBuffered(v.buffered.end(v.buffered.length - 1));
    const onEnd   = () => setPlaying(false);
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onFS    = () => setFullscreen(!!document.fullscreenElement);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("durationchange", onDur);
    v.addEventListener("progress", onBuf);
    v.addEventListener("ended", onEnd);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    document.addEventListener("fullscreenchange", onFS);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("durationchange", onDur);
      v.removeEventListener("progress", onBuf);
      v.removeEventListener("ended", onEnd);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      document.removeEventListener("fullscreenchange", onFS);
    };
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowControls(false);
    }, 3000);
  }, []);

  /* ── Controls ─────────────────────────────────── */
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
    resetHideTimer();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * duration;
    resetHideTimer();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
  };

  const changeVol = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    const val = parseFloat(e.target.value);
    if (v) { v.volume = val; v.muted = val === 0; }
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFS = async () => {
    if (!document.fullscreenElement) await containerRef.current?.requestFullscreen();
    else await document.exitFullscreen();
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  const progressPct = duration ? (progress / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const ctrlVisible = showControls || !playing;
  const hasSubs     = cues.length > 0;

  /* ── Subtitle style ───────────────────────────── */
  const subStyle: React.CSSProperties = {
    fontSize: `${subSettings.fontSize}rem`,
    color: subSettings.textColor,
    opacity: subSettings.textOpacity,
    backgroundColor: `rgba(0,0,0,${subSettings.bgOpacity})`,
  };

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden aspect-video group select-none ${className}`}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => playing && setShowControls(false)}
      onKeyDown={e => {
        if (e.code === "Space") { e.preventDefault(); togglePlay(); }
        if (e.code === "ArrowRight") { if (videoRef.current) videoRef.current.currentTime += 5; }
        if (e.code === "ArrowLeft")  { if (videoRef.current) videoRef.current.currentTime -= 5; }
      }}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={effectiveSrc}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFS}
        onLoadedMetadata={handleLoadedMetadata}
        playsInline
        preload="metadata"
      />

      {/* Floating quality change toast */}
      {qualityToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-950/90 text-white border border-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>{qualityToast}</span>
        </div>
      )}

      {/* Subtitle overlay */}
      {showSubs && currentCue && (
        <div
          className="absolute left-0 right-0 flex justify-center px-6 pointer-events-none"
          style={{
            bottom: ctrlVisible ? ((resolvedTitle || resolvedChannel) ? "118px" : "76px") : "16px",
            transition: "bottom 0.25s ease",
            zIndex: 20,
          }}
        >
          <span
            className="inline-block px-4 py-1.5 rounded-lg text-center leading-snug max-w-[88%]"
            style={subStyle}
          >
            {currentCue.text}
          </span>
        </div>
      )}

      {/* Subtitle settings panel */}
      {showPanel && hasSubs && (
        <SubPanel
          settings={subSettings}
          onChange={setSubSettings}
          onClose={() => setShowPanel(false)}
        />
      )}

      {/* Big play button */}
      {!playing && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
        >
          <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-all hover:scale-110 shadow-2xl">
            <Play className="w-8 h-8 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300"
        style={{ opacity: ctrlVisible ? 1 : 0, pointerEvents: ctrlVisible ? "auto" : "none" }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-none" />
        <div className="relative px-3.5 sm:px-6 pb-3 sm:pb-4 pt-14">
          {/* Video Title, Channel Name & Watermark (YouTube style) */}
          {(resolvedTitle || resolvedChannel) && (
            <div className="flex items-end justify-between gap-4 mb-2.5 sm:mb-3 select-none">
              <div className="min-w-0 flex-1">
                {resolvedTitle && (
                  <h3
                    className="text-white font-bold text-sm sm:text-base md:text-lg leading-snug line-clamp-1 drop-shadow-md tracking-tight"
                    title={resolvedTitle}
                  >
                    {resolvedTitle}
                  </h3>
                )}
                {resolvedChannel && (
                  <p className="text-white/70 text-xs sm:text-sm font-medium mt-0.5 line-clamp-1 drop-shadow">
                    {resolvedChannel}
                  </p>
                )}
              </div>
              <div className="flex-shrink-0 text-white/50 hover:text-white/80 transition-colors text-xs sm:text-sm font-semibold tracking-wide drop-shadow pb-0.5">
                Gapirai.uz
              </div>
            </div>
          )}

          {/* YouTube-style Red Progress Bar */}
          <div className="mb-2 sm:mb-3 cursor-pointer group/bar py-1.5" onClick={seek}>
            <div className="h-1 group-hover/bar:h-1.5 bg-white/25 rounded-full relative transition-all duration-100">
              <div className="absolute inset-y-0 left-0 bg-white/40 rounded-full" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-red-600 rounded-full transition-none" style={{ width: `${progressPct}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-red-600 rounded-full shadow-lg scale-0 group-hover/bar:scale-100 transition-transform"
                style={{ left: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white hover:text-red-500 transition flex-shrink-0 focus:outline-none"
              title={playing ? "Pauza (k)" : "Ijro (k)"}
            >
              {playing ? <Pause className="w-5 h-5" fill="currentColor" /> : <Play className="w-5 h-5" fill="currentColor" />}
            </button>

            {/* Skip 10s */}
            <button
              onClick={skipAhead}
              className="text-white/80 hover:text-white transition flex-shrink-0 focus:outline-none hidden xs:flex items-center"
              title="10 soniya oldinga (l)"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 flex-shrink-0 group/vol">
              <button
                onClick={toggleMute}
                className="text-white hover:text-red-500 transition focus:outline-none"
                title={muted ? "Ovozni yoqish (m)" : "Ovozni o'chirish (m)"}
              >
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={changeVol}
                className="w-16 sm:w-20 accent-red-600 cursor-pointer"
              />
            </div>

            {/* Time */}
            <span className="text-white/80 text-xs sm:text-sm font-mono ml-auto sm:ml-2 flex-shrink-0">
              {fmt(progress)} / {fmt(duration)}
            </span>

            {/* CC */}
            {hasSubs && (
              <button
                onClick={() => { setShowSubs(s => !s); setShowPanel(false); }}
                title="Subtitr yoqish/o'chirish"
                className="flex-shrink-0 hover:opacity-80 transition"
              >
                <CcIcon on={showSubs} />
              </button>
            )}

            {/* Subtitle settings gear */}
            {hasSubs && (
              <button
                onClick={() => { setShowPanel(p => !p); setShowQualityMenu(false); }}
                title="Subtitr sozlamalari"
                className={`flex-shrink-0 transition ${showPanel ? "text-blue-400" : "text-white/50 hover:text-white"}`}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Quality selector */}
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowQualityMenu(q => !q);
                  setShowPanel(false);
                }}
                title="Video sifati (360p, 720p, 1080p)"
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition flex items-center gap-1.5 select-none ${
                  showQualityMenu
                    ? "bg-blue-600 text-white border-blue-400 shadow-sm"
                    : "bg-white/10 hover:bg-white/20 text-white/90 border-white/20"
                }`}
              >
                <span>{currentQuality}</span>
                {currentQuality === "1080p" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </button>

              {/* Quality popover */}
              {showQualityMenu && (
                <div
                  className="absolute bottom-9 right-0 z-50 bg-slate-950/95 backdrop-blur-md border border-white/15 rounded-xl p-2 w-48 shadow-2xl text-white text-xs"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-white/10">
                    <span className="font-bold text-[10px] text-white/50 uppercase tracking-wider">Video sifati</span>
                    <button
                      onClick={() => setShowQualityMenu(false)}
                      className="text-white/40 hover:text-white transition text-xs leading-none"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {(resolutions.length > 0
                      ? resolutions
                      : [
                          { resolution: "1080p", available: true, status: "ready" },
                          { resolution: "720p", available: true, status: "ready" },
                          { resolution: "360p", available: true, status: "ready" },
                        ]
                    ).map(opt => {
                      const isCurrent = currentQuality === opt.resolution;
                      const isBusy = requestingRes === opt.resolution;
                      const label =
                        opt.resolution === "1080p"
                          ? "Full HD"
                          : opt.resolution === "720p"
                          ? "HD (Standart)"
                          : "SD (Tejamkor)";
                      return (
                        <button
                          key={opt.resolution}
                          onClick={() => handleSelectQuality(opt.resolution)}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition ${
                            isCurrent
                              ? "bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/30"
                              : "hover:bg-white/10 text-white/80"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-bold leading-tight">{opt.resolution}</span>
                            <span className="text-[10px] text-white/50">{label}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            ) : !opt.available ? (
                              <Lock className="w-3.5 h-3.5 text-white/40" />
                            ) : isCurrent ? (
                              <Check className="w-4 h-4 text-blue-400" />
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Audio download */}
            {audioDownloadUrl && (
              <a
                href={audioDownloadUrl}
                download
                title="Audio yuklab olish (MP3)"
                className="flex-shrink-0 text-white/50 hover:text-white transition"
                onClick={e => e.stopPropagation()}
              >
                <HeadphonesIcon />
              </a>
            )}

            {/* Theater mode — faqat onTheaterToggle berilgan bo'lsa */}
            {onTheaterToggle && (
              <button
                onClick={onTheaterToggle}
                title={theaterMode ? "Oddiy ko'rinish" : "Keng ekran (Theater)"}
                className="flex-shrink-0 text-white/50 hover:text-white transition"
              >
                {theaterMode
                  ? <Rows3 className="w-5 h-5" />
                  : <RectangleHorizontal className="w-5 h-5" />}
              </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFS} className="text-white hover:text-blue-400 transition flex-shrink-0">
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
