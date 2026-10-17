"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CreditCard, X, Play, Clock, CheckCircle2 } from "lucide-react";
import type { VideoInfo } from "@/lib/api";

interface Props {
  isOpen: boolean;
  videoInfo?: VideoInfo | null;
  videoMinutes?: number;
  minutesShort?: number;
  availableMinutes?: number;
  loading?: boolean;
  onClose: () => void;
  onStartPreview: () => void;
  onGoToPricing: () => void;
}

export default function PreviewOfferModal({
  isOpen,
  videoInfo,
  videoMinutes = 15,
  minutesShort = 10,
  availableMinutes = 5,
  loading = false,
  onClose,
  onStartPreview,
  onGoToPricing,
}: Props) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="relative w-full max-w-lg bg-white dark:bg-[#0c0a13] rounded-[32px] p-6 sm:p-8 shadow-2xl border border-violet-500/20 overflow-hidden"
        >
          {/* Background Glow */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-60 h-60 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition text-gray-500 dark:text-gray-400"
            aria-label="Yopish"
          >
            <X size={16} />
          </button>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 text-[11px] font-black uppercase tracking-wider mb-4 border border-violet-500/20">
            <Sparkles size={13} className="text-violet-500 animate-pulse" />
            Maxsus Sinov Taklifi
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight mb-2">
            Video davomiyligi balansingizdan uzun
          </h3>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-5">
            Ushbu video taxminan <strong className="text-slate-900 dark:text-white">{Math.round(videoMinutes)} daqiqa</strong>.
            Sizning hisobingizda esa bepul <strong className="text-slate-900 dark:text-white">{availableMinutes} daqiqa</strong> mavjud.
          </p>

          {/* Video Preview Snippet */}
          {videoInfo && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/5 dark:border-white/10 mb-5">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="w-16 h-10 object-cover rounded-xl shadow-sm flex-shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {videoInfo.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400 font-medium">
                  <span className="flex items-center gap-0.5">
                    <Clock size={10} />
                    {Math.round(videoMinutes)} daqiqa
                  </span>
                  <span>•</span>
                  <span>{videoInfo.uploader}</span>
                </div>
              </div>
            </div>
          )}

          {/* Free 2-Minute Preview Highlight Box */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-blue-500/10 border border-violet-500/30 mb-6 space-y-2">
            <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300 font-extrabold text-xs sm:text-sm">
              <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
              Dastlabki 2 daqiqasini MUTLAQO BEPUL dublyaj qilib beramiz!
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-6">
              GapirAI ovoz sifati va o'zbekcha tarjimasiga ishonch hosil qilishingiz uchun ushbu videoning eng muhim dastlabki qismini darhol bepul sinab ko'ring.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={loading}
              onClick={onStartPreview}
              className="w-full flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl btn-premium text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-violet-500/25 transition disabled:opacity-50"
            >
              <Play size={16} className="fill-current" />
              {loading ? "Jarayon boshlanmoqda..." : "✨ Dastlabki 2 daqiqasini bepul dublyaj qilish"}
            </button>

            <button
              type="button"
              onClick={onGoToPricing}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.07] dark:hover:bg-white/[0.08] text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm border border-black/5 dark:border-white/10 transition"
            >
              <CreditCard size={15} className="text-violet-500" />
              Butun videoni to'liq dublyaj qilish (Tariflar)
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition font-medium"
              >
                Boshqa qisqaroq video tanlash
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
