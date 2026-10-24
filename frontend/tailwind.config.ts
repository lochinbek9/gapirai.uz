import type { Config } from "tailwindcss";

// Dizayn tizimi (DESIGN.md): ranglar CSS o'zgaruvchilaridan -- yorug'/qorong'i
// rejimda bir xil nomlar, qiymatlar globals.css'da.
const ui = (name: string) => `rgb(var(--ui-${name}) / <alpha-value>)`;

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
