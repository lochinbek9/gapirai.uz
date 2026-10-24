'use client'
import { useEffect, useRef } from 'react'
import Script from 'next/script'

const DEFAULT_CLIENT_ID = "235172384103-60v6m8mvikofqioqroeeubtir7dpdt4q.apps.googleusercontent.com"
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID

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

// Google tugmasi faqat piksel kenglik qabul qiladi (200..400). Ilgari qat'iy 360px
// edi -- telefonda (375px ekran, karta ichi ~290px) tugma kartadan chiqib ketardi.
function buttonWidth(el: HTMLElement): number {
  return Math.max(200, Math.min(400, Math.floor(el.clientWidth || 360)))
}

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => void
  text?: 'signin_with' | 'signup_with' | 'continue_with'
}

export default function GoogleSignInButton({ onCredential, text = 'continue_with' }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!CLIENT_ID) return

    function render() {
      if (!window.google || !containerRef.current) return
      try {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => onCredential(resp.credential),
        })
        const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: isDark ? 'filled_black' : 'outline',
          size: 'large',
          width: buttonWidth(containerRef.current),
          text: text,
          locale: 'uz',
          shape: 'pill',
        })
      } catch (err) {
        console.error('Google Sign-In render error:', err)
      }
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
  }, [onCredential, text])

  if (!CLIENT_ID) return null

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.google && containerRef.current) {
            try {
              window.google.accounts.id.initialize({
                client_id: CLIENT_ID,
                callback: (resp) => onCredential(resp.credential),
              })
              const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
              window.google.accounts.id.renderButton(containerRef.current, {
                theme: isDark ? 'filled_black' : 'outline',
                size: 'large',
                width: buttonWidth(containerRef.current),
                text: text,
                locale: 'uz',
                shape: 'pill',
              })
            } catch (e) {
              console.error(e)
            }
          }
        }}
      />
      <div ref={containerRef} className="w-full min-h-[44px] flex justify-center items-center" />
    </>
  )
}
