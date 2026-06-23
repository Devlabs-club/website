/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}",
    "!./scratch/**",
    "./public/**/*.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        seasons: ['"the-seasons"', 'sans-serif'],
      },
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
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          base: "hsl(8 8% 3.5%)",
          elevated: "hsl(12 8% 5%)",
        },
        glow: {
          orange: "hsl(24 95% 56%)",
          grey: "hsl(228 4% 53%)",
        },
      },
      boxShadow: {
        glass: "0 8px 32px rgb(0 0 0 / 0.25), inset 0 1px 0 rgb(255 255 255 / 0.04)",
        "glass-lg": "0 24px 80px rgb(0 0 0 / 0.4)",
      },
      keyframes: {
        "shimmer-slide": {
          to: { transform: "translate(calc(100cqw - 100%), 0)" },
        },
        "spin-around": {
          "0%": { transform: "translateZ(0) rotate(0)" },
          "15%, 35%": { transform: "translateZ(0) rotate(90deg)" },
          "65%, 85%": { transform: "translateZ(0) rotate(270deg)" },
          "100%": { transform: "translateZ(0) rotate(360deg)" },
        },
      },
      animation: {
        "shimmer-slide":
          "shimmer-slide var(--speed, 3s) ease-in-out infinite alternate",
        "spin-around":
          "spin-around calc(var(--speed, 3s) * 2) infinite linear",
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
