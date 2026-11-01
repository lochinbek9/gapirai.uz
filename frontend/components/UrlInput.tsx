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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-4 rounded-control border border-ui-rule bg-ui-ground p-3"
    >
      {info.thumbnail && (
        <img src={info.thumbnail} alt="" className="h-14 w-24 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[15px] font-medium leading-snug text-ui-ink">{info.title}</p>
        <p className="mt-1 text-sm text-ui-muted">
          {info.uploader} · <span className="tabular-nums text-ui-ink">{formatDuration(info.duration)}</span>
        </p>
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
    { value: "auto",   label: "Avtomatik", icon: Sparkles,   desc: "Ovoz spikerning jinsiga qarab tanlanadi" },
    { value: "male",   label: "Erkak",     icon: AudioLines, desc: currentMaleVoice.id === "Charon" ? "Chuqur, ishonchli erkak ovozi" : currentMaleVoice.desc },
    { value: "female", label: "Ayol",      icon: AudioLines, desc: currentFemaleVoice.id === "Autonoe" ? "Yumshoq, aniq ayol ovozi" : currentFemaleVoice.desc },
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

  const empty = !url.trim();

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {/* Havola + boshlash: asosiy harakat bitta qatorda */}
      <div className="space-y-2">
        <label htmlFor="youtube-url" className="sr-only">
          YouTube havolasi
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="ui-input flex min-h-12 flex-1 items-center gap-2 pl-3 pr-1.5">
            <Youtube aria-hidden="true" className="h-5 w-5 shrink-0 text-ui-muted" />
            <input
              id="youtube-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => { setPasteError(false); onChange(e.target.value); }}
              placeholder="youtube.com/watch?v=..."
              aria-invalid={error ? true : undefined}
              aria-describedby={`youtube-url-rules${error ? " youtube-url-error" : ""}${pasteError ? " youtube-url-paste" : ""}${empty && !loading ? " submit-hint" : ""}`}
              className="min-w-0 flex-1 bg-transparent text-base text-ui-ink placeholder:text-ui-muted/80 focus:outline-none"
            />
            <button
              type="button"
              onClick={handlePaste}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ui-muted transition hover:bg-ui-ground hover:text-ui-ink"
            >
              <ClipboardPaste aria-hidden="true" size={16} />
              <span className="hidden sm:inline">Joylashtirish</span>
              <span className="sm:hidden">Qo&apos;yish</span>
            </button>
          </div>
          <button type="submit" disabled={loading || empty} className="ui-btn ui-btn-primary min-h-12 px-5 sm:w-auto">
            {loading ? (
              <><Loader2 aria-hidden="true" size={18} className="animate-spin" /> Yaratilmoqda...</>
            ) : (
              "Dublaj qilish"
            )}
          </button>
        </div>
        {empty && !loading && (
          <p id="submit-hint" className="text-sm text-ui-muted">
            Havolani qo&apos;ying yoki pastdagi namunalardan birini tanlang.
          </p>
        )}
        {pasteError && (
          <p id="youtube-url-paste" role="status" className="text-sm text-ui-ink">
            Brauzer buferdan o&apos;qishga ruxsat bermadi — havolani maydonga qo&apos;lda joylashtiring (Ctrl+V yoki uzoq bosib &quot;Qo&apos;yish&quot;).
          </p>
        )}
      </div>

      {error && (
        <motion.div
          id="youtube-url-error"
          role="alert"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-4 py-3"
        >
          <p className="text-[15px] font-medium text-ui-red-ink">{error}</p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {videoInfo && (
          <motion.div key="preview" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <VideoPreview info={videoInfo} />
          </motion.div>
        )}
      </AnimatePresence>

      <SampleVideosSection onSelect={handleSampleSelect} activeUrl={url} />

      <fieldset className="space-y-3">
        <legend id="voice-gender-label" className="ui-label mb-2.5 block">
          Ovoz
        </legend>
        <div role="radiogroup" aria-labelledby="voice-gender-label" className="grid grid-cols-3 gap-1 rounded-control bg-ui-ground p-1">
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
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition ${
                  isSelected ? "bg-ui-surface text-ui-ink shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(var(--ui-rule))]" : "text-ui-muted hover:text-ui-ink"
                }`}
              >
                <opt.icon aria-hidden="true" className="h-4 w-4" />
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-ui-muted">{genderOptions.find((o) => o.value === voiceGender)?.desc ?? genderOptions[0].desc}</p>
      </fieldset>

      {isProUser && isGemini && voiceGender !== "auto" && (
        <div className="space-y-2">
          <span id="voice-variant-label" className="ui-label block">Ovoz varianti (Pro)</span>
          <div role="group" aria-labelledby="voice-variant-label" className="grid grid-cols-3 gap-1 rounded-control bg-ui-ground p-1">
            {(voiceGender === "male" ? maleVoices : femaleVoices).map((v) => {
              const active = (voiceName || (voiceGender === "male" ? "Charon" : "Autonoe")) === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onVoiceNameChange?.(v.id)}
                  aria-pressed={active}
                  className={`rounded-control border px-2 py-2 text-left transition ${
                    active ? "border-ui-accent text-ui-ink shadow-[0_0_0_1px_rgb(var(--ui-accent))]" : "border-ui-rule text-ui-muted hover:border-ui-muted/60"
                  }`}
                >
                  <span className="block text-sm font-medium text-ui-ink">{v.label}</span>
                  <span className="block truncate text-xs">{v.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p id="youtube-url-rules" className="flex items-start gap-2 border-t border-ui-rule pt-4 text-[13px] leading-relaxed text-ui-muted">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Diniy, 18+, zo&apos;ravonlik yoki noqonuniy faoliyatga oid videolarni yubormang
          (bolalarga oid jinsiy kontent umuman qabul qilinmaydi).{" "}
          <Link href="/terms" className="font-medium text-ui-ink underline underline-offset-2">Foydalanish shartlari</Link>
        </span>
      </p>
    </form>
  );
}
