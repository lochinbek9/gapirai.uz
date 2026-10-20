"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertTriangle, Search, RotateCw, LogIn, Sparkles, ArrowRight, CreditCard,
  CheckCircle2, Clock, Brain, FileText, Video as VideoIcon, X,
} from "lucide-react";
import {
  ANALYSIS_STATUS_LABELS, askQuestion, generateQuiz, generateNotes, generateBilingual,
  searchTranscript, getTranscript, clearAnalysisId, displayLanguage, retryAnalysis, TranscriptSegment, QuizQuestion, QAEntry, BilingualSegment,
  getPlans, PlanDef, MinutePack, CurrentSubscription,
} from "@/lib/api";

const ANALYSIS_TIPS = [
  "Gemini AI videoning eng muhim joylarini ajratib, qisqa konspekt tuzmoqda...",
  "Transkript orqali videodagi istalgan so'z va daqiqani soniyalarda qidirishingiz mumkin...",
  "Tahlil tugagach, video mazmuni bo'yicha interaktiv test va AI bilan suhbat ochiladi...",
  "Barcha asosiy g'oyalar va bo'limlar daqiqama-daqiqa ajratib beriladi...",
];

function getAnalysisStageIndex(status: string): number {
  if (status === "pending" || status === "downloading" || status === "extracting_audio") return 0;
  if (status === "transcribing") return 1;
  if (status === "analyzing") return 2;
  if (status === "generating_results" || status === "completed") return 3;
  return 0;
}
import { useAnalysisPolling } from "@/hooks/useAnalysisPolling";
import YouTubePlayer, { YouTubePlayerHandle } from "@/components/YouTubePlayer";
import NotesTab from "@/components/analysis/NotesTab";
import QuizTab from "@/components/analysis/QuizTab";
import QATab from "@/components/analysis/QATab";
import { formatTs } from "@/lib/timestamp";
import { extractYouTubeId } from "@/lib/youtube";

type Tab = "summary" | "chapters" | "transcript" | "notes" | "quiz" | "qa";

const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Xulosa" },
  { key: "chapters", label: "Boblar" },
  { key: "transcript", label: "Transkript" },
  { key: "notes", label: "Konspekt" },
  { key: "quiz", label: "Test" },
  { key: "qa", label: "Savol-javob" },
];

function formatHumanDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 soniya";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h} soat ${m} daqiqa${s > 0 ? ` ${s} soniya` : ""}`;
  }
  if (m > 0) {
    return `${m} daqiqa${s > 0 ? ` ${s} soniya` : ""}`;
  }
  return `${s} soniya`;
}

