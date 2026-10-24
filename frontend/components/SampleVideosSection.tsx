"use client";

import { Brain, Check, Globe, Mic, Rocket, Zap, type LucideIcon } from "lucide-react";

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
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span id="samples-label" className="m-label">Namunalar</span>
        <span className="text-sm text-metro-muted">Havola izlamasdan bittasini tanlang</span>
      </div>

      <div role="group" aria-labelledby="samples-label" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SAMPLE_VIDEOS.map((sample) => {
          const isSelected = activeUrl === sample.url;
          const Icon = CATEGORY_ICONS[sample.categoryIcon];
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => onSelect(sample)}
              aria-pressed={isSelected}
              className={`group flex flex-col overflow-hidden rounded-[6px] border-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue ${
                isSelected ? "border-metro-ink" : "border-metro-rule hover:border-metro-muted"
              }`}
            >
              <span className="relative block aspect-video w-full overflow-hidden bg-metro-plaque">
                <img src={sample.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                <span className="absolute bottom-1 right-1 rounded-[3px] bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white m-num">
                  {sample.durationText}
                </span>
                {isSelected && (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-[3px] bg-metro-ink px-1.5 py-0.5 text-[11px] font-bold text-metro-ground">
                    <Check aria-hidden="true" className="h-3 w-3" /> Tanlangan
                  </span>
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1.5 p-2.5">
                <span className="line-clamp-2 text-sm font-bold leading-snug text-metro-ink">{sample.title}</span>
                <span className="mt-auto flex items-center justify-between gap-1 text-xs text-metro-muted">
                  <span className="inline-flex items-center gap-1">
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {sample.category}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Mic aria-hidden="true" className="h-3 w-3" />
                    {sample.gender === "male" ? "Erkak" : "Ayol"}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
