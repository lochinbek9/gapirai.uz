"use client";

import { useEffect, useState } from "react";
import { getVideoInfo, VideoInfo } from "@/lib/api";

const isYoutubeUrl = (v: string) => v.includes("youtube.com/watch") || v.includes("youtu.be/");

/** YouTube havolasi o'zgarganda video ma'lumotini (nom, rasm, davomiylik) oladi.
 * Qo'lda yozish ham, "Joylashtirish" tugmasi ham url holatini o'zgartiradi, shuning
 * uchun ikkalasi bir xil ishlaydi. Tez-tez o'zgarishda faqat oxirgisi olinadi. */
export function useVideoInfo(url: string): VideoInfo | null {
  const [info, setInfo] = useState<VideoInfo | null>(null);

  useEffect(() => {
    setInfo(null);
    const value = url.trim();
    if (!isYoutubeUrl(value)) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const data = await getVideoInfo(value);
        if (!stale) setInfo(data);
      } catch {
        /* preview ixtiyoriy -- jimgina o'tkazib yuboramiz */
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [url]);

  return info;
}
