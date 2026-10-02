import type { MetadataRoute } from "next";

// PWA manifesti. Next avtomatik /manifest.webmanifest sifatida serve qiladi va
// <link rel="manifest"> ni layout'ga qo'shadi. share_target — Android'da
// YouTube ilovasidan "Share" -> GapirAI oqimi uchun (app/share/page.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GapirAI.uz — YouTube dublyaj",
    short_name: "GapirAI",
    description:
      "YouTube videolarni sun'iy intellekt yordamida o'zbek tiliga dublyaj va tahlil qilish.",
    id: "/",
    start_url: "/?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b1120",
    theme_color: "#7c3aed",
    lang: "uz",
    dir: "ltr",
    categories: ["productivity", "education", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Dublyaj qilish", short_name: "Dublyaj", url: "/?src=pwa-shortcut" },
      { name: "Mening videolarim", short_name: "Dashboard", url: "/dashboard?src=pwa-shortcut" },
    ],
    // TypeScript MetadataRoute.Manifest hali share_target'ni bilmaydi —
    // Android/Chrome uni to'g'ri o'qiydi.
    ...( {
      share_target: {
        action: "/share",
        method: "GET",
        enctype: "application/x-www-form-urlencoded",
        params: { title: "title", text: "text", url: "url" },
      },
    } as Record<string, unknown> ),
  };
}
