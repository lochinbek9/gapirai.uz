'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getJob, Job, formatDuration, getVideoUrl, getDownloadUrl, getAudioUrl } from '@/lib/api'
import {
  Download, ArrowLeft, Youtube, ChevronDown, ChevronUp,
  Mic2, Clock, Loader2
} from 'lucide-react'
import VideoPlayer from '@/components/VideoPlayer'

/* ── Page ────────────────────────────────────────── */
export default function VideoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [showTranscript, setShowTranscript] = useState(false)
  const [theaterMode, setTheaterMode] = useState(false)

  useEffect(() => {
    getJob(id)
      .then(setJob)
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false))
  }, [id, router])

  if (loading || !job) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
      </div>
    )
  }

  const videoSrc = getVideoUrl(id)
  const audioUrl = job.status === 'completed' ? getAudioUrl(id) : undefined

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.back()} className="text-slate-400 hover:text-white transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Youtube className="w-4 h-4 text-white" />
            </div>
            <span className="text-base font-bold text-white">AI Dubber</span>
          </Link>
        </div>
      </header>

      <div className={theaterMode ? 'w-full' : 'max-w-6xl mx-auto px-6 py-8'}>
        <div className={theaterMode
          ? 'flex flex-col gap-0'
          : 'grid grid-cols-1 lg:grid-cols-3 gap-8'
        }>
          {/* Player */}
          <div className={theaterMode ? 'w-full' : 'lg:col-span-2 space-y-4'}>
            {job.status === 'completed' ? (
              <VideoPlayer
                src={videoSrc}
                subtitlesContent={job.uzbek_srt_content}
                audioDownloadUrl={audioUrl}
                theaterMode={theaterMode}
                onTheaterToggle={() => setTheaterMode(m => !m)}
                className={theaterMode ? '' : 'rounded-2xl'}
              />
            ) : (
              <div className="aspect-video bg-slate-800 rounded-2xl flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-400 mx-auto mb-3" />
                  <p className="text-slate-400">{job.status_message || 'Qayta ishlanmoqda...'}</p>
                </div>
              </div>
            )}

            {/* Title & info (below player, padded in theater mode) */}
            <div className={theaterMode ? 'max-w-6xl mx-auto px-6 pt-6 space-y-4' : 'space-y-4'}>
              <div>
                <h1 className="text-xl font-bold text-white mb-2">
                  {job.video_title || "Noma'lum video"}
                </h1>
                <div className="flex items-center gap-4 text-slate-400 text-sm">
                  {job.video_duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDuration(job.video_duration)}
                    </span>
                  )}
                  {job.speaker_gender && (
                    <span className="flex items-center gap-1">
                      <Mic2 className="w-4 h-4" />
                      {job.speaker_gender === 'female' ? 'Ayol ovozi (MadinaNeural)' : 'Erkak ovozi (SardorNeural)'}
                    </span>
                  )}
                </div>
              </div>

              {/* Download */}
              {job.status === 'completed' && (
                <a
                  href={getDownloadUrl(id)}
                  download
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition"
                >
                  <Download className="w-4 h-4" />
                  Yuklab olish (MP4)
                </a>
              )}

              {/* Translation accordion */}
              {job.translated_text && (
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="w-full flex items-center justify-between px-5 py-4 text-white font-medium hover:bg-white/5 transition"
                  >
                    <span>O'zbek tilidagi matn</span>
                    {showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showTranscript && (
                    <div className="px-5 pb-5">
                      <p className="text-slate-300 text-sm leading-relaxed">{job.translated_text}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Sidebar info shown below in theater mode */}
              {theaterMode && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-8">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                    <InfoRow label="Holat" value={job.status === 'completed' ? '✅ Tayyor' : job.status} />
                    {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                    {job.speaker_gender && (
                      <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? '👩 Ayol' : '👨 Erkak'} />
                    )}
                    {job.created_at && (
                      <InfoRow label="Yuborilgan" value={new Date(job.created_at).toLocaleDateString('uz-UZ')} />
                    )}
                    {job.uzbek_srt_content && <InfoRow label="Subtitr" value="✅ Mavjud" />}
                  </div>
                  {job.transcript_text && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                      <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Inglizcha matn</p>
                      <p className="text-slate-300 text-sm leading-relaxed line-clamp-6">{job.transcript_text}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar (only in default mode) */}
          {!theaterMode && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold">Video ma'lumotlari</h2>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                <InfoRow label="Holat" value={job.status === 'completed' ? '✅ Tayyor' : job.status} />
                {job.video_duration && <InfoRow label="Davomiylik" value={formatDuration(job.video_duration)} />}
                {job.speaker_gender && (
                  <InfoRow label="Spikerning jinsi" value={job.speaker_gender === 'female' ? '👩 Ayol' : '👨 Erkak'} />
                )}
                {job.created_at && (
                  <InfoRow label="Yuborilgan" value={new Date(job.created_at).toLocaleDateString('uz-UZ')} />
                )}
                {job.uzbek_srt_content && (
                  <InfoRow label="Subtitr" value="✅ Mavjud" />
                )}
              </div>

              {job.transcript_text && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Inglizcha matn</p>
                  <p className="text-slate-300 text-sm leading-relaxed line-clamp-6">{job.transcript_text}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium text-right">{value}</span>
    </div>
  )
}
