'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { Eye, EyeOff, Loader2, Youtube, ArrowLeft } from 'lucide-react'

function MeshBackground() {
  return (
    <div className="mesh-gradient">
      <div className="mesh-gradient-blob blob-1" />
      <div className="mesh-gradient-blob blob-2" />
      <div className="mesh-gradient-blob blob-3" />
    </div>
  )
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(name, email, password)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Ro\'yxatdan o\'tishda xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 transition-colors duration-300">
      <MeshBackground />

      {/* Orqaga */}
      <Link href="/" className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 font-bold transition text-xs uppercase tracking-widest">
        <ArrowLeft className="w-4 h-4" />
        Bosh sahifa
      </Link>

      <div className="w-full max-w-md z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex flex-col items-center gap-3">
            <div className="p-2 transition duration-300 hover:scale-[1.02]">
              <img src="/logo.webp" alt="GapirAI.uz Logo" width={160} height={80} className="h-20 w-auto object-contain dark:hidden" />
              <img src="/logodark.webp" alt="GapirAI.uz Logo" width={160} height={80} className="h-20 w-auto object-contain hidden dark:block" />
            </div>
            <p className="text-xs text-blue-600/80 dark:text-blue-400/80 font-bold uppercase tracking-widest mt-2">Yangi hisob yarating</p>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-[32px] p-8 sm:p-10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">Ismingiz</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ism Familiya"
                required
                className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3.5 text-sm text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
                className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3.5 text-sm text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest ml-1">Parol</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kamida 6 ta belgi"
                  required
                  className="w-full bg-black/[0.02] dark:bg-white/[0.02] border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3.5 pr-12 text-sm text-black dark:text-white placeholder-slate-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl px-5 py-4 text-blue-600 dark:text-blue-400 text-xs font-semibold leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 active:scale-[0.99] text-white font-extrabold py-3.5 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? 'Yaratilmoqda...' : "Hisob yaratish"}
            </button>
          </form>

          <p className="text-center text-gray-500 dark:text-gray-400 text-xs font-bold mt-8">
            Hisobingiz bormi?{' '}
            <Link href="/login" className="text-blue-600 dark:text-blue-400 hover:underline">
              Kiring
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
