import Link from "next/link";
import { ShieldCheck, Lock, FileText } from "lucide-react";

const POINTS = [
  {
    icon: Lock,
    title: "Shifrlangan uzatish",
    text: "Ma'lumotlaringiz SSL shifrlash va zamonaviy xavfsizlik protokollari orqali uzatiladi.",
  },
  {
    icon: ShieldCheck,
    title: "Uchinchi shaxslarga sotilmaydi",
    text: "Shaxsiy ma'lumotlaringiz hech qanday uchinchi shaxsga sotilmaydi yoki uzatilmaydi.",
  },
  {
    icon: FileText,
    title: "Shaffof shartlar",
    text: "Xizmatdan foydalanish qoidalari va maxfiylik siyosati ochiq va tushunarli tilda yozilgan.",
  },
];

export default function TrustSection() {
  return (
    <section className="w-full max-w-4xl mt-14 px-4 z-10">
      <h2 className="text-lg sm:text-2xl font-semibold text-ui-ink text-center mb-6 sm:mb-8">
        Maxfiylik va xavfsizlik
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="glass-card rounded-2xl p-5 border border-ui-rule text-left"
          >
            <Icon className="w-5 h-5 text-ui-accent-ink mb-3" />
            <h3 className="text-sm font-semibold text-ui-ink mb-1.5">{title}</h3>
            <p className="text-xs text-ui-muted leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-4 mt-6">
        <Link
          href="/privacy"
          className="text-xs font-semibold text-ui-accent-ink hover:underline"
        >
          Maxfiylik siyosati
        </Link>
        <span className="text-xs text-ui-muted">•</span>
        <Link
          href="/terms"
          className="text-xs font-semibold text-ui-accent-ink hover:underline"
        >
          Foydalanish shartlari
        </Link>
      </div>
    </section>
  );
}
