'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  icon?: React.ReactNode
  badge?: string
  badgeColor?: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  menuClassName?: string
  icon?: React.ReactNode
  disabled?: boolean
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Tanlang...',
  className = '',
  menuClassName = '',
  icon,
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value)

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 bg-[#0b0f19] hover:bg-[#111827] text-gray-200 border border-white/10 hover:border-white/20 rounded-xl px-3 py-1.5 text-xs font-medium transition shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className="flex items-center gap-1.5 truncate">
          {icon && <span className="text-gray-400 shrink-0">{icon}</span>}
          {selectedOption?.icon && <span className="shrink-0">{selectedOption.icon}</span>}
          <span className="truncate">{selectedOption?.label || placeholder}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-blue-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 mt-1 min-w-[170px] max-w-[280px] w-full right-0 bg-[#0c1222] border border-white/15 rounded-xl shadow-2xl p-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 overflow-hidden ${menuClassName}`}
          style={{ colorScheme: 'dark' }}
        >
          <div className="max-h-60 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-thumb-white/10">
            {options.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left ${
                    isSelected
                      ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                    <span className="truncate">{opt.label}</span>
                    {opt.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          opt.badgeColor || 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
