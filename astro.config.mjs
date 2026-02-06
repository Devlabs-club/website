import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import react from "@astrojs/react";

export default defineConfig({
  server: {
    allowedHosts: true,
    host: true,
    port: 4321,
  },
  preview: {
    port: 4321,
    host: true,
  },
  integrations: [tailwind(), react()],
  output: "server",
  adapter: vercel({
    edgeMiddleware:false,
    analytics: true,
    maxDuration: 60
  }),
  compilerOptions: {
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
});