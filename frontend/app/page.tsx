"use client";

import { useState } from "react";
import { Youtube, Wand2, AlertCircle } from "lucide-react";
import { createJob, getVideoInfo, VideoInfo } from "@/lib/api";
import { useJobPolling } from "@/hooks/useJobPolling";
import ProgressBar from "@/components/ProgressBar";
import VideoPlayer from "@/components/VideoPlayer";

export default function Home() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { job, error: pollError } = useJobPolling(jobId);

  const handleUrlChange = async (value: string) => {
    setUrl(value);
    setVideoInfo(null);
    setError(null);

    const isYoutube =
      value.includes("youtube.com/watch") || value.includes("youtu.be/");
    if (!isYoutube) return;

    try {
      const info = await getVideoInfo(value);
      setVideoInfo(info);
    } catch {
      // URL noto'g'ri yoki video yo'q
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await createJob(url);
      setJobId(result.job_id);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setUrl("");
    setVideoInfo(null);
    setJobId(null);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="bg-blue-500/20 p-4 rounded-2xl">
              <Wand2 size={40} className="text-blue-400" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">AI Dublyaj</h1>
          <p className="text-slate-400">
            YouTube videolarini o'zbek tiliga avtomatik dublyaj qilish
          </p>
        </div>

        {/* URL kiritish formasi */}
        {!jobId && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white/5 backdrop-blur rounded-2xl p-6 border border-white/10 space-y-4">
              <label className="block text-sm font-medium text-slate-300">
                YouTube Video URL
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Youtube
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400"
                  />
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Video preview */}
              {videoInfo && (
                <div className="flex gap-3 bg-white/5 rounded-xl p-3">
                  {videoInfo.thumbnail && (
                    <img
                      src={videoInfo.thumbnail}
                      alt={videoInfo.title}
                      className="w-24 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-sm leading-tight line-clamp-2">
                      {videoInfo.title}
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                      {videoInfo.uploader} ·{" "}
                      {Math.floor(videoInfo.duration / 60)} daqiqa
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex gap-2 text-red-400 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !url.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Yuklanmoqda...
                  </>
                ) : (
                  <>
                    <Wand2 size={18} />
                    Dublyaj qilish
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Progress va natija */}
        {job && (
          <div className="bg-white/5 backdrop-blur rounded-2xl p-6 border border-white/10 space-y-6">
            {/* Video sarlavhasi */}
            {job.video_title && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
                  Video
                </p>
                <h2 className="font-semibold text-lg leading-tight">
                  {job.video_title}
                </h2>
              </div>
            )}

            {/* Progress bar (completed bo'lmasa) */}
            {job.status !== "completed" && (
              <div className="bg-white/5 rounded-xl p-4">
                <ProgressBar job={job} />
              </div>
            )}

            {/* Tayyor video player */}
            {job.status === "completed" && job.output_video_url && (
              <VideoPlayer job={job} />
            )}

            {/* Polling xatosi */}
            {pollError && (
              <p className="text-yellow-400 text-sm">{pollError}</p>
            )}

            {/* Yangi video tugmasi */}
            {(job.status === "completed" || job.status === "failed") && (
              <button
                onClick={handleReset}
                className="w-full border border-white/20 hover:bg-white/10 py-3 rounded-xl font-medium transition-colors"
              >
                Yangi video dublyaj qilish
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs">
          Powered by Faster-Whisper · GPT-4o · Azure TTS · FFmpeg
        </p>
      </div>
    </main>
  );
}
