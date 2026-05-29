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
    edgeMiddleware: false,
    analytics: false,
    maxDuration: 60,
  }),
  compilerOptions: {
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  },
  vite: {
    // Heavy deps + full discovery can hang esbuild for many minutes
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "react-markdown",
        "style-to-js",
        "style-to-object",
      ],
      exclude: ["@xenova/transformers"],
    },
    ssr: {
      noExternal: ["react-tweet", "react-markdown", "style-to-js", "style-to-object"],
      external: ["@xenova/transformers"],
    },
    build: {
      rollupOptions: {
        external: ["@xenova/transformers"],
      },
    },
  },
});