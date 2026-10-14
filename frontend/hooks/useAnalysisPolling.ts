import { useState, useEffect, useRef, useCallback } from "react";
import { getAnalysis, VideoAnalysis, AnalysisStatus } from "@/lib/api";

const TERMINAL_STATUSES: AnalysisStatus[] = ["completed", "failed"];
const POLL_INTERVAL = 2000; // 2 soniya

export function useAnalysisPolling(analysisId: string | null) {
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    if (!analysisId) return;
    try {
      const data = await getAnalysis(analysisId);
      setAnalysis(data);
      setError(null);

      if (!TERMINAL_STATUSES.includes(data.status)) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setIs404(true);
        setError("Tahlil topilmadi.");
        return;
      }
      setError("Server bilan aloqa yo'q. Qayta urinilmoqda...");
      timerRef.current = setTimeout(poll, POLL_INTERVAL * 2);
    }
  }, [analysisId]);

  useEffect(() => {
    setIs404(false);
    setAnalysis(null);
    setError(null);

    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [poll]);

  return { analysis, error, is404, refetch: poll };
}
