'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Calendar, RefreshCw, X, Check } from 'lucide-react'

export type DateRangeValue = 'today' | '7d' | '14d' | '30d' | '90d' | 'all' | 'custom'

interface DateRangePillsProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue, startDate?: string, endDate?: string) => void
  onRefresh?: () => void
  loading?: boolean
  className?: string
  startDate?: string
  endDate?: string
}

const RANGES: { id: DateRangeValue; label: string }[] = [
  { id: 'today', label: 'Bugun' },
  { id: '7d', label: '7k' },
  { id: '14d', label: '14k' },
  { id: '30d', label: '30k' },
  { id: '90d', label: '90k' },
  { id: 'all', label: 'Barchasi' },
]

export default function DateRangePills({
  value,
  onChange,
  onRefresh,
  loading = false,
  className = '',
  startDate = '',
  endDate = '',
}: DateRangePillsProps) {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customStart, setCustomStart] = useState(startDate)
  const [customEnd, setCustomEnd] = useState(endDate)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCustomStart(startDate)
    setCustomEnd(endDate)
  }, [startDate, endDate])

  // Close custom popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowCustomModal(false)
      }
    }
    if (showCustomModal) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCustomModal])

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customStart) return
    onChange('custom', customStart, customEnd || customStart)
    setShowCustomModal(false)
  }

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {/* Pill group container */}
      <div className="bg-black/40 border border-white/10 rounded-2xl p-1 flex items-center gap-0.5 backdrop-blur-md shadow-inner">
        {RANGES.map((r) => {
          const isActive = value === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onChange(r.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 font-bold scale-[1.02]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {r.label}
            </button>
          )
        })}

        {/* Custom date range trigger */}
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setShowCustomModal((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all duration-200 ${
              value === 'custom'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30 font-bold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
            title="Istalgan oraliqni tanlash"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {value === 'custom' && customStart ? `${customStart.slice(5)} ~ ${customEnd ? customEnd.slice(5) : ''}` : 'Oraliq'}
            </span>
          </button>

          {/* Custom Date Modal / Popover */}
          {showCustomModal && (
            <div
              className="absolute right-0 top-full mt-2 w-72 bg-[#0c1222] border border-white/15 rounded-2xl p-4 shadow-2xl z-50 backdrop-blur-xl animate-in fade-in zoom-in-95"
              style={{ colorScheme: 'dark' }}
            >
              <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-violet-400" />
                  Oraliq sana tanlang
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleApplyCustom} className="space-y-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Boshlanish sanasi</label>
                  <input
                    type="date"
                    required
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Tugash sanasi</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCustomModal(false)}
                    className="flex-1 py-1.5 rounded-xl text-xs font-medium text-gray-400 hover:text-white bg-white/5 transition"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-1.5 rounded-xl text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-500/20 transition flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Qo'llash
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Refresh Icon Button */}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="p-2 rounded-2xl bg-black/40 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition shadow-sm disabled:opacity-50"
          title="Ma'lumotlarni yangilash"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-violet-400' : ''}`} />
        </button>
      )}
    </div>
  )
}
