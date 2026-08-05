import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Shaxsiy kabinet",
  description: "Xadichai.uz shaxsiy kabineti.",
  // Private, per-user content — never index.
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
