'use client'

import React, { useState, useEffect, useCallback, useMemo, Component, ErrorInfo, ReactNode } from 'react'
import {
  Search,
  Plus,
  Minus,
  Zap,
  Crown,
  Sparkles,
  RefreshCw,
  X,
  Check,
  Coins,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Calendar,
  Filter,
  ArrowUpDown,
  Info,
  Clock,
  AlertTriangle,
  Package,
  Key,
  UserPlus,
  Eye,
  EyeOff,
  Shield,
  Lock,
} from 'lucide-react'
import {
  AdminUserItem,
  AdminUsersSummary,
  AdminUserInsight,
  apiAdminListUsers,
  apiAdminAddMinutes,
  apiAdminSetPlan,
  apiAdminCreateUser,
  apiAdminUpdateUserCredentials,
} from '@/lib/admin'
import { formatTashkentDate, formatTashkentDateTimeObj } from '@/lib/timestamp'
import { getToken } from '@/lib/auth'
import CustomSelect, { SelectOption } from '@/components/CustomSelect'
import DateRangePills, { DateRangeValue } from '@/components/DateRangePills'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class SafeErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AdminUsersManager render error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center text-xs text-red-300">
          <AlertCircle className="w-6 h-6 mx-auto mb-2 text-red-400" />
          <p className="font-bold">Foydalanuvchilar bo'limini yuklashda xatolik yuz berdi.</p>
          <p className="text-gray-400 mt-1">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white font-semibold"
          >
            Qayta yuklash
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function AdminUsersManagerInner() {
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Filters and Sorting
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [balanceFilter, setBalanceFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [dateRange, setDateRange] = useState<DateRangeValue>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [summary, setSummary] = useState<AdminUsersSummary | null>(null)
  const [serverInsights, setServerInsights] = useState<AdminUserInsight[]>([])

  // Minute Top-up / Deduct modal state
  const [minuteModalUser, setMinuteModalUser] = useState<AdminUserItem | null>(null)
  const [actionType, setActionType] = useState<'add' | 'deduct'>('add')
  const [balanceType, setBalanceType] = useState<'kuymas' | 'tarif'>('kuymas')
  const [amountUzs, setAmountUzs] = useState<string>('')
  const [minutes, setMinutes] = useState<string>('')
  const [ratePerMinute, setRatePerMinute] = useState<number>(500)
  const [actionLoading, setActionLoading] = useState(false)

  // Plan Assignment modal state
  const [planModalUser, setPlanModalUser] = useState<AdminUserItem | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'standard' | 'pro'>('standard')
  const [planDays, setPlanDays] = useState<number>(30)
  const [resetMonthly, setResetMonthly] = useState<boolean>(true)

  // Create User modal state
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'user' as 'user' | 'admin',
    is_internal: false,
  })
  const [createLoading, setCreateLoading] = useState(false)

  // Edit User Credentials modal state
  const [editModalUser, setEditModalUser] = useState<AdminUserItem | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: 'user',
    is_internal: false,
    is_verified: true,
    is_active: true,
  })
  const [editLoading, setEditLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const fetchUsers = useCallback(async (
    query: string = '',
    p: number = 1,
    pFilter: string = planFilter,
    bFilter: string = balanceFilter,
    sBy: string = sortBy,
    dRange: string = dateRange,
    sDate: string = startDate,
    eDate: string = endDate,
  ) => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiAdminListUsers(
        token,
        query,
        p,
        20,
        pFilter,
        bFilter,
        sBy,
        dRange,
        sDate,
        eDate
      )
      if (data && Array.isArray(data.users)) {
        setUsers(data.users)
        setTotal(data.total || 0)
        setSummary(data.summary || null)
        setServerInsights(data.insights || [])
      } else {
        setUsers([])
        setTotal(0)
        setSummary(null)
        setServerInsights([])
      }
    } catch (err: any) {
      setUsers([])
      setSummary(null)
      setServerInsights([])
      setError(err?.response?.data?.detail || "Foydalanuvchilarni yuklashda xatolik. Backend qayta ishga tushirilganini tekshiring.")
    } finally {
      setLoading(false)
    }
  }, [planFilter, balanceFilter, sortBy, dateRange, startDate, endDate])

  useEffect(() => {
    fetchUsers(search, page, planFilter, balanceFilter, sortBy, dateRange, startDate, endDate)
  }, [fetchUsers, search, page, planFilter, balanceFilter, sortBy, dateRange, startDate, endDate])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchUsers(search, 1)
  }

  // Auto-conversion between Amount (UZS) and Minutes
  const handleAmountChange = (val: string) => {
    setAmountUzs(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0 && ratePerMinute > 0) {
      const calculatedMins = (num / ratePerMinute).toFixed(1)
      setMinutes(calculatedMins.endsWith('.0') ? parseInt(calculatedMins).toString() : calculatedMins)
    } else if (val === '') {
      setMinutes('')
    }
  }

  const handleMinutesChange = (val: string) => {
    setMinutes(val)
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0 && ratePerMinute > 0) {
      setAmountUzs(Math.round(num * ratePerMinute).toString())
    } else if (val === '') {
      setAmountUzs('')
    }
  }

  const applyPreset = (presetAmount: number) => {
    setAmountUzs(presetAmount.toString())
    const calculatedMins = (presetAmount / ratePerMinute).toFixed(1)
    setMinutes(calculatedMins.endsWith('.0') ? parseInt(calculatedMins).toString() : calculatedMins)
  }

  const handleAddMinutes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!minuteModalUser) return
    const token = getToken()
    if (!token) return

    const numMins = parseFloat(minutes)
    const numAmount = parseFloat(amountUzs)

    if ((isNaN(numMins) || numMins <= 0) && (isNaN(numAmount) || numAmount <= 0)) {
      setError("Iltimos, summa yoki daqiqa miqdorini kiriting")
      return
    }

    setActionLoading(true)
    setError(null)
    try {
      const res = await apiAdminAddMinutes(token, minuteModalUser.id, {
        minutes: !isNaN(numMins) && numMins > 0 ? numMins : undefined,
        amount_uzs: !isNaN(numAmount) && numAmount > 0 ? numAmount : undefined,
        rate_per_minute: ratePerMinute,
        action: actionType,
        target: balanceType,
      })
      setSuccessMsg(res.message || (actionType === 'deduct' ? "Daqiqalar muvaffaqiyatli ayirildi!" : "Daqiqalar muvaffaqiyatli qo'shildi!"))
      setMinuteModalUser(null)
      setAmountUzs('')
      setMinutes('')
      setActionType('add')
      setBalanceType('kuymas')
      fetchUsers(search, page)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Amalni bajarishda xatolik yuz berdi")
    } finally {
      setActionLoading(false)
    }
  }

  const handleSetPlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planModalUser) return
    const token = getToken()
    if (!token) return

    setActionLoading(true)
    setError(null)
    try {
      const res = await apiAdminSetPlan(token, planModalUser.id, {
        plan: selectedPlan,
        days: planDays,
        reset_monthly: resetMonthly,
      })
      setSuccessMsg(res.message || "Tarif muvaffaqiyatli biriktirildi!")
      setPlanModalUser(null)
      fetchUsers(search, page)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Tarifni o'zgartirishda xatolik yuz berdi")
    } finally {
      setActionLoading(false)
    }
  }

  const safeUsers = useMemo(() => (Array.isArray(users) ? users : []), [users])

  const planOptions: SelectOption[] = [
    { value: 'all', label: 'Barcha tariflar' },
    { value: 'free', label: 'Bepul (Free)', icon: <Sparkles className="w-3.5 h-3.5 text-gray-400" /> },
    { value: 'paid', label: 'Pullik (Standart + Pro)', icon: <Crown className="w-3.5 h-3.5 text-amber-400" /> },
    { value: 'standard', label: 'Standart tarif', icon: <Zap className="w-3.5 h-3.5 text-blue-400" /> },
    { value: 'pro', label: 'Pro tarif', icon: <Crown className="w-3.5 h-3.5 text-amber-400" /> },
    { value: 'has_package', label: 'Paket xarid qilganlar', icon: <Package className="w-3.5 h-3.5 text-emerald-400" /> },
  ]

  const balanceOptions: SelectOption[] = [
    { value: 'all', label: 'Barcha balanslar' },
    { value: 'has_balance', label: 'Balansi bor (>0 daq)' },
    { value: 'no_balance', label: 'Balansi tugagan (0 daq)' },
    { value: 'has_purchased', label: 'Kuymas paketi bor' },
    { value: 'no_purchased', label: 'Kuymas paketi yo\'q' },
  ]

  const sortOptions: SelectOption[] = [
    { value: 'newest', label: 'Eng yangi qo\'shilganlar' },
    { value: 'oldest', label: 'Eng eski qo\'shilganlar' },
    { value: 'balance_desc', label: 'Eng ko\'p balans bo\'yicha' },
    { value: 'balance_asc', label: 'Eng kam balans bo\'yicha' },
    { value: 'purchased_desc', label: 'Kuymas daqiqa bo\'yicha' },
    { value: 'alphabetical', label: 'Alifbo bo\'yicha (A-Z)' },
  ]

  const insights = useMemo(() => {
    if (serverInsights && serverInsights.length > 0) {
      return serverInsights
    }
    const list: { type: 'warning' | 'caution' | 'success' | 'info'; title: string; description: string }[] = []
    if (safeUsers.length === 0) return list

    const periodName = summary?.period_label || (
      dateRange === 'today' ? 'Bugun' :
      dateRange === '7d' ? 'So\'nggi 7 kun' :
      dateRange === '14d' ? 'So\'nggi 14 kun' :
      dateRange === '30d' ? 'So\'nggi 30 kun' :
      dateRange === '90d' ? 'So\'nggi 90 kun' :
      dateRange === 'custom' ? 'Tanlangan oraliq' : 'Barcha davr'
    )

    const freeCount = safeUsers.filter((u) => (u.plan || 'free').toLowerCase() === 'free').length
    const paidCount = safeUsers.filter((u) => ['standard', 'pro'].includes((u.plan || '').toLowerCase())).length
    const zeroBalCount = safeUsers.filter((u) => (u.balance?.total_available ?? 0) <= 0).length
    const hasPurchasedCount = safeUsers.filter((u) => (u.balance?.purchased ?? 0) > 0).length
    const unverifiedCount = safeUsers.filter((u) => !u.is_verified).length

    if (paidCount > 0) {
      list.push({
        type: 'success',
        title: `${periodName}: ${paidCount} ta faol pullik mijoz (Standart/Pro)`,
        description: `Platformaga to'lov qilayotgan obunachilar. Ularning limitsiz tahlil va tezkor audio generatsiyadan foydalanishini nazorat qilib boring.`,
      })
    } else if (freeCount > 0 && total > 0) {
      list.push({
        type: 'info',
        title: `${periodName}: ${total} ta yangi foydalanuvchi (bepul sinovda)`,
        description: `Tanlangan davrda ro'yxatdan o'tgan foydalanuvchilar bepul sinov tarifida. Qulay starter paketlar va aksiyalar ularning faolligini oshiradi.`,
      })
    }

    if (zeroBalCount > 0) {
      list.push({
        type: 'warning',
        title: `${periodName}: ${zeroBalCount} ta foydalanuvchida daqiqa tugagan`,
        description: `Ko'rsatilgan ro'yxatdagi foydalanuvchilarning balansi 0 daqiqa bo'lib qolgan. Ularga daqiqa paketlari (Starter 15 daqiqa) taklifini ko'rsatish konversiyani oshiradi.`,
      })
    }

    if (hasPurchasedCount > 0) {
      list.push({
        type: 'info',
        title: `${periodName}: ${hasPurchasedCount} ta foydalanuvchida kuymas daqiqalar mavjud`,
        description: `Ushbu daqiqalar bir martalik xarid qilingan bo'lib, oylik muddatga bog'liq emas va hech qachon kuymaydi.`,
      })
    }

    if (unverifiedCount > 0) {
      list.push({
        type: 'caution',
        title: `${periodName}: ${unverifiedCount} ta tasdiqlanmagan profil`,
        description: `Ushbu akkauntlar ro'yxatdan o'tgan, biroq email manzilini hali tasdiqlamagan.`,
      })
    }

    return list
  }, [serverInsights, safeUsers, total, summary, dateRange])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = getToken()
    if (!token) return

    if (!createForm.email.trim() || !createForm.password.trim()) {
      setError("Email va parol kiritilishi shart")
      return
    }

    if (createForm.password.trim().length < 6) {
      setError("Parol kamida 6 belgidan iborat bo'lishi kerak")
      return
    }

    setCreateLoading(true)
    setError(null)
    try {
      const res = await apiAdminCreateUser(token, {
        name: createForm.name.trim(),
        email: createForm.email.trim(),
        password: createForm.password.trim(),
        phone: createForm.phone.trim() || undefined,
        role: createForm.role,
        is_internal: createForm.is_internal,
        is_verified: true,
      })
      setSuccessMsg(res.message || "Yangi foydalanuvchi muvaffaqiyatli qo'shildi!")
      setCreateModalOpen(false)
      setCreateForm({ name: '', email: '', password: '', phone: '', role: 'user', is_internal: false })
      fetchUsers(search, page)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Foydalanuvchi qo'shishda xatolik yuz berdi")
    } finally {
      setCreateLoading(false)
    }
  }

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editModalUser) return
    const token = getToken()
    if (!token) return

    if (!editForm.email.trim()) {
      setError("Email bo'sh bo'lishi mumkin emas")
      return
    }

    if (editForm.password.trim() && editForm.password.trim().length < 6) {
      setError("Yangi parol kamida 6 belgidan iborat bo'lishi kerak")
      return
    }

    setEditLoading(true)
    setError(null)
    try {
      const payload: any = {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        phone: editForm.phone.trim() || undefined,
        role: editForm.role,
        is_internal: editForm.is_internal,
        is_verified: editForm.is_verified,
        is_active: editForm.is_active,
      }
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim()
      }

      const res = await apiAdminUpdateUserCredentials(token, editModalUser.id, payload)
      setSuccessMsg(res.message || "Foydalanuvchi ma'lumotlari muvaffaqiyatli yangilandi!")
      setEditModalUser(null)
      fetchUsers(search, page)
      setTimeout(() => setSuccessMsg(null), 4000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Ma'lumotlarni yangilashda xatolik yuz berdi")
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-white tracking-wide flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            Foydalanuvchilar va Tariflarni boshqarish
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Foydalanuvchilarga tarif yoqish, daqiqa qo'shish yoki so'm summasi orqali hisoblash
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setCreateForm({ name: '', email: '', password: '', phone: '', role: 'user', is_internal: false })
              setShowPassword(false)
              setCreateModalOpen(true)
              setError(null)
            }}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-blue-500/25 shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Yangi odam qo'shish</span>
          </button>
        {/* Date Range Pills & Refresh */}
        <DateRangePills
          value={dateRange}
          onChange={(newRange, start, end) => {
            setDateRange(newRange)
            setStartDate(start || '')
            setEndDate(end || '')
            setPage(1)
          }}
          onRefresh={() => fetchUsers(search, 1, planFilter, balanceFilter, sortBy, dateRange, startDate, endDate)}
          loading={loading}
          startDate={startDate}
          endDate={endDate}
        />
        </div>
      </div>

      {/* Filter and Search Bar with CustomSelect (No native white select glare!) */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Email, ism yoki telefon..."
                className="w-full bg-black/20 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setPage(1)
                    fetchUsers('', 1, planFilter, balanceFilter, sortBy, dateRange, startDate, endDate)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shrink-0"
            >
              Qidirish
            </button>
          </form>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tarif / Paket Filter */}
            <div className="w-44 sm:w-48">
              <CustomSelect
                value={planFilter}
                onChange={(val) => {
                  setPlanFilter(val)
                  setPage(1)
                }}
                options={planOptions}
                icon={<Filter className="w-3.5 h-3.5 text-blue-400" />}
                placeholder="Tarif bo'yicha"
              />
            </div>

            {/* Balans Filter */}
            <div className="w-44 sm:w-48">
              <CustomSelect
                value={balanceFilter}
                onChange={(val) => {
                  setBalanceFilter(val)
                  setPage(1)
                }}
                options={balanceOptions}
                icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
                placeholder="Balans bo'yicha"
              />
            </div>

            {/* Sort Filter */}
            <div className="w-48 sm:w-52">
              <CustomSelect
                value={sortBy}
                onChange={(val) => {
                  setSortBy(val)
                  setPage(1)
                }}
                options={sortOptions}
                icon={<ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />}
                placeholder="Tartiblash"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2 text-emerald-300 text-xs">
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Tizimning Avtomatik Xulosalari va Tavsiyalari (User Insights) */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span>Tizimning Avtomatik Xulosalari va Tavsiyalari</span>
              <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {summary?.period_label || (
                  dateRange === 'today' ? 'Bugun' :
                  dateRange === '7d' ? 'So\'nggi 7 kun' :
                  dateRange === '14d' ? 'So\'nggi 14 kun' :
                  dateRange === '30d' ? 'So\'nggi 30 kun' :
                  dateRange === '90d' ? 'So\'nggi 90 kun' :
                  dateRange === 'custom' ? 'Oraliq' : 'Barcha davr'
                )}
              </span>
            </h3>

            {summary && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur-sm">
                <span className="text-gray-400">Jami: <strong className="text-white font-mono">{summary.total.toLocaleString()}</strong></span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">Pullik: <strong className="text-amber-400 font-mono">{summary.paid_count}</strong></span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">Kuymas paket: <strong className="text-emerald-400 font-mono">{summary.has_package_count}</strong></span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">Balansi 0: <strong className="text-rose-400 font-mono">{summary.zero_balance_count}</strong></span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((ins, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                  ins.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    : ins.type === 'caution'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    : ins.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                    : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  {ins.type === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  {ins.type === 'caution' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {ins.type === 'success' && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {ins.type === 'info' && <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                  <span>{ins.title}</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{ins.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[880px]">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Foydalanuvchi</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Qo'shilgan vaqti</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Tarif</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Daqiqa Balansi</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">Amal qilish muddati</th>
              <th className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest text-right whitespace-nowrap">Harakatlar</th>
            </tr>
          </thead>
          <tbody>
            {loading && safeUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-400 mb-2" />
                  Yuklanmoqda...
                </td>
              </tr>
            ) : safeUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  Foydalanuvchi topilmadi
                </td>
              </tr>
            ) : (
              safeUsers.map((u) => {
                const planKey = (u.plan || 'free').toLowerCase()
                const displayTitle = u.email || u.phone || u.name || 'Foydalanuvchi'
                const initial = (displayTitle || 'U')[0].toUpperCase()
                const bal = u.balance || { total_available: 0, monthly_remaining: 0, monthly_cap: 5, purchased: 0 }
                const createdDt = formatTashkentDateTimeObj(u.created_at)

                return (
                  <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-medium text-xs flex items-center gap-1.5">
                            <span className="truncate max-w-[200px]">{displayTitle}</span>
                            {u.is_verified && (
                              <span title="Tasdiqlangan">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              </span>
                            )}
                            {u.role === 'admin' && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                                <Shield className="w-3 h-3" />
                                ADMIN
                              </span>
                            )}
                            {u.is_active === false && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                <Lock className="w-3 h-3" />
                                BLOKLANGAN
                              </span>
                            )}
                          </div>
                          {(u.name || u.phone) && u.email && (
                            <div className="text-[11px] text-gray-400 truncate max-w-[200px]">
                              {[u.name, u.phone].filter(Boolean).join(' • ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Platformaga qo'shilganlik vaqti */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-gray-200 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{createdDt.date}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono mt-0.5 pl-5">
                        {createdDt.time || '—'}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {planKey === 'pro' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          <Crown className="w-3.5 h-3.5 text-amber-400" />
                          PRO
                        </span>
                      ) : planKey === 'standard' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                          <Zap className="w-3.5 h-3.5 text-blue-400" />
                          STANDART
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/5 text-gray-400 border border-white/10">
                          <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                          BEPUL
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-white">
                        <span className="font-extrabold text-blue-400">{bal.total_available ?? 0}</span> daqiqa
                      </div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
                        <span>Oylik: {bal.monthly_remaining ?? 0}/{bal.monthly_cap ?? 5} daq</span>
                        {(bal.purchased ?? 0) > 0 && (
                          <span className="text-emerald-400 font-semibold">+{bal.purchased} kuymas</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                      {u.expires_at ? (
                        <span className="flex items-center gap-1 text-gray-300">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {formatTashkentDate(u.expires_at)}
                        </span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setMinuteModalUser(u)
                            setAmountUzs('')
                            setMinutes('')
                            setBalanceType('kuymas')
                            setError(null)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center gap-1 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Daqiqa / Summa
                        </button>

                        <button
                          onClick={() => {
                            setPlanModalUser(u)
                            setSelectedPlan(
                              planKey === 'pro' ? 'pro' : planKey === 'standard' ? 'standard' : 'standard'
                            )
                            setPlanDays(30)
                            setError(null)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 font-semibold text-xs flex items-center gap-1 transition"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          Tarif yoqish
                        </button>

                        <button
                          onClick={() => {
                            setEditModalUser(u)
                            setEditForm({
                              name: u.name || '',
                              email: u.email || '',
                              password: '',
                              phone: u.phone || '',
                              role: u.role === 'admin' ? 'admin' : 'user',
                              is_internal: !!u.is_internal,
                              is_verified: u.is_verified !== false,
                              is_active: u.is_active !== false,
                            })
                            setShowPassword(false)
                            setError(null)
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 font-semibold text-xs flex items-center gap-1 transition"
                          title="Parol, rol va ma'lumotlarni o'zgartirish"
                        >
                          <Key className="w-3.5 h-3.5" />
                          Tahrirlash
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination summary */}
      <div className="flex items-center justify-between text-xs text-gray-400 px-1">
        <span>Jami topildi: <strong className="text-white">{total}</strong> ta foydalanuvchi</span>
        {total > 20 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10"
            >
              Oldingi
            </button>
            <span>Sahifa {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total || loading}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 border border-white/10"
            >
              Keyingi
            </button>
          </div>
        )}
      </div>

      {/* MODAL 1: ADD / DEDUCT MINUTES MODAL */}
      {minuteModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Coins className={`w-5 h-5 ${actionType === 'deduct' ? 'text-rose-400' : 'text-emerald-400'}`} />
                  {actionType === 'deduct' ? "Daqiqa yoki Summa ayirish" : "Daqiqa yoki Summa qo'shish"}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">
                  {minuteModalUser.email || minuteModalUser.phone || minuteModalUser.name || 'Foydalanuvchi'}
                </p>
              </div>
              <button
                onClick={() => setMinuteModalUser(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Segmented control: Qo'shish / Ayirish */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setActionType('add')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                  actionType === 'add'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Balansga qo'shish
              </button>
              <button
                type="button"
                onClick={() => setActionType('deduct')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
                  actionType === 'deduct'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Minus className="w-3.5 h-3.5" /> Balansdan ayirish
              </button>
            </div>

            {/* Balans turi tanlash (Kuymas vs Tarif) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>Daqiqa / Balans turi:</span>
                <span className="text-gray-500 font-normal lowercase">qaysi balansga ta'sir qilsin?</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBalanceType('kuymas')}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    balanceType === 'kuymas'
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Kuymas daqiqa
                    </span>
                    {balanceType === 'kuymas' && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-tight">
                    Paket (muddatsiz, oydan-oyga o'tadi)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBalanceType('tarif')}
                  className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                    balanceType === 'tarif'
                      ? 'bg-blue-500/15 border-blue-500/50 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Tarif / Oylik
                    </span>
                    {balanceType === 'tarif' && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </div>
                  <div className="text-[10px] text-gray-400 leading-tight">
                    Oylik reja kvotasi (oy oxirida yangilanadi)
                  </div>
                </button>
              </div>
            </div>

            {/* Joriy balans ko'rsatkichi */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Jami mavjud balans:</span>
                <span className="text-white font-extrabold text-sm">
                  {minuteModalUser.balance?.total_available ?? 0} daqiqa
                </span>
              </div>
              <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-white/5">
                <span className="text-blue-300 font-medium">
                  Oylik tarif: {minuteModalUser.balance?.monthly_remaining ?? 0}/{minuteModalUser.balance?.monthly_cap ?? 5} daq
                </span>
                <span className="text-emerald-400 font-semibold">
                  Kuymas paket: {minuteModalUser.balance?.purchased ?? 0} daq
                </span>
              </div>
            </div>

            {/* Quick presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                {actionType === 'deduct' ? "Tezkor ayirish:" : "Tezkor summalar:"}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { amount: 2000, label: "2 000 so'm (4 daq)" },
                  { amount: 5000, label: "5 000 so'm (10 daq)" },
                  { amount: 15000, label: "15 000 so'm (30 daq)" },
                  { amount: 31000, label: "31 000 so'm (62 daq)" },
                  { amount: 50000, label: "50 000 so'm (100 daq)" },
                  { amount: 100000, label: "100 000 so'm (200 daq)" },
                ].map((p) => (
                  <button
                    key={p.amount}
                    type="button"
                    onClick={() => applyPreset(p.amount)}
                    className={`px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-gray-200 transition text-center ${
                      actionType === 'deduct' ? 'hover:border-rose-500/50' : 'hover:border-emerald-500/50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddMinutes} noValidate className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">
                    Summa (so'mda):
                  </label>
                  <input
                    type="number"
                    value={amountUzs}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="Masalan: 5000"
                    min="0"
                    step="any"
                    className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition ${
                      actionType === 'deduct' ? 'focus:border-rose-500' : 'focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">
                    Daqiqa miqdori:
                  </label>
                  <input
                    type="number"
                    value={minutes}
                    onChange={(e) => handleMinutesChange(e.target.value)}
                    placeholder="Masalan: 10"
                    min="0"
                    step="any"
                    className={`w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition ${
                      actionType === 'deduct' ? 'focus:border-rose-500' : 'focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-400 bg-black/20 p-2.5 rounded-xl border border-white/5">
                <span>1 daqiqa kursi:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={ratePerMinute}
                    onChange={(e) => setRatePerMinute(Math.max(1, parseFloat(e.target.value) || 500))}
                    className="w-16 bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-center text-white"
                  />
                  <span>so'm</span>
                </div>
              </div>

              <p className="text-[11px] text-gray-400 leading-relaxed">
                {actionType === 'deduct' ? (
                  balanceType === 'tarif' ? (
                    <>⚠️ Belgilangan daqiqa foydalanuvchining <span className="text-rose-400 font-semibold">oylik tarif kvotasidan</span> yechib olinadi.</>
                  ) : (
                    <>⚠️ Belgilangan daqiqa foydalanuvchining <span className="text-rose-400 font-semibold">kuymaydigan (paket) balansidan</span> yechib olinadi.</>
                  )
                ) : (
                  balanceType === 'tarif' ? (
                    <>ℹ️ Daqiqalar foydalanuvchining <span className="text-blue-400 font-semibold">oylik tarif kvotasi</span>ga qo'shiladi (oylik sarf miqdorini kamaytiradi).</>
                  ) : (
                    <>ℹ️ Qo'shilgan daqiqalar foydalanuvchining <span className="text-emerald-400 font-semibold">kuymaydigan balansi</span>ga yoziladi va oylik obuna tugasa ham saqlanib qoladi.</>
                  )
                )}
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setMinuteModalUser(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || (!minutes && !amountUzs)}
                  className={`flex-1 py-2.5 rounded-xl text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 ${
                    actionType === 'deduct'
                      ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-lg shadow-rose-900/30'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500'
                  }`}
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : actionType === 'deduct' ? (
                    <Minus className="w-4 h-4" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  {actionType === 'deduct'
                    ? (balanceType === 'tarif' ? "Tarifdan ayirish" : "Kuymasdan ayirish")
                    : (balanceType === 'tarif' ? "Tarifga qo'shish" : "Kuymasga qo'shish")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SET PLAN MODAL */}
      {planModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-400" />
                  Tarif rejasini biriktirish
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">
                  {planModalUser.email || planModalUser.phone || planModalUser.name || 'Foydalanuvchi'}
                </p>
              </div>
              <button
                onClick={() => setPlanModalUser(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSetPlan} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300">
                  Tarifni tanlang:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'free', label: 'BEPUL', desc: '5 daq/oy, 360p', icon: Sparkles },
                    { id: 'standard', label: 'STANDART', desc: '350 daq/oy, 720p', icon: Zap },
                    { id: 'pro', label: 'PRO', desc: '600 daq/oy, Azure TTS, 1080p', icon: Crown },
                  ].map((p) => {
                    const Icon = p.icon
                    const isSelected = selectedPlan === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlan(p.id as any)}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition ${
                          isSelected
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-gray-400'}`} />
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white">{p.label}</div>
                          <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{p.desc}</div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {selectedPlan !== 'free' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-300">
                    Amal qilish muddati (kun):
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[
                      { days: 30, label: '30 kun (1 oy)' },
                      { days: 60, label: '60 kun (2 oy)' },
                      { days: 90, label: '90 kun (3 oy)' },
                      { days: 365, label: '1 yil' },
                    ].map((d) => (
                      <button
                        key={d.days}
                        type="button"
                        onClick={() => setPlanDays(d.days)}
                        className={`py-1.5 rounded-lg border text-xs font-medium transition ${
                          planDays === d.days
                            ? 'bg-blue-500/20 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={planDays}
                    onChange={(e) => setPlanDays(Math.max(1, parseInt(e.target.value) || 30))}
                    min="1"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                    placeholder="Boshqa kun soni..."
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={resetMonthly}
                  onChange={(e) => setResetMonthly(e.target.checked)}
                  className="rounded bg-white/5 border-white/10 text-blue-500 focus:ring-0"
                />
                <span>Oylik sarflangan daqiqalarni 0 ga tushirish (yangi davr boshlash)</span>
              </label>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPlanModalUser(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Tarifni faollashtirish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CREATE USER MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-400" />
                  Yangi odam qo'shish
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Oddiy foydalanuvchi yoki administrator yarating
                </p>
              </div>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} noValidate className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Ism:</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Masalan: Aziz Karimov"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Email (login): *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="user@example.com"
                  autoComplete="off"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Parol: *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={createForm.password}
                    onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Kamida 6 belgi"
                    autoComplete="new-password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-10 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    title={showPassword ? 'Yashirish' : "Ko'rsatish"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Telefon:</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+998 90 123 45 67"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">Rol:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'user', label: 'Foydalanuvchi', desc: 'Oddiy hisob', icon: Sparkles },
                    { id: 'admin', label: 'Administrator', desc: "Admin panelga to'liq kirish", icon: Shield },
                  ].map((r) => {
                    const Icon = r.icon
                    const isSelected = createForm.role === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setCreateForm((f) => ({ ...f, role: r.id as 'user' | 'admin' }))}
                        className={`p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? r.id === 'admin'
                              ? 'bg-violet-600/20 border-violet-500 text-white'
                              : 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Icon className={`w-4 h-4 ${isSelected ? (r.id === 'admin' ? 'text-violet-400' : 'text-blue-400') : 'text-gray-400'}`} />
                          {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className="font-bold text-xs text-white">{r.label}</div>
                        <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{r.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={createForm.is_internal}
                  onChange={(e) => setCreateForm((f) => ({ ...f, is_internal: e.target.checked }))}
                  className="rounded bg-white/5 border-white/10 text-blue-500 focus:ring-0"
                />
                <span>Ichki hisob (jamoa a'zosi — statistikaga kirmaydi)</span>
              </label>

              {createForm.role === 'admin' && (
                <p className="text-[11px] text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-xl p-2.5 leading-relaxed">
                  ⚠️ Administrator barcha foydalanuvchilar, to'lovlar va tizim sozlamalariga to'liq kirish huquqiga ega bo'ladi.
                </p>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {createLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Qo'shish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: EDIT CREDENTIALS / ROLE MODAL */}
      {editModalUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-400" />
                  Parol va rolni o'zgartirish
                </h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[280px]">
                  {editModalUser.email || editModalUser.phone || editModalUser.name || 'Foydalanuvchi'}
                </p>
              </div>
              <button
                onClick={() => setEditModalUser(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-center gap-2 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCredentials} noValidate className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  Yangi parol:
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editForm.password}
                    onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="O'zgartirmaslik uchun bo'sh qoldiring"
                    autoComplete="new-password"
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-10 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    title={showPassword ? 'Yashirish' : "Ko'rsatish"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500">Kamida 6 belgi. Bo'sh qolsa, joriy parol saqlanadi.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">Rol:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'user', label: 'Foydalanuvchi', icon: Sparkles },
                    { id: 'admin', label: 'Administrator', icon: Shield },
                  ].map((r) => {
                    const Icon = r.icon
                    const isSelected = editForm.role === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setEditForm((f) => ({ ...f, role: r.id }))}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                          isSelected
                            ? r.id === 'admin'
                              ? 'bg-violet-600/20 border-violet-500 text-white'
                              : 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {r.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Ism:</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Telefon:</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300">Email (login):</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="off"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 transition"
                />
              </div>

              <div className="space-y-2 pt-1">
                {[
                  { key: 'is_active', label: 'Hisob faol (o\'chirilsa — foydalanuvchi bloklanadi)' },
                  { key: 'is_verified', label: 'Email tasdiqlangan' },
                  { key: 'is_internal', label: "Ichki hisob (statistikaga kirmaydi)" },
                ].map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm[opt.key as 'is_active' | 'is_verified' | 'is_internal']}
                      onChange={(e) => setEditForm((f) => ({ ...f, [opt.key]: e.target.checked }))}
                      className="rounded bg-white/5 border-white/10 text-amber-500 focus:ring-0"
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditModalUser(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs transition"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                >
                  {editLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Saqlash
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default function AdminUsersManager() {
  return (
    <SafeErrorBoundary>
      <AdminUsersManagerInner />
    </SafeErrorBoundary>
  )
}
