'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PageShell from '@/components/PageShell'
import { useAuth } from '@/hooks/useAuth'
import {
  listJobs, deleteJob, retryJob, Job, STATUS_LABELS, formatDuration, getVideoUrl,
  getPlans, subscribeToPlan, CurrentSubscription, getJobsStats, JobsStats,
  listUserAnalyses, deleteAnalysis, retryAnalysis, VideoAnalysis,
} from '@/lib/api'
import { extractYouTubeId } from '@/lib/youtube'
import PushOptIn from '@/components/PushOptIn'
import PremierePluginCard from '@/components/PremierePluginCard'
import BillingCard from '@/components/billing/BillingCard'
import DonateCTA from '@/components/DonateCTA'
import {
  Youtube, Plus, LogOut, Clock, CheckCircle2, XCircle, CircleSlash,
  Loader2, Trash2, Play, User2, Mic2, MicOff, Crown, RotateCw, ShieldAlert,
  Sparkles, FileText, Zap, Package, X,
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
    <div className="glass-card rounded-2xl p-4 sm:p-5 border border-ui-rule flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-ui-accent-ink flex items-center justify-center shrink-0">
          <Crown className="w-5 h-5" />
        </div>
        <div>
          <p className="text-ui-muted text-xs font-semibold ">Joriy tarif</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-ui-ink">{planName}</p>
            {isAdmin && (
              <span className="text-xs font-semibold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-ui-accent-ink border border-blue-500/20">
                ADMIN
              </span>
            )}
          </div>
        </div>
        <div className="sm:ml-3 text-xs text-ui-muted space-y-0.5 w-full sm:w-auto">
          {sub.minutes && (
            <>
              {isUnlimited ? (
                <p>
                  <span className="font-semibold text-ui-accent-ink">Cheksiz daqiqa</span>
                  <span className="text-gray-500 text-xs ml-1.5 font-medium">(Barcha AI provayderlar faol)</span>
                </p>
              ) : (
                <p>
                  <span className="font-semibold text-ui-ink">{sub.minutes.monthly_remaining}</span>
                  {' / '}{sub.minutes.monthly_cap} daqiqa qoldi (oylik)
                </p>
              )}
              {sub.minutes.monthly_used > 0 && (
                <p className="text-xs text-ui-muted">
                  {sub.minutes.monthly_used} daqiqa ishlatildi
                </p>
              )}
              {sub.minutes.purchased > 0 && !isUnlimited && (
                <p className="text-ui-accent-ink font-semibold">
                  + {sub.minutes.purchased} sotib olingan daqiqa
                </p>
              )}
            </>
          )}
          {sub.plan !== 'free' && sub.expires_at && !isUnlimited && (
            <p className={expiresSoon ? 'text-amber-500 font-semibold' : ''}>
              {formatTashkentDate(sub.expires_at)} gacha
            </p>
          )}
        </div>
      </div>
      {!isUnlimited && (
        <Link
          href="/pricing"
          onClick={sub.plan !== 'free' && expiresSoon ? (e) => { e.preventDefault(); onRenew() } : undefined}
          className="flex items-center justify-center gap-2 btn-premium text-xs font-semibold px-4 py-2.5 rounded-xl w-full sm:w-auto"
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
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold bg-emerald-500/10 text-ui-green-ink border-emerald-500/20">
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
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold tracking-wider bg-slate-500/10 text-slate-400 border-slate-500/20">
          <CircleSlash className="w-3 h-3 text-slate-400" />
          Bekor qilindi
        </span>
      )
    }
    const isNoSpeech = errorCode === 'NO_SPEECH_FOUND' || errorMessage?.toLowerCase().includes('nutq topilmadi')
    const isContentBlocked = errorCode === 'CONTENT_BLOCKED' || errorMessage?.toLowerCase().includes('kontent siyosati') || errorMessage?.toLowerCase().includes('taqiqlangan')
    if (isNoSpeech) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
          <MicOff className="w-3 h-3" />
          Nutq topilmadi
        </span>
      )
    }
    if (isContentBlocked) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20">
          <ShieldAlert className="w-3 h-3" />
          Rad etildi
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold tracking-wider bg-red-500/10 text-ui-red-ink border-red-500/20">
        <XCircle className="w-3 h-3" />
        Xatolik
      </span>
    )
  }
  const cfg: Record<string, { color: string; icon: React.ReactNode }> = {
    pending: { color: 'bg-blue-500/10 text-ui-accent-ink border-blue-500/20', icon: <Clock className="w-3 h-3" /> },
  }
  const def = { color: 'bg-blue-500/10 text-ui-accent-ink border-blue-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> }
  const { color, icon } = cfg[status] || def
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${color}`}>
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
}: {
  job: Job
  onDelete: (id: string) => void
  onRetry: (id: string, isRegenerate?: boolean) => void
  isRetrying: boolean
  isDeleting?: boolean
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
    <div className="group glass-card hover:translate-y-[-2px] hover:shadow-xl hover:border-blue-500/20 rounded-2xl overflow-hidden transition-all duration-300">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-black/10 dark:bg-slate-900/60 overflow-hidden">
        {job.video_thumbnail ? (
          <img src={thumbnail} alt={job.video_title || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-ui-ground">
            <Youtube className="w-12 h-12 text-ui-muted" />
          </div>
        )}
        {/* Duration badge */}
        <div className="absolute bottom-2.5 right-2.5 bg-black/75 text-white text-xs px-2 py-0.5 rounded-lg font-mono font-semibold tracking-tighter">
          {duration}
        </div>
        {/* Play overlay for ready jobs */}
        {isReady && (
          <Link href={`/video/${job.job_id}`} aria-label={`${job.video_title || 'Video'} — ochish`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 ">
            <div className="w-12 h-12 bg-white/95 rounded-2xl flex items-center justify-center shadow-lg transition transform translate-y-2 group-hover:translate-y-0 duration-300">
              <Play className="w-5 h-5 text-blue-600 fill-blue-600 ml-0.5" />
            </div>
          </Link>
        )}
        {/* In-progress overlay linking to video page */}
        {!isReady && !isFailed && (
          <Link
            href={`/video/${job.job_id}`}
            title="Jarayonni ko'rish"
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 "
          >
            <div className="px-3 py-1.5 bg-blue-600/90 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Jarayonni ko'rish</span>
            </div>
          </Link>
        )}
        {/* Progress bar on thumbnail for in-progress jobs */}
        {!isReady && !isFailed && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.max(5, Math.min(100, job.progress || 0))}%` }}
            />
          </div>
        )}
        {/* Top-left: Voice & Gender badge */}
        <div className="absolute top-2.5 left-2.5 bg-black/75 text-white text-xs font-semibold tracking-wider px-2 py-1 rounded-lg flex items-center gap-1.5 ">
          {isFemale ? <Mic2 className="w-3 h-3 text-blue-400" /> : <Mic2 className="w-3 h-3 text-blue-400" />}
          <span>{genderDisplayName} • {voiceDisplayName}</span>
        </div>
        {/* Top-right: Provider badge */}
        <div className="absolute top-2.5 right-2.5">
          <span className={`text-xs font-semibold px-2 py-1 rounded-lg shadow-md ${
            prov === 'gemini'
            ? 'bg-blue-900/80 text-blue-200 border border-blue-500/30'
            : prov === 'edge'
            ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/30'
            : 'bg-blue-900/80 text-blue-200 border border-blue-500/30'
          }`}>
            {prov === 'gemini' ? 'HD' : prov === 'edge' ? 'Standart' : 'Neural'}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="text-ui-ink font-semibold text-sm line-clamp-2 mb-2 min-h-[2.5rem]">
          <Link href={`/video/${job.job_id}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition">
            {job.video_title || 'Yuklanmoqda...'}
          </Link>
        </h3>

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
          <span className={`px-2 py-0.5 rounded-md font-semibold border ${
            prov === 'gemini'
            ? 'bg-blue-500/10 text-ui-accent-ink border-blue-500/20'
            : prov === 'edge'
            ? 'bg-emerald-500/10 text-ui-green-ink border-emerald-500/20'
            : 'bg-blue-500/10 text-ui-accent-ink border-blue-500/20'
          }`}>
            {prov === 'gemini' ? 'GapirAI HD' : prov === 'edge' ? 'Standart' : 'Neural HD'}
          </span>
          <span className="px-2 py-0.5 rounded-md font-medium bg-ui-ground text-gray-700 dark:text-gray-300 border border-ui-rule">
            {voiceDisplayName} ({genderDisplayName})
          </span>
          <span className="px-1.5 py-0.5 rounded-md font-medium text-ui-muted bg-ui-ground">
            Ohang: {styleDisplayName}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <StatusBadge status={job.status} errorCode={job.error_code} errorMessage={job.error_message} />
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isReady ? (
              <Link
                href={`/video/${job.job_id}`}
                className="text-xs text-ui-accent-ink hover:text-blue-500 font-semibold"
              >
                Ko'rish →
              </Link>
            ) : !isFailed ? (
              <Link
                href={`/video/${job.job_id}`}
                className="text-xs text-ui-accent-ink hover:text-blue-500 font-medium flex items-center gap-1"
                title="Jarayonni ko'rish"
              >
                <span>Jarayon</span>
                {job.progress ? <span className="font-mono text-xs">({Math.round(job.progress)}%)</span> : null}
                <span>→</span>
              </Link>
            ) : null}
            {isFailed && !isNonRetryable && (
              <button
                onClick={() => onRetry(job.job_id, false)}
                disabled={isRetrying}
                title="Qayta urinish (retry)"
                className="text-ui-muted hover:text-emerald-500 hover:bg-emerald-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-emerald-500' : ''}`} />
              </button>
            )}
            {isReady && (
              <button
                onClick={() => onRetry(job.job_id, true)}
                disabled={isRetrying}
                title="Qayta yaratish (Regenerate)"
                className="text-ui-muted hover:text-blue-500 hover:bg-blue-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
              >
                <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-ui-accent-ink' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(job.job_id)
              }}
              disabled={isDeleting || isRetrying}
              className="text-ui-muted hover:text-red-500 hover:bg-red-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
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
  const isDoc = analysis.source_type === 'document'
  const duration = isDoc
    ? (analysis.document_pages ? `${analysis.document_pages} ${analysis.document_unit || 'bet'}` : null)
    : analysis.video_duration ? formatDuration(analysis.video_duration) : null
  const isReady = analysis.status === 'completed'
  const isFailed = analysis.status === 'failed'

  const summaryText =
    analysis.summary?.short ||
    analysis.five_minute_summary?.why_it_matters ||
    analysis.status_message ||
    ''

  return (
    <div className="group glass-card hover:translate-y-[-2px] hover:shadow-xl hover:border-blue-500/20 rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between">
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
            <div className="w-full h-full flex items-center justify-center bg-ui-ground">
              {isDoc ? <FileText className="w-12 h-12 text-ui-muted" /> : <Sparkles className="w-12 h-12 text-blue-400" />}
            </div>
          )}

          {/* Duration badge */}
          {duration && (
            <div className="absolute bottom-2.5 right-2.5 bg-black/75 text-white text-xs px-2 py-0.5 rounded-lg font-mono font-semibold tracking-tighter">
              {duration}
            </div>
          )}

          {/* Top-left: AI Tahlil badge */}
          <div className="absolute top-2.5 left-2.5 bg-blue-950/80 text-blue-200 border border-blue-500/30 text-xs font-semibold px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-md">
            <Sparkles className="w-3 h-3 text-blue-400" />
            <span>AI Tahlil</span>
          </div>

          {/* Top-right: Language badge */}
          <div className="absolute top-2.5 right-2.5">
            <span className="text-xs font-semibold px-2 py-1 rounded-lg shadow-md bg-black/75 text-white border border-white/10">
              {analysis.language.toUpperCase()}
            </span>
          </div>

          {/* Hover overlay */}
          <Link
            href={`/video-analysis/${analysis.id}`}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 "
          >
            <div className="px-3.5 py-2 bg-white text-gray-900 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-lg transition transform translate-y-1 group-hover:translate-y-0">
              <Play className="w-4 h-4 fill-gray-900 ml-0.5" />
              <span>Tahlilni ko'rish</span>
            </div>
          </Link>

          {/* Progress bar for in-progress analyses */}
          {!isReady && !isFailed && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${Math.max(5, Math.min(100, analysis.progress || 0))}%` }}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-ui-ink font-semibold text-sm line-clamp-2 mb-1.5 min-h-[2.5rem]">
            <Link
              href={`/video-analysis/${analysis.id}`}
              className="hover:text-blue-600 dark:hover:text-blue-400 transition"
            >
              {analysis.video_title || 'YouTube video tahlili'}
            </Link>
          </h3>

          {summaryText && (
            <p className="text-ui-muted text-xs line-clamp-2 mb-3 leading-relaxed">
              {summaryText}
            </p>
          )}

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-xs">
            {analysis.chapters && analysis.chapters.length > 0 && (
              <span className="px-2 py-0.5 rounded-md font-medium bg-ui-ground text-gray-700 dark:text-gray-300 border border-ui-rule">
                {analysis.chapters.length} ta bob
              </span>
            )}
            {analysis.key_points && analysis.key_points.length > 0 && (
              <span className="px-2 py-0.5 rounded-md font-medium bg-ui-ground text-gray-700 dark:text-gray-300 border border-ui-rule">
                {analysis.key_points.length} asosiy fikr
              </span>
            )}
            {analysis.notes && (
              <span className="px-2 py-0.5 rounded-md font-medium bg-blue-500/10 text-ui-accent-ink border border-blue-500/20">
                Konspekt mavjud
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Footer / Status */}
      <div className="p-4 pt-0 border-t border-ui-rule mt-2 flex items-center justify-between">
        <div>
          {isReady ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold tracking-wider bg-emerald-500/10 text-ui-green-ink border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              Tayyor
            </span>
          ) : isFailed ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold tracking-wider bg-red-500/10 text-ui-red-ink border-red-500/20">
              <XCircle className="w-3 h-3" />
              Xatolik
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-semibold bg-blue-500/10 text-ui-accent-ink border-blue-500/20">
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
              title="Qayta urinish (Retry)"
              className="text-ui-muted hover:text-emerald-500 hover:bg-emerald-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
            >
              <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-emerald-500' : ''}`} />
            </button>
          )}
          {isReady && onRetry && (
            <button
              onClick={() => onRetry(analysis.id)}
              disabled={isRetrying}
              title="Qayta tahlil qilish (Regenerate)"
              className="text-ui-muted hover:text-blue-500 hover:bg-blue-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
            >
              <RotateCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-ui-accent-ink' : ''}`} />
            </button>
          )}
          <Link
            href={`/video-analysis/${analysis.id}`}
            className="text-xs text-ui-accent-ink hover:text-blue-500 font-semibold whitespace-nowrap"
          >
            Ko'rish →
          </Link>
          <button
            onClick={() => onDelete(analysis.id)}
            disabled={isDeleting || isRetrying}
            className="text-ui-muted hover:text-red-500 hover:bg-red-500/10 transition p-1.5 rounded-xl disabled:opacity-50"
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


