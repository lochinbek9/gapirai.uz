import { useState, useEffect, useRef } from "react";
import { getJob, Job, JobStatus } from "@/lib/api";

const TERMINAL_STATUSES: JobStatus[] = ["completed", "failed"];

// Har kutayotgan foydalanuvchi shu intervalda GET /api/jobs/{id} qiladi, shuning
// uchun so'rovlar soni = ochiq job sahifalari soni / interval. Hamma holatda
// 1.5s bo'lganda navbatda kutayotgan yuzlab odam serverni bekorga yuklardi
// (navbatdagi job'da o'zgaradigan hech narsa yo'q). Interval bosqichga qarab:
//  - FAST: backend bosqich ichidagi jonli foizni qaytaradi (job_progress.py)
//    faqat DOWNLOADING/SYNTHESIZING'da -- progress bar silliq harakatlanadi.
//  - MEDIUM: boshqa faol bosqichlar (matn, tarjima, birlashtirish).
//  - SLOW: navbatda / to'lov kutilmoqda -- holat kamdan-kam o'zgaradi.
//  - HIDDEN: tab fonda -- foydalanuvchi ko'rmayapti.
const POLL_FAST = 1500;
const POLL_MEDIUM = 3000;
const POLL_SLOW = 6000;
const POLL_HIDDEN = 15000;
const POLL_ERROR_MAX = 20000;

function baseDelay(status: JobStatus): number {
  if (status === "downloading" || status === "synthesizing") return POLL_FAST;
  if (status === "pending" || status === "awaiting_payment") return POLL_SLOW;
  return POLL_MEDIUM;
}

// +-20% tasodifiy og'ish: bir vaqtda ochilgan sahifalar hamma bir zumda
// so'rov yubormasligi uchun (thundering herd).
function withJitter(ms: number): number {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

export function useJobPolling(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIs404(false);
    setJob(null);
    setError(null);

    if (!jobId) return;

    let cancelled = false;
    let errorCount = 0;
    let terminal = false;

    const schedule = (ms: number) => {
      if (cancelled || terminal) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      timerRef.current = setTimeout(poll, withJitter(hidden ? Math.max(ms, POLL_HIDDEN) : ms));
    };

    const poll = async () => {
      try {
        const data = await getJob(jobId);
        if (cancelled) return;
        errorCount = 0;
        setJob(data);
        setError(null);

        if (TERMINAL_STATUSES.includes(data.status)) {
          terminal = true;
          return;
        }
        schedule(baseDelay(data.status));
      } catch (err: any) {
        if (cancelled) return;
        if (err?.response?.status === 404) {
          terminal = true;
          setIs404(true);
          setError("Job topilmadi.");
          return;
        }
        errorCount += 1;
        setError("Server bilan aloqa yo'q. Qayta urinilmoqda...");
        // Server band bo'lganda tez-tez urib uni yanada bosmaslik uchun
        // eksponensial kutish (3s, 6s, 12s ... 20s).
        schedule(Math.min(POLL_MEDIUM * 2 ** (errorCount - 1), POLL_ERROR_MAX));
      }
    };

    // Tab yana ko'ringanda kutmasdan darhol yangilaymiz.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !terminal && !cancelled) {
        if (timerRef.current) clearTimeout(timerRef.current);
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    poll();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);

  return { job, error, is404 };
}
