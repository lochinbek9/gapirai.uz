'use client'

import { useState, useEffect, useRef } from 'react'
import { Cookie, UploadCloud, Trash2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileText, Info } from 'lucide-react'
import { CookieHealth, apiAdminGetCookies, apiAdminUploadCookies, apiAdminDeleteCookies } from '@/lib/admin'

export default function AdminCookiesManager({ token }: { token: string }) {
  const [cookieHealth, setCookieHealth] = useState<CookieHealth | null>(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiAdminGetCookies(token)
      setCookieHealth(data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Cookie holatini yuklab bo\'lmadi')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) loadStatus()
  }, [token])

  const handleUpload = async () => {
    if (!selectedFile) return
    try {
      setUploading(true)
      setError(null)
      setSuccess(null)
      const res = await apiAdminUploadCookies(token, selectedFile)
      setSuccess(res.message || 'Cookies muvaffaqiyatli yangilandi')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadStatus()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Cookies faylini yuklashda xatolik')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Haqiqatan ham yuklangan cookies.txt faylini o\'chirmoqchimisiz?')) return
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)
      await apiAdminDeleteCookies(token)
      setSuccess('Cookies o\'chirildi')
      await loadStatus()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Cookies o\'chirishda xatolik')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Cookie className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">YouTube Cookies Boshqaruvi</h2>
            <p className="text-xs text-gray-400">
              YouTube bot-tekshiruvlari va yuklab olish xatoliklarini to&apos;liq oldini olish uchun cookies.txt
            </p>
          </div>
        </div>
        <button
          onClick={loadStatus}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Yangilash
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Cookie Status Display */}
      {cookieHealth && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-[11px] text-gray-400 font-medium">Holat:</span>
            <div className="mt-1 flex items-center gap-2">
              {cookieHealth.exists ? (
                cookieHealth.is_fresh ? (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Faol va yangi
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> Eskirgan ({cookieHealth.days_remaining} kun qoldi)
                  </span>
                )
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-400">
                  <XCircle className="w-3.5 h-3.5" /> Mavjud emas / Bo&apos;sh
                </span>
              )}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-[11px] text-gray-400 font-medium">Cookie soni:</span>
            <p className="mt-1 text-sm font-bold text-white">
              {cookieHealth.cookie_count || 0} ta sessiya
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-[11px] text-gray-400 font-medium">Fayl hajmi:</span>
            <p className="mt-1 text-sm font-bold text-white">
              {cookieHealth.size ? `${(cookieHealth.size / 1024).toFixed(1)} KB` : '0 KB'}
            </p>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-[11px] text-gray-400 font-medium">So&apos;nggi yangilanish:</span>
            <p className="mt-1 text-sm font-bold text-white truncate" title={cookieHealth.updated_at || 'Mavjud emas'}>
              {cookieHealth.updated_at || 'Mavjud emas'}
            </p>
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".txt"
              ref={fileInputRef}
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden"
              id="admin-cookie-file"
            />
            <label
              htmlFor="admin-cookie-file"
              className="cursor-pointer px-4 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center gap-2 transition"
            >
              <UploadCloud className="w-4 h-4" />
              {selectedFile ? selectedFile.name : 'cookies.txt faylini tanlash'}
            </label>
            {selectedFile && (
              <span className="text-xs text-gray-400 truncate max-w-xs">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedFile && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
              >
                {uploading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Yuklash va Faollashtirish
              </button>
            )}

            {cookieHealth?.exists && (
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition ml-auto"
                title="Cookielarni o'chirish"
              >
                <Trash2 className="w-3.5 h-3.5" />
                O&apos;chirish
              </button>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 text-xs text-gray-300 space-y-1.5">
          <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
            <Info className="w-4 h-4" />
            <span>Qanday qilib cookies.txt eksport qilinadi?</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1 text-[11px] leading-relaxed">
            <li>Chrome yoki Brave brauzeringizga <strong>&ldquo;Get cookies.txt LOCALLY&rdquo;</strong> kengaytmasini o&apos;rnating.</li>
            <li><strong>youtube.com</strong> sahifasiga o&apos;tib o&apos;z hisobingizga kiring.</li>
            <li>Kengaytmani oching va <strong>&ldquo;Export&rdquo;</strong> tugmasini bosib <code className="text-blue-300">cookies.txt</code> faylini yuklab oling.</li>
            <li>Shu faylni yuqoridagi tugma orqali yuklang. Tizim avtomatik tarzda barcha YouTube yuklashlarida shu cookiedan foydalanadi.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
