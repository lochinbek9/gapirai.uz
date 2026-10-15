"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileVideo, Loader2, Sparkles, UploadCloud, X } from "lucide-react";
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
  ttsProvider = "azure",
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

  const currentProvider = isProUser ? ttsProvider : "edge";
  const isGemini = currentProvider === "gemini";

  const maleVoices = isGemini
    ? [
        { id: "Charon", label: "Charon", desc: "Asosiy bariton" },
        { id: "Fenrir", label: "Fenrir", desc: "Chuqur, salobatli" },
        { id: "Puck",   label: "Puck",   desc: "Jonli, chaqqon" },
      ]
    : [
        { id: "uz-UZ-SardorNeural", label: "Sardor", desc: "Microsoft Neural (uz-UZ)" },
      ];

  const femaleVoices = isGemini
    ? [
        { id: "Autonoe", label: "Autonoe", desc: "Asosiy mayin" },
        { id: "Aoede",   label: "Aoede",   desc: "Ravon, ohangdor" },
      ]
    : [
        { id: "uz-UZ-MadinaNeural", label: "Madina", desc: "Microsoft Neural (uz-UZ)" },
      ];

  const currentMaleVoice = maleVoices.find((v) => v.id === (voiceName || selectedVoice)) || maleVoices[0];
  const currentFemaleVoice = femaleVoices.find((v) => v.id === (voiceName || selectedVoice)) || femaleVoices[0];

  const genderOptions = [
    { value: "auto",   label: "Avtomatik", icon: "🤖", desc: "AI aniqlaydi" },
    { value: "male",   label: "Erkak",     icon: "👨", desc: `${currentMaleVoice.label} ovozi` },
    { value: "female", label: "Ayol",      icon: "👩", desc: `${currentFemaleVoice.label} ovozi` },
  ];

  const handleGenderChange = (val: string) => {
    setGender(val);
    onGenderChange?.(val);
    const newV = val === "male" ? (isGemini ? "Charon" : "uz-UZ-SardorNeural") : val === "female" ? (isGemini ? "Autonoe" : "uz-UZ-MadinaNeural") : "";
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">
          Video fayl
        </label>

        {!file ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); pick(e.dataTransfer.files?.[0]); }}
            className={`glass-input flex flex-col items-center justify-center gap-2 px-4 py-8 sm:py-10 rounded-2xl sm:rounded-3xl cursor-pointer text-center border-2 border-dashed transition-all duration-300 ${
              dragActive ? "border-blue-500 bg-blue-500/10" : "border-black/10 dark:border-white/10 hover:border-blue-500/50"
            }`}
          >
            <UploadCloud className="w-8 h-8 text-blue-500" />
            <p className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-200">
              Video faylni tanlang yoki shu yerga tashlang
            </p>
            <p className="text-[10px] text-slate-400 dark:text-gray-600">
              MP4, MOV, MKV yoki WebM · {formatSize(SUBTITLE_UPLOAD_MAX_BYTES)} gacha · 120 daqiqagacha
            </p>
          </div>
        ) : (
          <div className="glass-input flex items-center gap-3 px-4 py-3.5 rounded-2xl sm:rounded-3xl">
            <FileVideo className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{file.name}</p>
              <p className="text-[10px] text-slate-400 dark:text-gray-500">{formatSize(file.size)}</p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => { checkId.current++; setFile(null); setError(null); setMinutesNote(null); if (inputRef.current) inputRef.current.value = ""; }}
                aria-label="Faylni olib tashlash"
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition"
              >
                <X size={16} />
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
        <p className="text-[10px] text-slate-400 dark:text-gray-600 ml-1">
          Qurilmangizdagi video to'liq o'zbek tiliga sun'iy intellekt orqali tarjima qilinib, dublyaj qilinadi.
        </p>
      </div>

      {/* TTS Provider Selector */}
      {isProUser ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between ml-1">
            <label className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
              <span>💎 Ovoz dvigateli (PRO tanlov)</span>
            </label>
            <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium">
              OpenAI balansi to'ldirilgach u ham qo'shiladi
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { id: 'azure', label: 'Azure Neural', icon: '🔷', sub: 'Sardor & Madina' },
              { id: 'edge', label: 'Edge Free', icon: '⚡', sub: 'Sardor & Madina' },
              { id: 'gemini', label: 'Gemini AI', icon: '✨', sub: 'Charon & Autonoe' },
            ].map((p) => {
              const active = (ttsProvider || 'azure') === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onTtsProviderChange?.(p.id)}
                  className={`flex flex-col items-center gap-1 p-2 sm:p-2.5 rounded-xl border text-center transition-all ${
                    active
                      ? "border-violet-500 bg-violet-500/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 shadow-md shadow-violet-500/10 font-bold ring-1 ring-violet-500/30"
                      : "border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.05] text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base">{p.icon}</span>
                    <span className="text-[11px] sm:text-xs font-black">{p.label}</span>
                  </div>
                  <span className="text-[8px] sm:text-[9px] text-gray-400 dark:text-gray-400 font-medium">{p.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-black/5 dark:bg-white/[0.03] border border-black/5 dark:border-white/5 rounded-xl px-3.5 py-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-500 font-bold">⚡ Ovoz dvigateli:</span>
            <span>Edge TTS (Sardor & Madina)</span>
          </div>
          <span className="text-[10px] text-violet-500 dark:text-violet-400 font-bold">
            Azure va Gemini — PRO tarifida
          </span>
        </div>
      )}

      {/* Voice gender selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">
          Ovoz jinsi
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {genderOptions.map((opt) => {
            const isSelected = gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleGenderChange(opt.value)}
                className={`flex flex-col items-center gap-1 sm:gap-1.5 py-3 sm:py-4 px-1.5 sm:px-3 rounded-xl sm:rounded-2xl border text-center transition-all duration-300 relative overflow-hidden ${
                  isSelected
                    ? "border-blue-500 bg-gradient-to-b from-blue-500/10 to-blue-500/20 dark:from-blue-500/20 dark:to-blue-500/30 shadow-lg shadow-blue-500/10"
                    : "border-black/5 dark:border-white/5 hover:border-blue-400/40 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500" />
                )}
                <span className="text-xl sm:text-2xl filter drop-shadow-md">{opt.icon}</span>
                <span className={`text-[11px] sm:text-xs font-bold transition-colors duration-200 ${isSelected ? "text-blue-600 dark:text-blue-400 font-extrabold" : "text-gray-700 dark:text-gray-300"}`}>
                  {opt.label}
                </span>
                <span className="text-[8px] sm:text-[9px] text-gray-400 dark:text-gray-500 font-medium">{opt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Voice owner indicator / selection */}
      <div className="bg-black/[0.03] dark:bg-white/[0.02] border border-black/5 dark:border-white/5 rounded-2xl p-3 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1.5">
            <span>🎙️ Ovoz egasi:</span>
            {gender === "auto" ? (
              <span className="text-blue-500 font-bold">AI aniqlaydi</span>
            ) : gender === "male" ? (
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">{currentMaleVoice.label} ({isGemini ? "Google Gemini" : "Microsoft Neural"})</span>
            ) : (
              <span className="text-pink-600 dark:text-pink-400 font-bold">{currentFemaleVoice.label} ({isGemini ? "Google Gemini" : "Microsoft Neural"})</span>
            )}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {isGemini ? "Gemini Voice Engine" : (currentProvider === "edge" ? "Edge TTS Engine" : "Azure Neural Engine")}
          </span>
        </div>

        {gender === "auto" ? (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Video transkripsiyasidan so'ng spikerning jinsi avtomatik aniqlanadi va unga mos ravishda{' '}
            <strong className="text-gray-700 dark:text-gray-300">{isGemini ? "Charon yoki Autonoe" : "Sardor yoki Madina"}</strong> ovozi biriktiriladi.
          </p>
        ) : isGemini ? (
          <div className="space-y-1.5 pt-1">
            <span className="text-[9px] text-gray-400 uppercase tracking-wider font-bold">
              Gemini ovozini tanlang:
            </span>
            <div className="grid grid-cols-3 gap-1.5">
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
                    className={`py-1.5 px-2 rounded-xl text-center border transition-all ${
                      active
                        ? "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300 font-bold shadow-sm"
                        : "border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <div className="text-[11px] font-bold">{v.label}</div>
                    <div className="text-[8px] text-gray-400 dark:text-gray-500 truncate">{v.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>O'zbek tili uchun tasdiqlangan tabiiy neyral ovoz: <strong className="text-gray-700 dark:text-gray-200">{gender === "male" ? "Sardor (uz-UZ-SardorNeural)" : "Madina (uz-UZ-MadinaNeural)"}</strong></span>
          </div>
        )}
      </div>

      {uploading && (
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 dark:text-gray-400">
            <span>
              {progress < 100 ? `Yuklanmoqda... ${progress}%` : "Server faylni tekshirmoqda..."}
            </span>
            {progress < 100 && (
              <button type="button" onClick={cancel} className="text-red-500 hover:underline">
                Bekor qilish
              </button>
            )}
          </div>
        </div>
      )}

      {minutesNote && !uploading && (
        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
          {minutesNote}{" "}
          <Link href="/pricing?reason=insufficient_minutes" className="underline hover:text-amber-500">
            Daqiqa sotib olish yoki tarifni yangilash
          </Link>
        </p>
      )}

      {!isLoggedIn && (
        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-4 py-3">
          Video yuklash uchun{" "}
          <Link href="/login" className="underline hover:text-amber-500">kiring</Link>
          {" "}yoki{" "}
          <Link href="/register" className="underline hover:text-amber-500">ro'yxatdan o'ting</Link>.
        </p>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex gap-3 items-center"
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">{error}</p>
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={uploading || !file}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-3
                   btn-premium disabled:from-gray-300 disabled:to-gray-200 dark:disabled:from-gray-800 dark:disabled:to-gray-800 disabled:opacity-50 disabled:pointer-events-none
                   text-white font-extrabold py-4 sm:py-5 rounded-2xl sm:rounded-[24px]
                   transition-all duration-300 text-xs sm:text-sm shadow-xl"
      >
        {uploading ? (
          <><Loader2 size={18} className="animate-spin" /> Yuklanmoqda...</>
        ) : (
          <><Sparkles size={18} /> Video dublaj qilish</>
        )}
      </motion.button>

      <div className="flex flex-wrap justify-center gap-4 sm:gap-8 pt-2">
        {["100% Avtomat", "HD Sifat", "O'zbek tilida"].map((label, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    </form>
  );
}
