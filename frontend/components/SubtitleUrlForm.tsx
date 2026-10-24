"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardPaste, FileText, Loader2, Youtube } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { createJob, SubtitleSourceLanguage } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** "Subtitr" rejimi (2026-09-16) -- AnalysisUrlForm bilan bir xil, o'zicha
 * mustaqil (parent'ning "dub" holat mashinasiga bog'liq emas): so'rov
 * yuboradi va natija sahifasiga (/subtitles/[id]) o'tkazadi. Dublyaj
 * audiosi/videosi yaratilmaydi -- backend/services/job_creation.py
 * subtitle_only=true bilan chaqiriladi. */
export default function SubtitleUrlForm({ sourceLanguage = "auto" }: { sourceLanguage?: SubtitleSourceLanguage }) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { job_id } = await createJob(url, "auto", true, sourceLanguage);
      router.push(`/subtitles/${job_id}`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object" && detail.error === "insufficient_minutes") {
        router.push("/pricing?reason=insufficient_minutes");
        return;
      }
      setError((typeof detail === "string" ? detail : detail?.message) || "Xatolik yuz berdi. Qayta urinib ko'ring.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="sub-url" className="m-label block">
          YouTube havolasi
        </label>
        <div className="m-input flex min-h-14 items-center gap-2 px-3 sm:px-4">
          <Youtube aria-hidden="true" className="h-5 w-5 shrink-0 text-metro-red" />
          <input
            id="sub-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube havolasini kiriting..."
            className="min-w-0 flex-1 bg-transparent text-base font-medium text-metro-ink placeholder:text-metro-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="flex shrink-0 items-center gap-1.5 rounded-[4px] px-2.5 py-2 font-sign text-sm font-bold uppercase tracking-wide text-metro-muted transition hover:bg-metro-ground hover:text-metro-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue"
          >
            <ClipboardPaste aria-hidden="true" size={14} />
            <span className="hidden sm:inline">Joylashtirish</span>
            <span className="sm:hidden">Qo&apos;yish</span>
          </button>
        </div>
        <p className="text-sm text-metro-muted">
          O'zbekcha subtitr (.srt/.vtt) yaratiladi — dublyaj audiosi yo'q, tezroq va TTS xarajatisiz.
        </p>
      </div>

      {!isLoggedIn && (
        <p className="text-base font-semibold text-amber-900 dark:text-amber-200 bg-amber-500/10 border-2 border-amber-600/40 rounded-[6px] px-4 py-3">
          Subtitr yaratish uchun{" "}
          <Link href="/login" className="underline hover:text-amber-900 dark:hover:text-amber-200">kiring</Link>
          {" "}yoki{" "}
          <Link href="/register" className="underline hover:text-amber-900 dark:hover:text-amber-200">ro'yxatdan o'ting</Link>.
        </p>
      )}

      {error && (
        <motion.div
          role="alert"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[6px] border-2 border-metro-red/50 bg-metro-red/5 px-4 py-3"
        >
                    <p className="text-base font-semibold text-metro-red-ink">{error}</p>
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={loading || !url.trim()}
                className="m-btn m-btn-blue min-h-14 w-full"
      >
        {loading ? (
          <><Loader2 aria-hidden="true" size={18} className="animate-spin" /> Subtitr yaratilmoqda...</>
        ) : (
          <><FileText aria-hidden="true" size={18} /> Subtitr yaratish</>
        )}
      </motion.button>

      <ul className="flex flex-wrap justify-center gap-4 sm:gap-8 pt-2">
        {["SRT", "VTT", "Vaqt kodlari", sourceLanguage === "uz" ? "O'zbekcha STT (tarjimasiz)" : "O'zbekcha tarjima"].map((label) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-metro-muted" />
            <span className="m-label">{label}</span>
          </li>
        ))}
      </ul>
    </form>
  );
}
