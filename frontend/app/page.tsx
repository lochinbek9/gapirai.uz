"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createJob, getJob, getVideoInfo, VideoInfo, cancelJob } from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { useAuth } from "@/hooks/useAuth";
import DubbingForm from "@/components/DubbingForm";
import AnalysisUrlForm from "@/components/AnalysisUrlForm";
import SubtitleForm from "@/components/SubtitleForm";
import StepProgress from "@/components/StepProgress";
import VideoResult from "@/components/VideoResult";
import ThemeToggle from "@/components/ThemeToggle";
import Footer from "@/components/Footer";
import DonateCTA from "@/components/DonateCTA";
import TelegramFeedbackSection from "@/components/TelegramFeedbackSection";
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
      className="flex flex-col items-center gap-2 sm:gap-3 text-center mb-5 sm:mb-8 px-2"
    >
      <div className="inline-flex items-center gap-2 px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-full bg-violet-500/10 dark:bg-violet-500/15 border border-violet-500/20 backdrop-blur-md shadow-sm">
        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-violet-500 animate-pulse" />
        <span className="text-[10px] sm:text-[11px] font-black text-violet-600 dark:text-violet-400 tracking-wider uppercase">
          AI Studio 2.0 • Avtomatik Dublyaj
        </span>
      </div>

      <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 dark:text-white transition-colors duration-300">
        GapirAI<span className="text-violet-600 dark:text-violet-500">.uz</span>
      </h1>
      <p className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white max-w-md leading-snug">
        Dunyodagi bilimlarni o'zbek tilida.
      </p>
      <p className="text-xs sm:text-base text-slate-600 dark:text-slate-300 font-medium max-w-md leading-relaxed">
        YouTube havolasi yoki video faylingizni o'zbek tiliga sun'iy intellekt orqali avtomatik dublyaj qiling.
      </p>
      <h2 className="sr-only">
        Dunyodagi bilimlarni o'zbek tilida — YouTube, kurslar va ta'limiy videolarni o'zbek tiliga avtomatik dublyaj qiluvchi va o'rganish materiallariga aylantiruvchi platforma, GapirAI.uz
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
            aria-label="Yopish"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="p-2 transition duration-300 hover:scale-105">
              <img src="/logo.webp" alt="GapirAI.uz Logo" width={256} height={256} className="h-32 w-auto object-contain dark:hidden" style={{ maxWidth: "200px", maxHeight: "140px", height: "auto" }} />
              <img src="/logodark.webp" alt="GapirAI.uz Logo" width={256} height={256} className="h-32 w-auto object-contain hidden dark:block" style={{ maxWidth: "200px", maxHeight: "140px", height: "auto" }} />
            </div>
          </div>

          <h2 className="text-2xl font-black text-black dark:text-white text-center mb-2">
            GapirAI.uz ga xush kelibsiz
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
  const [voiceGender, setVoiceGender] = useState("male");
  const [showWelcome, setShowWelcome] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [mode, setMode] = useState<"dub" | "subtitle" | "analyze">("dub");
  const startRef = useRef<number | null>(null);

  const handleCancel = async () => {
    if (!jobId) return;
    if (!confirm("Rostdan ham jarayonni bekor qilmoqchimisiz?")) return;
    setCancelLoading(true);
    try {
      const res = await cancelJob(jobId);
      if (res.success) {
        alert("Jarayon muvaffaqiyatli bekor qilindi.");
        clearJobId();
        setJobId(null);
      } else {
        alert(res.message || "Bekor qilishda xatolik yuz berdi.");
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Bekor qilishda xatolik yuz berdi.");
    } finally {
      setCancelLoading(false);
    }
  };

  const { job, is404 } = useJobPolling(jobId);

  useEffect(() => {
    if (is404 || (job && job.status === "awaiting_payment")) {
      clearJobId();
      setJobId(null);
    } else if (job && (job.status === "completed" || job.status === "failed")) {
      // Natija/xatolik ekrani `job` holatiga tayanadi — faqat localStorage'ni
      // tozalaymiz, jobId'ni saqlab qolamiz, aks holda ekran boshlang'ich
      // formaga qaytib ketadi.
      clearJobId();
    }
  }, [is404, job?.status]);

  useEffect(() => {
    const saved = loadJobId();
    if (saved) {
      getJob(saved)
        .then((data) => {
          if (data && !["completed", "failed", "awaiting_payment"].includes(data.status)) {
            setJobId(saved);
          } else {
            clearJobId();
          }
        })
        .catch(() => {
          clearJobId();
        });
    }
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

  // PWA share-target (app/share/page.tsx -> /?shared=<url>): YouTube ilovasidan
  // "Share -> GapirAI" qilinganda havolani oldindan to'ldiramiz.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shared = new URLSearchParams(window.location.search).get("shared");
    if (shared && (shared.includes("youtube.com") || shared.includes("youtu.be"))) {
      handleUrlChange(shared);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setLoading(true);
    setError(null);
    startRef.current = null;
    setElapsed(0);
    try {
      // 2026-09-16: bosh sahifaning asosiy tabi endi SOF dublyaj (o'quv
      // materiallari/tahlil bilan birlashtirilmagan) -- Subtitr va Video
      // tahlil qilish endi o'zining alohida tablari bor, shuning uchun bu
      // yerda learnVideo() (dublyaj+tahlil birga) o'rniga oddiy createJob()
      // ishlatiladi, natija /learn/[id] emas /video/[id]da ko'rsatiladi.
      const { job_id } = await createJob(url, voiceGender);
      router.push(`/video/${job_id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object" && detail.error === "insufficient_minutes") {
        // Matnli xabar ko'rsatib qo'ymasdan — to'g'ridan-to'g'ri /pricing'ga
        // o'tkazamiz, u yerda "yetarli daqiqa yo'q" modali chiqadi (2026-09-14).
        router.push("/pricing?reason=insufficient_minutes");
        return;
      } else {
        setError((typeof detail === "string" ? detail : detail?.message) || "Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
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
    <main className="relative min-h-screen flex flex-col items-center justify-start pt-16 sm:pt-24 pb-16 px-3 sm:px-8 overflow-x-hidden transition-colors duration-300">
      <MeshBackground />

      {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}

      <header className="absolute top-2.5 sm:top-6 left-2.5 sm:left-6 right-2.5 sm:right-6 z-50 flex items-center justify-between pointer-events-none gap-2">
        {/* Left Logo */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
          <Link href="/" className="flex items-center transition duration-300 hover:scale-105">
            <img src="/logo.webp" alt="GapirAI.uz Logo" width={140} height={36} className="h-8 sm:h-12 md:h-16 w-auto object-contain dark:hidden drop-shadow-md" />
            <img src="/logodark.webp" alt="GapirAI.uz Logo" width={140} height={36} className="h-8 sm:h-12 md:h-16 w-auto object-contain hidden dark:block drop-shadow-md" />
          </Link>
          <span className="hidden xs:inline-flex items-center gap-1 px-2 py-0.5 sm:px-3 sm:py-1.5 rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 backdrop-blur-md shadow-sm shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[9px] sm:text-[11px] font-black text-amber-600 dark:text-amber-400 tracking-wider uppercase whitespace-nowrap">
              Test
            </span>
          </span>
        </div>

        {/* Right Controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-3 shrink-0">
          {isLoggedIn ? (
            <Link
              href="/dashboard"
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-10 px-2.5 sm:px-4 bg-white/90 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-white/15 text-slate-800 dark:text-white text-[10px] sm:text-xs font-bold rounded-xl sm:rounded-2xl shadow-sm hover:shadow transition backdrop-blur-md hover:scale-105 active:scale-95 whitespace-nowrap"
            >
              <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500 shrink-0" />
              <span className="hidden sm:inline">Mening videolarim</span>
              <span className="sm:hidden">Videolar</span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-10 px-2.5 sm:px-4 bg-white/90 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-slate-200 dark:border-white/15 text-slate-800 dark:text-white text-[10px] sm:text-xs font-bold rounded-xl sm:rounded-2xl shadow-sm hover:shadow transition backdrop-blur-md hover:scale-105 active:scale-95 whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-500 shrink-0" />
              <span>Kirish</span>
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className={`w-full z-10 transition-all duration-500 ${phase === "done" ? "max-w-2xl" : "max-w-xl"}`}>
        <Logo />

        <motion.div
          layout
          className="glass-card rounded-[22px] sm:rounded-[32px] p-4 sm:p-8 md:p-10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div className="flex gap-1 sm:gap-2 p-1 mb-5 sm:mb-6 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setMode("dub")}
                    className={`flex-1 py-2 sm:py-2.5 px-1 rounded-xl text-xs sm:text-sm font-bold transition-all text-center ${
                      mode === "dub"
                        ? "bg-white dark:bg-white/10 shadow text-blue-600 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className="hidden sm:inline">Video dublaj qilish</span>
                    <span className="sm:hidden">Dublyaj</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("subtitle")}
                    className={`flex-1 py-2 sm:py-2.5 px-1 rounded-xl text-xs sm:text-sm font-bold transition-all text-center ${
                      mode === "subtitle"
                        ? "bg-white dark:bg-white/10 shadow text-blue-600 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className="hidden sm:inline">Subtitr yaratish</span>
                    <span className="sm:hidden">Subtitr</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("analyze")}
                    className={`flex-1 py-2 sm:py-2.5 px-1 rounded-xl text-xs sm:text-sm font-bold transition-all text-center ${
                      mode === "analyze"
                        ? "bg-white dark:bg-white/10 shadow text-blue-600 dark:text-blue-400"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className="hidden sm:inline">Video tahlil qilish</span>
                    <span className="sm:hidden">Tahlil</span>
                  </button>
                </div>

                {mode === "dub" ? (
                  <DubbingForm
                    url={url}
                    videoInfo={videoInfo}
                    loading={loading}
                    error={error}
                    voiceGender={voiceGender}
                    onChange={handleUrlChange}
                    onGenderChange={setVoiceGender}
                    onSubmit={handleSubmit}
                  />
                ) : mode === "subtitle" ? (
                  <SubtitleForm />
                ) : (
                  <AnalysisUrlForm />
                )}
              </motion.div>
            )}

            {phase === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-12 flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute w-12 h-12 rounded-full border-t-2 border-blue-500 animate-spin" />
                  <div className="w-8 h-8 rounded-full border-t-2 border-violet-400 animate-spin-slow" />
                </div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest animate-pulse">Server bilan bog'lanilmoqda...</p>
              </motion.div>
            )}

            {phase === "processing" && job && (
              <motion.div key="processing" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                {job.video_title && (
                  <div className="pb-4 border-b border-black/5 dark:border-white/5 transition-colors">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">Hozirgi video</span>
                    <h2 className="text-base font-bold text-gray-900 dark:text-white line-clamp-1 transition-colors">{job.video_title}</h2>
                  </div>
                )}
                <StepProgress job={job} elapsed={elapsed} onCancel={handleCancel} cancelLoading={cancelLoading} />
              </motion.div>
            )}

            {phase === "done" && job && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <VideoResult job={job} onReset={handleReset} />
              </motion.div>
            )}

            {phase === "error" && job && (
              <motion.div key="error" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-2">
                  <div className="w-8 h-8 text-blue-500">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                  </div>
                </div>
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-6 transition-colors">
                  <h3 className="text-blue-500 dark:text-blue-400 font-bold mb-2">Xatolik yuz berdi</h3>
                  <p className="text-sm text-blue-500/60 dark:text-blue-400/60 leading-relaxed">{job.error_message}</p>
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

      {/* ── Foydalanuvchilar Fikr va Takliflari (Telegram Kanalga avtomatik boradi) ── */}
      <TelegramFeedbackSection />

      {/* ── SEO Section: GapirAI.uz Tarjima va Dublyaj platformasi ── */}
      <section className="w-full max-w-4xl mt-16 px-4 space-y-6 z-10">
        <div className="glass-card rounded-[32px] p-8 sm:p-10 border border-black/5 dark:border-white/10 text-left">
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-4">
            GapirAI.uz (Gapir AI) — Sun'iy Intellekt Asosidagi Avtomatik Dublyaj Programmasi
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed font-normal mb-4">
            <strong>GapirAI.uz</strong> — bu ingliz tilidagi va boshqa xorijiy video kontentlarni o'zbek tiliga soniyalar ichida professional darajada tarjima va dublyaj (dublaj) qilib beruvchi onlayn dublyaj dasturi va platformadir. OpenAI Whisper (nutqni aniqlash), ilg'or neyron tarjimonlar hamda Microsoft Azure Speech AI (tabiiy o'zbekcha nutq sintezi) texnologiyalaridan foydalangan holda, platforma videodagi har bir spikerning jinsini aniqlaydi va ularni o'zlariga mos bo'lgan jonli, insoniy ovozlarda ovozlashtiradi. YouTube dublaj programmasi izlayotgan bo'lsangiz, GapirAI (Gapir AI) — o'zbek tilidagi eng qulay bepul dublyaj dasturlaridan biridir.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="bg-black/5 dark:bg-white/[0.03] p-4 rounded-2xl border border-black/5 dark:border-white/5">
              <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">🎯 Professional Dublyaj Imkoniyatlari</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                Istalgan YouTube havolasini kiriting va sun'iy intellekt yordamida professional o'zbekcha dublyaj, sinxron audio hamda tayyor MP4 video faylni yuklab oling.
              </p>
            </div>
            <div className="bg-black/5 dark:bg-white/[0.03] p-4 rounded-2xl border border-black/5 dark:border-white/5">
              <h3 className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">⚡ Tezkor Onlayn Xizmat</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-normal">
                Qurilmangizga hech qanday qo'shimcha ilova yoki dastur yuklash talab qilinmaydi. Dublyaj jarayoni to'liq bulutli serverlarimizda amalga oshiriladi.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-4">
        <DonateCTA />
      </section>

      <Footer />
    </main>
  );
}
