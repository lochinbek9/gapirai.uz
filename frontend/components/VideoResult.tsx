"use client";

import { Download, RotateCcw, ChevronDown, CheckCircle2, Share2, Check, ShieldAlert, Send, Sparkles, Copy, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Job, getDownloadUrl, getVideoUrl, formatDuration, getJobSummary, JobSummaryResponse } from "@/lib/api";
import { useState, useEffect, useRef, useMemo } from "react";
import VideoPlayer, { VideoPlayerHandle } from "@/components/VideoPlayer";
import InteractiveTranscript, { CueItem } from "@/components/InteractiveTranscript";

interface Props {
  job: Job;
  onReset: () => void;
}

export default function VideoResult({ job, onReset }: Props) {
  const [showText, setShowText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [summaryData, setSummaryData] = useState<JobSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const playerRef = useRef<VideoPlayerHandle>(null);

  const videoUrl = getVideoUrl(job.job_id);
  const downloadUrl = getDownloadUrl(job.job_id);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 120, behavior: "smooth" });
    }
  }, []);

  // Fetch AI Summary and Key Takeaways
  useEffect(() => {
    if (job?.job_id && (job.translated_text || job.transcript_text || job.linked_analysis_id)) {
      setSummaryLoading(true);
      getJobSummary(job.job_id)
        .then((res) => {
          if (res?.summary || (res?.key_points && res.key_points.length > 0)) {
            setSummaryData(res);
          }
        })
        .catch(() => {})
        .finally(() => setSummaryLoading(false));
    }
  }, [job?.job_id, job?.translated_text, job?.transcript_text, job?.linked_analysis_id]);

  // Parse WebVTT subtitles into cues for InteractiveTranscript
  const cues = useMemo<CueItem[]>(() => {
    if (!job.uzbek_srt_content) {
      if (job.translated_text) {
        return [{ start: 0, end: job.video_duration || 60, text: job.translated_text }];
      }
      return [];
    }
    const out: CueItem[] = [];
    const vttToSec = (t: string) =>
      t.trim().split(":").reduce((a, p) => a * 60 + parseFloat(p.replace(",", ".")), 0);
    for (const blk of job.uzbek_srt_content.replace(/\r/g, "").split(/\n\n+/)) {
      const lines = blk.trim().split("\n");
      const ti = lines.findIndex((l) => l.includes("-->"));
      if (ti < 0) continue;
      const [s, e] = lines[ti].split(" --> ");
      const text = lines.slice(ti + 1).filter((l) => l.trim()).join(" ");
      if (text) out.push({ start: vttToSec(s), end: vttToSec(e), text });
    }
    return out;
  }, [job.uzbek_srt_content, job.translated_text, job.video_duration]);

  const handleSeek = (sec: number) => {
    playerRef.current?.seekTo(sec);
  };

  const handleCopySummary = async () => {
    if (!summaryData) return;
    const parts = [];
    if (summaryData.summary) parts.push(`📌 Xulosa:\n${summaryData.summary}`);
    if (summaryData.key_points && summaryData.key_points.length > 0) {
      parts.push(`💡 Asosiy fikrlar:\n${summaryData.key_points.map((p, i) => `${i + 1}. ${p}`).join("\n")}`);
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      setSummaryCopied(true);
      setTimeout(() => setSummaryCopied(false), 2000);
    } catch {}
  };

  const handleShare = async () => {
    const shareUrl = typeof window !== "undefined"
      ? `${window.location.origin}/video/${job.job_id}`
      : "";
    const title = job.video_title || "Dublyaj qilingan video";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: "GapirAI.uz orqali o'zbek tiliga dublyaj qilingan videoni ko'ring!",
          url: shareUrl || window.location.href,
        });
        return;
      } catch (err) {
        // User canceled or web share failed, fallback to copy
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl || window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch (err) {
        console.error("Clipboard copy failed:", err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Success Header ────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl px-6 py-4 transition-colors"
      >
        <div className="relative">
           <CheckCircle2 aria-hidden="true" className="w-8 h-8 text-emerald-600 dark:text-emerald-500 transition-colors" strokeWidth={2.5} />
           <motion.div 
             className="absolute inset-0 bg-emerald-500 rounded-full blur-lg opacity-20"
             animate={{ scale: [1, 1.5, 1] }}
             transition={{ duration: 2, repeat: Infinity }}
           />
        </div>
        <div>
          <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest transition-colors">Dublyaj Tayyor!</h3>
          <p className="text-[11px] text-emerald-600/60 dark:text-emerald-400/60 font-medium transition-colors">Video muvaffaqiyatli qayta ishlandi</p>
        </div>
      </motion.div>

      {job.content_flagged && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-3xl px-6 py-4 transition-colors"
        >
          <ShieldAlert aria-hidden="true" className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Video tayyor va shaxsiy foydalanish uchun mavjud. Ammo kontent siyosatimizga ko&apos;ra
            (diniy, 18+, zo&apos;ravonlik yoki shunga o&apos;xshash kategoriya) bunday videolarni
            keyingi safar yubormaslikni so&apos;raymiz.
          </p>
        </motion.div>
      )}

      {/* ── Video Player ──────────────────────────── */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl overflow-hidden shadow-2xl ring-1 ring-black/5 dark:ring-white/10"
      >
        <VideoPlayer
          ref={playerRef}
          key={videoUrl}
          src={videoUrl}
          jobId={job.job_id}
          videoTitle={job.video_title}
          channelName={job.channel_name}
          youtubeUrl={job.youtube_url}
          subtitlesContent={job.uzbek_srt_content}
          onTimeUpdate={setCurrentTime}
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
              onClick={handleShare}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-3.5 py-3 bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/[0.05] rounded-2xl hover:bg-black/10 dark:hover:bg-white/[0.08] transition-all flex items-center gap-1.5"
              title="Ulashish"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" size={18} className="text-emerald-500 transition-colors" />
                  <span className="text-xs font-bold text-emerald-500">Nusxalandi!</span>
                </>
              ) : (
                <Share2 aria-hidden="true" size={18} className="text-gray-500 dark:text-gray-400 transition-colors" />
              )}
            </motion.button>
          </div>
        </div>

        <motion.a
          href={downloadUrl}
          download
          whileHover={{ y: -2 }}
          whileTap={{ y: 0 }}
          className="btn-premium w-full flex items-center justify-center gap-3
                     py-5 rounded-[24px]
                     transition-all duration-300 text-sm shadow-xl font-extrabold"
        >
          <Download aria-hidden="true" size={18} />
          Videoni yuklab olish
        </motion.a>

        {/* ── Viral Retention & Share Card ─────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-5 rounded-[24px] bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10 border border-blue-500/20 text-center space-y-3"
        >
          <div className="space-y-1">
            <h4 className="text-xs sm:text-sm font-black text-gray-900 dark:text-white flex items-center justify-center gap-1.5">
              <span>🎉 Dublyaj yoqdimi?</span>
            </h4>
            <p className="text-[11px] text-gray-600 dark:text-slate-400">
              Videoni Telegram&apos;da do&apos;stlaringizga ulashing yoki keyingi videongizni hoziroq tayyorlang!
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`https://t.me/share/url?url=${encodeURIComponent(typeof window !== "undefined" ? `${window.location.origin}/video/${job.job_id}` : `https://gapirai.uz/video/${job.job_id}`)}&text=${encodeURIComponent(`Men ushbu videoni GapirAI.uz orqali o'zbek tiliga dublyaj qildim! Ko'ring:`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-3 px-4 bg-[#229ED9] hover:bg-[#1E8BC0] text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-sky-500/20"
            >
              <Send aria-hidden="true" size={14} />
              Telegramda ulashish
            </a>
            <button
              onClick={handleShare}
              className="py-3 px-4 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-gray-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              {copied ? <Check aria-hidden="true" size={14} className="text-emerald-500" /> : <Share2 aria-hidden="true" size={14} />}
              <span>{copied ? "Nusxalandi" : "Havola"}</span>
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── AI Xulosa & Asosiy Tezislar (Growth Experiment 1) ── */}
      {summaryLoading ? (
        <div className="glass-card rounded-[24px] p-5 sm:p-6 border border-blue-500/15 animate-pulse space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg bg-blue-500/20" />
            <div className="h-4 w-40 bg-black/10 dark:bg-white/10 rounded-full" />
          </div>
          <div className="h-3 w-full bg-black/5 dark:bg-white/5 rounded-full" />
          <div className="h-3 w-4/5 bg-black/5 dark:bg-white/5 rounded-full" />
        </div>
      ) : summaryData && (summaryData.summary || (summaryData.key_points && summaryData.key_points.length > 0)) ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-[24px] p-5 sm:p-6 border border-blue-500/20 bg-gradient-to-br from-blue-500/5 via-indigo-500/5 to-transparent space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shadow-inner">
                <Sparkles aria-hidden="true" size={15} className="text-blue-500" />
              </div>
              <h4 className="text-xs sm:text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                AI Xulosa & Asosiy Tezislar
              </h4>
            </div>
            <button
              onClick={handleCopySummary}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition flex items-center gap-1.5"
            >
              {summaryCopied ? <Check aria-hidden="true" size={12} className="text-emerald-500" /> : <Copy aria-hidden="true" size={12} />}
              <span>{summaryCopied ? "Nusxalandi" : "Xulosani nusxalash"}</span>
            </button>
          </div>

          {summaryData.summary && (
            <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 leading-relaxed font-medium">
              {summaryData.summary}
            </p>
          )}

          {summaryData.key_points && summaryData.key_points.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">
                Asosiy xulosalar:
              </span>
              <div className="grid gap-2">
                {summaryData.key_points.map((pt, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/5 dark:border-white/5 text-xs text-gray-800 dark:text-gray-200"
                  >
                    <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="leading-snug">{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      ) : null}

      {/* ── Interaktiv Transkript (Growth Experiment 3) ── */}
      {cues.length > 0 && (
        <InteractiveTranscript
          cues={cues}
          currentTime={currentTime}
          onSeek={handleSeek}
          videoTitle={job.video_title}
          jobId={job.job_id}
        />
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
        <RotateCcw aria-hidden="true" size={14} />
        Yangi video dublyaj qilish
      </motion.button>
    </div>
  );
}
