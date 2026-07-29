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
  onChange: (value: string) => void;
  onGenderChange: (gender: string) => void;
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

export default function UrlInput({
  url, videoInfo, loading, error, voiceGender,
  onChange, onGenderChange, onSubmit,
}: Props) {

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {}
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* URL input */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest ml-1">
          YouTube Havolasi
        </label>
        <div className="glass-input flex items-center gap-3 px-5 py-4 rounded-3xl relative overflow-hidden group transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-rose-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" />
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
            className="flex items-center gap-2 text-[11px] font-bold text-red-600 dark:text-red-400 hover:text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-xl px-4 py-2 transition-all"
          >
            <ClipboardPaste size={14} />
            <span className="hidden sm:inline">Nusxani qo'yish</span>
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

      {/* Sample Video Suggestions */}
      <div className="pt-1 space-y-1.5">
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">
          💡 Namuna havolalardan birini sinab ko'ring:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange("https://youtu.be/UwMS0J2eTXE")}
            className="text-[11px] font-medium px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-red-500/10 hover:text-red-500 border border-black/5 dark:border-white/5 transition-all text-gray-600 dark:text-gray-400 flex items-center gap-1.5"
          >
            <span>🎯</span> Qo'rquvni yengish (58s)
          </button>
        </div>
      </div>

      {/* Gender selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest ml-1">
          Ovoz jinsi
        </label>
        <div className="grid grid-cols-3 gap-3">
          {GENDER_OPTIONS.map((opt) => {
            const isSelected = voiceGender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onGenderChange(opt.value)}
                className={`flex flex-col items-center gap-1.5 py-4 px-3 rounded-2xl border text-center transition-all duration-300 relative overflow-hidden ${
                  isSelected
                    ? "border-red-500 bg-gradient-to-b from-red-500/10 to-red-500/20 dark:from-red-500/20 dark:to-red-500/30 shadow-lg shadow-red-500/10"
                    : "border-black/5 dark:border-white/5 hover:border-red-400/40 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-red-500 via-rose-500 to-pink-500" />
                )}
                <span className="text-2xl filter drop-shadow-md">{opt.icon}</span>
                <span className={`text-xs font-bold transition-colors duration-200 ${isSelected ? "text-red-600 dark:text-red-400 font-extrabold" : "text-gray-700 dark:text-gray-300"}`}>
                  {opt.label}
                </span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">{opt.desc}</span>
              </button>
            );
          })}
        </div>
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
                   btn-premium disabled:from-gray-300 disabled:to-gray-200 dark:disabled:from-gray-800 dark:disabled:to-gray-800 disabled:opacity-50 disabled:pointer-events-none
                   text-white font-extrabold py-5 rounded-[24px]
                   transition-all duration-300 text-sm shadow-xl"
      >
        {loading ? (
          <><Loader2 size={18} className="animate-spin" /> Vazifa yaratilmoqda...</>
        ) : (
          <><Sparkles size={18} /> Dublyajni boshlash</>
        )}
      </motion.button>

      <div className="flex justify-center gap-8 pt-2">
        {["100% Avtomat", "HD Sifat", "O'zbek tilida"].map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-tighter">{label}</span>
          </div>
        ))}
      </div>
    </form>
  );
}
