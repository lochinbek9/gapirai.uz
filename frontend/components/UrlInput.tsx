"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { AudioLines, ClipboardPaste, Info, Loader2, Sparkles, Youtube } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoInfo, formatDuration } from "@/lib/api";
import SampleVideosSection, { SampleVideo } from "@/components/SampleVideosSection";

interface Props {
  url: string;
  videoInfo: VideoInfo | null;
  loading: boolean;
  error: string | null;
  voiceGender: string;
  voiceName?: string;
  ttsProvider?: string;
  isProUser?: boolean;
  onChange: (value: string) => void;
  onGenderChange: (gender: string) => void;
  onVoiceNameChange?: (voice: string) => void;
  onTtsProviderChange?: (provider: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function VideoPreview({ info }: { info: VideoInfo }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex gap-4 items-center bg-black/5 dark:bg-white/[0.03] rounded-2xl p-4 border border-black/5 dark:border-white/[0.05] shadow-inner transition-colors duration-300"
    >
      {info.thumbnail && (
        <div className="relative flex-shrink-0">
          <img
            src={info.thumbnail}
            alt=""
            className="w-24 h-14 object-cover rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10"
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-gray-900 dark:text-white line-clamp-2 transition-colors">
          {info.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{info.uploader}</span>
          <span className="w-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
          <span className="text-xs font-semibold tabular-nums text-blue-700 dark:text-blue-300">{formatDuration(info.duration)}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function UrlInput({
  url, videoInfo, loading, error, voiceGender, voiceName,
  ttsProvider = "gemini", isProUser = false,
  onChange, onGenderChange, onVoiceNameChange, onTtsProviderChange, onSubmit,
}: Props) {
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

  const currentMaleVoice = maleVoices.find((v) => v.id === voiceName) || maleVoices[0];
  const currentFemaleVoice = femaleVoices.find((v) => v.id === voiceName) || femaleVoices[0];

  // Foydalanuvchiga ichki TTS model nomi (Charon, Autonoe) emas, ovoz tavsifi ko'rsatiladi
  const genderOptions = [
    { value: "auto",   label: "Avtomatik", icon: Sparkles,   desc: "Spikerga qarab" },
    { value: "male",   label: "Erkak",     icon: AudioLines, desc: currentMaleVoice.id === "Charon" ? "Chuqur, ishonchli" : currentMaleVoice.desc },
    { value: "female", label: "Ayol",      icon: AudioLines, desc: currentFemaleVoice.id === "Autonoe" ? "Yumshoq, aniq" : currentFemaleVoice.desc },
  ];
  const genderRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pasteError, setPasteError] = useState(false);

  // Ovoz jinsi -- radiogroup: ←/→ tanlovni o'zgartiradi
  const onGenderKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = genderOptions.length - 1;
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (index === 0 ? last : index - 1)
      : null;
    if (next === null) return;
    e.preventDefault();
    handleGenderSelect(genderOptions[next].value);
    genderRefs.current[next]?.focus();
  };

  const handleGenderSelect = (val: string) => {
    onGenderChange(val);
    if (val === "male") {
      onVoiceNameChange?.(voiceName && maleVoices.some(v => v.id === voiceName) ? voiceName : "Charon");
    } else if (val === "female") {
      onVoiceNameChange?.(voiceName && femaleVoices.some(v => v.id === voiceName) ? voiceName : "Autonoe");
    } else {
      onVoiceNameChange?.("");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setPasteError(false);
      if (text) onChange(text);
    } catch {
      // Brauzer bufer ruxsatini bermadi -- foydalanuvchiga qo'lda joylashtirishni aytamiz
      setPasteError(true);
    }
  };

  const handleSampleSelect = (sample: SampleVideo) => {
    onChange(sample.url);
    handleGenderSelect(sample.gender);
    if (sample.recommendedVoice) {
      onVoiceNameChange?.(sample.recommendedVoice);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {/* URL input */}
      <div className="space-y-2">
        <label htmlFor="youtube-url" className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1">
          YouTube havolasi
        </label>
        <div className="glass-input flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-3 sm:py-4 rounded-2xl sm:rounded-3xl relative overflow-hidden group transition-all duration-300 focus-within:ring-2 focus-within:ring-violet-500/70">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-violet-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <Youtube aria-hidden="true" className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
          <input
            id="youtube-url"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            onChange={(e) => { setPasteError(false); onChange(e.target.value); }}
            placeholder="Video havolasini joylashtiring..."
            aria-invalid={error ? true : undefined}
            aria-describedby={`youtube-url-rules${error ? " youtube-url-error" : ""}${pasteError ? " youtube-url-paste" : ""}`}
            className="flex-1 min-w-0 bg-transparent text-black dark:text-white placeholder-slate-500 dark:placeholder-gray-400 text-sm focus:outline-none font-medium"
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
        {pasteError && (
          <p id="youtube-url-paste" role="status" className="text-xs text-slate-600 dark:text-slate-300 ml-1">
            Brauzer buferdan o&apos;qishga ruxsat bermadi — havolani maydonga qo&apos;lda joylashtiring (Ctrl+V yoki uzoq bosib &quot;Qo&apos;yish&quot;).
          </p>
        )}
        <p id="youtube-url-rules" className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed ml-1">
          <Info aria-hidden="true" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Diniy, 18+, zo&apos;ravonlik yoki noqonuniy faoliyatga oid videolarni yubormang
            (bolalarga oid jinsiy kontent esa umuman qabul qilinmaydi).{" "}
            <Link href="/terms" className="font-semibold text-blue-700 dark:text-blue-300 underline underline-offset-2">Foydalanish shartlari</Link>
          </span>
        </p>
      </div>

      {/* Video preview */}
      <AnimatePresence mode="wait">
        {videoInfo && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <VideoPreview info={videoInfo} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1-Click Sample Videos Carousel */}
      <SampleVideosSection onSelect={handleSampleSelect} activeUrl={url} />

      {/* Gender selector */}
      <fieldset className="space-y-2">
        <legend id="voice-gender-label" className="block text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide ml-1 mb-2">
          Ovoz jinsi
        </legend>
        <div role="radiogroup" aria-labelledby="voice-gender-label" className="grid grid-cols-3 gap-2 sm:gap-3">
          {genderOptions.map((opt, index) => {
            const isSelected = voiceGender === opt.value;
            const isFocusable = isSelected || (!genderOptions.some((o) => o.value === voiceGender) && index === 0);
            return (
              <button
                key={opt.value}
                ref={(el) => { genderRefs.current[index] = el; }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isFocusable ? 0 : -1}
                onKeyDown={(e) => onGenderKeyDown(e, index)}
                onClick={() => handleGenderSelect(opt.value)}
                className={`flex flex-col items-center gap-1 sm:gap-1.5 py-3 sm:py-4 px-1.5 sm:px-3 rounded-xl sm:rounded-2xl border text-center transition-all duration-300 relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  isSelected
                    ? "border-blue-500 bg-gradient-to-b from-blue-500/10 to-blue-500/20 dark:from-blue-500/20 dark:to-blue-500/30 shadow-lg shadow-blue-500/10"
                    : "border-black/5 dark:border-white/5 hover:border-blue-400/40 bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-pink-500" />
                )}
                <opt.icon aria-hidden className={`w-5 h-5 sm:w-6 sm:h-6 ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-500 dark:text-gray-400"}`} />
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
      {isProUser && isGemini && voiceGender !== "auto" && (
        <div className="space-y-1.5 pt-1">
          <span id="voice-variant-label" className="text-xs text-slate-600 dark:text-slate-400 uppercase tracking-wide font-bold">
            Ovoz variantini tanlang:
          </span>
          <div role="group" aria-labelledby="voice-variant-label" className="grid grid-cols-3 gap-1.5">
            {(voiceGender === "male" ? maleVoices : femaleVoices).map((v) => {
              const active = (voiceName || (voiceGender === "male" ? "Charon" : "Autonoe")) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onVoiceNameChange?.(v.id)}
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

      {/* Error */}
      {error && (
        <motion.div
          id="youtube-url-error"
          role="alert"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-4 flex gap-3 items-center"
        >
          <div aria-hidden="true" className="w-2 h-2 shrink-0 rounded-full bg-rose-500" />
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
        </motion.div>
      )}

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={loading || !url.trim()}
        aria-describedby={!url.trim() && !loading ? "submit-hint" : undefined}
        whileHover={url.trim() ? { scale: 1.01 } : undefined}
        whileTap={url.trim() ? { scale: 0.98 } : undefined}
        className="w-full flex items-center justify-center gap-3
                   btn-premium
                   text-white font-extrabold py-4 sm:py-5 rounded-2xl sm:rounded-[24px]
                   transition-all duration-300 text-sm shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-violet-500"
      >
        {loading ? (
          <><Loader2 aria-hidden="true" size={18} className="animate-spin" /> Vazifa yaratilmoqda...</>
        ) : (
          <><Sparkles aria-hidden="true" size={18} /> Video dublaj qilish</>
        )}
      </motion.button>

      {!url.trim() && !loading && (
        <p id="submit-hint" className="-mt-3 text-center text-xs text-slate-600 dark:text-slate-400">
          Avval video havolasini kiriting yoki namunaviy videoni tanlang
        </p>
      )}

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
