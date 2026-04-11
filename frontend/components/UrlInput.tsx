"use client";

import { ClipboardPaste, Loader2, Sparkles, Youtube } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoInfo, formatDuration } from "@/lib/api";

interface Props {
  url: string;
  videoInfo: VideoInfo | null;
  loading: boolean;
  error: string | null;
  voiceGender: string;
  quality: string;
  onChange: (value: string) => void;
  onGenderChange: (gender: string) => void;
  onQualityChange: (quality: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function VideoPreview({ info }: { info: VideoInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex gap-4 items-center bg-black/5 dark:bg-white/[0.03] rounded-2xl p-4 border border-black/5 dark:border-white/[0.05] shadow-inner transition-colors duration-300"
    >
      {info.thumbnail && (
        <div className="relative flex-shrink-0">
          <img
            src={info.thumbnail}
            alt={info.title}
            className="w-24 h-14 object-cover rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10"
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold leading-tight text-gray-900 dark:text-white line-clamp-2 transition-colors">
          {info.title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">{info.uploader}</span>
          <span className="w-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
          <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">{formatDuration(info.duration)}</span>
        </div>
      </div>
    </motion.div>
  );
}

const GENDER_OPTIONS = [
  { value: "auto",   label: "Avtomatik", icon: "🤖", desc: "AI aniqlaydi" },
  { value: "male",   label: "Erkak",     icon: "👨", desc: "Sardor ovozi" },
  { value: "female", label: "Ayol",      icon: "👩", desc: "Madina ovozi" },
];

const QUALITY_OPTIONS = [
  {
    value: "fast",
    label: "Tez",
    icon: "⚡",
    desc: "~1.5× vaqt",
    color: "amber",
    tip: "Oddiy sifat, tez natija",
    multiplier: 1.5,
  },
  {
    value: "standard",
    label: "Standart",
    icon: "⭐",
    desc: "~3× vaqt",
    color: "blue",
    tip: "Yaxshi sifat va tezlik",
    multiplier: 3,
  },
  {
    value: "hd",
    label: "HD",
    icon: "💎",
    desc: "~5× vaqt",
    color: "purple",
    tip: "Eng yuqori sifat",
    multiplier: 5,
  },
];

function fmtMin(seconds: number, multiplier: number): string {
  const mins = Math.ceil((seconds / 60) * multiplier);
  if (mins < 1) return "< 1 daq";
  return `~${mins} daq`;
}

export default function UrlInput({
  url, videoInfo, loading, error, voiceGender, quality,
  onChange, onGenderChange, onQualityChange, onSubmit,
}: Props) {

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {}
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* URL input */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">
          YouTube Havolasi
        </label>
        <div className="glass-input flex items-center gap-3 px-5 py-4 rounded-3xl relative overflow-hidden group transition-all duration-300">
          <Youtube className="w-6 h-6 text-red-500 flex-shrink-0" />
          <input
            type="text"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder="YouTube havolasini kiriting..."
            className="flex-1 bg-transparent text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-600 text-sm focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl px-4 py-2 transition-all"
          >
            <ClipboardPaste size={14} />
            <span className="hidden sm:inline">Paste</span>
          </button>
        </div>
      </div>

      {/* Video preview */}
      <AnimatePresence mode="wait">
        {videoInfo && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <VideoPreview info={videoInfo} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gender selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">
          Ovoz jinsi
        </label>
        <div className="grid grid-cols-3 gap-2">
          {GENDER_OPTIONS.map((opt) => {
            const isSelected = voiceGender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onGenderChange(opt.value)}
                className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border text-center transition-all duration-200 ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/10 dark:bg-blue-500/20"
                    : "border-black/10 dark:border-white/10 hover:border-blue-400/40 bg-black/3 dark:bg-white/3"
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className={`text-xs font-bold ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"}`}>
                  {opt.label}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quality selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">
          Dublyaj sifati
        </label>
        <div className="grid grid-cols-3 gap-2">
          {QUALITY_OPTIONS.map((opt) => {
            const isSelected = quality === opt.value;
            const timeEst = videoInfo?.duration
              ? fmtMin(videoInfo.duration, opt.multiplier)
              : opt.desc;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onQualityChange(opt.value)}
                className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border text-center transition-all duration-200 ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10 dark:bg-indigo-500/20"
                    : "border-black/10 dark:border-white/10 hover:border-indigo-400/40"
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className={`text-xs font-bold ${isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-gray-700 dark:text-gray-300"}`}>
                  {opt.label}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">{timeEst}</span>
              </button>
            );
          })}
        </div>
        {/* Tanlangan sifat haqida qisqa izoh */}
        <p className="text-[10px] text-gray-400 dark:text-gray-600 text-center mt-1">
          {QUALITY_OPTIONS.find(o => o.value === quality)?.tip}
        </p>
      </div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 items-center"
        >
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
        </motion.div>
      )}

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={loading || !url.trim()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-3
                   bg-gradient-to-r from-blue-600 to-indigo-600
                   hover:from-blue-500 hover:to-indigo-500
                   disabled:from-gray-300 disabled:to-gray-200 dark:disabled:from-gray-800 dark:disabled:to-gray-800 disabled:opacity-50
                   text-white font-bold py-5 rounded-[24px]
                   transition-all duration-300 text-sm shadow-xl shadow-blue-900/20"
      >
        {loading ? (
          <><Loader2 size={18} className="animate-spin" /> Vazifa yaratilmoqda...</>
        ) : (
          <><Sparkles size={18} /> Dublyajni boshlash</>
        )}
      </motion.button>

      <div className="flex justify-center gap-8 pt-1">
        {["100% Avtomat", "HD Sifat", "O'zbek tilida"].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-500" />
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-tighter">{label}</span>
          </div>
        ))}
      </div>
    </form>
  );
}
