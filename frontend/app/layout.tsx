import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL('https://xadichai.uz'),
  title: {
    default: "Xadichai.uz — AI yordamida YouTube videolarini o'zbekcha dublyaj qilish",
    template: "%s | Xadichai.uz",
  },
  description: "Xadichai.uz — Sun'iy intellekt (AI) yordamida YouTube va boshqa videolarni tezkor, sifatli hamda avtomatik o'zbek tiliga dublyaj va tarjima qilish platformasi. O'zbekcha dublyaj, tarjima va ovozlashtirish.",
  keywords: [
    "Xadichai",
    "xadichai.uz",
    "Xadicha",
    "xadicha uz",
    "xadichai dublyaj",
    "youtube dublyaj",
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
    "ai tarjima",
    "video tarjima ai",
    "videolarni o'zbek tiliga o'girish",
    "ovozlashtirish",
    "video ovoz berish",
    "ai voice generator uzbek",
    "xadichai ai dubbing platformasi"
  ],
  authors: [{ name: "Xadichai.uz Team", url: "https://xadichai.uz" }],
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
    siteName: "Xadichai.uz",
    title: "Xadichai.uz — AI yordamida YouTube videolarini o'zbekcha dublyaj qilish",
    description: "Sun'iy intellekt yordamida videolarni avtomatik va sifatli o'zbek tiliga dublyaj hamda tarjima qiling.",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "Xadichai.uz AI Dubbing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Xadichai.uz — AI yordamida YouTube videolarini o'zbekcha dublyaj qilish",
    description: "Videolarni AI yordamida avtomatik o'zbek tiliga dublyaj qilamiz.",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Xadichai.uz",
    "applicationCategory": "MultimediaApplication",
    "operatingSystem": "All",
    "url": "https://xadichai.uz",
    "description": "YouTube videolarini sun'iy intellekt (AI) yordamida avtomatik o'zbek tiliga dublyaj va tarjima qilish platformasi.",
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
