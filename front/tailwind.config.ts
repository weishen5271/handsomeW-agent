import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Airtable Blue - Primary CTA
        primary: {
          DEFAULT: "#1b61c9",
          hover: "#1648a3",
          light: "#5d8ad1",
        },
        // Deep Navy - Primary text
        navy: {
          DEFAULT: "#181d26",
          secondary: "#333333",
          muted: "rgba(4, 14, 32, 0.69)",
        },
        // Surface colors
        surface: {
          white: "#ffffff",
          raised: "#f8fafc",
        },
        // Border
        border: "#e0e2e6",
        // Semantic
        success: "#006400",
        // Haas/Groot inspired text colors
        "text-primary": "#181d26",
        "text-secondary": "#333333",
        "text-weak": "rgba(4, 14, 32, 0.69)",
      },
      boxShadow: {
        "blue-tint": "rgba(45,127,249,0.28) 0px 1px 3px",
        "card": "0 8px 24px rgba(17, 17, 17, 0.05)",
        "ambient": "rgba(15,48,106,0.05) 0px 0px 20px",
        "layer": "rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "sans-serif"],
        display: ["Outfit", "Inter", "Noto Sans SC", "sans-serif"],
      },
      letterSpacing: {
        tight: "0.08px",
        wide: "0.12px",
        widest: "0.28px",
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "12px",
        card: "16px",
      },
    },
  },
  plugins: [],
} satisfies Config;
