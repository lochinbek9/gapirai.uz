"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Copy, Check, Play, Globe, Download, ArrowDownCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface CueItem {
  start: number;
  end: number;
  text: string;
  origText?: string;
}

interface Props {
  cues: CueItem[];
  currentTime: number;
  onSeek: (seconds: number) => void;
  videoTitle?: string;
  jobId?: string;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function InteractiveTranscript({
  cues,
  currentTime,
  onSeek,
  videoTitle,
  jobId,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [mode, setMode] = useState<"uz" | "bilingual">("uz");
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement | null>(null);

  // Filter cues by search query
  const filteredCues = useMemo(() => {
    if (!searchQuery.trim()) return cues;
    const q = searchQuery.toLowerCase();
    return cues.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        (c.origText && c.origText.toLowerCase().includes(q))
    );
  }, [cues, searchQuery]);

  // Find currently active cue index
  const activeIndex = useMemo(() => {
    return filteredCues.findIndex(
      (c) => currentTime >= c.start && currentTime <= c.end + 0.3
    );
  }, [filteredCues, currentTime]);

  // Auto-scroll to active cue if enabled
  useEffect(() => {
    if (!autoScroll || activeIndex < 0 || !activeItemRef.current || !listRef.current) return;
    const container = listRef.current;
    const el = activeItemRef.current;
    const top = el.offsetTop - container.offsetTop - 60;
    container.scrollTo({ top, behavior: "smooth" });
  }, [activeIndex, autoScroll]);

  // Copy full transcript text
  const handleCopyAll = async () => {
    const fullText = cues
      .map((c) => `[${formatTime(c.start)}] ${c.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const hasBilingual = useMemo(() => cues.some((c) => !!c.origText), [cues]);

  if (!cues || cues.length === 0) return null;

  return (
    <div className="glass-card rounded-[24px] p-4 sm:p-6 border border-black/5 dark:border-white/10 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs">
            <Play size={14} className="fill-blue-500" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
              <span>Interaktiv Transkript</span>
              <span className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                {cues.length} ta gap
              </span>
            </h4>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Kerakli gapni bosing — video o&apos;sha daqiqadan ijro etiladi
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasBilingual && (
            <button
              onClick={() => setMode(mode === "uz" ? "bilingual" : "uz")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                mode === "bilingual"
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-600 dark:text-blue-400"
                  : "bg-black/5 dark:bg-white/5 border-transparent text-gray-600 dark:text-gray-400"
              }`}
              title="Ikki tilli ko'rinish"
            >
              <Globe size={13} />
              <span className="text-[11px]">Bilingual</span>
            </button>
          )}

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              autoScroll
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-black/5 dark:bg-white/5 border-transparent text-gray-500 dark:text-gray-400"
            }`}
            title="Sinxron skroll qilish"
          >
            <ArrowDownCircle size={13} />
            <span className="text-[11px]">{autoScroll ? "Sinxron ON" : "Sinxron OFF"}</span>
          </button>

          <button
            onClick={handleCopyAll}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition flex items-center gap-1.5"
            title="Matndan nusxa olish"
          >
            {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
            <span className="text-[11px]">{copied ? "Nusxalandi" : "Nusxalash"}</span>
          </button>

          {jobId && (
            <a
              href={`/api/jobs/${jobId}/subtitles.txt`}
              download
              className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 transition flex items-center gap-1"
              title=".txt formatida yuklab olish"
            >
              <Download size={13} />
              <span className="text-[11px] hidden xs:inline">.TXT</span>
            </a>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Transkript bo'yicha so'z qidirish..."
          className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Transcript List */}
      <div
        ref={listRef}
        className="max-h-72 sm:max-h-84 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar"
      >
        {filteredCues.map((cue, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={`${cue.start}-${idx}`}
              ref={isActive ? activeItemRef : null}
              onClick={() => onSeek(cue.start)}
              className={`w-full text-left p-2.5 sm:p-3 rounded-2xl transition-all duration-200 flex items-start gap-3 group relative ${
                isActive
                  ? "bg-blue-500/15 dark:bg-blue-500/20 border border-blue-500/30 shadow-sm"
                  : "hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
              }`}
            >
              {/* Timestamp Badge */}
              <span
                className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 transition-colors ${
                  isActive
                    ? "bg-blue-500 text-white shadow-sm shadow-blue-500/30"
                    : "bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400 group-hover:text-blue-500 group-hover:bg-blue-500/10"
                }`}
              >
                {formatTime(cue.start)}
              </span>

              {/* Text content */}
              <div className="flex-1 min-w-0 space-y-0.5">
                <p
                  className={`text-xs sm:text-[13px] leading-relaxed transition-colors ${
                    isActive
                      ? "text-blue-900 dark:text-blue-100 font-semibold"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {cue.text}
                </p>

                {mode === "bilingual" && cue.origText && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 italic leading-snug">
                    {cue.origText}
                  </p>
                )}
              </div>
            </button>
          );
        })}

        {filteredCues.length === 0 && (
          <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">
            &ldquo;{searchQuery}&rdquo; so&apos;zi bo&apos;yicha hech narsa topilmadi
          </div>
        )}
      </div>
    </div>
  );
}
