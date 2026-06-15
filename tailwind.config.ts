import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#05070d",
          soft: "#0a0f1c",
          panel: "#0b1322",
          raised: "#0e1830",
        },
        line: {
          DEFAULT: "#13263f",
          bright: "#1d3e63",
        },
        ink: {
          DEFAULT: "#cfe8ff",
          dim: "#7f9dc4",
          faint: "#4f6a86",
        },
        cyber: {
          cyan: "#00e5ff",
          blue: "#2b7bff",
          sky: "#38bdf8",
          violet: "#9b6bff",
          green: "#27e0a4",
          amber: "#ffb454",
          red: "#ff4d6d",
        },
      },
      fontFamily: {
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(0,229,255,0.18), 0 0 22px rgba(0,229,255,0.12)",
        "glow-strong":
          "0 0 0 1px rgba(0,229,255,0.4), 0 0 30px rgba(0,229,255,0.28)",
      },
      keyframes: {
        blink: {
          "0%,49%": { opacity: "1" },
          "50%,100%": { opacity: "0" },
        },
        flicker: {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.86" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        blink: "blink 1.1s steps(1) infinite",
        flicker: "flicker 4s ease-in-out infinite",
        scan: "scan 7s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
