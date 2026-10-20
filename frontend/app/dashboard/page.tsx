'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import {
  listJobs, deleteJob, retryJob, Job, STATUS_LABELS, formatDuration, getVideoUrl,
  getPlans, subscribeToPlan, CurrentSubscription, getJobsStats, JobsStats,
  listUserAnalyses, deleteAnalysis, retryAnalysis, VideoAnalysis,
} from '@/lib/api'
import { extractYouTubeId } from '@/lib/youtube'
import PushOptIn from '@/components/PushOptIn'
import BillingCard from '@/components/billing/BillingCard'
import DonateCTA from '@/components/DonateCTA'
import {
  Youtube, Plus, LogOut, Clock, CheckCircle2, XCircle, CircleSlash,
  Loader2, Trash2, Play, User2, Mic2, MicOff, Crown, RotateCw, ShieldAlert,
  Sparkles, FileText,
} from 'lucide-react'
import { formatTashkentDate } from '@/lib/timestamp'

const PLAN_NAMES: Record<string, string> = { free: 'Bepul', standard: 'Standart', pro: 'Pro' }

function PlanCard({ sub, onRenew, renewing }: { sub: CurrentSubscription | null; onRenew: () => void; renewing: boolean }) {
  if (!sub) return null
  const planName = PLAN_NAMES[sub.plan] || sub.plan
  const expiresSoon = sub.expires_at && new Date(sub.expires_at).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000
  const isAdmin = sub.is_admin
  const isUnlimited = sub.minutes?.is_unlimited || (sub.minutes?.monthly_cap ?? 0) >= 99999

  return (
    <div className="glass-card rounded-2xl p-4 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-[10px] font-bold uppercase tracking-wider">Joriy tarif</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-black text-gray-900 dark:text-white">{planName}</p>
            {isAdmin && (
              <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                ADMIN
              </span>
            )}
          </div>
        </div>
        <div className="sm:ml-3 text-xs text-gray-500 dark:text-gray-400 space-y-0.5 w-full sm:w-auto">
          {sub.minutes && (
            <>
              {isUnlimited ? (
                <p>
                  <span className="font-bold text-violet-600 dark:text-violet-400">Cheksiz daqiqa</span>
                  <span className="text-gray-500 text-[11px] ml-1.5 font-medium">(Barcha AI provayderlar faol)</span>
                </p>
              ) : (
                <p>
                  <span className="font-bold text-gray-800 dark:text-gray-200">{sub.minutes.monthly_remaining}</span>
                  {' / '}{sub.minutes.monthly_cap} daqiqa qoldi (oylik)
                </p>
              )}
              {sub.minutes.monthly_used > 0 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {sub.minutes.monthly_used} daqiqa ishlatildi
                </p>
              )}
              {sub.minutes.purchased > 0 && !isUnlimited && (
                <p className="text-violet-500 dark:text-violet-400 font-semibold">
                  + {sub.minutes.purchased} sotib olingan daqiqa
                </p>
              )}
            </>
          )}
          {sub.plan !== 'free' && sub.expires_at && !isUnlimited && (
            <p className={expiresSoon ? 'text-amber-500 font-bold' : ''}>
              {formatTashkentDate(sub.expires_at)} gacha
            </p>
          )}
        </div>
      </div>
      {!isUnlimited && (
        <Link
          href="/pricing"
          onClick={sub.plan !== 'free' && expiresSoon ? (e) => { e.preventDefault(); onRenew() } : undefined}
          className="flex items-center justify-center gap-2 btn-premium text-xs font-bold px-4 py-2.5 rounded-xl shadow-md w-full sm:w-auto"
        >
          {renewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
          {sub.plan === 'free' ? "Tarifni oshirish" : expiresSoon ? 'Yangilash' : 'Tariflarni ko\'rish'}
        </Link>
      )}
    </div>
  )
}

