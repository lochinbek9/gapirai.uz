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
      id: '557407324',
      url: `https://t.me/goldendevuz?text=${telegramPreFilledMsg}`,
      role: 'Bosh Dasturchi & Admin',
    },
    {
      handle: '@mentor_lochinbek',
      id: '1758736133',
      url: `https://t.me/mentor_lochinbek?text=${telegramPreFilledMsg}`,
      role: 'Loyiha Rahbari & Mentor',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-300">
      <div
        className="relative w-full max-w-lg bg-gradient-to-b from-gray-900 via-gray-900 to-black border border-indigo-500/30 rounded-[32px] p-6 sm:p-8 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-56 h-56 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          aria-label="Yopish"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-indigo-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold mb-4">
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Ilk Muvaffaqiyatli Dublyaj Mukofoti!</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
          Tabriklaymiz! Sizga <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">10% Chegirma</span> berildi 🎉
        </h2>

        <p className="text-gray-300 text-sm leading-relaxed mb-5">
          Birinchi videongiz sifatli ovozda muvaffaqiyatli tayyor bo&apos;ldi. Keyingi videolaringiz uchun 
          <strong className="text-amber-300 font-semibold"> 24 soat (1 sutka) </strong> davomida barcha tarif va daqiqa paketlariga maxsus 10% chegirmadan foydalaning!
        </p>

        {/* Timer Box */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/60 border border-indigo-500/30 rounded-2xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-indigo-300 font-semibold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" />
              Chegirma tugashiga qoldi:
            </span>
            <span className="text-[11px] font-mono text-gray-400">1 sutka</span>
          </div>

          {!isExpired ? (
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div className="bg-black/50 border border-white/5 rounded-xl py-2 px-3">
                <div className="text-2xl font-black font-mono text-white">
                  {String(timeLeft.hours).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Soat</div>
              </div>
              <div className="bg-black/50 border border-white/5 rounded-xl py-2 px-3">
                <div className="text-2xl font-black font-mono text-white">
                  {String(timeLeft.minutes).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Daqiqa</div>
              </div>
              <div className="bg-black/50 border border-white/5 rounded-xl py-2 px-3">
                <div className="text-2xl font-black font-mono text-amber-400 animate-pulse">
                  {String(timeLeft.seconds).padStart(2, '0')}
                </div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Soniya</div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-center py-2 text-amber-300 font-semibold text-sm">
              ⏰ Afsuski, 24 soatlik muddat tugagan. Narxlar odatiy holatiga qaytdi.
            </div>
          )}
        </div>

        {/* Discount Price Preview */}
        {!isExpired && (
          <div className="space-y-2 mb-6">
            <div className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              Chegirmali narxlar:
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                <span className="text-gray-400 text-[11px]">15 daq Starter:</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-bold text-amber-300 font-mono text-sm">4,410 UZS</span>
                  <span className="text-gray-500 line-through text-[10px]">4,900</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                <span className="text-gray-400 text-[11px]">Standard (oylik):</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-bold text-amber-300 font-mono text-sm">71,100 UZS</span>
                  <span className="text-gray-500 line-through text-[10px]">79,000</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                <span className="text-gray-400 text-[11px]">35 daqiqa paketi:</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-bold text-amber-300 font-mono text-sm">13,500 UZS</span>
                  <span className="text-gray-500 line-through text-[10px]">15,000</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between">
                <span className="text-gray-400 text-[11px]">Pro (oylik):</span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-bold text-amber-300 font-mono text-sm">179,100 UZS</span>
                  <span className="text-gray-500 line-through text-[10px]">199,000</span>
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
            className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-950 font-bold text-base shadow-lg shadow-amber-500/25 transition-all transform active:scale-[0.98] mb-4"
          >
            <span>10% Chegirma bilan xarid qilish</span>
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : null}

        {/* Fallback / Expired / Admin Contact Section */}
        <div className="pt-4 border-t border-white/10">
          <p className="text-xs text-gray-300 mb-3 text-center">
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
                className="flex items-center justify-between p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 text-blue-300 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <div className="text-left">
                    <div className="font-semibold text-xs text-white group-hover:text-blue-300 transition-colors">
                      {admin.handle}
                    </div>
                    <div className="text-[10px] text-gray-400">ID: {admin.id}</div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
