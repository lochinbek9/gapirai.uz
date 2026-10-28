"use client";

import { CheckCircle2, Copy, Download, FileText, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { Job, getSubtitleDownloadUrl, getCapcutPackageUrl } from "@/lib/api";
import { useState } from "react";

interface Props {
  job: Job;
  onReset: () => void;
}

/** "Subtitr" rejimining natija ko'rinishi -- dublyaj audiosi/videosi yo'q
 * (subtitle_only=true), shuning uchun VideoResult (pleer, rezolyutsiya
 * tugmalari) o'rniga faqat .srt/.vtt/.txt yuklab olish + tarjima matnini
 * ko'rsatadi (2026-09-16; .vtt yuklab olish va .txt -- 2026-09-20). */
export default function SubtitleResult({ job, onReset }: Props) {
  const [showText, setShowText] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    if (!job.translated_text) return;
    try {
      await navigator.clipboard.writeText(job.translated_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-control border border-ui-green/30 bg-ui-green/[0.06] px-4 py-3"
      >
        <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-ui-green-ink" />
        <div>
          <h3 className="text-[15px] font-semibold text-ui-ink">Subtitr tayyor!</h3>
          <p className="text-sm text-ui-muted">
            {job.video_title || "Video"}
          </p>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-3">
        <a
          href={getSubtitleDownloadUrl(job.job_id, "srt")}
          className="ui-btn ui-btn-primary min-h-20 w-full flex-col"
        >
          <Download className="w-5 h-5" />
          .SRT
        </a>
        <a
          href={getSubtitleDownloadUrl(job.job_id, "vtt")}
          className="ui-btn ui-btn-secondary min-h-20 w-full flex-col"
        >
          <Download className="w-5 h-5" />
          .VTT
        </a>
        <a
          href={getSubtitleDownloadUrl(job.job_id, "txt")}
          className="ui-btn ui-btn-secondary min-h-20 w-full flex-col"
        >
          <FileText className="w-5 h-5" />
          .TXT (matn)
        </a>
      </div>
      <p className="-mt-3 text-xs text-ui-muted text-center">
        .SRT/.VTT — vaqt kodli subtitr (pleer va montaj dasturlari uchun); .TXT — faqat matn.{" "}
        <a href={getCapcutPackageUrl(job.job_id)} download className="font-semibold text-ui-ink underline underline-offset-2">
          CapCut uchun (qoʻllanma bilan)
        </a>
      </p>

      {job.translated_text && (
        <div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowText((v) => !v)}
              className="text-xs font-semibold text-ui-muted hover:text-ui-ink transition"
            >
              {showText ? "Matnni yashirish" : "Matnni ko'rsatish"}
            </button>
            <button
              onClick={copyText}
              className="inline-flex items-center gap-1 text-xs font-semibold text-ui-muted hover:text-ui-ink transition"
            >
              <Copy className="w-3 h-3" />
              {copied ? "Nusxalandi" : "Matnni nusxalash"}
            </button>
          </div>
          {showText && (
            <p className="mt-3 text-sm text-ui-muted leading-relaxed whitespace-pre-line rounded-2xl bg-ui-ground p-4 max-h-64 overflow-y-auto">
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
