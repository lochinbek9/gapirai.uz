"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

export default function ThemeToggle({ tone = "default" }: { tone?: "default" | "bar" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  // "system" rejimida ham haqiqiy ko'rinishga qarab almashtiramiz
  const isDark = resolvedTheme === "dark";
  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={tone === "bar"
        ? "w-10 h-10 flex items-center justify-center rounded-[6px] text-metro-plaque-ink shadow-[inset_0_0_0_2px_rgb(var(--m-plaque-ink)/0.25)] hover:shadow-[inset_0_0_0_2px_rgb(var(--m-plaque-ink)/0.7)] transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-metro-plaque-ink"
        : "w-10 h-10 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-blue-500/20 dark:border-white/15 text-gray-900 dark:text-white shadow-sm transition-all duration-300 backdrop-blur-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"}
      aria-label={isDark ? "Yorug' rejimga o'tish" : "Qorong'i rejimga o'tish"}
    >
      <AnimatePresence mode="wait">
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.2 }}
          >
            <Moon aria-hidden="true" className={tone === "bar" ? "w-4 h-4" : "w-4 h-4 text-blue-500 dark:text-blue-400"} />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
            transition={{ duration: 0.2 }}
          >
            <Sun aria-hidden="true" className={tone === "bar" ? "w-5 h-5" : "w-5 h-5 text-amber-500"} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
