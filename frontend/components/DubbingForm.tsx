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
          { id: "url", label: <><span className="sm:hidden">Havola</span><span className="hidden sm:inline">YouTube havolasi</span></>, icon: Youtube },
          { id: "file", label: <><span className="sm:hidden">Fayl</span><span className="hidden sm:inline">Video fayl yuklash</span></>, icon: FileVideo },
        ]}
        className="inline-flex w-full gap-1 rounded-[6px] bg-metro-ground p-1 sm:w-auto"
        tabClassName={(active) =>
          `flex flex-1 items-center justify-center gap-2 rounded-[4px] px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-blue sm:flex-none ${
            active
              ? "bg-metro-surface text-metro-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
              : "text-metro-muted hover:text-metro-ink"
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
