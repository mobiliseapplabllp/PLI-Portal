import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdfa", 100: "#ccfbf1", 500: "#14b8a6",
          600: "#0d9488", 700: "#0f766e", 800: "#115e59",
        },
        surface: {
          DEFAULT: "#ffffff", dark: "#111827",
          muted: "#f8fafc", "muted-dark": "#1f2937",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06)",
      },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
};
export default config;
