"use client";

import { Brain, Check, Globe, Rocket, Zap, type LucideIcon } from "lucide-react";

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

/** Namunalar: ramkasiz kartalar -- rasm, nom va bitta kulrang qator. Telefonda gorizontal
 * aylantiriladi (2 ustunli katak formani cho'zib yuborardi), kompyuterda 4 ustun. */
export default function SampleVideosSection({ onSelect, activeUrl }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <span id="samples-label" className="ui-label block">Namunalar</span>
        <span className="text-sm text-ui-muted">Havola izlamasdan bittasini tanlab sinab ko&apos;ring</span>
      </div>

      <div
        role="group"
        aria-labelledby="samples-label"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
      >
        {SAMPLE_VIDEOS.map((sample) => {
          const isSelected = activeUrl === sample.url;
          const Icon = CATEGORY_ICONS[sample.categoryIcon];
          return (
            <button
              key={sample.id}
              type="button"
              onClick={() => onSelect(sample)}
              aria-pressed={isSelected}
              className="group w-[62%] shrink-0 snap-start rounded-xl text-left sm:w-auto"
            >
              <span
                className={`relative block aspect-video w-full overflow-hidden rounded-xl bg-ui-ground ring-offset-2 ring-offset-ui-surface transition ${
                  isSelected ? "ring-2 ring-ui-accent" : "group-hover:opacity-90"
                }`}
              >
                <img src={sample.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                  {sample.durationText}
                </span>
                {isSelected && (
                  <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ui-accent text-white">
                    <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-2 line-clamp-2 block text-sm font-medium leading-snug text-ui-ink">{sample.title}</span>
              <span className="mt-1 flex items-center gap-1 text-xs text-ui-muted">
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{sample.category} · {sample.gender === "male" ? "Erkak" : "Ayol"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
