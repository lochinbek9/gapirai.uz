import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL('https://xadichai.uz'),
  title: {
    default: "Xadichai.uz — YouTube videolarni o'zbek tiliga AI dublyaj qilish",
    template: "%s | Xadichai.uz",
  },
  description: "Xadichai.uz — YouTube videolarni sun'iy intellekt yordamida avtomatik o'zbek tiliga dublyaj qiluvchi onlayn platforma. 1 soatgacha videolar bepul.",
  keywords: [
    "xadichai",
    "xadichai uz",
    "youtube dublyaj",
    "video dublyaj",
    "o'zbekcha dublyaj",
    "AI dublyaj",
    "video tarjima",
    "ovozlashtirish",
  ],
  authors: [{ name: "Xadichai.uz", url: "https://xadichai.uz" }],
  creator: "Xadichai.uz",
  publisher: "Xadichai.uz",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/icon.png" },
      { url: "/logo.webp", type: "image/webp" },
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
    siteName: "Xadichai.uz",
    title: "Xadichai.uz — YouTube videolarni o'zbek tiliga AI dublyaj qilish",
    description: "Sun'iy intellekt yordamida YouTube videolarni avtomatik o'zbek tiliga dublyaj va tarjima qiluvchi onlayn platforma.",
    images: [
      {
        url: "https://xadichai.uz/logo.webp",
        width: 256,
        height: 256,
        alt: "Xadichai.uz logotipi",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Xadichai.uz — YouTube videolarni o'zbek tiliga AI dublyaj qilish",
    description: "Videolarni AI yordamida avtomatik o'zbek tiliga dublyaj qiluvchi onlayn platforma.",
    images: ["https://xadichai.uz/logo.webp"],
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
    "alternateName": ["Xadichai", "Xadichai uz"],
    "url": "https://xadichai.uz",
    "inLanguage": "uz",
    "description": "YouTube videolarni sun'iy intellekt yordamida avtomatik o'zbek tiliga dublyaj qiluvchi onlayn platforma."
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Xadichai.uz",
    "url": "https://xadichai.uz",
    "logo": "https://xadichai.uz/logo.webp"
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Xadichai.uz",
    "alternateName": ["Xadichai", "Xadichai uz"],
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "All",
    "url": "https://xadichai.uz",
    "description": "YouTube videolarni sun'iy intellekt yordamida avtomatik o'zbek tiliga dublyaj va tarjima qiluvchi onlayn platforma.",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "UZS"
    }
  };

  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
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
