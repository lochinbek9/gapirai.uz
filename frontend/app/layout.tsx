import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL('https://xadichai.uz'),
  title: {
    default: "Xadichai.uz — Hadicha & Xadicha AI Dublyaj Programmasi | Online Video Dublyaj Dasturi",
    template: "%s | Xadichai.uz (Hadicha Dublyaj)",
  },
  description: "Xadichai.uz (Hadicha / Xadicha) — YouTube videolarni sun'iy intellekt (AI) yordamida tezkor, bepul va avtomatik o'zbek tiliga dublyaj qiluvchi eng ilg'or dublyaj programmasi va video tarjima dasturi.",
  keywords: [
    // Brand Variations (O'zbek, Kirill va Lotin qidiruvlar)
    "xadicha",
    "hadicha",
    "xadichai",
    "hadichai",
    "xadichai.uz",
    "hadicha uz",
    "xadicha uz",
    "hadicha dublyaj",
    "xadicha dublyaj",
    "xadicha ai",
    "hadicha ai",

    // Dublyaj & Dastur Qidiruv Kalit So'zlari
    "dublyaj",
    "dublyaj programmasi",
    "dublyaj dasturi",
    "dublyaj qilish",
    "dublyaj sayti",
    "online dublyaj",
    "onlayn dublyaj",
    "video dublyaj",
    "video dublyaj dasturi",
    "youtube dublyaj",
    "youtube dublyaj programmasi",
    "youtube o'zbekcha dublyaj",
    "youtube video tarjima",
    "youtube tarjimon",
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
    "ai voice generator uzbek"
  ],
  authors: [{ name: "Xadichai.uz Team (Hadicha)", url: "https://xadichai.uz" }],
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
    siteName: "Xadichai.uz (Hadicha Dublyaj)",
    title: "Xadichai.uz — Hadicha & Xadicha AI Dublyaj Programmasi",
    description: "Sun'iy intellekt yordamida YouTube videolarni avtomatik o'zbek tiliga dublyaj hamda tarjima qiluvchi dastur va platforma.",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Xadichai.uz Hadicha AI Dublyaj Programmasi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xadichai.uz — Hadicha & Xadicha AI Dublyaj Programmasi",
    description: "Videolarni AI yordamida avtomatik o'zbek tiliga dublyaj qiluvchi dastur va sayt.",
    images: ["/logo.png"],
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
      "Hadicha Dublyaj",
      "Xadicha Dublyaj",
      "Dublyaj Programmasi",
      "Dublyaj Dasturi"
    ],
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "All",
    "url": "https://xadichai.uz",
    "description": "Hadicha (Xadichai.uz) — YouTube videolarni sun'iy intellekt (AI) yordamida avtomatik o'zbek tiliga dublyaj va tarjima qiluvchi onlayn dublyaj programmasi va dasturi.",
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
        "name": "Hadicha (Xadichai.uz) nima?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Xadichai.uz (Hadicha) — sun'iy intellekt (AI) yordamida YouTube videolarni avtomatik o'zbek tiliga dublyaj va tarjima qiluvchi innovatsion onlayn platforma va dublyaj programmasidir."
        }
      },
      {
        "@type": "Question",
        "name": "Dublyaj programmasi orqali videolarni o'zbekcha qilish bepulmi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Ha! Xadichai.uz saytida 10 daqiqagacha bo'lgan YouTube videolarni mutlaqo bepul va tezkor o'zbek tiliga dublyaj qilishingiz mumkin."
        }
      },
      {
        "@type": "Question",
        "name": "YouTube videolarni o'zbek tiliga dublyaj qilish qanday ishlaydi?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Shunchaki YouTube havolasini Xadichai.uz (Hadicha) saytiga joylaysiz. Sun'iy intellekt video matnini ajratadi, professional o'zbek tiliga tarjima qiladi va tabiiy insoniy ovozda dublyaj qiladi."
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
