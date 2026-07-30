"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createJob, getVideoInfo, VideoInfo } from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { useAuth } from "@/hooks/useAuth";
import UrlInput from "@/components/UrlInput";
import StepProgress from "@/components/StepProgress";
import VideoResult from "@/components/VideoResult";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";
import { LayoutDashboard, LogIn, X, UserPlus } from "lucide-react";


/* ── LocalStorage helpers ─────────────────────────── */
const JOB_KEY = "dubber_last_job";

function saveJobId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(JOB_KEY, JSON.stringify({ id, ts: Date.now() }));
}

function loadJobId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(JOB_KEY);
    if (!raw) return null;
    const { id, ts } = JSON.parse(raw);
    // 24 soatdan eski bo'lsa tozala
    if (Date.now() - ts > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(JOB_KEY);
      return null;
    }
    return id ?? null;
  } catch {
    return null;
  }
}

function clearJobId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(JOB_KEY);
}

/* ── Mesh Background ──────────────────────────────── */
function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}

/* ── Logo ─────────────────────────────────────────── */
function Logo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-2.5 text-center mb-6 sm:mb-8 px-2"
    >
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-md shadow-sm">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[11px] font-extrabold text-red-600 dark:text-red-400 tracking-wider uppercase">
          AI Studio 2.0 • Avtomatik Dublyaj
        </span>
      </div>

      <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-black dark:text-white transition-colors duration-300">
        Xadichai<span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-500 to-pink-500">.uz</span>
      </h1>
      <p className="text-xs sm:text-base text-gray-600 dark:text-gray-400 font-medium max-w-md leading-relaxed">
        YouTube videolarni sun'iy intellekt yordamida <span className="font-bold text-gray-900 dark:text-white">sof, tabiiy o'zbek tiliga</span> avtomatik dublyaj qiling
      </p>
      <h2 className="sr-only">
        YouTube videolarni sun'iy intellekt yordamida o'zbek tiliga avtomatik dublyaj va tarjima qilish platformasi — Xadicha uz (Xadichai)
      </h2>
    </motion.div>
  );
}

