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
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/75 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: "spring", duration: 0.4 }}
          className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-ui-surface rounded-2xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl border border-ui-rule overflow-hidden my-auto"
        >
          {/* Background Glow */}

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-ui-ground hover:bg-black/10 dark:hover:bg-white/15 transition text-ui-muted z-10"
            aria-label="Yopish"
          >
            <X aria-hidden="true" size={15} />
          </button>

          <div className="overflow-y-auto pr-0.5 space-y-3">
            {/* Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs sm:text-[11px] font-semibold border border-blue-500/20">
              <Sparkles aria-hidden="true" size={12} className="text-blue-500 animate-pulse" />
              Maxsus Sinov Taklifi
            </div>

            <div>
              <h3 className="text-lg sm:text-xl font-semibold text-ui-ink leading-snug">
                Video davomiyligi balansingizdan uzun
              </h3>
              <p className="text-xs text-ui-muted mt-1 leading-relaxed">
                Ushbu video taxminan <strong className="text-ui-ink">{Math.round(videoMinutes)} daqiqa</strong>.
                Sizning hisobingizda esa bepul <strong className="text-ui-ink">{availableMinutes} daqiqa</strong> mavjud.
              </p>
            </div>

            {/* Video Preview Snippet */}
            {videoInfo && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-ui-ground border border-ui-rule">
                {videoInfo.thumbnail && (
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-14 h-9 object-cover rounded-lg shadow-sm flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-ui-ink truncate">
                    {videoInfo.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-ui-muted font-medium">
                    <span className="flex items-center gap-0.5">
                      <Clock aria-hidden="true" size={10} />
                      {Math.round(videoMinutes)} daqiqa
                    </span>
                    <span>•</span>
                    <span className="truncate">{videoInfo.uploader}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Free 2-Minute Preview Highlight Box */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-1">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-xs sm:text-sm">
                <CheckCircle2 aria-hidden="true" size={15} className="text-emerald-500 flex-shrink-0" />
                Dastlabki 2 daqiqasini MUTLAQO BEPUL dublyaj qilib beramiz!
              </div>
              <p className="text-xs text-ui-muted leading-relaxed pl-5">
                GapirAI ovoz sifati va o'zbekcha tarjimasiga ishonch hosil qilishingiz uchun ushbu videoning eng muhim dastlabki qismini darhol bepul sinab ko'ring.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={onStartPreview}
                className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl btn-premium text-white font-semibold text-xs sm:text-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Play aria-hidden="true" size={14} className="fill-current" />
                {loading ? "Jarayon boshlanmoqda..." : "Dastlabki 2 daqiqasini bepul dublyaj qilish"}
              </button>

              <button
                type="button"
                onClick={onGoToPricing}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-ui-ground hover:bg-black/[0.07] dark:hover:bg-white/[0.08] text-ui-ink font-semibold text-xs border border-ui-rule transition cursor-pointer"
              >
                <CreditCard aria-hidden="true" size={14} className="text-blue-500" />
                Butun videoni to'liq dublyaj qilish (Tariflar)
              </button>

              <div className="text-center pt-0.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-xs text-ui-muted hover:text-gray-600 dark:hover:text-gray-300 transition font-medium cursor-pointer"
                >
                  Boshqa qisqaroq video tanlash
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
