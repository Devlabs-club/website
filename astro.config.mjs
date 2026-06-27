import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import cloudflare from "@astrojs/cloudflare";
import vercel from "@astrojs/vercel";
import react from "@astrojs/react";

const useVercelAdapter =
  process.env.ASTRO_ADAPTER === "vercel" || process.env.VERCEL === "1";

/** Native / heavy server deps — keep out of Rollup SSR bundles. */
const SSR_EXTERNAL = [
  "@xenova/transformers",
  "mongoose",
  "mongodb",
  "pdf-parse",
  "nodemailer",
  "bcryptjs",
  "jsonwebtoken",
  "@workos-inc/node",
  "cloudinary",
  "@sendgrid/mail",
  "@sendgrid/client",
  "@langchain/core",
  "@langchain/mongodb",
  "pdf-lib",
  "@pdf-lib/fontkit",
  "qrcode",
  "nunjucks",
  "@dqbd/tiktoken",
  "sharp",
  "onnxruntime-node",
];

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
  image: {
    service: {
      entrypoint: "astro/assets/services/noop",
    },
  },
  adapter: useVercelAdapter
    ? vercel({
        edgeMiddleware: false,
        analytics: false,
        maxDuration: 60,
      })
    : cloudflare({
        platformProxy: {
          enabled: true,
        },
      }),
  vite: {
    server: {
      // Prevent the browser from caching stale Vite module URLs between dev refreshes.
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    },
    // Lock dependency pre-bundling to a fixed list so cache invalidation (504 Outdated
    // Optimize Dep) does not happen on every config save. react-markdown is lazy-loaded
    // in ChatMarkdown.tsx — do not pre-bundle it (aria-query hangs esbuild for minutes).
    optimizeDeps: {
      noDiscovery: true,
      include: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@astrojs/react/client.js",
      ],
      exclude: ["@xenova/transformers", "react-markdown"],
    },
    ssr: {
      noExternal: ["react-tweet"],
      external: SSR_EXTERNAL,
    },
    build: {
      sourcemap: false,
      target: "es2022",
    },
  },
});
