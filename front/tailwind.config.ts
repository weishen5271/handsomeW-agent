import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        luminaBg: "#f8f9fa",
        luminaText: "#111111",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(17, 17, 17, 0.05)",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans SC", "sans-serif"],
        title: ["Outfit", "Inter", "Noto Sans SC", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
