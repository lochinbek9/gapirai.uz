'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  Clock,
  Zap,
  CheckCircle2,
  X,
  ExternalLink,
  MessageCircle,
  ShieldCheck,
  Gift,
  ArrowRight,
} from 'lucide-react'
import { JobDiscountOffer } from '@/lib/api'

interface FirstVideoDiscountModalProps {
  discount: JobDiscountOffer
  isOpen: boolean
  onClose: () => void
}

export default function FirstVideoDiscountModal({
  discount,
  isOpen,
  onClose,
}: FirstVideoDiscountModalProps) {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number
    minutes: number
    seconds: number
    totalSeconds: number
  }>({
    hours: 24,
    minutes: 0,
    seconds: 0,
    totalSeconds: 86400,
  })

  // Live countdown timer
  useEffect(() => {
    if (!discount.expires_at && !discount.seconds_left) return

    const calculateTimeLeft = () => {
      let secondsRemaining = 0
      if (discount.expires_at) {
        const expTime = new Date(discount.expires_at).getTime()
        const now = Date.now()
        secondsRemaining = Math.max(0, Math.floor((expTime - now) / 1000))
      } else {
        secondsRemaining = Math.max(0, discount.seconds_left)
      }

      const hours = Math.floor(secondsRemaining / 3600)
      const minutes = Math.floor((secondsRemaining % 3600) / 60)
      const seconds = secondsRemaining % 60

      setTimeLeft({
        hours,
        minutes,
        seconds,
        totalSeconds: secondsRemaining,
      })
    }

    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 1000)
    return () => clearInterval(interval)
  }, [discount.expires_at, discount.seconds_left])

  if (!isOpen) return null

  const isExpired = timeLeft.totalSeconds <= 0

  const telegramPreFilledMsg = encodeURIComponent(
    "Salom! GapirAI'da birinchi videomni dublyaj qildim. 10% maxsus chegirma muddati o'tib ketibdi, menga chegirma berish imkoniyati bormi?"
  )

  const adminContacts = [
    {
      handle: '@goldendevuz',
      url: `https://t.me/goldendevuz?text=${telegramPreFilledMsg}`,
      role: 'Bosh Dasturchi & Admin',
    },
    {
      handle: '@mentor_lochinbek',
      url: `https://t.me/mentor_lochinbek?text=${telegramPreFilledMsg}`,
      role: 'Loyiha Rahbari & Mentor',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 animate-in fade-in duration-300">
      <div
        className="relative w-full max-w-lg bg-ui-surface border border-blue-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl text-ui-ink overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow Effects */}

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-ui-muted hover:text-ui-ink bg-ui-ground hover:bg-ui-ground transition-colors"
          aria-label="Yopish"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold mb-4">
          <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-300 animate-pulse" />
          <span>Ilk Muvaffaqiyatli Dublyaj Mukofoti!</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-semibold text-ui-ink tracking-tight mb-2">
          Tabriklaymiz! Sizga <span className="text-ui-ink">10% chegirma</span> berildi
        </h2>

        <p className="text-ui-muted text-sm leading-relaxed mb-5">
          Birinchi videongiz sifatli ovozda muvaffaqiyatli tayyor bo&apos;ldi. Keyingi videolaringiz uchun 
          <strong className="text-amber-700 dark:text-amber-300 font-semibold"> 24 soat (1 sutka) </strong> davomida barcha tarif va daqiqa paketlariga maxsus 10% chegirmadan foydalaning!
        </p>

        {/* Timer Box */}
        <div className=" bg-blue-950/60 border border-blue-500/30 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ui-accent-ink font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-700 dark:text-amber-300" />
              Chegirma tugashiga qoldi:
            </span>
            <span className="text-xs font-mono text-ui-muted">1 sutka</span>
          </div>

          {!isExpired ? (
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="bg-black/50 border border-ui-rule rounded-xl py-2 px-3">
                <div className="text-2xl font-semibold font-mono text-ui-ink">
                  {String(timeLeft.hours).padStart(2, '0')}
                </div>
                <div className="text-xs text-ui-muted ">Soat</div>
              </div>
              <div className="bg-black/50 border border-ui-rule rounded-xl py-2 px-3">
                <div className="text-2xl font-semibold font-mono text-ui-ink">
                  {String(timeLeft.minutes).padStart(2, '0')}
                </div>
                <div className="text-xs text-ui-muted ">Daqiqa</div>
              </div>
              <div className="bg-black/50 border border-ui-rule rounded-xl py-2 px-3">
                <div className="text-2xl font-semibold font-mono text-amber-700 dark:text-amber-300 animate-pulse">
                  {String(timeLeft.seconds).padStart(2, '0')}
                </div>
                <div className="text-xs text-ui-muted ">Soniya</div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-center py-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
              ⏰ Afsuski, 24 soatlik muddat tugagan. Narxlar odatiy holatiga qaytdi.
            </div>
          )}
        </div>

        {/* Discount Price Preview */}
        {!isExpired && (
          <div className="space-y-2 mb-6">
            <div className="text-xs font-semibold text-ui-muted flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
              Chegirmali narxlar:
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-ui-ground border border-ui-rule flex flex-col justify-between">
                <span className="text-ui-muted text-xs">15 daq Starter:</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-semibold text-amber-700 dark:text-amber-300 font-mono text-sm">4,410 UZS</span>
                  <span className="text-ui-muted line-through text-xs">4,900</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-ui-ground border border-ui-rule flex flex-col justify-between">
                <span className="text-ui-muted text-xs">Standard (oylik):</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-semibold text-amber-700 dark:text-amber-300 font-mono text-sm">71,100 UZS</span>
                  <span className="text-ui-muted line-through text-xs">79,000</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-ui-ground border border-ui-rule flex flex-col justify-between">
                <span className="text-ui-muted text-xs">35 daqiqa paketi:</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-semibold text-amber-700 dark:text-amber-300 font-mono text-sm">13,500 UZS</span>
                  <span className="text-ui-muted line-through text-xs">15,000</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-ui-ground border border-ui-rule flex flex-col justify-between">
                <span className="text-ui-muted text-xs">Pro (oylik):</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-semibold text-amber-700 dark:text-amber-300 font-mono text-sm">179,100 UZS</span>
                  <span className="text-ui-muted line-through text-xs">199,000</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Primary CTA */}
        {!isExpired ? (
          <Link
            href="/pricing"
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-gray-950 font-semibold text-base shadow-lg transition-all transform active:scale-[0.98] mb-4"
          >
            <span>10% Chegirma bilan xarid qilish</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : null}

        {/* Fallback / Expired / Admin Contact Section */}
        <div className="pt-4 border-t border-ui-rule">
          <p className="text-xs text-ui-muted mb-3 text-center">
            {isExpired
              ? "Ulgurmay qoldingizmi? Ko'nglingizni aslo cho'ktirmang! Adminlar bilan bog'lanib shaxsiy chegirma so'rashingiz mumkin:"
              : "Savollaringiz bormi yoki maxsus shartlar kerakmi? Adminlar bilan bog'laning:"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {adminContacts.map((admin) => (
              <a
                key={admin.handle}
                href={admin.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 text-ui-accent-ink transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-ui-accent-ink flex-shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold text-xs text-ui-ink group-hover:text-ui-accent-ink transition-colors">
                      {admin.handle}
                    </div>
                    <div className="text-xs text-ui-muted">{admin.role}</div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-ui-accent-ink opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
