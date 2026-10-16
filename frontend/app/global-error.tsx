'use client'

// Next.js talabi: global-error.tsx ROOT layout'ning o'zida xato yuz bersa
// ishlaydi (error.tsx buni ushlay olmaydi, chunki u ham shu layout ichida
// render qilinadi) -- shuning uchun o'z <html>/<body>'sini o'zi belgilashi
// SHART, va Tailwind/global CSS pipeline'ga tayanmasligi kerak (root layout
// buzilgan bo'lishi mumkin bo'lgan holatda ishlashi kerak).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="uz">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Xatolik — GapirAI.uz</title>
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --bg: #f8fafc;
            --card-bg: rgba(255, 255, 255, 0.92);
            --card-border: rgba(226, 232, 240, 0.9);
            --text-title: #0f172a;
            --text-sub: #64748b;
            --shadow: 0 20px 50px -12px rgba(15, 23, 42, 0.08);
            --badge-bg: rgba(99, 102, 241, 0.1);
            --badge-text: #6366f1;
            --btn-sec-bg: #f1f5f9;
            --btn-sec-text: #475569;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #090d16;
              --card-bg: rgba(15, 23, 42, 0.85);
              --card-border: rgba(255, 255, 255, 0.08);
              --text-title: #f8fafc;
              --text-sub: #94a3b8;
              --shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.5);
              --badge-bg: rgba(139, 92, 246, 0.15);
              --badge-text: #a78bfa;
              --btn-sec-bg: rgba(255, 255, 255, 0.05);
              --btn-sec-text: #cbd5e1;
            }
          }
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
            box-sizing: border-box;
          }
          .card {
            background: var(--card-bg);
            border: 1px solid var(--card-border);
            border-radius: 28px;
            padding: 2.5rem 2rem;
            max-width: 440px;
            width: 100%;
            text-align: center;
            box-shadow: var(--shadow);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
          }
          .badge {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--badge-bg);
            color: var(--badge-text);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 1.25rem;
          }
          .title {
            font-size: 1.35rem;
            font-weight: 800;
            color: var(--text-title);
            margin: 0 0 0.5rem 0;
            letter-spacing: -0.02em;
          }
          .desc {
            font-size: 0.9rem;
            color: var(--text-sub);
            line-height: 1.6;
            margin: 0 0 1.75rem 0;
          }
          .btn-group {
            display: flex;
            gap: 0.75rem;
          }
          .btn-pri {
            flex: 1;
            padding: 0.85rem 1.25rem;
            border-radius: 16px;
            background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #0ea5e9 100%);
            color: white;
            font-weight: 700;
            font-size: 0.875rem;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .btn-sec {
            flex: 1;
            padding: 0.85rem 1.25rem;
            border-radius: 16px;
            background: var(--btn-sec-bg);
            color: var(--btn-sec-text);
            font-weight: 700;
            font-size: 0.875rem;
            border: 1px solid var(--card-border);
            cursor: pointer;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
        `}} />
      </head>
      <body>
        <div className="card">
          <div className="badge">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h1 className="title">Nimadur noto&apos;g&apos;ri ketdi</h1>
          <p className="desc">
            Ilovani yuklashda kutilmagan xatolik yuz berdi. Qaytadan urinib ko&apos;ring — muammo davom etsa, bosh sahifaga qayting.
          </p>
          <div className="btn-group">
            <button onClick={reset} className="btn-pri">
              Qaytadan urinish
            </button>
            <a href="/" className="btn-sec">
              Bosh sahifa
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
