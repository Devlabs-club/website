import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import react from "@astrojs/react";

export default defineConfig({
  server: {
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "e5525193d5b7.ngrok-free.app",
      "a283ec87ba64.ngrok-free.app",
    ],
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