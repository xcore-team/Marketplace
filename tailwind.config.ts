import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["Inter", "sans-serif"],
        mono:    ["JetBrains Mono", "monospace"],
        display: ["Syne", "sans-serif"],
      },
      colors: {
        admin: {
          // ── Backgrounds ────────────────────────────────────────────
          bg:        "#06080f",
          surface:   "#0b0f1c",
          "surface-2": "#111827",
          border:    "rgba(255,255,255,0.07)",

          // ── xcore identity ─────────────────────────────────────────
          xcore:     "#00C896",
          "xcore-dim":  "rgba(0,200,150,0.12)",
          "xcore-glow": "rgba(0,200,150,0.25)",
          "xcore-mint": "#7fffd4",

          // ── Functional signals ─────────────────────────────────────
          ok:        "#00C896",
          warn:      "#f59e0b",
          danger:    "#ef4444",
          pending:   "#38bdf8",

          // ── Trust levels ───────────────────────────────────────────
          "trust-sandboxed": "#64748b",
          "trust-verified":  "#7fffd4",
          "trust-trusted":   "#00C896",

          // ── Text scale ─────────────────────────────────────────────
          "text-1": "#f1f5f9",
          "text-2": "#94a3b8",
          "text-3": "#475569",
        },
      },
      backgroundImage: {
        "xcore-gradient": "linear-gradient(135deg, #00C896 0%, #7fffd4 100%)",
        "surface-gradient": "linear-gradient(180deg, #0b0f1c 0%, #06080f 100%)",
      },
      boxShadow: {
        "xcore":       "0 0 20px rgba(0,200,150,0.25)",
        "xcore-sm":    "0 0 10px rgba(0,200,150,0.15)",
        "xcore-lg":    "0 0 40px rgba(0,200,150,0.30)",
        "surface":     "0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
        "danger":      "0 0 16px rgba(239,68,68,0.25)",
        "warn":        "0 0 16px rgba(245,158,11,0.25)",
      },
      animation: {
        "fade-in":     "fadeIn 0.3s ease-out forwards",
        "slide-up":    "slideUp 0.3s ease-out forwards",
        "slide-in":    "slideIn 0.25s ease-out forwards",
        "pulse-slow":  "pulse 3s ease-in-out infinite",
        "pulse-dot":   "pulseDot 2s ease-in-out infinite",
        "pulse-glow":  "pulseGlow 3s ease-in-out infinite",
        "shimmer":     "shimmer 1.8s linear infinite",
        "spin-slow":   "spin 4s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%":   { opacity: "0", transform: "translateX(-8px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%":      { opacity: "0.4", transform: "scale(0.85)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 10px rgba(0,200,150,0.15)" },
          "50%":      { boxShadow: "0 0 24px rgba(0,200,150,0.40)" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      borderRadius: {
        "4xl": "2rem",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-expo":  "cubic-bezier(0.7, 0, 0.84, 0)",
      },
    },
  },
  plugins: [],
};

export default config;