/* ── Welcome Modal (birinchi tashrif) ─────────────── */
function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="relative w-full max-w-md bg-white dark:bg-[#070202] rounded-[32px] p-8 shadow-2xl border border-black/5 dark:border-white/10"
        >
          {/* Yopish */}
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition text-gray-500 dark:text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="p-2 transition duration-300 hover:scale-105">
              <img src="/logo.png" alt="Xadichai.uz Logo" className="h-32 w-auto object-contain dark:hidden" />
              <img src="/logodark.png" alt="Xadichai.uz Logo" className="h-32 w-auto object-contain hidden dark:block" />
            </div>
          </div>

          <h2 className="text-2xl font-black text-black dark:text-white text-center mb-2">
            Xadichai.uz ga xush kelibsiz
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-8 leading-relaxed px-4">
            YouTube videolarini o'zbek tiliga soniyalar ichida dublyaj qiling. Barcha videolaringizni saqlash uchun bepul hisob oching.
          </p>

          <div className="space-y-3">
            <Link
              href="/register"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 btn-premium py-3.5 rounded-2xl font-extrabold text-sm"
            >
              <UserPlus className="w-4 h-4" />
              Bepul ro'yxatdan o'tish
            </Link>

            <Link
              href="/login"
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.06] dark:hover:bg-white/[0.06] border border-black/10 dark:border-white/10 text-gray-800 dark:text-gray-200 font-semibold py-3.5 rounded-2xl transition text-sm"
            >
              <LogIn className="w-4 h-4" />
              Hisobim bor — kirish
            </Link>

            <button
              onClick={onClose}
              className="w-full text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 py-2 transition font-medium"
            >
              Hisobsiz davom etish
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ── Main Page ────────────────────────────────────── */
export default function Home() {
  const { user, isLoggedIn, loading: authLoading } = useAuth();
  const router = useRouter();

  const [jobId, setJobId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [voiceGender, setVoiceGender] = useState("auto");
  const [showWelcome, setShowWelcome] = useState(false);
  const startRef = useRef<number | null>(null);

  const { job, is404 } = useJobPolling(jobId);

  useEffect(() => {
    if (is404) {
      clearJobId();
      setJobId(null);
    }
  }, [is404]);

  useEffect(() => {
    const saved = loadJobId();
    if (saved) setJobId(saved);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (isLoggedIn) return;
    const seen = localStorage.getItem("dubber_welcome_seen");
    if (!seen) {
      const t = setTimeout(() => setShowWelcome(true), 800);
      return () => clearTimeout(t);
    }
  }, [authLoading, isLoggedIn]);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem("dubber_welcome_seen", "1");
  };

  useEffect(() => {
    if (jobId) saveJobId(jobId);
  }, [jobId]);

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
      const { job_id, status } = await createJob(url, voiceGender);
      if (status === "awaiting_payment") {
        saveJobId(job_id);
        router.push(`/video/${job_id}`);
      } else {
        setJobId(job_id);
      }
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
    clearJobId();
  };

  const phase =
    !jobId ? "idle"
    : !job ? "loading"
    : job.status === "completed" ? "done"
    : job.status === "failed" ? "error"
    : "processing";

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-start pt-20 sm:pt-24 pb-20 px-4 sm:px-8 overflow-x-hidden transition-colors duration-300">
      <MeshBackground />

      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}

      <header className="absolute top-4 sm:top-6 left-4 sm:left-6 right-4 sm:right-6 z-50 flex items-center justify-between pointer-events-none">
        {/* Left Logo */}
        <Link href="/" className="pointer-events-auto flex items-center transition duration-300 hover:scale-105">
          <img src="/logo.png" alt="Xadichai.uz Logo" className="h-8 sm:h-10 w-auto max-w-[200px] object-contain dark:hidden" />
          <img src="/logodark.png" alt="Xadichai.uz Logo" className="h-8 sm:h-10 w-auto max-w-[200px] object-contain hidden dark:block" />
        </Link>

        {/* Right Controls */}
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3 sm:px-4 bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-red-500/20 dark:border-white/15 text-gray-900 dark:text-white text-[11px] sm:text-xs font-bold rounded-2xl shadow-sm transition backdrop-blur-md hover:scale-105 active:scale-95"
            >
              <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
              Paneli
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 sm:gap-2 h-9 sm:h-10 px-3.5 sm:px-4 bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-red-500/20 dark:border-white/15 text-gray-900 dark:text-white text-[11px] sm:text-xs font-bold rounded-2xl shadow-sm transition backdrop-blur-md hover:scale-105 active:scale-95"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
              Kirish
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className={`w-full z-10 transition-all duration-500 ${phase === "done" ? "max-w-2xl" : "max-w-xl"}`}>
        <Logo />

        <motion.div
          layout
          className="glass-card rounded-[32px] p-8 sm:p-10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <UrlInput
                  url={url}
                  videoInfo={videoInfo}
                  loading={loading}
                  error={error}
                  voiceGender={voiceGender}
                  onChange={handleUrlChange}
                  onGenderChange={setVoiceGender}
                  onSubmit={handleSubmit}
                />
              </motion.div>
            )}

            {phase === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-12 h-12 rounded-full border-t-2 border-red-500 animate-spin" />
                  <div className="w-8 h-8 rounded-full border-t-2 border-rose-400 animate-spin-slow" />
                </div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest animate-pulse">Server bilan bog'lanilmoqda...</p>
              </motion.div>
            )}

            {phase === "processing" && job && (
              <motion.div key="processing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {job.video_title && (
                  <div className="pb-4 border-b border-black/5 dark:border-white/5 transition-colors">
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block mb-1">Hozirgi video</span>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white line-clamp-1 transition-colors">{job.video_title}</h2>
                  </div>
                )}
                <StepProgress job={job} elapsed={elapsed} />
              </motion.div>
            )}

            {phase === "done" && job && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <VideoResult job={job} onReset={handleReset} />
              </motion.div>
            )}

            {phase === "error" && job && (
              <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-2">
                  <div className="w-8 h-8 text-red-500">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                </div>
                <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6 transition-colors">
                  <h3 className="text-red-500 dark:text-red-400 font-bold mb-2">Xatolik yuz berdi</h3>
                  <p className="text-sm text-red-500/60 dark:text-red-400/60 leading-relaxed">{job.error_message}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="w-full py-4 glass-input rounded-2xl font-bold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all text-xs uppercase tracking-widest"
                >
                  Qayta boshlash
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── SEO Section: Xadicha / Hadicha Dublyaj Programmasi ── */}
      <section className="w-full max-w-4xl mt-16 px-4 space-y-6 z-10">
        <div className="glass-card rounded-[32px] p-8 sm:p-10 border border-black/5 dark:border-white/10 text-left">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-4">
            Xadichai.uz (Hadicha) — Sun'iy Intellekt Bilan Bepul Video Dublyaj Programmasi
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-normal mb-4">
            <strong>Xadichai.uz</strong> (xalq orasida <em>Hadicha</em> yoki <em>Xadicha uz</em> nomi bilan tanilgan) — bu YouTube va boshqa videolarni avtomatik tarzda sof o'zbek tiliga tarjima va dublyaj qiluvchi 1-raqamli <strong>dublyaj programmasi va dasturidir</strong>. Google AI Studio hamda Neural AI texnologiyalari yordamida har bir video jonli, insoniy va ta'sirli nutq bilan ovozlashtiriladi.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="bg-black/5 dark:bg-white/[0.03] p-4 rounded-2xl border border-black/5 dark:border-white/5">
              <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase mb-1">🎯 Nega Xadicha (Hadicha uz) Dublyaj Sayti?</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                Har qanday YouTube video havolasini kiriting va soniyalar ichida professional <strong>o'zbekcha dublyaj</strong> hamda <strong>sinxron subtitrlarni</strong> yuklab oling.
              </p>
            </div>
            <div className="bg-black/5 dark:bg-white/[0.03] p-4 rounded-2xl border border-black/5 dark:border-white/5">
              <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase mb-1">⚡ Onlayn Dublyaj Dasturi Afzalliklari</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                Dasturni kompyuterga o'rnatish shart emas. Barcha jarayonlar 100% onlayn brauzerda avtomatlashtirilgan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
