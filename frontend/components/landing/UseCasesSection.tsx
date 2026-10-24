import { Video, GraduationCap, Newspaper } from "lucide-react";

const USE_CASES = [
  {
    icon: Video,
    title: "Kontent yaratuvchilar",
    desc: "Xorijiy videolaringizni o'zbek auditoriyasi uchun tushunarli qiling — YouTube kanalingizni kengaytiring.",
  },
  {
    icon: GraduationCap,
    title: "Ta'lim beruvchilar",
    desc: "Ingliz tilidagi dars va ma'ruzalarni o'quvchilaringiz uchun o'zbek tilida taqdim eting.",
  },
  {
    icon: Newspaper,
    title: "Media va bloggerlar",
    desc: "Xorijiy yangilik va sharhlarni tezkor ravishda o'zbek tilida auditoriyangizga yetkazing.",
  },
];

export default function UseCasesSection() {
  return (
    <section className="w-full max-w-4xl mt-14 px-4 z-10">
      <h2 className="text-lg sm:text-2xl font-semibold text-ui-ink text-center mb-6 sm:mb-8">
        Kimlar uchun mos?
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {USE_CASES.map((u) => (
          <div
            key={u.title}
            className="glass-card rounded-2xl p-5 sm:p-6 border border-ui-rule text-left"
          >
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center mb-3">
              <u.icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-ui-ink mb-1.5">{u.title}</h3>
            <p className="text-xs text-ui-muted leading-relaxed">{u.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
