"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { AudioLines, FileVideo, Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  detectVideoContentType,
  getMinuteBalance,
  uploadJobFile,
  SUBTITLE_UPLOAD_MAX_BYTES,
} from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

const ACCEPT = "video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm";

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

const MAX_VIDEO_MINUTES = 120;

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
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration / 60 : null);
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

export default function DubFileForm({
  voiceGender = "auto",
  ttsProvider = "gemini",
  isProUser = false,
  voiceName,
  onGenderChange,
  onVoiceNameChange,
  onTtsProviderChange,
}: {
  voiceGender?: string;
  ttsProvider?: string;
  isProUser?: boolean;
  voiceName?: string;
  onGenderChange?: (gender: string) => void;
  onVoiceNameChange?: (voice: string) => void;
  onTtsProviderChange?: (provider: string) => void;
}) {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [gender, setGender] = useState(voiceGender);
  const [selectedVoice, setSelectedVoice] = useState(voiceName || "");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [minutesNote, setMinutesNote] = useState<string | null>(null);
  const checkId = useRef(0);

  const currentProvider = ttsProvider || "gemini";
  const isGemini = currentProvider === "gemini";

  // Real Gemini AI voices
  const maleVoices = [
    { id: "Charon", label: "Charon", desc: "Asosiy bariton" },
    { id: "Fenrir", label: "Fenrir", desc: "Chuqur, salobatli" },
    { id: "Puck",   label: "Puck",   desc: "Jonli, chaqqon" },
  ];

  const femaleVoices = [
    { id: "Autonoe", label: "Autonoe", desc: "Asosiy mayin" },
    { id: "Aoede",   label: "Aoede",   desc: "Ravon, ohangdor" },
    { id: "Kore",    label: "Kore",    desc: "Yumshoq, muloyim" },
  ];

  const currentMaleVoice = maleVoices.find((v) => v.id === (voiceName || selectedVoice)) || maleVoices[0];
  const currentFemaleVoice = femaleVoices.find((v) => v.id === (voiceName || selectedVoice)) || femaleVoices[0];

  // UrlInput bilan bir xil: emoji/ichki TTS nomi o'rniga ikonka va tushunarli tavsif
  const genderOptions = [
    { value: "auto",   label: "Avtomatik", icon: Sparkles,   desc: "Spikerga qarab" },
    { value: "male",   label: "Erkak",     icon: AudioLines, desc: currentMaleVoice.id === "Charon" ? "Chuqur, ishonchli" : currentMaleVoice.desc },
    { value: "female", label: "Ayol",      icon: AudioLines, desc: currentFemaleVoice.id === "Autonoe" ? "Yumshoq, aniq" : currentFemaleVoice.desc },
  ];
  const genderRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onGenderKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = genderOptions.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : null;
    if (next === null) return;
    e.preventDefault();
    handleGenderChange(genderOptions[next].value);
    genderRefs.current[next]?.focus();
  };

  const handleGenderChange = (val: string) => {
    setGender(val);
    onGenderChange?.(val);
    const newV = val === "male"
      ? (selectedVoice && maleVoices.some(v => v.id === selectedVoice) ? selectedVoice : "Charon")
      : val === "female"
      ? (selectedVoice && femaleVoices.some(v => v.id === selectedVoice) ? selectedVoice : "Autonoe")
      : "";
    setSelectedVoice(newV);
    onVoiceNameChange?.(newV);
  };

  const checkMinutes = async (f: File) => {
    const id = ++checkId.current;
    setMinutesNote(null);
    if (!isLoggedIn) return;
    const [minutes, balance] = await Promise.all([
      readDurationMinutes(f),
      getMinuteBalance().then((r) => r.balance).catch(() => null),
    ]);
    if (id !== checkId.current || minutes == null) return;
    if (minutes > MAX_VIDEO_MINUTES) {
      setFile(null);
      setError(`Video juda uzun (${Math.round(minutes)} daqiqa). Maksimal ruxsat etilgan davomiylik — ${MAX_VIDEO_MINUTES} daqiqa.`);
      return;
    }
    if (balance && minutes > balance.total_available + 1e-6) {
      setMinutesNote(
        `Bu video ≈${Math.ceil(minutes)} daqiqa, sizda esa ${Math.floor(balance.total_available * 10) / 10} daqiqa qolgan — yuklash rad etilishi mumkin.`
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
      const resolvedVoice = selectedVoice || (
        currentProvider === "gemini"
          ? (gender === "female" ? "Autonoe" : "Charon")
          : (gender === "female" ? "uz-UZ-MadinaNeural" : "uz-UZ-SardorNeural")
      );
      const { job_id } = await uploadJobFile(
        file,
        {
          subtitleOnly: false,
          voiceGender: gender,
          ttsProvider: currentProvider,
          voiceName: gender === "auto" ? undefined : resolvedVoice,
        },
        setProgress,
        controller.signal
      );
      router.push(`/video/${job_id}`);
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
            : "Yuklashda xatolik yuz berdi — internet aloqasini tekshirib qayta urinib ko'ring.")
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
        <span id="dub-file-label" className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1">
          Video fayl
        </span>

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            aria-describedby="dub-file-formats"
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
            <p id="dub-file-formats" className="text-xs text-slate-600 dark:text-slate-400">
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
          Qurilmangizdagi video to'liq o'zbek tiliga sun'iy intellekt orqali tarjima qilinib, dublyaj qilinadi.
        </p>
      </div>



      {/* Voice gender selector */}
      <fieldset className="space-y-2">
        <legend id="dub-file-gender-label" className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1 mb-2">
          Ovoz jinsi
        </legend>
        <div role="radiogroup" aria-labelledby="dub-file-gender-label" className="grid grid-cols-3 gap-2 sm:gap-3">
          {genderOptions.map((opt, index) => {
            const isSelected = gender === opt.value;
            const isFocusable = isSelected || (!genderOptions.some((o) => o.value === gender) && index === 0);
            return (
              <button
                key={opt.value}
                ref={(el) => { genderRefs.current[index] = el; }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isFocusable ? 0 : -1}
                onKeyDown={(e) => onGenderKeyDown(e, index)}
                onClick={() => handleGenderChange(opt.value)}
                className={`flex flex-col items-center gap-1 sm:gap-1.5 py-3 sm:py-4 px-1.5 sm:px-3 rounded-xl sm:rounded-2xl border text-center transition-all duration-300 relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  isSelected
                    ? "border-blue-500 bg-gradient-to-b from-blue-500/10 to-blue-500/20 dark:from-blue-500/20 dark:to-blue-500/30 shadow-lg shadow-blue-500/10"
                    : "border-black/5 dark:border-white/5 hover:border-blue-400/40 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500" />
                )}
                <opt.icon aria-hidden="true" className={`w-5 h-5 sm:w-6 sm:h-6 ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-gray-400"}`} />
                <span className={`text-xs sm:text-sm font-bold transition-colors duration-200 ${isSelected ? "text-blue-700 dark:text-blue-300 font-extrabold" : "text-slate-800 dark:text-gray-200"}`}>
                  {opt.label}
                </span>
                <span className="text-xs leading-tight text-slate-600 dark:text-slate-300 font-medium">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Gemini ovoz tanlash (faqat Pro foydalanuvchi Gemini tanlaganda) */}
      {isProUser && isGemini && gender !== "auto" && (
        <div className="space-y-1.5 pt-1">
          <span id="dub-file-variant-label" className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wide font-bold">
            Ovoz variantini tanlang:
          </span>
          <div role="group" aria-labelledby="dub-file-variant-label" className="grid grid-cols-3 gap-1.5">
            {(gender === "male" ? maleVoices : femaleVoices).map((v) => {
              const active = (selectedVoice || (gender === "male" ? "Charon" : "Autonoe")) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setSelectedVoice(v.id);
                    onVoiceNameChange?.(v.id);
                  }}
                  aria-pressed={active}
                  className={`py-1.5 px-2 rounded-xl text-center border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    active
                      ? "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold shadow-sm"
                      : "border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  <div className="text-xs font-bold">{v.label}</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{v.desc}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          Video yuklash uchun{" "}
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
          <><Sparkles aria-hidden="true" size={18} /> Video dublaj qilish</>
        )}
      </motion.button>

      <ul className="flex flex-wrap justify-center gap-4 sm:gap-8 pt-2">
        {["100% avtomatik", "HD sifat", "O'zbek tilida"].map((label) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">{label}</span>
          </li>
        ))}
      </ul>
    </form>
  );
}
