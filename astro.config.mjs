import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import react from "@astrojs/react";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [react(), tailwind()],
  site: "https://sohamd22.github.io/",
  base: "/devlabs-website",
  output: "server",
  adapter: cloudflare(),

  // Add server configuration to improve stability
  server: {
    port: 3000,
    host: false, // Set to 'true' if you need to expose to network
    hmr: {
      // Reduce aggressive reloading
      overlay: true,
      clientPort: 3000,
    },
  },

  // Configure Vite to handle .env files better
  vite: {
    optimizeDeps: {
      // Force exclude problematic dependencies if needed
      exclude: [],
    },
    server: {
      // Reduce watch sensitivity for certain files
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**"],
      },
    },
  },
});
