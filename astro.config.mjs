import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare"; // Add this

export default defineConfig({
  integrations: [tailwind(), react()],
  site: "https://sohamd22.github.io/",
  base: "/devlabs-website",
  output: "hybrid",
  adapter: cloudflare(),
});