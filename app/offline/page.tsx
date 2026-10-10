export const metadata = { title: "Oflayn" };

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">📡</div>
      <h1 className="text-xl font-black text-gray-900 dark:text-white">Internet aloqasi yo&apos;q</h1>
      <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm">
        GapirAI.uz ishlashi uchun internet kerak. Aloqa tiklangach sahifani yangilang.
      </p>
      <a
        href="/"
        className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-500 to-indigo-500 text-white"
      >
        Qayta urinish
      </a>
    </div>
  );
}
