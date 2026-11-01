"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createJob, getJob, getVideoInfo, VideoInfo, cancelJob } from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import { useAuth } from "@/hooks/useAuth";
import DubbingForm from "@/components/DubbingForm";
import AnalysisForm from "@/components/AnalysisForm";
import SubtitleForm from "@/components/SubtitleForm";
import StepProgress from "@/components/StepProgress";
import VideoResult from "@/components/VideoResult";
import Footer from "@/components/Footer";
import DonateCTA from "@/components/DonateCTA";
import TelegramFeedbackSection from "@/components/TelegramFeedbackSection";
import PreviewOfferModal from "@/components/PreviewOfferModal";
import UploadRecoveryPrompt from "@/components/UploadRecoveryPrompt";
import { X, UserPlus, LogIn, Sparkles, AlertTriangle } from "lucide-react";
import TabList, { tabPanelProps } from "@/components/ui/TabList";
import SiteHeader from "@/components/home/SiteHeader";
import StatsStrip from "@/components/home/StatsStrip";
import Services from "@/components/home/Services";
import HowItWorks from "@/components/home/HowItWorks";
import PublicVideosStrip from "@/components/home/PublicVideosStrip";
import TelegramSection from "@/components/home/TelegramSection";
import { SERVICES, type ServiceId } from "@/components/home/serviceList";


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

/* ── Birinchi tashrif: ro'yxatdan o'tish taklifi ─────
   Ilgari sahifani to'sadigan modal edi; endi birinchi ekranni bloklamaydigan,
   yopiladigan qator (yopilganda dubber_welcome_seen saqlanadi). */
