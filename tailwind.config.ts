import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        "paper-deep": "var(--paper-deep)",
        card: "var(--card)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-muted": "var(--ink-muted)",
        "ink-faint": "var(--ink-faint)",
        border: "var(--border)",
        "border-soft": "var(--border-soft)",
        pink: "var(--pink)",
        "pink-soft": "var(--pink-soft)",
        "pink-deep": "var(--pink-deep)",
        positive: "var(--positive)",
        "positive-soft": "var(--positive-soft)",
        negative: "var(--negative)",
        "negative-soft": "var(--negative-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        // Main Dashboard (lgeral) palette - additive, do not remove
        steel: "#6b7280",
        cloud: "#f4f4f4",
        sand: "#fdfaf7",
        accent: { DEFAULT: "#ec4899", soft: "#fce7f3" },
        good: "#10b981",
        warn: "#f59e0b",
        bad: "#ef4444",
        bar: {
          rose: "#ec4899",
          pink: "#f472b6",
          orange: "#fb923c",
          coral: "#f87171",
          green: "#10b981",
          teal: "#0d9488",
          amber: "#f59e0b",
          violet: "#8b5cf6",
          blue: "#3b82f6",
          navy: "#1e3a8a",
          slate: "#475569",
        },
        "card-border": "#ececec",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
