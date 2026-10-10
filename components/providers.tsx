"use client";

import { ThemeProvider } from "next-themes";
import DonateModal from "./DonateModal";

// mounted guardi olib tashlandi — ThemeProvider har doim ishlaydi.
// html elementi suppressHydrationWarning orqali hydration xatolarini bostiradi.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
      {/* Davriy "qo'llab-quvvatlash" modali -- root layout'ga to'g'ridan-to'g'ri
          qo'shilsa Next 15.5 clientReferenceManifest xatosini beradi, shuning
          uchun allaqachon client bo'lgan shu provider ichida render qilinadi. */}
      <DonateModal />
    </ThemeProvider>
  );
}
