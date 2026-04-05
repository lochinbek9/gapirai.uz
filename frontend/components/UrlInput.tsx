"use client";

import { ClipboardPaste, Loader2, Sparkles, Youtube } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoInfo, formatDuration } from "@/lib/api";

interface Props {
  url: string;
  videoInfo: VideoInfo | null;
  loading: boolean;
  error: string | null;
  onChange: (value: string) => void;
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
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 to-transparent"></div>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold leading-tight text-gray-900 dark:text-white line-clamp-2 transition-colors">
          {info.title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase transition-colors">{info.uploader}</span>
          <span className="w-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700"></span>
          <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 transition-colors">{formatDuration(info.duration)}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function UrlInput({
  url,
  videoInfo,
  loading,
  error,
  onChange,
  onSubmit,
}: Props) {

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch { /* Clipboard access denied */ }
  };

  const hasContent = url.trim().length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1 transition-colors">
          YouTube Havolasi
        </label>
        <div className="glass-input flex items-center gap-3 px-5 py-4 rounded-3xl relative overflow-hidden group transition-all duration-300">
          <Youtube className="w-6 h-6 text-red-500 flex-shrink-0 group-focus-within:scale-110 transition-transform duration-300" />
          <input
            type="text"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder="YouTube havolasini kiriting..."
            className="flex-1 bg-transparent text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-600 text-sm focus:outline-none font-medium transition-colors"
            style={{ color: 'black' }}
          />
          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300
                       bg-blue-500/10 hover:bg-blue-500/20 rounded-xl px-4 py-2 transition-all active:scale-95"
          >
            <ClipboardPaste size={14} />
            <span className="hidden sm:inline">Paste</span>
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {videoInfo && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 24 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <VideoPreview info={videoInfo} />
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex gap-3 items-center"
        >
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 transition-colors">{error}</p>
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={loading || !hasContent}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="btn-premium w-full flex items-center justify-center gap-3
                   bg-gradient-to-r from-blue-600 to-indigo-600 
                   hover:from-blue-500 hover:to-indigo-500
                   disabled:from-gray-300 disabled:to-gray-200 dark:disabled:from-gray-800 dark:disabled:to-gray-800 disabled:opacity-50
                   text-white font-bold py-5 rounded-[24px]
                   transition-all duration-300 text-sm shadow-xl shadow-blue-900/20"
      >
        {loading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            Vazifa yaratilmoqda...
          </>
        ) : (
          <>
            <Sparkles size={18} />
            Dublyajni boshlash
          </>
        )}
      </motion.button>

      <div className="flex justify-center gap-8 pt-2">
        {[
          { label: "100% Avtomat", active: true },
          { label: "HD Sifat", active: true },
          { label: "O'zbek tilida", active: true }
        ].map((badge, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-500"></div>
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-tighter transition-colors">{badge.label}</span>
          </div>
        ))}
      </div>
    </form>
  );
}
