"use client";

import { ClipboardPaste, Loader2, Sparkles, Youtube } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { VideoInfo, formatDuration } from "@/lib/api";

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
            alt={info.title}
            className="w-24 h-14 object-cover rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10"
          />
          <div className="absolute inset-0 rounded-xl bg-gradient-to-t from-black/20 to-transparent" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-bold leading-tight text-gray-900 dark:text-white line-clamp-2 transition-colors">
          {info.title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase">{info.uploader}</span>
          <span className="w-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
          <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400">{formatDuration(info.duration)}</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function UrlInput({
  url, videoInfo, loading, error, voiceGender, voiceName,
  ttsProvider = "azure", isProUser = false,
  onChange, onGenderChange, onVoiceNameChange, onTtsProviderChange, onSubmit,
}: Props) {
  const currentProvider = isProUser ? ttsProvider : "edge";
  const isGemini = currentProvider === "gemini";

  // Real voices per provider
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

  const currentMaleVoice = maleVoices.find((v) => v.id === voiceName) || maleVoices[0];
  const currentFemaleVoice = femaleVoices.find((v) => v.id === voiceName) || femaleVoices[0];

  const genderOptions = [
    { value: "auto",   label: "Avtomatik", icon: "🤖", desc: "AI aniqlaydi" },
    { value: "male",   label: "Erkak",     icon: "👨", desc: `${currentMaleVoice.label} ovozi` },
    { value: "female", label: "Ayol",      icon: "👩", desc: `${currentFemaleVoice.label} ovozi` },
  ];

  const handleGenderSelect = (val: string) => {
    onGenderChange(val);
    if (val === "male") {
      onVoiceNameChange?.(isGemini ? "Charon" : "uz-UZ-SardorNeural");
    } else if (val === "female") {
      onVoiceNameChange?.(isGemini ? "Autonoe" : "uz-UZ-MadinaNeural");
    } else {
      onVoiceNameChange?.("");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text);
    } catch {}
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* URL input */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">
          YouTube Havolasi
        </label>
        <div className="glass-input flex items-center gap-2.5 sm:gap-3 px-3.5 sm:px-5 py-3 sm:py-4 rounded-2xl sm:rounded-3xl relative overflow-hidden group transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-violet-500/5 opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none" />
          <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
          <input
            type="text"
            value={url}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Video havolasini joylashtiring..."
            className="flex-1 bg-transparent text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-600 text-xs sm:text-sm focus:outline-none font-medium"
          />
          <button
            type="button"
            onClick={handlePaste}
            className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl px-2.5 sm:px-4 py-1.5 sm:py-2 transition-all flex-shrink-0"
          >
            <ClipboardPaste size={13} />
            <span className="hidden xs:inline">Nusxani </span><span>qo'yish</span>
          </button>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed ml-1">
          Diniy, 18+, zo'ravonlik yoki noqonuniy faoliyatga oid videolarni yubormang
          (bolalarga oid jinsiy kontent esa umuman qabul qilinmaydi).
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

      {/* Sample Video Suggestions */}
      <div className="pt-1 space-y-1.5">
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider ml-1">
          💡 Namuna havolalardan birini sinab ko'ring:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange("https://youtu.be/UwMS0J2eTXE")}
            className="text-[11px] font-medium px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-blue-500/10 hover:text-blue-500 border border-black/5 dark:border-white/5 transition-all text-gray-600 dark:text-gray-400 flex items-center gap-1.5"
          >
            <span>🎯</span> Qo'rquvni yengish (58s)
          </button>
        </div>
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

      {/* Gender selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">
          Ovoz jinsi
        </label>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {genderOptions.map((opt) => {
            const isSelected = voiceGender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleGenderSelect(opt.value)}
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
            {voiceGender === "auto" ? (
              <span className="text-blue-500 font-bold">AI aniqlaydi</span>
            ) : voiceGender === "male" ? (
              <span className="text-indigo-600 dark:text-indigo-400 font-bold">{currentMaleVoice.label} ({isGemini ? "Google Gemini" : "Microsoft Neural"})</span>
            ) : (
              <span className="text-pink-600 dark:text-pink-400 font-bold">{currentFemaleVoice.label} ({isGemini ? "Google Gemini" : "Microsoft Neural"})</span>
            )}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            {isGemini ? "Gemini Voice Engine" : (currentProvider === "edge" ? "Edge TTS Engine" : "Azure Neural Engine")}
          </span>
        </div>

        {voiceGender === "auto" ? (
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
              {(voiceGender === "male" ? maleVoices : femaleVoices).map((v) => {
                const active = (voiceName || (voiceGender === "male" ? "Charon" : "Autonoe")) === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onVoiceNameChange?.(v.id)}
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
            <span>O'zbek tili uchun tasdiqlangan tabiiy neyral ovoz: <strong className="text-gray-700 dark:text-gray-200">{voiceGender === "male" ? "Sardor (uz-UZ-SardorNeural)" : "Madina (uz-UZ-MadinaNeural)"}</strong></span>
          </div>
        )}
      </div>

      {/* Error */}
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

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={loading || !url.trim()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-center gap-3
                   btn-premium disabled:from-gray-300 disabled:to-gray-200 dark:disabled:from-gray-800 dark:disabled:to-gray-800 disabled:opacity-50 disabled:pointer-events-none
                   text-white font-extrabold py-4 sm:py-5 rounded-2xl sm:rounded-[24px]
                   transition-all duration-300 text-xs sm:text-sm shadow-xl"
      >
        {loading ? (
          <><Loader2 size={18} className="animate-spin" /> Vazifa yaratilmoqda...</>
        ) : (
          <><Sparkles size={18} /> Video dublaj qilish</>
        )}
      </motion.button>

      <div className="flex flex-wrap justify-center gap-4 sm:gap-8 pt-2">
        {["100% Avtomat", "HD Sifat", "O'zbek tilida"].map((label, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-tighter">{label}</span>
          </div>
        ))}
      </div>
    </form>
  );
}
