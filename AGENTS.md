# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
The main product is the **DevLabs** website / "DevLabs OS" — an **Astro 5 (SSR) + React 19 + Tailwind** app (`galactic-gravity` in `package.json`). It is a talent marketplace connecting startup founders with student builders. Sub-directories `workers/`, `linkedin-scraper/`, `packages/agent-wrapped/`, and `agent/` are auxiliary/experimental and are NOT needed to run or test the main website.

### Package manager & common commands
- Package manager is **bun** (see `vercel.json` and `.conductor/settings.toml`). Do NOT use npm/pnpm even though extra lockfiles exist.
- Dev server: `bun run dev` → `astro dev` on **port 4321** (`astro.config.mjs`). This is the primary dev workflow.
- Tests: `bun test` (tests use the built-in `bun:test`; there is no separate test runner installed). Test files live at `src/lib/**/**.test.ts`.
- Build: `bun run build` (defaults to the Cloudflare adapter). Use `ASTRO_ADAPTER=vercel bun run build` to build with the Vercel adapter that matches production (`vercel.json`).
- There is no working lint/format setup (`.trunk/` symlinks are broken; no eslint/biome/prettier config). `astro check` is not wired up (no `@astrojs/check` installed).

### Local MongoDB is required for DB-backed routes (non-obvious)
MongoDB Community 8.0 is installed in the image but is **not** a managed service — start it manually before testing anything beyond static marketing pages:

```bash
mongod --dbpath /var/lib/mongodb --bind_ip 127.0.0.1 --port 27017
```

Gotchas discovered during setup:
- The homepage (`src/pages/index.astro`) is prerendered, but it makes a **client-side** `fetch("/api/builders/github-contributions")`. That API route imports `src/lib/mongodb.ts`, which throws at module load when `MONGODB_URI` is unset. Result: `curl /` returns 200, but in a **browser** an Astro dev error overlay ("Please define the MONGODB_URI environment variable") appears. Running local MongoDB removes the overlay.
- `connectDB()` and `connectAdminDB()` both use the single default mongoose connection (`mongoose.connect`). Therefore `MONGODB_URI` and `ADMIN_MONGO_URI` **must be the same connection string** or mongoose throws `Can't call openUri() on an active connection with different connection strings`. `MOMENTUM_MONGODB_URI` uses a separate `createConnection` and may differ.

### Local env file (gitignored)
Local dev reads `.env` (via `src/lib/loadEnv.ts`). It is gitignored, so recreate it if missing:

```
WEBSITE_ROOT=http://localhost:4321
WORKOS_REDIRECT_URI=http://localhost:4321/api/auth/oauth/callback
API_PROXY_ORIGIN=
MONGODB_URI=mongodb://127.0.0.1:27017/devlabs
ADMIN_MONGO_URI=mongodb://127.0.0.1:27017/devlabs
MOMENTUM_MONGODB_URI=mongodb://127.0.0.1:27017/momentum
```

### External services (optional for local dev)
All third-party integrations are lazy — they only throw when the specific flow is invoked, not at boot. None are required to run the dev server or test the public marketing surface (`/`, `/about`, `/events`, `/sponsor`, `/momentum`) or public write endpoints like `POST /api/remind-me`. Add the relevant secrets from `.env.example` only when testing those flows:
- **WorkOS** — auth/signup + all `/auth/*`, `/founder/*`, `/builder/*` authenticated flows.
- **Twilio Verify** — phone verification during onboarding.
- **Stripe** — founder billing/checkout.
- **OpenRouter / Exa** — AI chat, talent search, conversational agent.
- **GitHub token** — populates the homepage GitHub contribution wall.
- **LinkedIn scraper (Railway) / AgentPhone / BlueBubbles / SendGrid / Cloudinary** — enrichment, messaging, email, media.