function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <aside aria-label="Ro'yxatdan o'tish taklifi" className="border-b border-ui-rule bg-ui-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <p className="flex-1 text-[15px] text-ui-muted">
          <strong className="font-medium text-ui-ink">Bepul hisob oching</strong> — videolaringiz saqlanadi va har 30 kunda 5 daqiqa bepul.
        </p>
        <div className="flex items-center gap-2">
          <Link href="/register" onClick={onClose} className="ui-btn min-h-10 flex-1 whitespace-nowrap px-3.5 text-sm sm:flex-none">
            <UserPlus aria-hidden="true" className="h-4 w-4" /> Ro&apos;yxatdan o&apos;tish
          </Link>
          <Link href="/login" onClick={onClose} className="ui-btn ui-btn-secondary hidden min-h-10 px-3.5 text-sm sm:inline-flex">
            <LogIn aria-hidden="true" className="h-4 w-4" /> Kirish
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Taklifni yopish"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ui-muted hover:bg-ui-ground hover:text-ui-ink"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
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
  const [voiceName, setVoiceName] = useState<string>("");
  const [ttsProvider, setTtsProvider] = useState<string>("gemini");
  const [isProUser, setIsProUser] = useState<boolean>(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [mode, setMode] = useState<"dub" | "subtitle" | "analyze">("dub");
  const [previewOffer, setPreviewOffer] = useState<{
    isOpen: boolean;
    videoMinutes: number;
    minutesShort: number;
    availableMinutes: number;
  }>({
    isOpen: false,
    videoMinutes: 15,
    minutesShort: 10,
    availableMinutes: 5,
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (user) {
      if (user.role === "admin") {
        setIsProUser(true);
      } else {
        import("@/lib/api").then(({ getPlans }) => {
          getPlans()
            .then((res) => {
              if (res.current?.plan === "pro") {
                setIsProUser(true);
              }
            })
            .catch(() => {});
        });
      }
    } else {
      setIsProUser(false);
    }
  }, [user]);

  const handleCancel = async () => {
    if (!jobId) return;
    const canRefund = job?.can_refund_on_cancel !== undefined
      ? job.can_refund_on_cancel
      : ((elapsed || 0) <= 30);
    const secLeft = job?.cancel_refund_seconds_left !== undefined
      ? Math.max(0, Math.round(job.cancel_refund_seconds_left))
      : Math.max(0, 30 - Math.round(elapsed || 0));
    const stageName = job?.initial_stage || "boshlang'ich";

    const confirmMsg = !canRefund
      ? "Diqqat: Dublyajning dastlabki bosqichi (30 soniya) yakunlangan yoki keyingi bosqichga o'tib bo'lgan! Server va AI resurslari sarflangani sababli, bekor qilsangiz sarflangan daqiqalar (limit) hisobingizga QAYTARILMAYDI!\n\nJarayonni bekor qilishni tasdiqlaysizmi?"
      : `Haqiqatan ham jarayonni bekor qilmoqchimisiz? Dastlabki bosqich (${stageName}) vaqti (30 soniya, qolgan vaqt: ${secLeft}s) ichida bo'lgani sababli sarflangan daqiqalaringiz hisobingizga to'liq qaytariladi.`;
    if (!confirm(confirmMsg)) return;
    setCancelLoading(true);
    try {
      const res = await cancelJob(jobId);
      if (res.success) {
        alert(res.message || "Jarayon muvaffaqiyatli bekor qilindi.");
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
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared") || params.get("url");
    const requestedMode = params.get("mode");
    if (requestedMode && (requestedMode === "dub" || requestedMode === "subtitle" || requestedMode === "analyze")) {
      setMode(requestedMode as any);
    }
    if (shared && (shared.includes("youtube.com") || shared.includes("youtu.be"))) {
      handleUrlChange(shared);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mehmon foydalanuvchi kiritgan video havolasini login/ro'yxatdan o'tgach avtomatik tiklash
  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    const pendingRaw = sessionStorage.getItem("pending_dub_job");
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        if (pending?.url) {
          handleUrlChange(pending.url);
          if (pending.voiceGender) setVoiceGender(pending.voiceGender);
          if (pending.ttsProvider) setTtsProvider(pending.ttsProvider);
          if (pending.voiceName) setVoiceName(pending.voiceName);
          sessionStorage.removeItem("pending_dub_job");
        }
      } catch {
        sessionStorage.removeItem("pending_dub_job");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (!isLoggedIn) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "pending_dub_job",
          JSON.stringify({
            url: url.trim(),
            voiceGender,
            ttsProvider,
            voiceName,
          })
        );
      }
      router.push('/login?returnUrl=/');
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
      const { job_id } = await createJob(
        url,
        voiceGender,
        false,
        "auto",
        ttsProvider || "gemini",
        voiceName || undefined
      );
      router.push(`/video/${job_id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object" && detail.error === "insufficient_minutes") {
        // Yangi foydalanuvchini birdaniga /pricing'ga haydab yo'qotmaslik uchun --
        // bepul 2 daqiqalik sinov dublyaji modalini ko'rsatamiz!
        const short = Number(detail.minutes_short) || 0;
        const dur = Number(detail.video_minutes) || 15;
        const available = Math.max(0, Math.round(dur - short));
        setPreviewOffer({
          isOpen: true,
          videoMinutes: dur,
          minutesShort: short,
          availableMinutes: available,
        });
        return;
      } else {
        setError((typeof detail === "string" ? detail : detail?.message) || "Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStartPreview = async () => {
    if (!url.trim()) return;
    setPreviewLoading(true);
    try {
      const { job_id } = await createJob(
        url,
        voiceGender,
        false,
        "auto",
        ttsProvider || "gemini",
        voiceName || undefined,
        undefined,
        false,
        true // is_preview = true (2 daqiqalik bepul sinov)
      );
      setPreviewOffer((prev) => ({ ...prev, isOpen: false }));
      router.push(`/video/${job_id}`);
    } catch (err: any) {
      const rawDetail = err?.response?.data?.detail;
      const message = typeof rawDetail === "string"
        ? rawDetail
        : (rawDetail?.message || "Sinov dublyajini boshlashda xatolik yuz berdi. Qaytadan urinib ko'ring.");
      alert(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleGoToPricingFromPreview = () => {
    const short = previewOffer.minutesShort;
    const dur = previewOffer.videoMinutes;
    setPreviewOffer((prev) => ({ ...prev, isOpen: false }));
    router.push(`/pricing?reason=insufficient_minutes&short=${encodeURIComponent(short)}&duration=${encodeURIComponent(dur)}`);
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

  // Xizmatni tanlash: rejim almashadi va forma ko'rinadigan joyga o'tiladi
  const pickService = (id: ServiceId) => {
    setMode(id);
    if (jobId) return;
    document.getElementById("boshlash")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="relative overflow-x-hidden bg-ui-surface text-ui-ink focus:outline-none">
        {showWelcome && <WelcomeModal onClose={handleCloseWelcome} />}
        <PreviewOfferModal
          isOpen={previewOffer.isOpen}
          videoInfo={videoInfo}
          videoMinutes={previewOffer.videoMinutes}
          minutesShort={previewOffer.minutesShort}
          availableMinutes={previewOffer.availableMinutes}
          loading={previewLoading}
          onClose={() => setPreviewOffer((prev) => ({ ...prev, isOpen: false }))}
          onStartPreview={handleStartPreview}
          onGoToPricing={handleGoToPricingFromPreview}
        />

        {/* ── Birinchi ekran: sarlavha + ishlaydigan forma ── */}
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] text-ui-ink sm:text-6xl lg:text-[4rem] [text-wrap:balance]">
              Dunyo bilimlari oʻzbek tilida
            </h1>
            <p className="mx-auto mt-5 max-w-[52ch] text-lg leading-relaxed text-ui-muted sm:text-xl [text-wrap:pretty]">
              YouTube havolasini yoki videongizni yuboring — u oʻzbekcha ovoz, subtitr yoki qisqa konspekt boʻlib qaytadi.
              Har 30 kunda 5 daqiqa bepul.
            </p>
          </div>

          <section id="boshlash" aria-label="Video yuborish" className="mx-auto mt-10 max-w-[720px] scroll-mt-24 sm:mt-12">
            <motion.div
              layout
              className="ui-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_40px_-12px_rgb(0_0_0/0.12)] sm:p-6 dark:shadow-none"
            >
              <AnimatePresence mode="wait">
                {phase === "idle" && (
                  <motion.div key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                    <TabList
                      idBase="mode"
                      label="Xizmat turi"
                      value={mode}
                      onChange={setMode}
                      items={(Object.keys(SERVICES) as ServiceId[]).map((id) => {
                        const Icon = SERVICES[id].icon;
                        return {
                          id,
                          label: (
                            <>
                              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                              {SERVICES[id].name}
                            </>
                          ),
                        };
                      })}
                      className="mb-5 grid grid-cols-3 gap-1 rounded-control bg-ui-ground p-1"
                      tabClassName={(active) =>
                        `flex min-h-10 items-center justify-center gap-2 rounded-lg px-1 text-sm font-medium transition sm:text-[15px] ${
                          active
                            ? "bg-ui-surface text-ui-ink shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(var(--ui-rule))]"
                            : "text-ui-muted hover:text-ui-ink"
                        }`
                      }
                    />
                    <div {...tabPanelProps("mode", mode)}>
                      {mode === "dub" ? (
                        <DubbingForm
                          url={url}
                          videoInfo={videoInfo}
                          loading={loading}
                          error={error}
                          voiceGender={voiceGender}
                          voiceName={voiceName}
                          ttsProvider={ttsProvider}
                          isProUser={isProUser}
                          onChange={handleUrlChange}
                          onGenderChange={setVoiceGender}
                          onVoiceNameChange={setVoiceName}
                          onTtsProviderChange={setTtsProvider}
                          onSubmit={handleSubmit}
                        />
                      ) : mode === "subtitle" ? (
                        <SubtitleForm />
                      ) : (
                        <AnalysisForm />
                      )}
                    </div>
                  </motion.div>
                )}

                {phase === "loading" && (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-12" role="status">
                    <Sparkles aria-hidden="true" className="h-5 w-5 animate-pulse text-ui-muted" />
                    <p className="text-[15px] text-ui-muted">Video maʼlumotlari tekshirilmoqda...</p>
                  </motion.div>
                )}

                {phase === "processing" && job && (
                  <motion.div key="processing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-6">
                    {job.video_title && (
                      <div className="border-b border-ui-rule pb-4">
                        <p className="text-sm text-ui-muted">Hozirgi video</p>
                        <h2 className="mt-1 line-clamp-2 text-lg font-semibold text-ui-ink">{job.video_title}</h2>
                      </div>
                    )}
                    <StepProgress job={job} elapsed={elapsed} onCancel={handleCancel} cancelLoading={cancelLoading} />
                  </motion.div>
                )}

                {phase === "done" && job && (
                  <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <VideoResult job={job} onReset={handleReset} />
                  </motion.div>
                )}

                {phase === "error" && job && (() => {
                  const isYouTubeRestricted =
                    job.error_code === 'AUTH_ERROR' ||
                    job.error_code === 'DOWNLOAD_FAILED' ||
                    job.error_code === 'HTTP_403' ||
                    job.error_code === 'PO_TOKEN_REQUIRED' ||
                    job.error_message?.toLowerCase().includes('bot') ||
                    job.error_message?.toLowerCase().includes('sign in') ||
                    job.error_message?.toLowerCase().includes('ruxsat') ||
                    job.error_message?.toLowerCase().includes('private');

                  return (
                    <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4" role="alert">
                      {isYouTubeRestricted ? (
                        <>
                          <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
                            <div className="flex items-start gap-3">
                              <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
                              <h2 className="text-lg font-semibold text-ui-ink">YouTube bu videoni yuklashga ruxsat bermadi</h2>
                            </div>
                            <p className="text-[15px] leading-relaxed text-ui-muted">
                              Bot himoyasi yoki yosh/hudud cheklovi sababli video avtomatik yuklanmadi. Videoni fayl sifatida yuklasangiz, dublaj odatdagidek ishlaydi.
                            </p>
                            <div className="rounded-control border border-ui-rule bg-ui-surface p-4">
                              <UploadRecoveryPrompt jobId={job.job_id} />
                            </div>
                          </div>
                          <button onClick={handleReset} className="ui-btn ui-btn-secondary w-full">Boshqa video kiritish</button>
                        </>
                      ) : (
                        <>
                          <div className="rounded-xl border border-ui-red/30 bg-ui-red/[0.05] p-5">
                            <h2 className="text-lg font-semibold text-ui-ink">Dublaj tugallanmadi</h2>
                            <p className="mt-2 text-[15px] leading-relaxed text-ui-muted">{job.error_message || "Kutilmagan xatolik yuz berdi."}</p>
                          </div>
                          <button onClick={handleReset} className="ui-btn ui-btn-secondary w-full">Qayta boshlash</button>
                        </>
                      )}
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </motion.div>
          </section>
        </div>

        <StatsStrip />
        <Services onPick={pickService} active={mode} />
        <HowItWorks />
        <PublicVideosStrip />
        <TelegramSection />

        <section id="haqida" aria-labelledby="haqida-title" className="scroll-mt-24 border-t border-ui-rule">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 id="haqida-title" className="text-3xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-4xl">GapirAI.uz haqida</h2>
              <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-ui-muted">
                <strong className="font-medium text-ui-ink">GapirAI.uz</strong> (Gapir AI) — ingliz tilidagi va boshqa xorijiy videolarni oʻzbek tiliga dublyaj (dublaj) qiluvchi onlayn dastur.
                Nutqni aniqlash, neyron tarjima va oʻzbekcha nutq sintezi (TTS) uchun sunʼiy intellekt modellaridan foydalanadi, videodagi spikerning jinsini aniqlab, unga mos ovoz tanlaydi.
                Qurilmangizga hech narsa oʻrnatish shart emas: hammasi brauzerda yoki Telegramʼda ishlaydi.
              </p>
              <DonateCTA variant="line" className="mt-8 justify-start" />
            </div>
            <div>
              <TelegramFeedbackSection />
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}