function StatusBadge({
  status,
  errorCode,
  errorMessage,
}: {
  status: string
  errorCode?: string | null
  errorMessage?: string | null
}) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" />
        Tayyor
      </span>
    )
  }
  if (status === 'failed') {
    const isCancelled = errorCode === 'USER_CANCELLED' ||
      errorMessage?.toLowerCase().includes('user cancelled') ||
      errorMessage?.toLowerCase().includes('bekor qilindi')
    if (isCancelled) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider bg-slate-500/10 text-slate-400 border-slate-500/20">
          <CircleSlash className="w-3 h-3 text-slate-400" />
          Bekor qilindi
        </span>
      )
    }
    const isNoSpeech = errorCode === 'NO_SPEECH_FOUND' || errorMessage?.toLowerCase().includes('nutq topilmadi')
    const isContentBlocked = errorCode === 'CONTENT_BLOCKED' || errorMessage?.toLowerCase().includes('kontent siyosati') || errorMessage?.toLowerCase().includes('taqiqlangan')
    if (isNoSpeech) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          <MicOff className="w-3 h-3" />
          Nutq topilmadi
        </span>
      )
    }
    if (isContentBlocked) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
          <ShieldAlert className="w-3 h-3" />
          Rad etildi
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
        <XCircle className="w-3 h-3" />
        Xatolik
      </span>
    )
  }
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    pending: { color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', icon: <Clock className="w-3 h-3" /> },
  }
  const def = { color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
  const { color, icon } = cfg[status] || def
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${color}`}>
      {icon}
      {STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}
    </span>
  )
}

function VideoCard({
  job,
  onDelete,
  onRetry,
  isRetrying,
  isDeleting = false,
  isAdmin = false,
}: {
  job: Job
  onDelete: (id: string) => void
  onRetry: (id: string, isRegenerate?: boolean) => void
  isRetrying: boolean
  isDeleting?: boolean
  isAdmin?: boolean
}) {
  const thumbnail = job.video_thumbnail || `https://img.youtube.com/vi/${job.job_id}/mqdefault.jpg`
  const duration = job.video_duration ? formatDuration(job.video_duration) : '--:--'
  const isReady = job.status === 'completed'
  const isFailed = job.status === 'failed'
  const isNoSpeech = job.error_code === 'NO_SPEECH_FOUND' || job.error_message?.toLowerCase().includes('nutq topilmadi')
  const isContentBlocked = job.error_code === 'CONTENT_BLOCKED' || job.error_message?.toLowerCase().includes('kontent siyosati') || job.error_message?.toLowerCase().includes('taqiqlangan')
  const isNonRetryable = isNoSpeech || isContentBlocked

  // TTS Metadata formatting
  const prov = (job.tts_provider || 'azure').toLowerCase()
  const isFemale = job.speaker_gender === 'female' || (job.voice_name && /madina|female|autonoe|aoede/i.test(job.voice_name))
  const genderDisplayName = isFemale ? 'Ayol' : 'Erkak'

  let voiceDisplayName = job.voice_name || ''
  if (!voiceDisplayName) {
    if (prov === 'gemini') {
      voiceDisplayName = isFemale ? 'Autonoe' : 'Charon'
    } else {
      voiceDisplayName = isFemale ? 'Madina' : 'Sardor'
    }
  } else {
    // Toza nomini ajratib ko'rsatish: masalan uz-UZ-MadinaNeural -> Madina
    voiceDisplayName = voiceDisplayName.replace('uz-UZ-', '').replace('Neural', '')
  }

  const styleDisplayName = job.voice_style && job.voice_style !== 'neutral' ? job.voice_style : 'Neytral'

  return (
    <div className="group glass-card hover:translate-y-[-2px] hover:shadow-xl hover:border-indigo-500/20 rounded-2xl overflow-hidden transition-all duration-300">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/10 dark:bg-slate-900/60 overflow-hidden">
        {job.video_thumbnail ? (
          <img src={thumbnail} alt={job.video_title || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-black/5 dark:bg-white/[0.02]">
            <Youtube className="w-12 h-12 text-slate-400 dark:text-slate-700" />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2.5 right-2.5 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold tracking-tighter">
          {duration}
        </div>
        {/* Play overlay for ready jobs */}
        {isReady && (
          <Link href={`/video/${job.job_id}`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
            <div className="w-12 h-12 bg-white/95 rounded-2xl flex items-center justify-center shadow-lg transition transform translate-y-2 group-hover:translate-y-0 duration-300">
              <Play className="w-5 h-5 text-indigo-600 fill-indigo-600 ml-0.5" />
            </div>
          </Link>
        )}
        {/* In-progress overlay linking to video page */}
        {!isReady && !isFailed && (
          <Link
            href={`/video/${job.job_id}`}
            title="Jarayonni ko'rish"
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm"
          >
            <div className="px-3 py-1.5 bg-indigo-600/90 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Jarayonni ko'rish</span>
            </div>
          </Link>
        )}
        {/* Progress bar on thumbnail for in-progress jobs */}
        {!isReady && !isFailed && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${Math.max(5, Math.min(100, job.progress || 0))}%` }}
            />
          </div>
        )}
        {/* Top-left: Voice & Gender badge */}
        <div className="absolute top-2.5 left-2.5 bg-black/75 text-white text-[9px] font-bold tracking-wider px-2 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-sm">
          {isFemale ? <Mic2 className="w-3 h-3 text-pink-400" /> : <Mic2 className="w-3 h-3 text-indigo-400" />}
          <span>{genderDisplayName} • {voiceDisplayName}</span>
        </div>
        {/* Top-right: Provider badge */}
        <div className="absolute top-2.5 right-2.5">
          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg backdrop-blur-sm shadow-md ${
            prov === 'gemini'
              ? 'bg-violet-900/80 text-violet-200 border border-violet-500/30'
              : prov === 'edge'
              ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/30'
              : 'bg-sky-900/80 text-sky-200 border border-sky-500/30'
          }`}>
            {prov === 'gemini' ? 'HD' : prov === 'edge' ? 'Standart' : 'Neural'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-gray-900 dark:text-white font-bold text-sm line-clamp-2 mb-2 min-h-[2.5rem]">
          <Link href={`/video/${job.job_id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
            {job.video_title || 'Yuklanmoqda...'}
          </Link>
        </h3>

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px]">
          <span className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${
            prov === 'gemini'
              ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
              : prov === 'edge'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
          }`}>
            {prov === 'gemini' ? 'GapirAI HD' : prov === 'edge' ? 'Standart' : 'Neural HD'}
          </span>
          <span className="px-2 py-0.5 rounded-md font-medium bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-black/5 dark:border-white/5">
            {voiceDisplayName} ({genderDisplayName})
          </span>
          <span className="px-1.5 py-0.5 rounded-md font-medium text-gray-400 dark:text-gray-500 bg-black/[0.02] dark:bg-white/[0.02]">
            Ohang: {styleDisplayName}
          </span>
        </div>

        {/* Admin exact metadata inspection */}
        {isAdmin && (
          <div className="mb-3 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-600 dark:text-amber-400 space-y-1">
            <div className="flex items-center justify-between font-bold text-amber-500">
              <span className="flex items-center gap-1"><span>🛠</span> AI MODELLAR (ADMIN)</span>
              <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20">{prov}</span>
            </div>
            <div className="text-[9px] text-gray-700 dark:text-gray-300 space-y-0.5">
              <div className="flex justify-between"><span className="text-gray-500">STT:</span> <span className="font-semibold text-gray-900 dark:text-gray-100">{job.stt_model || '— (eski job)'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tarjima:</span> <span className="font-semibold text-gray-900 dark:text-gray-100">{job.translation_model || '— (eski job)'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TTS:</span> <span className="font-semibold text-gray-900 dark:text-gray-100">{job.tts_model || (prov === 'azure' ? `azure-neural (${voiceDisplayName})` : prov === 'edge' ? `edge-tts (${voiceDisplayName})` : `gemini-tts (${voiceDisplayName})`)}</span></div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <StatusBadge status={job.status} errorCode={job.error_code} errorMessage={job.error_message} />
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isReady ? (
              <Link
                href={`/video/${job.job_id}`}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-bold"
              >
                Ko'rish →
              </Link>
            ) : !isFailed ? (
              <Link
                href={`/video/${job.job_id}`}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium flex items-center gap-1"
                title="Jarayonni ko'rish"
              >
                <span>Jarayon</span>
                {job.progress ? <span className="font-mono text-[11px]">({Math.round(job.progress)}%)</span> : null}
                <span>→</span>
              </Link>
            ) : null}
            {isFailed && !isNonRetryable && (
              <button
                onClick={() => onRetry(job.job_id, false)}
                disabled={isRetrying}
                title="Qayta urinish (retry)"
                className="text-gray-400 hover:text-emerald-500 hover:bg-emerald-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-emerald-500' : ''}`} />
              </button>
            )}
            {isReady && (
              <button
                onClick={() => onRetry(job.job_id, true)}
                disabled={isRetrying}
                title="Qayta yaratish (Regenerate)"
                className="text-gray-400 hover:text-violet-500 hover:bg-violet-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-violet-500' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(job.job_id)
              }}
              disabled={isDeleting || isRetrying}
              className="text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
              title="O'chirish"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalysisCard({
  analysis,
  onDelete,
  onRetry,
  isDeleting = false,
  isRetrying = false,
}: {
  analysis: VideoAnalysis
  onDelete: (id: string) => void
  onRetry?: (id: string) => void
  isDeleting?: boolean
  isRetrying?: boolean
}) {
  const ytId = extractYouTubeId(analysis.youtube_url)
  const thumbnail =
    analysis.video_thumbnail ||
    (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null)
  const duration = analysis.video_duration ? formatDuration(analysis.video_duration) : null
  const isReady = analysis.status === 'completed'
  const isFailed = analysis.status === 'failed'

  const summaryText =
    analysis.summary?.short ||
    analysis.five_minute_summary?.why_it_matters ||
    analysis.status_message ||
    ''

  return (
    <div className="group glass-card hover:translate-y-[-2px] hover:shadow-xl hover:border-violet-500/20 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between">
      <div>
        {/* Thumbnail */}
        <div className="relative aspect-video bg-black/10 dark:bg-slate-900/60 overflow-hidden">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={analysis.video_title || 'Video tahlili'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black/5 dark:bg-white/[0.02]">
              <Sparkles className="w-12 h-12 text-violet-400" />
            </div>
          )}

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2.5 right-2.5 bg-black/75 text-white text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold tracking-tighter">
              {duration}
            </div>
          )}

          {/* Top-left: AI Tahlil badge */}
          <div className="absolute top-2.5 left-2.5 bg-violet-950/80 text-violet-200 border border-violet-500/30 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg flex items-center gap-1.5 backdrop-blur-sm shadow-md">
            <Sparkles className="w-3 h-3 text-violet-400" />
            <span>AI Tahlil</span>
          </div>

          {/* Top-right: Language badge */}
          <div className="absolute top-2.5 right-2.5">
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg backdrop-blur-sm shadow-md bg-black/75 text-white border border-white/10">
              {analysis.language.toUpperCase()}
            </span>
          </div>

          {/* Hover overlay */}
          <Link
            href={`/video-analysis/${analysis.id}`}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm"
          >
            <div className="px-3.5 py-2 bg-white text-gray-900 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg transition transform translate-y-1 group-hover:translate-y-0">
              <Play className="w-4 h-4 fill-gray-900 ml-0.5" />
              <span>Tahlilni ko'rish</span>
            </div>
          </Link>

          {/* Progress bar for in-progress analyses */}
          {!isReady && !isFailed && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-300"
                style={{ width: `${Math.max(5, Math.min(100, analysis.progress || 0))}%` }}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-gray-900 dark:text-white font-bold text-sm line-clamp-2 mb-1.5 min-h-[2.5rem]">
            <Link
              href={`/video-analysis/${analysis.id}`}
              className="hover:text-violet-600 dark:hover:text-violet-400 transition"
            >
              {analysis.video_title || 'YouTube video tahlili'}
            </Link>
          </h3>

          {summaryText && (
            <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-2 mb-3 leading-relaxed">
              {summaryText}
            </p>
          )}

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[10px]">
            {analysis.chapters && analysis.chapters.length > 0 && (
              <span className="px-2 py-0.5 rounded-md font-medium bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-black/5 dark:border-white/5">
                {analysis.chapters.length} ta bob
              </span>
            )}
            {analysis.key_points && analysis.key_points.length > 0 && (
              <span className="px-2 py-0.5 rounded-md font-medium bg-black/5 dark:bg-white/5 text-gray-700 dark:text-gray-300 border border-black/5 dark:border-white/5">
                {analysis.key_points.length} asosiy fikr
              </span>
            )}
            {analysis.notes && (
              <span className="px-2 py-0.5 rounded-md font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                Konspekt mavjud
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Status */}
      <div className="p-4 pt-0 border-t border-black/5 dark:border-white/5 mt-2 flex items-center justify-between">
        <div>
          {isReady ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              Tayyor
            </span>
          ) : isFailed ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wider bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20">
              <XCircle className="w-3 h-3" />
              Xatolik
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
              <Loader2 className="w-3 h-3 animate-spin" />
              {analysis.status_message || 'Tahlil qilinmoqda'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {isFailed && onRetry && (
            <button
              onClick={() => onRetry(analysis.id)}
              disabled={isRetrying}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-sm transition disabled:opacity-50"
              title="Tahlilni qayta urinish (Regenerate)"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>Qayta urinish</span>
            </button>
          )}
          {isReady && onRetry && (
            <button
              onClick={() => onRetry(analysis.id)}
              disabled={isRetrying}
              title="Qayta tahlil qilish"
              className="text-gray-400 hover:text-violet-500 hover:bg-violet-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
            >
              <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-violet-500' : ''}`} />
            </button>
          )}
          <Link
            href={`/video-analysis/${analysis.id}`}
            className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 font-bold"
          >
            Ko'rish →
          </Link>
          <button
            onClick={() => onDelete(analysis.id)}
            disabled={isDeleting || isRetrying}
            className="text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
            title="O'chirish"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  );
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'dubbing' | 'analysis'>('dubbing')
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [analyses, setAnalyses] = useState<VideoAnalysis[]>([])
  const [analysesLoading, setAnalysesLoading] = useState(true)
  const [deletingAnalysisId, setDeletingAnalysisId] = useState<string | null>(null)
  const [jobsStats, setJobsStats] = useState<JobsStats | null>(null)
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null)
  const [renewing, setRenewing] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      listJobs()
        .then(setJobs)
        .catch(console.error)
        .finally(() => setJobsLoading(false))

      listUserAnalyses()
        .then((data) => {
          setAnalyses(data)
          // Agar foydalanuvchida dublyaj yo'q lekin tahlil bo'lsa, avtomatik tahlil tabini ko'rsatish
          if (jobs.length === 0 && data.length > 0) {
            setActiveTab('analysis')
          }
        })
        .catch(console.error)
        .finally(() => setAnalysesLoading(false))

      getJobsStats().then(setJobsStats).catch(console.error)
      getPlans().then((res) => setSubscription(res.current)).catch(console.error)

      const interval = setInterval(() => {
        listJobs().then(setJobs).catch(console.error)
        listUserAnalyses().then(setAnalyses).catch(console.error)
        getJobsStats().then(setJobsStats).catch(console.error)
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [user])

  async function handleDeleteAnalysis(id: string) {
    if (!confirm("Ushbu video tahlilini o'chirishni tasdiqlaysizmi?")) return
    setDeletingAnalysisId(id)
    try {
      await deleteAnalysis(id)
      setAnalyses((prev) => prev.filter((a) => a.id !== id))
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Tahlilni o'chirishda xatolik yuz berdi.")
    } finally {
      setDeletingAnalysisId(null)
    }
  }

  const [retryingAnalysisId, setRetryingAnalysisId] = useState<string | null>(null)

  async function handleRetryAnalysis(id: string) {
    setRetryingAnalysisId(id)
    try {
      await retryAnalysis(id)
      setAnalyses((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: 'pending', status_message: "Qayta navbatga qo'shildi..." }
            : a
        )
      )
      router.push(`/video-analysis/${id}`)
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Tahlilni qayta ishga tushirishda xatolik yuz berdi.")
      setRetryingAnalysisId(null)
    }
  }

  async function handleRenew() {
    if (!subscription || subscription.plan === 'free') return
    setRenewing(true)
    const paymentWindow = typeof window !== 'undefined' ? window.open('about:blank', '_blank') : null
    try {
      const res = await subscribeToPlan(subscription.plan)
      if (res.success && res.payment_url) {
        if (paymentWindow) paymentWindow.location.href = res.payment_url
        else window.location.href = res.payment_url
      } else if (paymentWindow) {
        paymentWindow.close()
      }
    } catch {
      if (paymentWindow) paymentWindow.close()
    } finally {
      setRenewing(false)
    }
  }

  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm("Bu videoni o'chirishni tasdiqlaysizmi?")) return
    setDeletingId(id)
    try {
      await deleteJob(id)
      setJobs((prev) => prev.filter((j) => j.job_id !== id))
      getJobsStats().then(setJobsStats).catch(console.error)
    } catch (err: any) {
      console.error("Failed to delete job:", err)
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Videoni o'chirishda xatolik yuz berdi."
      alert(message)
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRetry(id: string, isRegenerate = false) {
    if (isRegenerate) {
      if (!confirm("Ushbu videoni qaytadan yaratishni (regenerate) tasdiqlaysizmi? Balansingizdan tegishli daqiqa yechiladi.")) {
        return
      }
    }
    setRetryingId(id)
    try {
      await retryJob(id, isRegenerate ? { force_regenerate: true } : undefined)
      router.push(`/video/${id}`)
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Videoni qayta ishga tushirishda xatolik yuz berdi.")
      setRetryingId(null)
    }
  }

  function handleLogout() {
    logout()
    router.push('/')
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#050101] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  const completedCount = jobsStats ? jobsStats.completed : jobs.filter(j => j.status === 'completed').length
  const processingCount = jobsStats ? jobsStats.processing : jobs.filter(j => !['completed', 'failed'].includes(j.status)).length
  const totalCount = jobsStats ? jobsStats.total : jobs.length

  return (
    <div className="min-h-screen relative flex flex-col transition-colors duration-300">
      <MeshBackground />

      {/* Header */}
      <header className="border-b border-black/5 dark:border-white/10 bg-white/40 dark:bg-black/40 backdrop-blur-xl sticky top-0 z-10 transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-4 flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
            <img src="/logo.webp" alt="GapirAI.uz" width={120} height={32} className="h-8 sm:h-12 md:h-16 w-auto object-contain dark:hidden transition duration-300 group-hover:scale-105" />
            <img src="/logodark.webp" alt="GapirAI.uz" width={120} height={32} className="h-8 sm:h-12 md:h-16 w-auto object-contain hidden dark:block transition duration-300 group-hover:scale-105" />
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-gray-600 dark:text-gray-300 transition-colors">
              <User2 className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs font-bold truncate max-w-[120px]">{user.name}</span>
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 sm:gap-2 btn-premium text-xs font-bold px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl shadow-md whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline">Yangi video</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 sm:gap-2 text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 text-xs font-bold transition px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span className="hidden xs:inline">Chiqish</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-3 sm:px-6 py-6 sm:py-8 flex-1">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-6 mb-6 sm:mb-8">
          <div className="glass-card rounded-2xl p-3 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner">
            <p className="text-gray-500 dark:text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Jami</p>
            <p className="text-xl sm:text-3xl font-black text-gray-900 dark:text-white">{totalCount}</p>
          </div>
          <div className="glass-card rounded-2xl p-3 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner">
            <p className="text-gray-500 dark:text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Tayyor</p>
            <p className="text-xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">{completedCount}</p>
          </div>
          <div className="glass-card rounded-2xl p-3 sm:p-5 border border-black/5 dark:border-white/5 shadow-inner">
            <p className="text-gray-500 dark:text-gray-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Jarayonda</p>
            <p className="text-xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">{processingCount}</p>
          </div>
        </div>

        <PlanCard sub={subscription} onRenew={handleRenew} renewing={renewing} />
        <BillingCard />
        <PushOptIn />
        <DonateCTA className="mb-6" />

        {/* Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 w-fit">
            <button
              onClick={() => setActiveTab('dubbing')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'dubbing'
                  ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Youtube className="w-4 h-4 text-rose-500" />
              <span>Dublyaj videolarim</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10 font-mono">
                {jobs.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('analysis')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === 'analysis'
                  ? 'bg-white dark:bg-white/10 text-violet-600 dark:text-violet-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span>Video tahlillari</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 font-mono font-bold">
                {analyses.length}
              </span>
            </button>
          </div>
        </div>

        {/* Content by active tab */}
        {activeTab === 'dubbing' && (
          jobsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-20 glass-card rounded-3xl p-8 border border-black/5 dark:border-white/5">
              <Youtube className="w-16 h-16 text-gray-300 dark:text-slate-800 mx-auto mb-4 animate-pulse" />
              <p className="text-gray-500 dark:text-gray-400 font-bold mb-2">Hali video yo'q</p>
              <Link href="/" className="text-blue-500 hover:underline text-xs font-bold uppercase tracking-wider">
                Birinchi videoni dublyaj qiling →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {jobs.map((job) => (
                <VideoCard
                  key={job.job_id}
                  job={job}
                  onDelete={handleDelete}
                  onRetry={handleRetry}
                  isRetrying={retryingId === job.job_id}
                  isDeleting={deletingId === job.job_id}
                  isAdmin={user?.role === 'admin'}
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'analysis' && (
          analysesLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
          ) : analyses.length === 0 ? (
            <div className="text-center py-20 glass-card rounded-3xl p-8 border border-black/5 dark:border-white/5">
              <Sparkles className="w-16 h-16 text-violet-300 dark:text-violet-900/60 mx-auto mb-4 animate-pulse" />
              <p className="text-gray-500 dark:text-gray-400 font-bold mb-2">Hali video tahlil qilinmagan</p>
              <p className="text-xs text-gray-400 mb-4 max-w-sm mx-auto">
                YouTube videoning xulosasi, asosiy fikrlari va transkriptini bir necha soniyada oling.
              </p>
              <Link href="/" className="text-violet-500 hover:underline text-xs font-bold uppercase tracking-wider">
                Video tahlil qilish →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {analyses.map((analysis) => (
                <AnalysisCard
                  key={analysis.id}
                  analysis={analysis}
                  onDelete={handleDeleteAnalysis}
                  onRetry={handleRetryAnalysis}
                  isDeleting={deletingAnalysisId === analysis.id}
                  isRetrying={retryingAnalysisId === analysis.id}
                />
              ))}
            </div>
          )
        )}
      </main>
    </div>
  )
}