export default function VideoAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { analysis, error, is404, refetch } = useAnalysisPolling(id);
  const playerRef = useRef<YouTubePlayerHandle>(null);
  const htmlVideoRef = useRef<HTMLVideoElement>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [retrying, setRetrying] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([]);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TranscriptSegment[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [transcriptView, setTranscriptView] = useState<"normal" | "bilingual">("normal");
  const [bilingual, setBilingual] = useState<BilingualSegment[] | null>(null);
  const [bilingualLoading, setBilingualLoading] = useState(false);
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [minutePacks, setMinutePacks] = useState<MinutePack[]>([]);
  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  const isAnalysisActive = Boolean(analysis && analysis.status !== "completed" && analysis.status !== "failed");

  useEffect(() => {
    if (!isAnalysisActive) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isAnalysisActive]);

  useEffect(() => {
    if (!isAnalysisActive) return;
    const timer = setInterval(() => {
      setTipIndex((i) => (i + 1) % ANALYSIS_TIPS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [isAnalysisActive]);

  useEffect(() => {
    getPlans()
      .then((res) => {
        if (res.plans) setPlans(res.plans);
        if (res.minute_packs) setMinutePacks(res.minute_packs);
        if (res.current) setCurrentSub(res.current);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (analysis?.qa_history) setQaHistory(analysis.qa_history);
    if (analysis?.quiz) setQuiz(analysis.quiz);
    if (analysis?.notes) setNotes(analysis.notes);
  }, [analysis]);

  useEffect(() => {
    if (analysis?.status === "completed" && id) {
      getTranscript(id).then((res) => setTranscript(res.segments)).catch(() => {});
    }
  }, [analysis?.status, id]);

  const [toast, setToast] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const showToast = (message: string, type: "error" | "success" = "error") => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 6000);
  };

  const handleRetry = async () => {
    if (!id || retrying) return;
    setRetrying(true);
    try {
      await retryAnalysis(id);
      await refetch();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Qayta urinishda xatolik yuz berdi.");
    } finally {
      setRetrying(false);
    }
  };

  const seek = (seconds: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(seconds);
    } else if (htmlVideoRef.current) {
      htmlVideoRef.current.currentTime = seconds;
      htmlVideoRef.current.play().catch(() => {});
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !id) return;
    setAsking(true);
    try {
      const entry = await askQuestion(id, question.trim());
      setQaHistory((prev) => [...prev, entry]);
      setQuestion("");
    } catch {
      showToast("Savolga javob berishda xatolik yuz berdi.");
    } finally {
      setAsking(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!id) return;
    setQuizLoading(true);
    try {
      const res = await generateQuiz(id);
      setQuiz(res.quiz);
      showToast("Test savollari muvaffaqiyatli tayyorlandi!", "success");
    } catch {
      showToast("Test yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleGenerateNotes = async () => {
    if (!id) return;
    setNotesLoading(true);
    try {
      const res = await generateNotes(id);
      setNotes(res.notes);
      showToast("Konspekt muvaffaqiyatli yaratildi!", "success");
    } catch {
      showToast("Konspekt yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setNotesLoading(false);
    }
  };

  const handleToggleBilingual = async () => {
    if (transcriptView === "bilingual") {
      setTranscriptView("normal");
      return;
    }
    setTranscriptView("bilingual");
    if (!id || bilingual) return;
    setBilingualLoading(true);
    try {
      const res = await generateBilingual(id);
      setBilingual(res.segments);
    } catch {
      showToast("Bilingual ko'rinishni yaratishda xatolik yuz berdi.");
      setTranscriptView("normal");
    } finally {
      setBilingualLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const res = await searchTranscript(id, searchQuery.trim());
    setSearchResults(res.results);
  };

  if (is404) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 border border-white/10 rounded-2xl p-6 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Tahlil topilmadi</h2>
          <p className="text-sm text-gray-400">
            Ushbu video tahlili mavjud emas yoki o'chirilgan bo'lishi mumkin.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition"
          >
            Bosh sahifaga qaytish
          </Link>
        </div>
      </div>
    );
  }

  if (error === "auth_required") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 border border-white/10 rounded-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
            <LogIn className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Tizimga kirish talab qilinadi</h2>
          <p className="text-sm text-gray-400">
            Ushbu tahlilni ko'rish yoki uning jarayonini kuzatish uchun profilingizga kiring.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href={`/login?returnUrl=/video-analysis/${id}`}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition"
            >
              Kirish
            </Link>
            <Link
              href="/"
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-sm transition"
            >
              Bosh sahifa
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error === "forbidden") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800/80 border border-white/10 rounded-2xl p-6 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Kirish cheklangan</h2>
          <p className="text-sm text-gray-400">
            Ushbu tahlil shaxsiy bo'lib, faqat uning egasi ko'rishi mumkin.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition"
          >
            Bosh sahifaga qaytish
          </Link>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        <span className="text-xs text-gray-400 font-medium">Yuklanmoqda...</span>
      </div>
    );
  }

  const videoId = extractYouTubeId(analysis.youtube_url);
  const isDone = analysis.status === "completed";
  const isFailed = analysis.status === "failed";

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => { clearAnalysisId(); router.push("/"); }}
            className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 text-white transition active:scale-95 shadow-sm"
            aria-label="Orqaga qaytish"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 transition duration-300 hover:scale-105">
            <img src="/logodark.webp" alt="GapirAI.uz Logo" width={120} height={32} className="h-8 w-auto object-contain" />
            <span className="text-lg font-black tracking-tight text-white">
              GapirAI<span className="text-violet-500">.uz</span>
            </span>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Modern Toast Notification */}
        {toast && (
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 transition-all duration-300 ${
              toast.type === "error"
                ? "bg-red-950/80 border-red-500/40 text-red-200"
                : "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === "error" ? (
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              <p className="text-xs sm:text-sm font-semibold">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!isDone && !isFailed && (
          <div className="bg-slate-800/60 border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6">
            {/* Top row: Video Thumbnail & Info + Elapsed Time */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-white/10">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                {analysis.video_thumbnail ? (
                  <div className="relative w-24 sm:w-28 aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/10 flex-shrink-0">
                    <img
                      src={analysis.video_thumbnail}
                      alt={analysis.video_title || "Video"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center flex-shrink-0">
                    <VideoIcon className="w-7 h-7 text-blue-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2">
                    {analysis.video_title || "Video tahlili tayyorlanmoqda..."}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    {analysis.video_duration ? (
                      <span>Davomiyligi: {formatHumanDuration(analysis.video_duration)}</span>
                    ) : null}
                    <span className="flex items-center gap-1 text-blue-400 font-medium">
                      <Clock className="w-3.5 h-3.5" /> {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-1">
                <span className="text-2xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
                  {Math.round(analysis.progress)}%
                </span>
                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  Jarayonda
                </span>
              </div>
            </div>

            {/* Glowing Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-2.5 rounded-full bg-white/5 overflow-hidden p-0.5 border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                  style={{ width: `${Math.max(5, analysis.progress)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs text-gray-400">
                <span>{analysis.status_message || ANALYSIS_STATUS_LABELS[analysis.status]}</span>
                <span>Taxminan: 30-60 soniya</span>
              </div>
            </div>

            {/* 4-Stage Visual Stepper */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              {[
                {
                  idx: 0,
                  title: "1. Media & Audio",
                  desc: "Yuklab olish va tayyorlash",
                  icon: VideoIcon,
                },
                {
                  idx: 1,
                  title: "2. Nutq Transkripti",
                  desc: "Whisper STT (so'zma-so'z)",
                  icon: FileText,
                },
                {
                  idx: 2,
                  title: "3. Gemini AI Tahlili",
                  desc: "Xulosa va asosiy fikrlar",
                  icon: Brain,
                },
                {
                  idx: 3,
                  title: "4. Yakuniy Natijalar",
                  desc: "Konspekt va testlar",
                  icon: Sparkles,
                },
              ].map((stage) => {
                const currentStageIdx = getAnalysisStageIndex(analysis.status);
                const isPassed = currentStageIdx > stage.idx;
                const isCurrent = currentStageIdx === stage.idx;
                const StageIcon = stage.icon;

                return (
                  <div
                    key={stage.idx}
                    className={`relative p-3.5 rounded-2xl border transition-all duration-300 ${
                      isCurrent
                        ? "bg-gradient-to-b from-blue-500/15 to-violet-500/10 border-blue-500/40 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30"
                        : isPassed
                        ? "bg-emerald-500/5 border-emerald-500/30 text-gray-300"
                        : "bg-white/[0.02] border-white/5 opacity-60 text-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                          isCurrent
                            ? "bg-blue-500 text-white shadow-md shadow-blue-500/30 animate-pulse"
                            : isPassed
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            : "bg-white/10 text-gray-400"
                        }`}
                      >
                        {isPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : isCurrent ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <StageIcon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className={`text-xs font-bold leading-tight ${isCurrent ? "text-white" : isPassed ? "text-gray-200" : "text-gray-400"}`}>
                        {stage.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-tight pl-9">
                      {stage.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Rotating Tips Box */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-xs text-gray-300 transition-all duration-500">
                {ANALYSIS_TIPS[tipIndex]}
              </p>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-white">Xatolik yuz berdi</h2>
            <p className="text-sm text-gray-400 max-w-lg mx-auto">
              {analysis.error_message || "Videoni tahlil qilishda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko'ring."}
            </p>
            <div className="pt-2">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-medium text-sm transition shadow-lg shadow-blue-500/20 active:scale-95 disabled:opacity-50"
              >
                {retrying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Qayta ishga tushirilmoqda...</span>
                  </>
                ) : (
                  <>
                    <RotateCw className="w-4 h-4" />
                    <span>Qaytadan urinish</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {isDone && (
          <>
            {videoId ? (
              <YouTubePlayer ref={playerRef} videoId={videoId} />
            ) : analysis?.video_url ? (
              <video
                ref={htmlVideoRef}
                src={analysis.video_url}
                controls
                className="w-full aspect-video rounded-2xl bg-black object-contain shadow-2xl border border-white/10"
              />
            ) : (
              <div className="aspect-video bg-black rounded-2xl flex items-center justify-center text-gray-500 text-sm">
                Video ko'rsatib bo'lmadi
              </div>
            )}

            <h1 className="text-xl font-bold text-white">{analysis.video_title}</h1>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold text-gray-400">
              {analysis.video_language && (
                <span className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                  Original: {displayLanguage(analysis.video_language)}
                </span>
              )}
              <span className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
                Tahlil: {displayLanguage(analysis.language)}
              </span>
            </div>

            {/* ── Dubbing Lead Magnet Banner (Faqat chet tildagi videolar uchun) ── */}
            {Boolean(analysis.video_language && !analysis.video_language.toLowerCase().startsWith("uz")) && (() => {
              const durationSec = analysis.video_duration || 0;
              const videoMinutes = Math.max(1, Math.ceil(durationSec / 60));
              const availableMinutes = currentSub?.minutes?.total_available ?? 5;
              const neededMinutes = Math.max(0, videoMinutes - availableMinutes);

              const packs = minutePacks.length > 0 ? minutePacks : [
                { minutes: 15, price: 4900, one_time: true },
                { minutes: 35, price: 15000 },
                { minutes: 70, price: 25000 },
                { minutes: 140, price: 45000 },
                { minutes: 350, price: 100000 },
              ];

              const eligiblePacks = packs.filter((p) => !p.already_purchased);
              const recPack = eligiblePacks.find((p) => p.minutes >= neededMinutes) || eligiblePacks[eligiblePacks.length - 1];

              const recPlan = neededMinutes <= 350
                ? (plans.find((p) => p.id === "standard") || { id: "standard", name: "Standart", monthly_minutes: 350, price: 49000 })
                : (plans.find((p) => p.id === "pro") || { id: "pro", name: "Pro", monthly_minutes: 600, price: 199000 });

              const formattedDur = formatHumanDuration(durationSec);

              if (neededMinutes <= 0) {
                return (
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-600/20 via-teal-600/20 to-blue-600/20 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-emerald-500/10">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/20 px-2.5 py-0.5 rounded-full">
                          🎙️ Ovozli Dublyaj
                        </span>
                        <span className="text-[11px] text-emerald-300 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Balansingiz yetarli ({availableMinutes} daqiqa)
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-extrabold text-white">
                        Ushbu videoni to&apos;liq o&apos;zbekcha ovozda eshitishni xohlaysizmi?
                      </h3>
                      <p className="text-xs text-gray-300">
                        Video davomiyligi: <strong className="text-white">{formattedDur}</strong> ({videoMinutes} daqiqa). Balansingizdagi daqiqalar yetarli — videoni to&apos;liq dublyaj qilishingiz mumkin.
                      </p>
                    </div>

                    <Link
                      href={`/?url=${encodeURIComponent(analysis.youtube_url)}&mode=dub`}
                      className="btn-premium px-5 py-3 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all shrink-0"
                    >
                      <Sparkles size={16} />
                      <span>O&apos;zbekcha dublyaj qilish</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              }

              return (
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 border border-blue-500/30 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-blue-500/10">
                  <div className="space-y-2 text-center md:text-left max-w-2xl">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-blue-400 bg-blue-500/20 px-2.5 py-0.5 rounded-full">
                        🎙️ Ovozli Dublyaj
                      </span>
                      {recPack && (
                        <span className="text-[11px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Tavsiya paket: +{recPack.minutes} daqiqa ({recPack.price.toLocaleString("uz-UZ")} so&apos;m)
                        </span>
                      )}
                      {recPlan && (
                        <span className="text-[11px] text-violet-300 font-bold bg-violet-500/10 px-2 py-0.5 rounded-full">
                          yoki {recPlan.name} tarifi ({recPlan.price.toLocaleString("uz-UZ")} so&apos;m/oy)
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-extrabold text-white">
                      Ushbu videoni to&apos;liq o&apos;zbekcha ovozda eshitishni xohlaysizmi?
                    </h3>
                    <p className="text-xs text-gray-300 leading-relaxed">
                      Video davomiyligi: <strong className="text-white">{formattedDur}</strong> ({videoMinutes} daqiqa).{" "}
                      Balansingizda {availableMinutes} daqiqa mavjud — to&apos;liq dublyaj qilish uchun{" "}
                      <strong className="text-amber-300">{neededMinutes} daqiqa</strong> yetishmayapti.{" "}
                      Ushbu videoni dublyaj qilish uchun{" "}
                      {recPack && (
                        <>
                          <strong className="text-emerald-300">+{recPack.minutes} daqiqalik paketni</strong> ({recPack.price.toLocaleString("uz-UZ")} so&apos;m) olishni{" "}
                        </>
                      )}
                      yoki{" "}
                      <strong className="text-violet-300">{recPlan.name} tarifiga</strong> ({recPlan.price.toLocaleString("uz-UZ")} so&apos;m/oy) o&apos;tishni tavsiya qilamiz!
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0 w-full md:w-auto">
                    <Link
                      href={`/pricing?reason=insufficient_minutes&short=${encodeURIComponent(neededMinutes)}&duration=${encodeURIComponent(videoMinutes)}`}
                      className="btn-premium w-full sm:w-auto px-5 py-3 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap flex items-center justify-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all"
                    >
                      <CreditCard size={15} />
                      <span>Paket yoki tarif olish</span>
                    </Link>
                    <Link
                      href={`/?url=${encodeURIComponent(analysis.youtube_url)}&mode=dub`}
                      className="w-full sm:w-auto px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs sm:text-sm font-bold whitespace-nowrap flex items-center justify-center gap-1.5 transition-all border border-white/10"
                    >
                      <Sparkles size={14} className="text-amber-400" />
                      <span>2 daqiqa bepul sinash</span>
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              );
            })()}

            <div role="tablist" aria-label="Tahlil bo'limlari" className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  id={`tab-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${
                    tab === t.key ? "bg-white/10 text-blue-400 shadow" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              {tab === "summary" && analysis.summary && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Qisqa</h3>
                    <p className="text-gray-200 text-sm leading-relaxed">{analysis.summary.short}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">O'rtacha</h3>
                    <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{analysis.summary.medium}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">Batafsil</h3>
                    <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{analysis.summary.detailed}</p>
                  </div>
                  {analysis.key_points && analysis.key_points.length > 0 && (
                    <div>
                      <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-3">Asosiy fikrlar</h3>
                      <div className="space-y-2">
                        {analysis.key_points.map((kp, i) => (
                          <button
                            key={i}
                            onClick={() => seek(kp.timestamp)}
                            className="w-full text-left flex gap-3 items-start bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl p-3 transition"
                          >
                            <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                              {formatTs(kp.timestamp)}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-white">{kp.title}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{kp.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "chapters" && (
                <div className="space-y-2">
                  {(analysis.chapters || []).map((c, i) => (
                    <button
                      key={i}
                      onClick={() => seek(c.start)}
                      className="w-full text-left flex justify-between items-center bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl p-3 transition"
                    >
                      <span className="text-sm font-bold text-white">{c.title}</span>
                      <span className="text-[11px] font-mono text-blue-400">{formatTs(c.start)}</span>
                    </button>
                  ))}
                  {(!analysis.chapters || analysis.chapters.length === 0) && (
                    <p className="text-sm text-gray-500">Boblar topilmadi.</p>
                  )}
                </div>
              )}

              {tab === "transcript" && (
                <div className="space-y-4">
                  {analysis.video_language && analysis.video_language !== analysis.language && (
                    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-fit">
                      <button
                        onClick={() => setTranscriptView("normal")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${transcriptView === "normal" ? "bg-white/10 text-blue-400" : "text-gray-400 hover:text-gray-200"}`}
                      >
                        Oddiy
                      </button>
                      <button
                        onClick={handleToggleBilingual}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${transcriptView === "bilingual" ? "bg-white/10 text-blue-400" : "text-gray-400 hover:text-gray-200"}`}
                      >
                        Bilingual
                      </button>
                    </div>
                  )}

                  {transcriptView === "normal" ? (
                    <>
                      <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                          <Search className="w-4 h-4 text-gray-500" />
                          <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Transkript ichidan qidirish..."
                            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
                          />
                        </div>
                        <button type="submit" className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-400 text-sm font-bold hover:bg-blue-500/30 transition">
                          Qidirish
                        </button>
                      </form>
                      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                        {(searchResults ?? transcript).map((seg, i) => (
                          <button
                            key={i}
                            onClick={() => seek(seg.start)}
                            className="w-full text-left flex gap-3 items-start hover:bg-white/[0.04] rounded-lg p-2 transition"
                          >
                            <span className="text-[11px] font-mono text-blue-400 shrink-0 mt-0.5">{formatTs(seg.start)}</span>
                            <span className="text-sm text-gray-300">{seg.text}</span>
                          </button>
                        ))}
                        {searchResults?.length === 0 && (
                          <p className="text-sm text-gray-500">Hech narsa topilmadi.</p>
                        )}
                      </div>
                    </>
                  ) : bilingualLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
                      <Loader2 className="w-4 h-4 animate-spin" /> Bilingual ko'rinish tayyorlanmoqda...
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {(bilingual ?? []).map((seg, i) => (
                        <button
                          key={i}
                          onClick={() => seek(seg.start)}
                          className="w-full text-left flex gap-3 items-start hover:bg-white/[0.04] rounded-lg p-2.5 transition border border-white/5"
                        >
                          <span className="text-[11px] font-mono text-blue-400 shrink-0 mt-0.5">{formatTs(seg.start)}</span>
                          <div className="space-y-1">
                            <p className="text-sm text-white">{seg.original}</p>
                            <p className="text-sm text-gray-400">{seg.translated}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "notes" && (
                <NotesTab notes={notes} loading={notesLoading} onGenerate={handleGenerateNotes} />
              )}

              {tab === "quiz" && (
                <QuizTab
                  quiz={quiz}
                  loading={quizLoading}
                  answers={quizAnswers}
                  onGenerate={handleGenerateQuiz}
                  onAnswer={(qi, oi) => setQuizAnswers((prev) => ({ ...prev, [qi]: oi }))}
                  onSeek={seek}
                />
              )}

              {tab === "qa" && (
                <QATab
                  history={qaHistory}
                  question={question}
                  asking={asking}
                  onQuestionChange={setQuestion}
                  onAsk={handleAsk}
                  onSeek={seek}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
