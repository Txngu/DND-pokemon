import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // PokéGear / Rotom Phone palette
        rotom: {
          red: "#E4362B",
          "red-dark": "#8F1A17",
          "red-light": "#FF6A52",
        },
        screen: {
          ink: "#121022",
          deep: "#1B1832",
          surface: "#242145",
        },
        volt: {
          DEFAULT: "#FFD23F",
          dim: "#C79E1F",
        },
        circuit: {
          teal: "#34E4C0",
          violet: "#8B7CFF",
        },
        mist: "#EDEBFF",
      },
      fontFamily: {
        display: ["'Rubik'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        phone: "3.25rem",
        screen: "2.25rem",
      },
      boxShadow: {
        "phone-bezel": "0 30px 60px -20px rgba(0,0,0,0.65), inset 0 0 0 2px rgba(255,255,255,0.06)",
        glass: "0 8px 32px rgba(0,0,0,0.35)",
      },
      backgroundImage: {
        "rotom-gradient": "radial-gradient(120% 120% at 50% -10%, #3a2e63 0%, #14101f 55%, #0a0812 100%)",
        "screen-noise": "linear-gradient(160deg, rgba(139,124,255,0.12), rgba(52,228,192,0.06))",
      },
      keyframes: {
        "unlock-swipe": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-100%)", opacity: "0" },
        },
        "icon-pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(0.9)" },
          "100%": { transform: "scale(40)" , opacity: "0"},
        },
        "float-slow": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "float-slow": "float-slow 4s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
