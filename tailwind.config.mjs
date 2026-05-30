/** @type {import('tailwindcss').Config} */
export default {
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
    },
  },
  plugins: [require("@tailwindcss/forms"), require("tailwindcss-animate"), require("@tailwindcss/typography")],
};
