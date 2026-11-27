import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        haunt: {
          bg: "#07090F",
          card: "#0F1420",
          border: "#1F2937",
          spectral: "#A855F7",
          safe: "#22C55E",
          uneasy: "#F59E0B",
          danger: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
