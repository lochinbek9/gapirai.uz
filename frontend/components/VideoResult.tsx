"use client";

import { Download, RotateCcw, ChevronDown, CheckCircle2, Share2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Job, getDownloadUrl, formatDuration } from "@/lib/api";
import { useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";

interface Props {
  job: Job;
  onReset: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function VideoResult({ job, onReset }: Props) {
  const [showText, setShowText] = useState(false);
  const videoUrl = `${API_BASE}${job.output_video_url}`;
  const downloadUrl = getDownloadUrl(job.job_id);

  return (
    <div className="space-y-6">
      {/* ── Success Header ────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 bg-green-500/10 border border-green-500/20 rounded-3xl px-6 py-4 transition-colors"
      >
        <div className="relative">
           <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-500 transition-colors" strokeWidth={2.5} />
           <motion.div 
             className="absolute inset-0 bg-green-500 rounded-full blur-lg opacity-20"
             animate={{ scale: [1, 1.5, 1] }}
             transition={{ duration: 2, repeat: Infinity }}
           />
        </div>
        <div>
          <h3 className="text-sm font-black text-green-600 dark:text-green-400 uppercase tracking-widest transition-colors">Dublyaj Tayyor!</h3>
          <p className="text-[11px] text-green-600/60 dark:text-green-400/60 font-medium transition-colors">Video muvaffaqiyatli qayta ishlandi</p>
        </div>
      </motion.div>

      {/* ── Video Player ──────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl overflow-hidden shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
      >
        <VideoPlayer
          key={videoUrl}
          src={videoUrl}
          subtitlesContent={job.uzbek_srt_content}
          className="rounded-3xl"
        />
      </motion.div>

      {/* ── Info & Actions ────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-6 px-1">
          <div className="space-y-1">
            <h4 className="text-base font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight transition-colors">
              {job.video_title || "Dublyaj qilingan video"}
            </h4>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase transition-colors">Davomiyligi</span>
               <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 transition-colors">{formatDuration(job.video_duration || 0)}</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-3 bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.05] rounded-2xl hover:bg-black/10 dark:hover:bg-white/[0.08] transition-colors"
              title="Ulashish"
            >
              <Share2 size={18} className="text-gray-500 transition-colors" />
            </motion.button>
          </div>
        </div>

        <motion.a
          href={downloadUrl}
          download
          whileHover={{ y: -2 }}
          whileTap={{ y: 0 }}
          className="btn-premium w-full flex items-center justify-center gap-3
                     bg-gradient-to-r from-blue-600 to-indigo-600 
                     text-white font-bold py-5 rounded-[24px]
                     transition-all duration-300 text-sm shadow-xl shadow-blue-900/40"
        >
          <Download size={18} />
          Videoni yuklab olish
        </motion.a>
      </div>

      {/* ── Translation Text Accordion ────────────── */}
      {job.translated_text && (
        <div className="glass-input rounded-2xl overflow-hidden border border-black/5 dark:border-white/[0.03] transition-colors">
          <button 
            onClick={() => setShowText(!showText)}
            className="w-full flex items-center justify-between px-6 py-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
               <div className="w-1 h-1 rounded-full bg-blue-500"></div>
               <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest transition-colors">O'zbekcha matn</span>
            </div>
            <ChevronDown 
              size={14} 
              className={`text-gray-400 dark:text-gray-600 transition-transform duration-300 ${showText ? "rotate-180" : ""}`} 
            />
          </button>
          
          <AnimatePresence>
            {showText && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-6 pb-6 pt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-h-48 overflow-y-auto">
                   <p className="whitespace-pre-wrap transition-colors">{job.translated_text}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Reset Button ──────────────────────────── */}
      <motion.button
        onClick={onReset}
        whileHover={{ scale: 1.01 }}
        className="w-full flex items-center justify-center gap-3
                   py-4 rounded-[22px] border border-black/5 dark:border-white/[0.04]
                   text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.02] dark:hover:bg-white/[0.02]
                   transition-all duration-300 text-[11px] font-bold uppercase tracking-widest"
      >
        <RotateCcw size={14} />
        Yangi video dublyaj qilish
      </motion.button>
    </div>
  );
}
