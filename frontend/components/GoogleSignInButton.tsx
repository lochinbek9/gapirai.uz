'use client'
import { useEffect, useRef } from 'react'
import Script from 'next/script'

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void
}

// GOOGLE_CLIENT_ID sozlanmagan bo'lsa, tugma umuman ko'rsatilmaydi (buzilgan
// tugma ko'rsatishdan ko'ra) — backend/config.py'dagi bir xil "sozlanmasa
// yashirin" tamoyili.
export default function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackRef = useRef(onCredential)
  callbackRef.current = onCredential

  useEffect(() => {
    if (!CLIENT_ID) return

    function render() {
      if (!window.google || !containerRef.current) return
      // initialize idempotente: guarda na instância evita o aviso
      // "initialize() is called multiple times" do GSI.
      const gsi = window.google.accounts.id as typeof window.google.accounts.id & { __gapiraiInitialized?: boolean }
      if (!gsi.__gapiraiInitialized) {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID!,
          callback: (resp) => callbackRef.current(resp.credential),
        })
        gsi.__gapiraiInitialized = true
      }
      // width numérico (px) — o GSI rejeita "100%".
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: 360,
        text: 'continue_with',
        locale: 'uz',
      })
    }

    if (window.google) {
      render()
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval)
          render()
        }
      }, 100)
      return () => clearInterval(interval)
    }
  }, [])

  if (!CLIENT_ID) return null

  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      <div ref={containerRef} className="w-full flex justify-center" />
    </>
  )
}
