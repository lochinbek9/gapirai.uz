"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/components/home/SiteHeader";
import Footer from "@/components/Footer";
import {
  ArrowLeft, Loader2, AlertTriangle, Search, RotateCw, LogIn, Sparkles, ArrowRight, CreditCard,
  CheckCircle2, Clock, Brain, FileText, Video as VideoIcon, X, ChevronDown, ChevronUp, Copy, Check, XCircle,
} from "lucide-react";
import {
  ANALYSIS_STATUS_LABELS, askQuestion, generateQuiz, generateNotes, generateBilingual,
  searchTranscript, getTranscript, clearAnalysisId, displayLanguage, retryAnalysis, cancelAnalysis, TranscriptSegment, QuizQuestion, QAEntry, BilingualSegment,
  getPlans, PlanDef, MinutePack, CurrentSubscription,
} from "@/lib/api";

const ANALYSIS_TIPS = [
  "AI intellekti videoning eng muhim joylarini ajratib, qisqa konspekt tuzmoqda...",
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
import ConfirmModal from "@/components/ConfirmModal";
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
  const [cancelling, setCancelling] = useState(false);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [copiedError, setCopiedError] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAEntry[]>([]);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesStartTime, setNotesStartTime] = useState<number | null>(null);
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
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

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

  const handleCancel = () => {
    if (!id || cancelling) return;
    setConfirmCancelOpen(true);
  };

  const executeCancel = async () => {
    setCancelling(true);
    try {
      await cancelAnalysis(id);
      showToast("Video tahlili muvaffaqiyatli bekor qilindi.", "success");
      setConfirmCancelOpen(false);
      await refetch();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Bekor qilishda xatolik yuz berdi.");
    } finally {
      setCancelling(false);
    }
  };

  const handleCopyError = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedError(true);
    setTimeout(() => setCopiedError(false), 2000);
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
    setQuizStartTime(Date.now());
    setQuizLoading(true);
    try {
      const res = await generateQuiz(id);
      setQuiz(res.quiz);
      showToast("Test savollari muvaffaqiyatli tayyorlandi!", "success");
    } catch {
      showToast("Test yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setQuizLoading(false);
      setQuizStartTime(null);
    }
  };

  const handleGenerateNotes = async (force: boolean = false) => {
    if (!id) return;
    setNotesStartTime(Date.now());
    setNotesLoading(true);
    try {
      const res = await generateNotes(id, force);
      setNotes(res.notes);
      showToast(force ? "Konspekt yangilandi!" : "Konspekt muvaffaqiyatli yaratildi!", "success");
    } catch {
      showToast("Konspekt yaratishda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
    } finally {
      setNotesLoading(false);
      setNotesStartTime(null);
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
      <div className="min-h-screen bg-ui-surface flex items-center justify-center p-4">
        <div className="ui-card w-full max-w-md space-y-4 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-700 dark:text-amber-300 mx-auto" />
          <h2 className="text-xl font-semibold text-ui-ink">Tahlil topilmadi</h2>
          <p className="text-sm text-ui-muted">
            Ushbu video tahlili mavjud emas yoki o'chirilgan bo'lishi mumkin.
          </p>
          <Link
            href="/"
            className="ui-btn ui-btn-primary"
          >
            Bosh sahifaga qaytish
          </Link>
        </div>
      </div>
    );
  }

  if (error === "auth_required") {
    return (
      <div className="min-h-screen bg-ui-surface flex items-center justify-center p-4">
        <div className="ui-card w-full max-w-md space-y-4 p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-ui-accent-ink flex items-center justify-center mx-auto">
            <LogIn className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-semibold text-ui-ink">Tizimga kirish talab qilinadi</h2>
          <p className="text-sm text-ui-muted">
            Ushbu tahlilni ko'rish yoki uning jarayonini kuzatish uchun profilingizga kiring.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Link
              href={`/login?returnUrl=/video-analysis/${id}`}
              className="ui-btn ui-btn-primary"
            >
              Kirish
            </Link>
            <Link
              href="/"
              className="ui-btn ui-btn-secondary"
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
      <div className="min-h-screen bg-ui-surface flex items-center justify-center p-4">
        <div className="ui-card w-full max-w-md space-y-4 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-ui-red-ink mx-auto" />
          <h2 className="text-xl font-semibold text-ui-ink">Kirish cheklangan</h2>
          <p className="text-sm text-ui-muted">
            Ushbu tahlil shaxsiy bo'lib, faqat uning egasi ko'rishi mumkin.
          </p>
          <Link
            href="/"
            className="ui-btn ui-btn-primary"
          >
            Bosh sahifaga qaytish
          </Link>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-ui-surface flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-ui-accent-ink animate-spin" />
        <span className="text-xs text-ui-muted font-medium">Yuklanmoqda...</span>
      </div>
    );
  }

  const videoId = extractYouTubeId(analysis.youtube_url);
  const isDone = analysis.status === "completed";
  const isFailed = analysis.status === "failed";

  return (
    <>
    <SiteHeader />
    <main id="main" tabIndex={-1} className="min-h-screen bg-ui-surface text-ui-ink focus:outline-none">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-6 sm:px-6">
        <button type="button" onClick={() => { clearAnalysisId(); router.push("/dashboard"); }} className="inline-flex items-center gap-1.5 text-sm text-ui-muted transition hover:text-ui-ink">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Mening videolarim
        </button>
        {analysis.linked_job_id && (
          <Link href={`/video/${analysis.linked_job_id}`} className="ui-btn ui-btn-secondary min-h-9 px-3.5 text-sm">
            Dublyaj sahifasi <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Modern Toast Notification */}
        {toast && (
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-center justify-between gap-3 transition-all duration-300 ${
              toast.type === "error"
                ? "bg-red-950/80 border-red-500/40 text-ui-red-ink"
                : "bg-emerald-950/80 border-emerald-500/40 text-ui-green-ink"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === "error" ? (
                <AlertTriangle className="w-5 h-5 text-ui-red-ink shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-ui-green-ink shrink-0" />
              )}
              <p className="text-xs sm:text-sm font-semibold">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:bg-ui-ground rounded-lg text-ui-muted hover:text-ui-ink transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {!isDone && !isFailed && (
          <div className="bg-ui-ground border border-ui-rule rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Top row: Video Thumbnail & Info + Elapsed Time */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-ui-rule">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                {analysis.video_thumbnail ? (
                  <div className="relative w-24 sm:w-28 aspect-video rounded-xl overflow-hidden bg-ui-ground border border-ui-rule flex-shrink-0">
                    <img
                      src={analysis.video_thumbnail}
                      alt={analysis.video_title || "Video"}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-ui-rule flex items-center justify-center flex-shrink-0">
                    <VideoIcon className="w-7 h-7 text-ui-accent-ink" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-semibold text-ui-ink line-clamp-2">
                    {analysis.video_title || "Video tahlili tayyorlanmoqda..."}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-ui-muted mt-1">
                    {analysis.video_duration ? (
                      <span>Davomiyligi: {formatHumanDuration(analysis.video_duration)}</span>
                    ) : null}
                    <span className="flex items-center gap-1 text-ui-accent-ink font-medium">
                      <Clock className="w-3.5 h-3.5" /> {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                <div className="flex items-center sm:flex-col sm:items-end gap-2 sm:gap-0.5">
                  <span className="text-2xl font-semibold text-ui-ink">
                    {Math.round(analysis.progress)}%
                  </span>
                  <span className="text-xs font-semibold text-ui-green-ink flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                    Jarayonda
                  </span>
                </div>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold text-ui-red-ink hover:text-ui-red-ink transition active:scale-95 disabled:opacity-50 shadow-sm"
                  title="Tahlilni to'xtatish va bekor qilish"
                >
                  {cancelling ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Bekor qilish</span>
                </button>
              </div>
            </div>

            {/* Glowing Progress Bar */}
            <div className="space-y-2">
              <div className="w-full h-2.5 rounded-full bg-ui-ground overflow-hidden p-0.5 border border-ui-rule">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                  style={{ width: `${Math.max(5, analysis.progress)}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs text-ui-muted">
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
                  desc: "Groq Whisper (so'zma-so'z)",
                  icon: FileText,
                },
                {
                  idx: 2,
                  title: "3. Sun'iy Intellekt Tahlili",
                  desc: "Xulosa va boblar",
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
                        ? " bg-blue-500/15 border-blue-500/40 shadow-lg ring-1 ring-blue-500/30"
                        : isPassed
                        ? "bg-emerald-500/5 border-emerald-500/30 text-ui-muted"
                        : "bg-ui-ground border-ui-rule opacity-60 text-ui-muted"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                          isCurrent
                            ? "bg-blue-500 text-white shadow-md animate-pulse"
                            : isPassed
                            ? "bg-ui-green/10 text-ui-green-ink border border-emerald-500/40"
                            : "bg-ui-ground text-ui-muted"
                        }`}
                      >
                        {isPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-ui-green-ink" />
                        ) : isCurrent ? (
                          <Loader2 className="w-4 h-4 animate-spin text-ui-ink" />
                        ) : (
                          <StageIcon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <span className={`text-xs font-semibold leading-tight ${isCurrent ? "text-ui-ink" : isPassed ? "text-ui-ink" : "text-ui-muted"}`}>
                        {stage.title}
                      </span>
                    </div>
                    <p className="text-xs text-ui-muted leading-tight pl-9">
                      {stage.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Rotating Tips Box & Cancel */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-ui-ground border border-ui-rule">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-300" />
                </div>
                <p className="text-xs text-ui-muted transition-all duration-500">
                  {ANALYSIS_TIPS[tipIndex]}
                </p>
              </div>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-ui-ground hover:bg-rose-500/10 border border-ui-rule hover:border-rose-500/30 text-xs font-semibold text-ui-muted hover:text-ui-red-ink transition shrink-0 active:scale-95 disabled:opacity-50"
                title="Tahlilni to'xtatish"
              >
                {cancelling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>To'xtatish</span>
              </button>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-rose-950/20 p-6 sm:p-10 shadow-2xl space-y-8">
            {/* Ambient Background Glow */}

            {/* Top Video Header Card */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-ui-rule relative z-10">
              <div className="flex items-center gap-4 min-w-0">
                {analysis.video_thumbnail ? (
                  <div className="relative w-24 sm:w-28 aspect-video rounded-xl overflow-hidden bg-ui-ground border border-ui-rule flex-shrink-0 shadow-md">
                    <img
                      src={analysis.video_thumbnail}
                      alt={analysis.video_title || "Video"}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-rose-950/20" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <VideoIcon className="w-6 h-6 text-ui-red-ink" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-ui-ink truncate max-w-lg">
                    {analysis.video_title || "YouTube Video"}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-ui-muted font-mono">
                    {analysis.video_duration && analysis.video_duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-ui-muted" />
                        {formatHumanDuration(analysis.video_duration)}
                      </span>
                    )}
                    <span>•</span>
                    <span className="truncate max-w-[200px] text-ui-muted">{analysis.youtube_url}</span>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-ui-red-ink text-xs font-semibold shrink-0">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span>Tahlil to'xtatildi</span>
              </div>
            </div>

            {/* Error Message & Friendly Diagnosis */}
            <div className="text-center max-w-xl mx-auto space-y-3 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-ui-red-ink flex items-center justify-center mx-auto shadow-lg ">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-ui-ink tracking-tight">
                Tahlil jarayonida to'xtalish yuz berdi
              </h2>
              <p className="text-sm text-ui-muted leading-relaxed">
                Video hajmi katta bo'lgani yoki sun'iy intellekt serverlarida vaqtinchalik yuklama yuqori bo'lgani sababli jarayon to'xtab qoldi.
                Balansingizdagi daqiqalar saqlab qolingan.
              </p>
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 relative z-10">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="inline-flex items-center justify-center gap-2.5 px-7 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-xl active:scale-95 transition-all duration-300 disabled:opacity-50"
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

              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-ui-ground hover:bg-rose-500/15 border border-ui-rule hover:border-rose-500/40 text-ui-muted hover:text-ui-red-ink font-semibold text-sm transition active:scale-95 disabled:opacity-50"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-ui-red-ink" />
                    <span>Bekor qilinmoqda...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-ui-red-ink" />
                    <span>Tahlilni bekor qilish</span>
                  </>
                )}
              </button>

              <button
                onClick={() => { clearAnalysisId(); router.push("/"); }}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-ui-ground hover:bg-ui-ground border border-ui-rule text-ui-muted hover:text-ui-ink font-semibold text-sm transition active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Boshqa video tahlil qilish</span>
              </button>
            </div>

            {/* Collapsible Technical Details */}
            <div className="pt-2 border-t border-ui-rule relative z-10">
              <button
                onClick={() => setShowTechDetails((prev) => !prev)}
                className="flex items-center justify-center gap-2 mx-auto text-xs text-ui-muted hover:text-ui-ink font-medium py-1 transition"
              >
                <span>Texnik xatolik tafsilotlari</span>
                {showTechDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showTechDetails && (
                <div className="mt-3 p-4 rounded-2xl bg-ui-ground border border-ui-rule text-left space-y-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs text-ui-muted font-mono pb-2 border-b border-ui-rule">
                    <span>ID: {analysis.id}</span>
                    <button
                      onClick={() => handleCopyError(`${analysis.error_message || ''}\nCode: ${analysis.error_code || ''}\nID: ${analysis.id}`)}
                      className="flex items-center gap-1 text-ui-muted hover:text-ui-ink transition"
                    >
                      {copiedError ? <Check className="w-3.5 h-3.5 text-ui-green-ink" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedError ? "Nusxalandi" : "Nusxa olish"}</span>
                    </button>
                  </div>
                  {analysis.error_code && (
                    <p className="text-xs font-mono text-ui-red-ink">
                      Kod: <span className="text-ui-ink font-semibold">{analysis.error_code}</span>
                    </p>
                  )}
                  <p className="text-xs font-mono text-ui-muted whitespace-pre-wrap break-words leading-relaxed">
                    {analysis.error_message || "Noma'lum xatolik yuz berdi."}
                  </p>
                </div>
              )}
            </div>

            {/* Helpful Advice Banner */}
            <div className="p-3.5 rounded-2xl bg-ui-ground border border-ui-rule flex items-start sm:items-center gap-3 text-xs text-ui-muted relative z-10">
              <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 text-ui-accent-ink">
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="leading-relaxed">
                <span className="font-semibold text-ui-ink">Foydali tavsiya:</span> Katta hajmdagi videolarda (1 soatdan ortiq) AI tahlili bo'lib-bo'lib amalga oshiriladi. <strong>«Qaytadan urinish»</strong> tugmasini bosganingizda tizim avtomatik ravishda optimal modelni ishga tushiradi.
              </p>
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
                className="w-full aspect-video rounded-2xl bg-black object-contain shadow-2xl border border-ui-rule"
              />
            ) : (
              <div className="aspect-video bg-black rounded-2xl flex items-center justify-center text-ui-muted text-sm">
                Video ko'rsatib bo'lmadi
              </div>
            )}

            <h1 className="text-xl font-semibold text-ui-ink">{analysis.video_title}</h1>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-ui-muted">
              {analysis.video_language && (
                <span className="bg-ui-ground border border-ui-rule rounded-lg px-2.5 py-1">
                  Original: {displayLanguage(analysis.video_language)}
                </span>
              )}
              <span className="bg-ui-ground border border-ui-rule rounded-lg px-2.5 py-1">
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
                  <div className="p-4 sm:p-5 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg ">
                    <div className="space-y-1 text-center sm:text-left">
                      <div className="flex items-center justify-center sm:justify-start gap-2">
                        <span className="text-xs font-semibold text-ui-green-ink bg-emerald-500/20 px-2.5 py-0.5 rounded-full">
                          🎙️ Ovozli Dublyaj
                        </span>
                        <span className="text-xs text-ui-green-ink font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Balansingiz yetarli ({availableMinutes} daqiqa)
                        </span>
                      </div>
                      <h3 className="text-sm sm:text-base font-semibold text-ui-ink">
                        Ushbu videoni to&apos;liq o&apos;zbekcha ovozda eshitishni xohlaysizmi?
                      </h3>
                      <p className="text-xs text-ui-muted">
                        Video davomiyligi: <strong className="text-ui-ink">{formattedDur}</strong> ({videoMinutes} daqiqa). Balansingizdagi daqiqalar yetarli — videoni to&apos;liq dublyaj qilishingiz mumkin.
                      </p>
                    </div>

                    <Link
                      href={analysis.linked_job_id ? `/video/${analysis.linked_job_id}` : `/?url=${encodeURIComponent(analysis.youtube_url)}&mode=dub`}
                      className="btn-premium px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shrink-0"
                    >
                      <Sparkles size={16} />
                      <span>{analysis.linked_job_id ? "Tayyor dublyajni ochish" : "O'zbekcha dublyaj qilish"}</span>
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              }

              return (
                <div className="p-4 sm:p-5 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg ">
                  <div className="space-y-2 text-center md:text-left max-w-2xl">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                      <span className="text-xs font-semibold text-ui-accent-ink bg-blue-500/20 px-2.5 py-0.5 rounded-full">
                        🎙️ Ovozli Dublyaj
                      </span>
                      {recPack && (
                        <span className="text-xs text-ui-green-ink font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Tavsiya paket: +{recPack.minutes} daqiqa ({recPack.price.toLocaleString("uz-UZ")} so&apos;m)
                        </span>
                      )}
                      {recPlan && (
                        <span className="text-xs text-ui-accent-ink font-semibold bg-blue-500/10 px-2 py-0.5 rounded-full">
                          yoki {recPlan.name} tarifi ({recPlan.price.toLocaleString("uz-UZ")} so&apos;m/oy)
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-semibold text-ui-ink">
                      Ushbu videoni to&apos;liq o&apos;zbekcha ovozda eshitishni xohlaysizmi?
                    </h3>
                    <p className="text-xs text-ui-muted leading-relaxed">
                      Video davomiyligi: <strong className="text-ui-ink">{formattedDur}</strong> ({videoMinutes} daqiqa).{" "}
                      Balansingizda {availableMinutes} daqiqa mavjud — to&apos;liq dublyaj qilish uchun{" "}
                      <strong className="text-amber-700 dark:text-amber-300">{neededMinutes} daqiqa</strong> yetishmayapti.{" "}
                      Ushbu videoni dublyaj qilish uchun{" "}
                      {recPack && (
                        <>
                          <strong className="text-ui-green-ink">+{recPack.minutes} daqiqalik paketni</strong> ({recPack.price.toLocaleString("uz-UZ")} so&apos;m) olishni{" "}
                        </>
                      )}
                      yoki{" "}
                      <strong className="text-ui-accent-ink">{recPlan.name} tarifiga</strong> ({recPlan.price.toLocaleString("uz-UZ")} so&apos;m/oy) o&apos;tishni tavsiya qilamiz!
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-2.5 shrink-0 w-full md:w-auto">
                    {analysis.linked_job_id ? (
                      <Link
                        href={`/video/${analysis.linked_job_id}`}
                        className="btn-premium w-full sm:w-auto px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all"
                      >
                        <Sparkles size={15} />
                        <span>Dublyaj sahifasiga o'tish</span>
                        <ArrowRight size={13} />
                      </Link>
                    ) : (
                      <>
                        <Link
                          href={`/pricing?reason=insufficient_minutes&short=${encodeURIComponent(neededMinutes)}&duration=${encodeURIComponent(videoMinutes)}`}
                          className="btn-premium w-full sm:w-auto px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all"
                        >
                          <CreditCard size={15} />
                          <span>Paket yoki tarif olish</span>
                        </Link>
                        <Link
                          href={`/?url=${encodeURIComponent(analysis.youtube_url)}&mode=dub`}
                          className="w-full sm:w-auto px-4 py-3 rounded-xl bg-ui-ground hover:bg-white/15 text-ui-ink text-xs sm:text-sm font-semibold whitespace-nowrap flex items-center justify-center gap-1.5 transition-all border border-ui-rule"
                        >
                          <Sparkles size={14} className="text-amber-700 dark:text-amber-300" />
                          <span>2 daqiqa bepul sinash</span>
                          <ArrowRight size={13} />
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            <div role="tablist" aria-label="Tahlil bo'limlari" className="flex gap-1 p-1 rounded-2xl bg-ui-ground border border-ui-rule overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  aria-controls={`panel-${t.key}`}
                  id={`tab-${t.key}`}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all ${
                    tab === t.key ? "bg-ui-ground text-ui-accent-ink shadow" : "text-ui-muted hover:text-ui-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="bg-ui-ground border border-ui-rule rounded-2xl p-6">
              {tab === "summary" && analysis.summary && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-semibold text-ui-accent-ink mb-2">Qisqa</h3>
                    <p className="text-ui-ink text-sm leading-relaxed">{analysis.summary.short}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-ui-accent-ink mb-2">O'rtacha</h3>
                    <p className="text-ui-ink text-sm leading-relaxed whitespace-pre-line">{analysis.summary.medium}</p>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-ui-accent-ink mb-2">Batafsil</h3>
                    <p className="text-ui-ink text-sm leading-relaxed whitespace-pre-line">{analysis.summary.detailed}</p>
                  </div>
                  {analysis.key_points && analysis.key_points.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-ui-accent-ink mb-3">Asosiy fikrlar</h3>
                      <div className="space-y-2">
                        {analysis.key_points.map((kp, i) => (
                          <button
                            key={i}
                            onClick={() => seek(kp.timestamp)}
                            className="w-full text-left flex gap-3 items-start bg-ui-ground hover:bg-ui-ground border border-ui-rule rounded-xl p-3 transition"
                          >
                            <span className="text-xs font-mono text-ui-accent-ink bg-blue-500/10 rounded px-1.5 py-0.5 mt-0.5 shrink-0">
                              {formatTs(kp.timestamp)}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-ui-ink">{kp.title}</p>
                              <p className="text-xs text-ui-muted mt-0.5">{kp.description}</p>
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
                      className="w-full text-left flex justify-between items-center bg-ui-ground hover:bg-ui-ground border border-ui-rule rounded-xl p-3 transition"
                    >
                      <span className="text-sm font-semibold text-ui-ink">{c.title}</span>
                      <span className="text-xs font-mono text-ui-accent-ink">{formatTs(c.start)}</span>
                    </button>
                  ))}
                  {(!analysis.chapters || analysis.chapters.length === 0) && (
                    <p className="text-sm text-ui-muted">Boblar topilmadi.</p>
                  )}
                </div>
              )}

              {tab === "transcript" && (
                <div className="space-y-4">
                  {analysis.video_language && analysis.video_language !== analysis.language && (
                    <div className="flex gap-1 p-1 rounded-xl bg-ui-ground border border-ui-rule w-fit">
                      <button
                        onClick={() => setTranscriptView("normal")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${transcriptView === "normal" ? "bg-ui-ground text-ui-accent-ink" : "text-ui-muted hover:text-ui-ink"}`}
                      >
                        Oddiy
                      </button>
                      <button
                        onClick={handleToggleBilingual}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${transcriptView === "bilingual" ? "bg-ui-ground text-ui-accent-ink" : "text-ui-muted hover:text-ui-ink"}`}
                      >
                        Bilingual
                      </button>
                    </div>
                  )}

                  {transcriptView === "normal" ? (
                    <>
                      <form onSubmit={handleSearch} className="flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-ui-ground border border-ui-rule rounded-xl px-3 py-2">
                          <Search className="w-4 h-4 text-ui-muted" />
                          <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Transkript ichidan qidirish..."
                            className="flex-1 bg-transparent text-sm text-ui-ink placeholder:text-ui-muted focus:outline-none"
                          />
                        </div>
                        <button type="submit" className="px-4 py-2 rounded-xl bg-blue-500/20 text-ui-accent-ink text-sm font-semibold hover:bg-blue-500/30 transition">
                          Qidirish
                        </button>
                      </form>
                      <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                        {(searchResults ?? transcript).map((seg, i) => (
                          <button
                            key={i}
                            onClick={() => seek(seg.start)}
                            className="w-full text-left flex gap-3 items-start hover:bg-ui-ground rounded-lg p-2 transition"
                          >
                            <span className="text-xs font-mono text-ui-accent-ink shrink-0 mt-0.5">{formatTs(seg.start)}</span>
                            <span className="text-sm text-ui-muted">{seg.text}</span>
                          </button>
                        ))}
                        {searchResults?.length === 0 && (
                          <p className="text-sm text-ui-muted">Hech narsa topilmadi.</p>
                        )}
                      </div>
                    </>
                  ) : bilingualLoading ? (
                    <div className="flex items-center gap-2 text-sm text-ui-muted py-6">
                      <Loader2 className="w-4 h-4 animate-spin" /> Bilingual ko'rinish tayyorlanmoqda...
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {(bilingual ?? []).map((seg, i) => (
                        <button
                          key={i}
                          onClick={() => seek(seg.start)}
                          className="w-full text-left flex gap-3 items-start hover:bg-ui-ground rounded-lg p-2.5 transition border border-ui-rule"
                        >
                          <span className="text-xs font-mono text-ui-accent-ink shrink-0 mt-0.5">{formatTs(seg.start)}</span>
                          <div className="space-y-1">
                            <p className="text-sm text-ui-ink">{seg.original}</p>
                            <p className="text-sm text-ui-muted">{seg.translated}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "notes" && (
                <NotesTab
                  notes={notes}
                  loading={notesLoading}
                  onGenerate={() => handleGenerateNotes(false)}
                  onRegenerate={() => handleGenerateNotes(true)}
                  startTime={notesStartTime}
                  videoDuration={analysis?.video_duration}
                />
              )}

              {tab === "quiz" && (
                <QuizTab
                  quiz={quiz}
                  loading={quizLoading}
                  answers={quizAnswers}
                  onGenerate={handleGenerateQuiz}
                  onAnswer={(qi, oi) => setQuizAnswers((prev) => ({ ...prev, [qi]: oi }))}
                  onSeek={seek}
                  startTime={quizStartTime}
                  videoDuration={analysis?.video_duration}
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

      {/* Modern Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={executeCancel}
        loading={cancelling}
        title="Video tahlilini bekor qilish"
        message="Haqiqatan ham ushbu video tahlilini to'xtatib bekor qilmoqchimisiz?"
        confirmText="Ha, bekor qilinsin"
        cancelText="Ortga"
        danger
      />
    </main>
    <Footer />
    </>
  );
}
