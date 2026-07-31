import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL('https://xadichai.uz'),
  title: {
    default: "Xadichai.uz (Hadicha / Xadicha uz) — YouTube Dublyaj Programmasi | Online Video Dublyaj",
    template: "%s | Xadichai.uz (Hadicha & Xadicha Uz Dublyaj)",
  },
  description: "Xadichai.uz (Hadicha / Xadicha / Xadicha uz / Xadichai uz) — YouTube videolarni (You Tube dublyaj) sun'iy intellekt (AI) yordamida tezkor, bepul va avtomatik o'zbek tiliga dublyaj qiluvchi 1-raqamli dublyaj programmasi hamda video tarjima dasturi.",
  keywords: [
    // Brand Variations (Lotin & Kirill)
    "hadicha",
    "xadicha",
    "xadichai",
    "hadichai",
    "xadicha uz",
    "hadicha uz",
    "xadichai uz",
    "hadichai uz",
    "hadicha dublyaj",
    "xadicha dublyaj",
    "hadicha ai",
    "xadicha ai",
    "хадича",
    "хадичаи",
    "хадича уз",
    "хадича дубляж",

    // YouTube Dublyaj & Search Keywords
    "you tube dublyaj",
    "youtube dublyaj",
    "you tube dublyaj qilish",
    "youtube dublyaj qilish",
    "youtube video dublyaj",
    "youtube o'zbekcha dublyaj",
    "youtube tarjimon",
    "youtube video tarjima",

    // Dublyaj & Dastur Kalit So'zlari
    "dublyaj",
    "dublyaj ilovasi",
    "dublyaj programmasi",
    "dublyaj dasturi",
    "dublyaj qilish",
    "dublyaj sayti",
    "online dublyaj",
    "onlayn dublyaj",
    "video dublyaj",
    "video dublyaj dasturi",
    "o'zbekcha dublyaj",
    "ozbekcha dublyaj",
    "o'zbek tilida dublyaj",
    "video dublyaj uzbekcha",
    "AI dublyaj",
    "ai dubbing uzbek",
    "sun'iy intellekt dublyaj",
    "ai tarjima programmasi",
    "video tarjima ai",
    "videolarni o'zbek tiliga o'girish",
    "ovozlashtirish dasturi",
    "video ovoz berish programmasi",
    "ai voice generator uzbek",
    "дубляж иловаси",
    "ўзбекча дубляж"
  ],
  authors: [{ name: "Xadichai.uz Team (Hadicha & Xadicha Uz)", url: "https://xadichai.uz" }],
  creator: "Xadichai.uz",
  publisher: "Xadichai.uz",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/icon.png" },
      { url: "/logo.png", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
    apple: [
      { url: "/apple-icon.png" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "uz_UZ",
    url: "https://xadichai.uz",
    siteName: "Xadichai.uz (Hadicha / Xadicha uz — YouTube Dublyaj)",
    title: "Xadichai.uz (Hadicha / Xadicha uz) — YouTube Dublyaj Programmasi",
    description: "Sun'iy intellekt yordamida YouTube videolarni (You Tube dublyaj) avtomatik o'zbek tiliga dublyaj hamda tarjima qiluvchi dastur va platforma.",
    images: [
      {
        url: "https://xadichai.uz/logo.png",
        width: 1200,
        height: 630,
        alt: "Xadichai.uz Hadicha Xadicha uz AI Dublyaj Programmasi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xadichai.uz (Hadicha / Xadicha uz) — YouTube Dublyaj Programmasi",
    description: "Videolarni va You Tube dublyaj kontentlarini AI yordamida avtomatik o'zbek tiliga dublyaj qiluvchi dastur va sayt.",
    images: ["https://xadichai.uz/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "srZlb7Q_Zziyn-5bWCG4Kc5NLwyyALavPhPL9MaU_iU",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Xadichai.uz",
    "alternateName": [
      "Hadicha",
      "Xadicha",
      "Hadicha uz",
      "Xadicha uz",
      "Xadichai uz",
      "Hadichai uz",
      "YouTube dublyaj",
      "You tube dublyaj",
      "Hadicha Dublyaj"
    ],
    "url": "https://xadichai.uz",
    "inLanguage": "uz",
    "description": "YouTube videolarni (You Tube dublyaj) sun'iy intellekt (AI) yordamida tezkor, bepul va avtomatik o'zbek tiliga dublyaj qiluvchi 1-raqamli Hadicha / Xadicha uz dublyaj programmasi."
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Xadichai.uz (Hadicha & Xadicha uz)",
    "url": "https://xadichai.uz",
    "logo": "https://xadichai.uz/logo.png",
    "sameAs": [
      "https://xadichai.uz"
    ]
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Xadichai.uz",
    "alternateName": [
      "Hadicha",
      "Xadicha",
      "Hadicha uz",
      "Xadicha uz",
      "Xadichai",
      "Hadichai",
      "Xadichai uz",
      "Hadichai uz",
      "YouTube dublyaj",
      "You tube dublyaj",
      "Hadicha Dublyaj",
      "Xadicha Dublyaj",
      "Dublyaj Programmasi",
      "Dublyaj Dasturi"
    ],
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "All",
    "url": "https://xadichai.uz",
    "description": "Hadicha / Xadicha uz (Xadichai.uz) — YouTube videolarni (You tube dublyaj) sun'iy intellekt (AI) yordamida avtomatik o'zbek tiliga dublyaj va tarjima qiluvchi onlayn dublyaj programmasi.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "UZS"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Hadicha (Xadicha / Xadicha uz / Xadichai.uz) nima?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Xadichai.uz (Hadicha / Xadicha uz) — sun'iy intellekt (AI) yordamida YouTube videolarni avtomatik o'zbek tiliga dublyaj va tarjima qiluvchi innovatsion onlayn platforma va dublyaj programmasidir."
        }
      },
      {
        "@type": "Question",
        "name": "YouTube dublyaj (You tube dublyaj) dasturi orqali videolarni o'zbekcha qilish bepulmi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ha! Xadichai.uz (Hadicha uz) saytida 10 daqiqagacha bo'lgan YouTube videolarni mutlaqo bepul va tezkor o'zbek tiliga dublyaj qilishingiz mumkin."
        }
      },
      {
        "@type": "Question",
        "name": "YouTube videolarni Xadicha uz (Hadicha) orqali o'zbek tiliga dublyaj qilish qanday ishlaydi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Shunchaki YouTube havolasini Xadichai.uz (Hadicha / Xadicha uz) saytiga joylaysiz. Sun'iy intellekt video matnini ajratadi, professional o'zbek tiliga tarjima qiladi va tabiiy insoniy ovozda dublyaj qiladi."
        }
      }
    ]
  };

  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <meta name="google-site-verification" content="srZlb7Q_Zziyn-5bWCG4Kc5NLwyyALavPhPL9MaU_iU" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=111132425', 'ym');

            ym(111132425, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
          `}
        </Script>
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/111132425" style={{ position: "absolute", left: "-9999px" }} alt="" />
          </div>
        </noscript>
      </body>
    </html>
  );
}
