"use client";

import { useState } from "react";
import { FileVideo, Youtube } from "lucide-react";
import TabList, { tabPanelProps } from "@/components/ui/TabList";
import UrlInput from "@/components/UrlInput";
import DubFileForm from "@/components/DubFileForm";
import type { VideoInfo } from "@/lib/api";

interface Props {
  url: string;
  videoInfo: VideoInfo | null;
  loading: boolean;
  error: string | null;
  voiceGender: string;
  voiceName?: string;
  ttsProvider?: string;
  isProUser?: boolean;
  onChange: (url: string) => void;
  onGenderChange: (gender: string) => void;
  onVoiceNameChange?: (voice: string) => void;
  onTtsProviderChange?: (provider: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export default function DubbingForm({
  url,
  videoInfo,
  loading,
  error,
  voiceGender,
  voiceName,
  ttsProvider = "gemini",
  isProUser = false,
  onChange,
  onGenderChange,
  onVoiceNameChange,
  onTtsProviderChange,
  onSubmit,
}: Props) {
  const [source, setSource] = useState<"url" | "file">("url");


  return (
    <div className="space-y-5">
      <TabList
        idBase="dub-source"
        label="Video manbasi"
        value={source}
        onChange={setSource}
        items={[
          { id: "url", label: "YouTube havolasi", icon: Youtube },
          { id: "file", label: "Video fayl yuklash", icon: FileVideo },
        ]}
        className="flex gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5"
        tabClassName={(active) =>
          `flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
            active
              ? "bg-white dark:bg-white/10 text-blue-700 dark:text-blue-300 shadow-sm"
              : "text-slate-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          }`}
      />

      <div {...tabPanelProps("dub-source", source)}>
      {source === "url" ? (
        <UrlInput
          url={url}
          videoInfo={videoInfo}
          loading={loading}
          error={error}
          voiceGender={voiceGender}
          voiceName={voiceName}
          ttsProvider={ttsProvider}
          isProUser={isProUser}
          onChange={onChange}
          onGenderChange={onGenderChange}
          onVoiceNameChange={onVoiceNameChange}
          onTtsProviderChange={onTtsProviderChange}
          onSubmit={onSubmit}
        />
      ) : (
        <DubFileForm
          voiceGender={voiceGender}
          voiceName={voiceName}
          ttsProvider={ttsProvider}
          isProUser={isProUser}
          onGenderChange={onGenderChange}
          onVoiceNameChange={onVoiceNameChange}
          onTtsProviderChange={onTtsProviderChange}
        />
      )}
      </div>
    </div>
  );
}
