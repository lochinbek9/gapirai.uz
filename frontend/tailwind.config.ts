import type { Config } from "tailwindcss";

// Dizayn tizimi (DESIGN.md): ranglar CSS o'zgaruvchilaridan -- yorug'/qorong'i
// rejimda bir xil nomlar, qiymatlar globals.css'da.
const ui = (name: string) => `rgb(var(--ui-${name}) / <alpha-value>)`;

const NEUTRAL = {
  50: "#F6F7F9", 100: "#EEF0F3", 200: "#E5E7EB", 300: "#D1D5DB", 400: "#9CA3AF", 500: "#6B7280",
  600: "#585E6A", 700: "#3F4450", 800: "#22252C", 900: "#141519", 950: "#0B0B0D",
};

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "420px",
      },
      colors: {
        // Eski sahifalardagi blue-* / gray-* klasslari ham yangi tizimga mos:
        // ko'k = logo aksenti (#2B5CF0 atrofida), kulranglar = neytral tokenlar.
        blue: {
          50: "#EEF3FF", 100: "#DFE8FF", 200: "#C4D3FF", 300: "#9CB4FF", 400: "#6F8DFA",
          500: "#4A6EF5", 600: "#2B5CF0", 700: "#204CD6", 800: "#1E3FAD", 900: "#1E3787", 950: "#172352",
        },
        gray: NEUTRAL,
        slate: NEUTRAL,
        zinc: NEUTRAL,
        neutral: NEUTRAL,
        ui: {
          ground: ui("ground"),
          surface: ui("surface"),
          ink: ui("ink"),
          muted: ui("muted"),
          rule: ui("rule"),
          dark: ui("dark"),
          "dark-ink": ui("dark-ink"),
          accent: ui("accent"),
          "accent-ink": ui("accent-ink"),
          red: ui("red"),
          "red-ink": ui("red-ink"),
          green: ui("green"),
          "green-ink": ui("green-ink"),
          // eski nomlar (formalar) -> yangi semantika
          blue: ui("accent"),
          "blue-ink": ui("accent-ink"),
          plaque: ui("dark"),
          "plaque-ink": ui("dark-ink"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        control: "10px",
        card: "16px",
      },
    },
  },
  plugins: [],
};

export default config;
