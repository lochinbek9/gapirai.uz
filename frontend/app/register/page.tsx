'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import GoogleSignInButton from '@/components/GoogleSignInButton'
import TelegramSignInButton from '@/components/TelegramSignInButton'
import type { TelegramLoginData } from '@/lib/auth'
import { Eye, EyeOff, Loader2, Youtube, ArrowLeft } from 'lucide-react'


export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'code'>('form')
  const [code, setCode] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [returnUrl, setReturnUrl] = useState('')
  const { register, verifyCode, resendCode, googleAuth, telegramAuth } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const r = new URLSearchParams(window.location.search).get('returnUrl')
      if (r) setReturnUrl(r)
    }
  }, [])

  const getDestination = () => {
    if (typeof window === 'undefined') return '/dashboard'
    const params = new URLSearchParams(window.location.search)
    const r = params.get('returnUrl')
    if (r && r.startsWith('/')) return r
    if (sessionStorage.getItem('pending_dub_job')) return '/'
    return '/dashboard'
  }

  const handleGoogleCredential = async (credential: string) => {
    setError('')
    setLoading(true)
    try {
      await googleAuth(credential)
      router.push(getDestination())
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Google orqali kirishda xatolik yuz berdi.')
    } finally {
      setLoading(false)
    }
  }

  const handleTelegramAuth = async (data: TelegramLoginData) => {
    setError('')
    setLoading(true)
    try {
      await telegramAuth(data)
      router.push(getDestination())
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Telegram orqali roʻyxatdan oʻtishda xatolik yuz berdi.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(name, email, password)
      setStep('code')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ro\'yxatdan o\'tishda xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyCode(email, code)
      router.push(getDestination())
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kod noto\'g\'ri yoki muddati tugagan')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setError('')
    setResendMessage('')
    setResendLoading(true)
    try {
      await resendCode(email)
      setResendMessage('Yangi kod yuborildi.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kodni qayta yuborishda xatolik')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <main id="main" className="flex min-h-screen flex-col bg-ui-ground text-ui-ink">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="GapirAI.uz — bosh sahifa">
          <img src="/logo.webp" alt="" width={120} height={32} className="h-8 w-auto dark:hidden" />
          <img src="/logodark.webp" alt="" width={120} height={32} className="hidden h-8 w-auto dark:block" />
        </Link>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-ink">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Bosh sahifa
        </Link>
      </div>
      <div className="flex flex-1 justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.03em]">Yangi hisob yarating</h1>
          <p className="mt-2 text-center text-[15px] text-ui-muted">Har 30 kunda 5 daqiqa bepul. Videolaringiz hisobingizda saqlanadi.</p>
          <div className="ui-card mt-8 p-6 sm:p-8">
          {step === 'form' && (
            <div className="mb-6 space-y-5">
              <GoogleSignInButton onCredential={handleGoogleCredential} text="signup_with" />
              <TelegramSignInButton onAuth={handleTelegramAuth} text="signup_with" />
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-ui-rule" />
                <span className="text-xs text-ui-muted">yoki</span>
                <div className="h-px flex-1 bg-ui-rule" />
              </div>
            </div>
          )}

          {step === 'form' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="ui-label">Ismingiz</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ism Familiya"
                  required
                  className="ui-input min-h-11 w-full px-3 text-base placeholder:text-ui-muted/80 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="ui-label">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="ui-input min-h-11 w-full px-3 text-base placeholder:text-ui-muted/80 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="ui-label">Parol</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Kamida 6 ta belgi"
                    required
                    className="ui-input min-h-11 w-full px-3 pr-12 text-base placeholder:text-ui-muted/80 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    aria-label={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
                    aria-pressed={showPass}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-ui-muted hover:text-ui-ink"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-4 py-3 text-sm font-medium leading-relaxed text-ui-red-ink">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="ui-btn ui-btn-primary w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Yaratilmoqda...' : "Hisob yaratish"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-ui-ink">Tasdiqlash kodi yuborildi</p>
                <p className="text-sm text-ui-muted">
                  <span className="font-medium text-ui-ink">{email}</span> manziliga 6 xonali kod yubordik.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="ui-label">Tasdiqlash kodi</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  required
                  autoFocus
                  className="ui-input min-h-14 w-full px-3 text-center text-2xl font-semibold tracking-[0.5em] tabular-nums placeholder:text-ui-muted/60 focus:outline-none"
                />
              </div>

              {error && (
                <div role="alert" className="rounded-control border border-ui-red/30 bg-ui-red/[0.05] px-4 py-3 text-sm font-medium leading-relaxed text-ui-red-ink">
                  {error}
                </div>
              )}
              {resendMessage && (
                <div role="status" className="rounded-control border border-ui-green/30 bg-ui-green/[0.06] px-4 py-3 text-sm font-medium leading-relaxed text-ui-green-ink">
                  {resendMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="ui-btn ui-btn-primary w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Tekshirilmoqda...' : 'Tasdiqlash'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="font-medium text-ui-muted hover:text-ui-ink"
                >
                  Orqaga
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="font-medium text-ui-accent-ink hover:underline disabled:opacity-50"
                >
                  {resendLoading ? 'Yuborilmoqda...' : "Kodni qayta yuborish"}
                </button>
              </div>
            </form>
          )}

          {step === 'form' && (
            <p className="mt-6 text-center text-sm text-ui-muted">
              Hisobingiz bormi?{' '}
              <Link
                href={returnUrl ? `/login?returnUrl=${encodeURIComponent(returnUrl)}` : '/login'}
                className="font-medium text-ui-accent-ink hover:underline"
              >
                Kiring
              </Link>
            </p>
          )}
        </div>
        </div>
      </div>
    </main>
  )
}
