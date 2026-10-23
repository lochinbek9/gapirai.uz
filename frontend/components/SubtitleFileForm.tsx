"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileText, FileVideo, Loader2, UploadCloud, X } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { detectVideoContentType, getMinuteBalance, uploadJobFile, SUBTITLE_UPLOAD_MAX_BYTES, SubtitleSourceLanguage } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

/** "Subtitr" rejimi -- video FAYLDAN (2026-09-20): foydalanuvchi qurilmasidagi
 * videoni yuklaydi, backend (POST /api/jobs/upload) uni to'g'ridan-to'g'ri
 * diskka oqim bilan yozadi va subtitr jobini yaratadi. SubtitleUrlForm bilan
 * bir xil natija sahifasiga (/subtitles/[id]) o'tkazadi. */

const ACCEPT = "video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm";

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

// backend/services/plans.py: MAX_JOB_MINUTES bilan bir xil.
const MAX_VIDEO_MINUTES = 120;

/** Brauzerning o'zi video metadata'sidan davomiylikni (daqiqa) o'qiydi -- hech
 * narsa yuklanmaydi. Format brauzerda ochilmasa (masalan ba'zi .mkv) yoki 8
 * soniyada javob bermasa null: bu holda oldindan tekshiruv o'tkazib yuboriladi,
 * server baribir aniq tekshiradi. */
function readDurationMinutes(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration / 60 : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

function validateFile(file: File): string | null {
  if (!detectVideoContentType(file)) return "Faqat MP4, MOV, MKV yoki WebM formatlar qabul qilinadi.";
  if (file.size <= 0) return "Fayl bo'sh.";
  if (file.size > SUBTITLE_UPLOAD_MAX_BYTES) {
    return `Fayl hajmi ${formatSize(SUBTITLE_UPLOAD_MAX_BYTES)} dan katta bo'lmasligi kerak (sizniki: ${formatSize(file.size)}).`;
  }
  return null;
}

export default function SubtitleFileForm({ sourceLanguage = "auto" }: { sourceLanguage?: SubtitleSourceLanguage }) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [minutesNote, setMinutesNote] = useState<string | null>(null);
  const checkId = useRef(0);

  // Yuklashdan OLDIN: video uzunligi qolgan daqiqaga sig'adimi. Katta faylni
  // yuklab bo'lgach "daqiqa yetmadi" degan rad javobini olmaslik uchun. Bu
  // ogohlantirish (bloklamaydi): avtomatik to'ldirish yoqilgan foydalanuvchining
  // daqiqasi yuklashdan keyin o'zi to'ldiriladi -- yakuniy qaror serverda.
  const checkMinutes = async (f: File) => {
    const id = ++checkId.current;
    setMinutesNote(null);
    if (!isLoggedIn) return;
    const [minutes, balance] = await Promise.all([
      readDurationMinutes(f),
      getMinuteBalance().then((r) => r.balance).catch(() => null),
    ]);
    if (id !== checkId.current || minutes == null) return; // boshqa fayl tanlangan
    if (minutes > MAX_VIDEO_MINUTES) {
      setFile(null);
      setError(`Video juda uzun (${Math.round(minutes)} daqiqa). Maksimal ruxsat etilgan davomiylik — ${MAX_VIDEO_MINUTES} daqiqa.`);
      return;
    }
    if (balance && minutes > balance.total_available + 1e-6) {
      setMinutesNote(
        `Bu video ≈${Math.ceil(minutes)} daqiqa, sizda esa ${Math.floor(balance.total_available * 10) / 10} daqiqa qolgan — yuklash rad etilishi mumkin.`,
      );
    }
  };

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const problem = validateFile(f);
    setError(problem);
    setFile(problem ? null : f);
    setMinutesNote(null);
    if (!problem) void checkMinutes(f);
    else checkId.current++;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || uploading) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const { job_id } = await uploadJobFile(file, { subtitleOnly: true, sourceLanguage }, setProgress, controller.signal);
      router.push(`/subtitles/${job_id}`);
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
        setUploading(false);
        return;
      }
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 402 && detail && typeof detail === "object" && detail.error === "insufficient_minutes") {
        router.push("/pricing?reason=insufficient_minutes");
        return;
      }
      setError(
        (typeof detail === "string" ? detail : detail?.message) ||
          (err?.response
            ? "Xatolik yuz berdi. Qayta urinib ko'ring."
            : "Yuklashda xatolik yuz berdi — internet aloqasini tekshirib qayta urinib ko'ring."),
      );
      setUploading(false);
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="space-y-2">
        <span id="sub-file-label" className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1">
          Video fayl
        </span>

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-describedby="sub-file-formats"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); pick(e.dataTransfer.files?.[0]); }}
            className={`glass-input flex flex-col items-center justify-center gap-2 px-4 py-8 sm:py-10 rounded-2xl sm:rounded-3xl cursor-pointer text-center border-2 border-dashed transition-all duration-300 ${
              dragActive ? "border-blue-500 bg-blue-500/10" : "border-black/10 dark:border-white/10 hover:border-blue-500/50"
            }`}
          >
            <UploadCloud aria-hidden="true" className="w-8 h-8 text-blue-500" />
            <p className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200">
              Video faylni tanlang yoki shu yerga tashlang
            </p>
            <p id="sub-file-formats" className="text-xs text-slate-600 dark:text-slate-400">
              MP4, MOV, MKV yoki WebM · {formatSize(SUBTITLE_UPLOAD_MAX_BYTES)} gacha · 120 daqiqagacha
            </p>
          </div>
        ) : (
          <div className="glass-input flex items-center gap-3 px-4 py-3.5 rounded-2xl sm:rounded-3xl">
            <FileVideo aria-hidden="true" className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{file.name}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{formatSize(file.size)}</p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => { checkId.current++; setFile(null); setError(null); setMinutesNote(null); if (inputRef.current) inputRef.current.value = ""; }}
                aria-label="Faylni olib tashlash"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition"
              >
                <X aria-hidden="true" size={16} />
              </button>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }}
        />
        <p className="text-xs text-slate-600 dark:text-slate-400 ml-1">
          {sourceLanguage === "uz" ? "Nutq o'zbekcha matnga aylantirilib (tarjimasiz), " : "Videodagi nutq o'zbekchaga tarjima qilinib, "}subtitr (.srt/.vtt/.txt) tayyorlanadi — dublyaj audiosi yo'q.
        </p>
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-gray-300">
            <span>
              {progress < 100 ? `Yuklanmoqda... ${progress}%` : "Server faylni tekshirmoqda..."}
            </span>
            {progress < 100 && (
              <button type="button" onClick={cancel} className="text-red-700 dark:text-red-400 font-bold hover:underline">
                Bekor qilish
              </button>
            )}
          </div>
        </div>
      )}

      {minutesNote && !uploading && (
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-4 py-3">
          {minutesNote}{" "}
          <Link href="/pricing?reason=insufficient_minutes" className="underline hover:text-amber-900 dark:hover:text-amber-200">
            Daqiqa sotib olish yoki tarifni yangilash
          </Link>
        </p>
      )}

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
        disabled={uploading || !file}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-3
                   btn-premium
                   text-white font-extrabold py-4 sm:py-5 rounded-2xl sm:rounded-[24px]
                   transition-all duration-300 text-sm shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
      >
        {uploading ? (
          <><Loader2 aria-hidden="true" size={18} className="animate-spin" /> Yuklanmoqda...</>
        ) : (
          <><FileText aria-hidden="true" size={18} /> Subtitr yaratish</>
        )}
      </motion.button>
    </form>
  );
}
