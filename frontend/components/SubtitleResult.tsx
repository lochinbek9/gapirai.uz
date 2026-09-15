"use client";

import { CheckCircle2, Download, FileText, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { Job, getSubtitleDownloadUrl } from "@/lib/api";
import { useState } from "react";

interface Props {
  job: Job;
  onReset: () => void;
}

/** "Subtitr" rejimining natija ko'rinishi -- dublyaj audiosi/videosi yo'q
 * (subtitle_only=true), shuning uchun VideoResult (pleer, rezolyutsiya
 * tugmalari) o'rniga faqat .srt/.vtt yuklab olish + tarjima matnini
 * ko'rsatadi (2026-09-16). */
export default function SubtitleResult({ job, onReset }: Props) {
  const [showText, setShowText] = useState(false);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl px-6 py-4 transition-colors"
      >
        <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-500 transition-colors shrink-0" strokeWidth={2.5} />
        <div>
          <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest transition-colors">Subtitr tayyor!</h3>
          <p className="text-[11px] text-emerald-600/60 dark:text-emerald-400/60 font-medium transition-colors">
            {job.video_title || "Video"}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3">
        <a
          href={getSubtitleDownloadUrl(job.job_id, "srt")}
          className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold text-sm hover:opacity-90 transition"
        >
          <Download className="w-5 h-5" />
          .SRT yuklab olish
        </a>
        <a
          href={getSubtitleDownloadUrl(job.job_id, "vtt")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border border-black/10 dark:border-white/10 text-gray-700 dark:text-gray-200 font-bold text-sm hover:bg-black/5 dark:hover:bg-white/5 transition"
        >
          <FileText className="w-5 h-5" />
          .VTT ko'rish
        </a>
      </div>

      {job.translated_text && (
        <div>
          <button
            onClick={() => setShowText((v) => !v)}
            className="text-xs font-bold text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition"
          >
            {showText ? "Tarjima matnini yashirish" : "Tarjima matnini ko'rsatish"}
          </button>
          {showText && (
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line rounded-2xl bg-black/[0.03] dark:bg-white/[0.03] p-4 max-h-64 overflow-y-auto">
              {job.translated_text}
            </p>
          )}
        </div>
      )}

      <motion.button
        onClick={onReset}
        whileHover={{ scale: 1.01 }}
        className="w-full flex items-center justify-center gap-3
                   py-4 rounded-[22px] border border-black/5 dark:border-white/[0.04]
                   text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.02] dark:hover:bg-white/[0.02]
                   transition-all duration-300 text-[11px] font-bold uppercase tracking-widest"
      >
        <RotateCcw size={14} />
        Yangi subtitr yaratish
      </motion.button>
    </div>
  );
}
