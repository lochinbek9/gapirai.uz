"use client";

import { motion } from "framer-motion";
import { Brain, Check, Globe, Mic, Play, Rocket, Sparkles, Zap, type LucideIcon } from "lucide-react";

// Emoji o'rniga bitta chiziq qalinligidagi ikonka tizimi (lucide).
const CATEGORY_ICONS = { brain: Brain, rocket: Rocket, globe: Globe, zap: Zap } satisfies Record<string, LucideIcon>;

export interface SampleVideo {
  id: string;
  url: string;
  title: string;
  category: string;
  categoryIcon: keyof typeof CATEGORY_ICONS;
  durationText: string;
  thumbnail: string;
  recommendedVoice: "Charon" | "Autonoe";
  gender: "male" | "female";
}

export const SAMPLE_VIDEOS: SampleVideo[] = [
  {
    id: "fear",
    url: "https://youtu.be/UwMS0J2eTXE",
    title: "Qo'rquvni qanday yengish mumkin?",
    category: "Psixologiya",
    categoryIcon: "brain",
    durationText: "0:58",
    thumbnail: "https://i.ytimg.com/vi/UwMS0J2eTXE/hqdefault.jpg",
    recommendedVoice: "Charon",
    gender: "male",
  },
  {
    id: "ai",
    url: "https://youtu.be/2ePf9rue1Ao",
    title: "Sun'iy intellekt kelajagi va insoniyat",
    category: "Texnologiya",
    categoryIcon: "rocket",
    durationText: "0:45",
    thumbnail: "https://i.ytimg.com/vi/2ePf9rue1Ao/hqdefault.jpg",
    recommendedVoice: "Autonoe",
    gender: "female",
  },
  {
    id: "cosmos",
    url: "https://youtu.be/pDmg2DyOp7o",
    title: "Koinot mo'jizalari va qora tuynuklar",
    category: "Fan & Olam",
    categoryIcon: "globe",
    durationText: "0:22",
    thumbnail: "https://i.ytimg.com/vi/pDmg2DyOp7o/hqdefault.jpg",
    recommendedVoice: "Charon",
    gender: "male",
  },
  {
    id: "habit",
    url: "https://youtu.be/kqQLQZ7vTcI",
    title: "2 daqiqalik qoida: Dangasalikni yengish",
    category: "Samaradorlik",
    categoryIcon: "zap",
    durationText: "0:22",
    thumbnail: "https://i.ytimg.com/vi/kqQLQZ7vTcI/hqdefault.jpg",
    recommendedVoice: "Charon",
    gender: "male",
  },
];

interface Props {
  onSelect: (sample: SampleVideo) => void;
  activeUrl?: string;
}

export default function SampleVideosSection({ onSelect, activeUrl }: Props) {
  return (
    <div className="pt-2 pb-1 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1 ml-1">
        <div className="flex items-center gap-1.5">
          <Sparkles aria-hidden="true" className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
          <span id="samples-label" className="text-xs font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            Tayyor namunaviy videolar
          </span>
        </div>
        <span className="text-xs text-slate-600 dark:text-slate-400 font-medium hidden sm:inline">
          Havola izlamasdan 1 klikda sinab ko&apos;ring
        </span>
      </div>

      <div role="group" aria-labelledby="samples-label" className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
        {SAMPLE_VIDEOS.map((sample) => {
          const isSelected = activeUrl === sample.url;
          return (
            <motion.button
              key={sample.id}
              type="button"
              onClick={() => onSelect(sample)}
              aria-pressed={isSelected}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`group text-left p-2 rounded-2xl border transition-all duration-300 relative flex flex-col justify-between overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                isSelected
                  ? "bg-violet-500/10 dark:bg-violet-500/15 border-violet-500 shadow-md ring-2 ring-violet-500/20"
                  : "bg-black/[0.02] dark:bg-white/[0.03] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] border-black/5 dark:border-white/10 hover:border-violet-400/40"
              }`}
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-900 mb-2">
                <img
                  src={sample.thumbnail}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                {/* Duration Badge */}
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-sm text-[11px] font-bold tabular-nums text-white shadow-sm">
                  {sample.durationText}
                </div>

                {/* Category Pill */}
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-[11px] font-medium text-white flex items-center gap-1">
                  {(() => { const Icon = CATEGORY_ICONS[sample.categoryIcon]; return <Icon aria-hidden className="w-3 h-3" />; })()}
                  <span className="truncate max-w-[80px]">{sample.category}</span>
                </div>

                {/* Play Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <div className="w-7 h-7 rounded-full bg-violet-600/90 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                    <Play aria-hidden="true" className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Title & Action */}
              <div className="space-y-1.5 flex-1 flex flex-col justify-between">
                {/* Tugma ichida sarlavha (h*) bo'lishi mumkin emas -- oddiy matn */}
                <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                  {sample.title}
                </span>
                <span className="flex items-center justify-between gap-1 pt-0.5 text-xs">
                  <span className={`font-semibold flex items-center gap-1 ${
                    isSelected ? "text-violet-700 dark:text-violet-300 font-bold" : "text-slate-600 dark:text-slate-300"
                  }`}>
                    {isSelected ? <><Check aria-hidden className="w-3 h-3" />Tanlangan</> : <><Play aria-hidden className="w-3 h-3" />Sinash</>}
                  </span>
                  <span className="flex items-center gap-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <Mic aria-hidden="true" className="w-3 h-3" />
                    {sample.gender === "male" ? "Erkak" : "Ayol"}
                  </span>
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
