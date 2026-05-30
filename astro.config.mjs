import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import react from "@astrojs/react";

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
  adapter: vercel({
    edgeMiddleware: false,
    analytics: false,
    maxDuration: 60,
  }),
  vite: {
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
