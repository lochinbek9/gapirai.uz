import { Clock, Users2, Captions, MonitorPlay, Volume2, Ban } from "lucide-react";

const FEATURES = [
  {
    icon: Clock,
    title: "Oyiga 5 daqiqa bepul",
    desc: "Har oy 5 daqiqagacha videoni to'lovsiz dublyaj qiling. Ko'proq kerak bo'lsa — oylik tarif yoki qo'shimcha daqiqa paketi.",
  },
  {
    icon: Users2,
    title: "Spiker jinsini avtomatik aniqlash",
    desc: "Tizim video ovozini tahlil qilib, erkak yoki ayol ovoziga mos dublyaj tanlaydi — xohlasangiz qo'lda ham belgilash mumkin.",
  },
  {
    icon: Captions,
    title: "O'zbekcha subtitr",
    desc: "Har bir dublyaj bilan birga video pleyerda yoqib-o'chirish mumkin bo'lgan o'zbekcha subtitr ham tayyorlanadi.",
  },
  {
    icon: MonitorPlay,
    title: "Turli video sifatlari",
    desc: "Tarifingizga qarab 360p dan 1080p gacha sifatda yuklab olish imkoniyati.",
  },
  {
    icon: Volume2,
    title: "Original fon saqlanadi",
    desc: "Dublyaj original video ovozini butunlay o'chirmaydi — fon musiqasi va effektlar tabiiy tarzda pasaytirilib qoldiriladi.",
  },
  {
    icon: Ban,
    title: "Qo'shimcha dastursiz",
    desc: "Hech qanday dastur o'rnatish shart emas — barcha qayta ishlash bulutli serverlarda amalga oshiriladi.",
  },
];

export default function FeaturesSection() {
  return (
    <section className="w-full max-w-4xl mt-14 px-4 z-10">
      <h2 className="text-lg sm:text-2xl font-semibold text-ui-ink text-center mb-6 sm:mb-8">
        Imkoniyatlar
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="glass-card rounded-2xl p-5 border border-ui-rule flex items-start gap-3.5 text-left"
          >
            <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 flex items-center justify-center">
              <f.icon className="w-4.5 h-4.5 text-ui-accent-ink" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ui-ink mb-1">{f.title}</h3>
              <p className="text-xs text-ui-muted leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
