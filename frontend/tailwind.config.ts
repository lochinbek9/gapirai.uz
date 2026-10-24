import type { Config } from "tailwindcss";

// Metro tizimi (DESIGN.md): ranglar CSS o'zgaruvchilaridan -- yorug'/qorong'i
// rejimda bir xil nomlar, qiymatlar globals.css'da.
const metro = (name: string) => `rgb(var(--m-${name}) / <alpha-value>)`;

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
        metro: {
          ground: metro("ground"),
          surface: metro("surface"),
          ink: metro("ink"),
          muted: metro("muted"),
          rule: metro("rule"),
          plaque: metro("plaque"),
          "plaque-ink": metro("plaque-ink"),
          brass: metro("brass"),
          red: metro("red"),
          "red-ink": metro("red-ink"),
          blue: metro("blue"),
          "blue-ink": metro("blue-ink"),
          green: metro("green"),
          "green-ink": metro("green-ink"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        sign: ["var(--font-sign)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        plate: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
