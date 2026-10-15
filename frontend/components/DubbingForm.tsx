"use client";

import { useState } from "react";
import { FileVideo, Youtube } from "lucide-react";
import UrlInput from "@/components/UrlInput";
import DubFileForm from "@/components/DubFileForm";
import type { VideoInfo } from "@/lib/api";

interface Props {
  url: string;
  videoInfo: VideoInfo | null;
  loading: boolean;
  error: string | null;
  voiceGender: string;
  ttsProvider?: string;
  isProUser?: boolean;
  onChange: (url: string) => void;
  onGenderChange: (gender: string) => void;
  onTtsProviderChange?: (provider: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function DubbingForm({
  url,
  videoInfo,
  loading,
  error,
  voiceGender,
  ttsProvider = "azure",
  isProUser = false,
  onChange,
  onGenderChange,
  onTtsProviderChange,
  onSubmit,
}: Props) {
  const [source, setSource] = useState<"url" | "file">("url");

  const tab = (id: "url" | "file", label: string, Icon: typeof Youtube) => (
    <button
      type="button"
      onClick={() => setSource(id)}
      aria-pressed={source === id}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all ${
        source === id
          ? "bg-white dark:bg-white/10 text-blue-600 dark:text-blue-400 shadow-sm"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5">
        {tab("url", "YouTube havolasi", Youtube)}
        {tab("file", "Video fayl yuklash", FileVideo)}
      </div>

      {source === "url" ? (
        <UrlInput
          url={url}
          videoInfo={videoInfo}
          loading={loading}
          error={error}
          voiceGender={voiceGender}
          ttsProvider={ttsProvider}
          isProUser={isProUser}
          onChange={onChange}
          onGenderChange={onGenderChange}
          onTtsProviderChange={onTtsProviderChange}
          onSubmit={onSubmit}
        />
      ) : (
        <DubFileForm
          voiceGender={voiceGender}
          onGenderChange={onGenderChange}
        />
      )}
    </div>
  );
}
