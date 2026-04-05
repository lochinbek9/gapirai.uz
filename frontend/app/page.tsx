"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createJob, getVideoInfo, VideoInfo } from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import UrlInput from "@/components/UrlInput";
import StepProgress from "@/components/StepProgress";
import VideoResult from "@/components/VideoResult";
import ThemeToggle from "@/components/ThemeToggle";

/* ── Mesh Background Component ────────────────── */
function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}

/* ── Logo ─────────────────────────────────────── */
function Logo() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-4 text-center mb-8"
    >
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative w-16 h-16 rounded-2xl bg-white dark:bg-[#0F172A] border border-black/5 dark:border-white/10 flex items-center justify-center shadow-2xl transition-colors duration-300">
          <svg viewBox="0 0 24 24" className="w-8 h-8 fill-blue-500">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 transition-colors duration-300">
          AI Dubber
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">
          Professional darajada avtomatik dublyaj platformasi
        </p>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  const { job } = useJobPolling(jobId);

  useEffect(() => {
    if (!jobId || !job) return;
    if (job.status === "completed" || job.status === "failed") return;
    if (!startRef.current) startRef.current = Date.now();

    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [jobId, job?.status]);

  const handleUrlChange = async (value: string) => {
    setUrl(value);
    setVideoInfo(null);
    setError(null);

    const isYoutube = value.includes("youtube.com/watch") || value.includes("youtu.be/");
    if (!isYoutube) return;

    try {
      setVideoInfo(await getVideoInfo(value));
    } catch { /* Fail silently */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    startRef.current = null;
    setElapsed(0);

    try {
      const { job_id } = await createJob(url);
      setJobId(job_id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Xatolik yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUrl("");
    setVideoInfo(null);
    setJobId(null);
    setError(null);
    setElapsed(0);
    startRef.current = null;
  };

  const phase = !jobId ? "idle" : !job ? "loading" : job.status === "completed" ? "done" : job.status === "failed" ? "error" : "processing";

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-6 sm:p-12 overflow-hidden transition-colors duration-300">
      <MeshBackground />
      
      {/* Top right toggle */}
      <div className="absolute top-8 right-8 z-50">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-xl z-10">
        <Logo />

        <motion.div
          layout
          className="glass-card rounded-[32px] p-8 sm:p-10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <AnimatePresence mode="wait">
            {/* Phase: IDLE */}
            {phase === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <UrlInput
                  url={url}
                  videoInfo={videoInfo}
                  loading={loading}
                  error={error}
                  onChange={handleUrlChange}
                  onSubmit={handleSubmit}
                />
              </motion.div>
            )}

            {/* Phase: INITIAL LOADING */}
            {phase === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-12 flex flex-col items-center gap-4"
              >
                <div className="relative flex items-center justify-center">
                   <div className="absolute w-12 h-12 rounded-full border-t-2 border-blue-500 animate-spin"></div>
                   <div className="w-8 h-8 rounded-full border-t-2 border-indigo-400 dark:border-indigo-400 animate-spin-slow"></div>
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">Server bilan bog'lanilmoqda...</p>
              </motion.div>
            )}

            {/* Phase: PROCESSING */}
            {phase === "processing" && job && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {job.video_title && (
                  <div className="pb-4 border-b border-black/5 dark:border-white/5 transition-colors">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">Hozirgi video</span>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white line-clamp-1 transition-colors">{job.video_title}</h2>
                  </div>
                )}
                <StepProgress job={job} elapsed={elapsed} />
              </motion.div>
            )}

            {/* Phase: DONE */}
            {phase === "done" && job && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
              >
                <VideoResult job={job} onReset={handleReset} />
              </motion.div>
            )}

            {/* Phase: ERROR */}
            {phase === "error" && job && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6 text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-2">
                   <div className="w-8 h-8 text-red-500">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                   </div>
                </div>
                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 transition-colors">
                  <h3 className="text-red-500 dark:text-red-400 font-bold mb-2">Xatolik yuz berdi</h3>
                  <p className="text-sm text-red-500/60 dark:text-red-400/60 leading-relaxed transition-colors">{job.error_message}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="w-full py-4 glass-input rounded-2xl font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all"
                >
                  Qayta boshlash
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div 
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ delay: 1 }}
           className="mt-12 text-center"
        >
          <div className="inline-flex items-center gap-6 px-6 py-2 rounded-full bg-black/5 dark:bg-white/[0.02] border border-black/5 dark:border-white/[0.05] transition-colors">
             <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-tighter transition-colors">Stack</span>
             <div className="flex gap-4 items-center">
                <span className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors cursor-default grayscale hover:grayscale-0">Whisper</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors cursor-default grayscale hover:grayscale-0">GPT-4o</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 transition-colors cursor-default grayscale hover:grayscale-0">Azure TTS</span>
             </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
