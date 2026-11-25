"use client";

import { useEffect, useState } from "react";
import { getVideoInfo, VideoInfo } from "@/lib/api";

const isYoutubeUrl = (v: string) => v.includes("youtube.com/watch") || v.includes("youtu.be/");

/** Preview olinmaganda: serverning tushunarli sababi, boʻlmasa umumiy xabar */
export function videoInfoError(err: any): string {
  const detail = err?.response?.data?.detail;
  return typeof detail === "string" ? detail : "Video ma'lumotlarini olib bo'lmadi. U o'chirilgan yoki yopiq bo'lishi mumkin.";
}

/** YouTube havolasi o'zgarganda video ma'lumotini (nom, rasm, davomiylik) oladi.
 * Qo'lda yozish ham, "Joylashtirish" tugmasi ham url holatini o'zgartiradi, shuning
 * uchun ikkalasi bir xil ishlaydi. Tez-tez o'zgarishda faqat oxirgisi olinadi. */
export function useVideoInfo(url: string): { info: VideoInfo | null; error: string | null } {
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInfo(null);
    setError(null);
    const value = url.trim();
    if (!isYoutubeUrl(value)) return;
    let stale = false;
    const t = setTimeout(async () => {
      try {
        const data = await getVideoInfo(value);
        if (!stale) setInfo(data);
      } catch (err) {
        if (!stale) setError(videoInfoError(err));
      }
    }, 400);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [url]);

  return { info, error };
}
