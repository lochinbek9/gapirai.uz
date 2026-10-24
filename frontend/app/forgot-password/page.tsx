'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'


export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const { forgotPassword, resetPassword } = useAuth()
  const router = useRouter()

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setStep('reset')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Xatolik yuz berdi.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await resetPassword(email, code, newPassword)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Kod noto\'g\'ri yoki muddati tugagan')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    setResendMessage('')
    setResendLoading(true)
    try {
      await forgotPassword(email)
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
        <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-ui-muted hover:text-ui-ink">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Kirish
        </Link>
      </div>
      <div className="flex flex-1 justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[400px]">
          <h1 className="text-center text-3xl font-semibold tracking-[-0.03em]">Parolni tiklash</h1>
          <div className="ui-card mt-8 p-6 sm:p-8">
          {step === 'email' ? (
            <form onSubmit={handleRequestCode} className="space-y-5">
              <div className="text-center space-y-1 mb-2">
                <p className="text-base font-semibold text-ui-ink">Parolingizni unutdingizmi?</p>
                <p className="text-sm text-ui-muted">Emailingizni kiriting, tiklash kodini yuboramiz.</p>
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
                {loading ? 'Yuborilmoqda...' : 'Tiklash kodini yuborish'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-ui-ink">Tiklash kodi yuborildi</p>
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

              <div className="space-y-1.5">
                <label className="ui-label">Yangi parol</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                    className="ui-input min-h-11 w-full px-3 pr-12 text-base placeholder:text-ui-muted/80 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
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
              {resendMessage && (
                <div role="status" className="rounded-control border border-ui-green/30 bg-ui-green/[0.06] px-4 py-3 text-sm font-medium leading-relaxed text-ui-green-ink">
                  {resendMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6 || newPassword.length < 6}
                className="ui-btn ui-btn-primary w-full"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Yangilanmoqda...' : 'Parolni yangilash'}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setStep('email')}
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
        </div>
        </div>
      </div>
    </main>
  )
}