/**
 * FreeTierConversionBanner — only shown to free-plan users.
 * Offers a quick jump to /pricing with Starter pack & subscription highlights.
 */
function FreeTierConversionBanner({ onDismiss }: { onDismiss: () => void }) {
  const OPTIONS = [
    { href: '/pricing#minute-packs', icon: Package, name: 'Bir martalik paket', value: '+15 daqiqa', note: '4 900 soʻm, kuymaydi', action: 'Sotib olish' },
    { href: '/pricing#plans', icon: Zap, name: 'Standart', value: '350 daqiqa / 30 kun', note: '720p, ustuvor navbat', action: 'Tarifni koʻrish' },
    { href: '/pricing#plans', icon: Crown, name: 'Pro', value: '600 daqiqa / 30 kun', note: '1080p, ovoz variantlari', action: 'Tarifni koʻrish' },
  ]
  return (
    <section aria-labelledby="upgrade-title" className="ui-card relative mb-6 p-5 sm:p-6">
      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-ui-muted transition hover:bg-ui-ground hover:text-ui-ink"
        aria-label="Yopish"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
      <h2 id="upgrade-title" className="pr-10 text-lg font-semibold text-ui-ink">Bepul daqiqalaringiz tugamoqdami?</h2>
      <p className="mt-1 text-sm text-ui-muted">Paket yoki obuna bilan dublyajni toʻxtovsiz davom ettiring.</p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {OPTIONS.map(({ href, icon: Icon, name, value, note, action }) => (
          <li key={name}>
            <Link href={href} className="group flex h-full flex-col rounded-control border border-ui-rule p-4 transition hover:border-ui-muted/60">
              <span className="flex items-center gap-2 text-sm text-ui-muted">
                <Icon aria-hidden="true" className="h-4 w-4" /> {name}
              </span>
              <span className="mt-2 text-base font-semibold text-ui-ink tabular-nums">{value}</span>
              <span className="mt-0.5 text-sm text-ui-muted">{note}</span>
              <span className="mt-3 text-sm font-medium text-ui-accent-ink group-hover:underline">{action}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
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
  const [conversionBannerDismissed, setConversionBannerDismissed] = useState(false)

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
      <div className="flex min-h-screen items-center justify-center bg-ui-surface" role="status">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-ui-muted" />
        <span className="sr-only">Yuklanmoqda</span>
      </div>
    )
  }

  const completedCount = jobsStats ? jobsStats.completed : jobs.filter(j => j.status === 'completed').length
  const processingCount = jobsStats ? jobsStats.processing : jobs.filter(j => !['completed', 'failed'].includes(j.status)).length
  const totalCount = jobsStats ? jobsStats.total : jobs.length

  const TAB = (active: boolean) =>
    `flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition ${
      active ? 'bg-ui-surface text-ui-ink shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(var(--ui-rule))]' : 'text-ui-muted hover:text-ui-ink'
    }`

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-ui-ink sm:text-4xl">Mening videolarim</h1>
            <p className="mt-2 flex items-center gap-1.5 text-[15px] text-ui-muted">
              <User2 aria-hidden="true" className="h-4 w-4" />
              <span className="truncate">{user.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/" className="ui-btn ui-btn-primary">
              <Plus aria-hidden="true" className="h-4 w-4" /> Yangi video
            </Link>
            <button type="button" onClick={handleLogout} className="ui-btn ui-btn-secondary">
              <LogOut aria-hidden="true" className="h-4 w-4" /> Chiqish
            </button>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-3 divide-x divide-ui-rule rounded-card border border-ui-rule">
          {[
            ['Jami', totalCount],
            ['Tayyor', completedCount],
            ['Jarayonda', processingCount],
          ].map(([label, value]) => (
            <div key={label as string} className="px-4 py-4 sm:px-6 sm:py-5">
              <dt className="text-sm text-ui-muted">{label}</dt>
              <dd className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-ui-ink tabular-nums sm:text-3xl">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6" />
        <PlanCard sub={subscription} onRenew={handleRenew} renewing={renewing} />

        {/* Conversion banner: only for free users who haven't dismissed it */}
        {subscription?.plan === 'free' && !conversionBannerDismissed && (
          <FreeTierConversionBanner onDismiss={() => setConversionBannerDismissed(true)} />
        )}

        <BillingCard />
        <PushOptIn />
        <PremierePluginCard />
        <DonateCTA className="mb-6" />

        {/* Tabs */}
        <div role="tablist" aria-label="Videolar turi" className="mb-6 mt-4 inline-flex gap-1 rounded-control bg-ui-ground p-1">
          <button type="button" role="tab" aria-selected={activeTab === 'dubbing'} onClick={() => setActiveTab('dubbing')} className={TAB(activeTab === 'dubbing')}>
            <Youtube aria-hidden="true" className="h-4 w-4" />
            <span>Dublyaj</span>
            <span className="text-xs text-ui-muted tabular-nums">{jobs.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} className={TAB(activeTab === 'analysis')}>
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            <span>Tahlillar</span>
            <span className="text-xs text-ui-muted tabular-nums">{analyses.length}</span>
          </button>
        </div>

        {/* Content by active tab */}
        {activeTab === 'dubbing' && (
          jobsLoading ? (
            <div className="flex items-center justify-center py-20" role="status">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-ui-muted" />
              <span className="sr-only">Yuklanmoqda</span>
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-card border border-dashed border-ui-rule px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ui-ink">Hali video yoʻq</p>
              <p className="mt-1 text-[15px] text-ui-muted">YouTube havolasini yuboring — tayyor videolar shu yerda saqlanadi.</p>
              <Link href="/" className="ui-btn ui-btn-primary mt-6">Birinchi videoni dublyaj qilish</Link>
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
                />
              ))}
            </div>
          )
        )}

        {activeTab === 'analysis' && (
          analysesLoading ? (
            <div className="flex items-center justify-center py-20" role="status">
              <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-ui-muted" />
              <span className="sr-only">Yuklanmoqda</span>
            </div>
          ) : analyses.length === 0 ? (
            <div className="rounded-card border border-dashed border-ui-rule px-6 py-16 text-center">
              <p className="text-lg font-semibold text-ui-ink">Hali video tahlil qilinmagan</p>
              <p className="mx-auto mt-1 max-w-sm text-[15px] text-ui-muted">YouTube videoning xulosasi, asosiy fikrlari va konspektini oling — daqiqa sarflamaydi.</p>
              <Link href="/?mode=analyze" className="ui-btn ui-btn-primary mt-6">Video tahlil qilish</Link>
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
      </div>
    </PageShell>
  )
}
