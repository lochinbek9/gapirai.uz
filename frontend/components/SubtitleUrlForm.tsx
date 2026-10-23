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
        <label htmlFor="sub-url" className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1">
          YouTube havolasi
        </label>
        <div className="glass-input flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-3 sm:py-4 rounded-2xl sm:rounded-3xl relative overflow-hidden group transition-all duration-300 focus-within:ring-2 focus-within:ring-violet-500/70">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-violet-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <Youtube aria-hidden="true" className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
          <input
            id="sub-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="YouTube havolasini kiriting..."
            className="flex-1 bg-transparent text-black dark:text-white placeholder-slate-500 dark:placeholder-gray-400 text-sm focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 hover:text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl px-3 sm:px-4 py-2 transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            <ClipboardPaste aria-hidden="true" size={14} />
            <span className="hidden sm:inline">Joylashtirish</span>
            <span className="sm:hidden">Qo&apos;yish</span>
          </button>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400 ml-1">
          O'zbekcha subtitr (.srt/.vtt) yaratiladi — dublyaj audiosi yo'q, tezroq va TTS xarajatisiz.
        </p>
      </div>

      {!isLoggedIn && (
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">
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
          className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-4 flex gap-3 items-center"
        >
          <div aria-hidden="true" className="w-2 h-2 shrink-0 rounded-full bg-rose-500" />
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={loading || !url.trim()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-3
                   btn-premium
                   text-white font-extrabold py-4 sm:py-5 rounded-2xl sm:rounded-[24px]
                   transition-all duration-300 text-sm shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
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
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</span>
          </li>
        ))}
      </ul>
    </form>
  );
}
