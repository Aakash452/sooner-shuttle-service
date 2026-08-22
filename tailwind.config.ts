import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        crimson: {
          DEFAULT: "#841617",
          dark: "#5c0f10",
          light: "#a8262a",
        },
        gold: {
          DEFAULT: "#FDB927",
          dark: "#caa02b",
        },
        ink: {
          DEFAULT: "#0b0b0d",
          soft: "#161619",
          card: "#1c1c20",
          line: "#2a2a30",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Impact", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        goldglow: "0 0 0 1px rgba(253,185,39,0.25), 0 8px 24px rgba(253,185,39,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
