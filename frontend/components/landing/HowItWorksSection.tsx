import { Link2, Cpu, Download } from "lucide-react";

// Ketma-ketlik o'zi ma'lumot (havola -> AI -> tayyor video), shuning uchun
// raqamlangan jarayon chizig'i; bir xil kartochkalar qatori emas.
const STEPS = [
  {
    icon: Link2,
    title: "Video havolasini kiriting",
    desc: "YouTube video havolasini yuqoridagi maydonga joylashtiring va dublyaj qilish tugmasini bosing.",
  },
  {
    icon: Cpu,
    title: "AI videoni qayta ishlaydi",
    desc: "Nutq matnga aylantiriladi, o'zbek tiliga tarjima qilinadi, so'ng tabiiy o'zbekcha ovozga aylantiriladi.",
  },
  {
    icon: Download,
    title: "Tayyor videoni yuklab oling",
    desc: "O'zbekcha dublyaj qilingan MP4 videoni to'g'ridan-to'g'ri saytdan yuklab olasiz.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="qanday-ishlaydi" aria-labelledby="how-it-works-title" className="w-full max-w-5xl mt-20 sm:mt-28 px-4 z-10 scroll-mt-24">
      <h2
        id="how-it-works-title"
        className="text-2xl sm:text-4xl font-black tracking-[-0.025em] text-slate-900 dark:text-white text-center mb-10 sm:mb-14 [text-wrap:balance]"
      >
        Havoladan tayyor videogacha — uch qadam
      </h2>

      <ol className="relative grid gap-9 sm:grid-cols-3 sm:gap-8">
        {/* Qadamlarni bog'lovchi chiziq: telefonda vertikal, kompyuterda gorizontal */}
        <div
          aria-hidden
          className="absolute left-6 top-6 bottom-6 w-px sm:left-[16.66%] sm:right-[16.66%] sm:top-6 sm:bottom-auto sm:w-auto sm:h-px bg-gradient-to-b sm:bg-gradient-to-r from-blue-500/50 via-violet-500/50 to-blue-500/50"
        />
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex items-start gap-4 sm:flex-col sm:items-center sm:gap-0 sm:text-center">
            <div className="relative z-[1] w-12 h-12 shrink-0 rounded-full bg-white dark:bg-slate-950 border border-violet-500/40 flex items-center justify-center shadow-[0_8px_24px_-10px_rgba(124,58,237,0.55)] sm:mb-5">
              <step.icon aria-hidden className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="pt-1 sm:pt-0">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">
                <span className="text-violet-600 dark:text-violet-400 tabular-nums">{i + 1}.</span> {step.title}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-[36ch] sm:mx-auto">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
