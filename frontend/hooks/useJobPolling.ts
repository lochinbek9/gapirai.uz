import { useState, useEffect, useRef } from "react";
import { getJob, Job, JobStatus } from "@/lib/api";

const TERMINAL_STATUSES: JobStatus[] = ["completed", "failed"];
const POLL_INTERVAL = 2000; // 2 soniya

export function useJobPolling(jobId: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const data = await getJob(jobId);
        setJob(data);
        setError(null);

        if (!TERMINAL_STATUSES.includes(data.status)) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL);
        }
      } catch (err) {
        setError("Server bilan aloqa yo'q. Qayta urinilmoqda...");
        timerRef.current = setTimeout(poll, POLL_INTERVAL * 2);
      }
    };

    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);

  return { job, error };
}
