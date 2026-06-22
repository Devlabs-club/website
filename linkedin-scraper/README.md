# LinkedIn CDP scraper service

This folder contains the remote scraper container used by onboarding enrichment.
It runs a persistent Chromium session, exposes noVNC for manual login, and exposes
an authenticated `/run` API for the website.

## Architecture

One image bundles:
- Chromium with remote debugging on `127.0.0.1:9222`.
- Xvfb, x11vnc, and noVNC for viewing and signing in.
- A small Node HTTP API at `/run` and `/health`.
- nginx on the public `$PORT`, routing `/vnc.html` to noVNC and `/run` to the API.

The LinkedIn session is stored in `/data/chrome-profile`, so the host must provide
a persistent volume mounted at `/data`.

## Environment

Required:

```bash
MONGODB_URI=...
ADMIN_MONGO_URI=...
GITHUB_TOKEN=...
LINKEDIN_SCRAPER_SECRET=...
VNC_PASSWORD=...
```

The website should use:

```bash
LINKEDIN_SCRAPER_URL=https://<scraper-domain>
LINKEDIN_SCRAPER_SECRET=<same secret as the scraper service>
```

## Railway

1. Set the Dockerfile path to `linkedin-scraper/Dockerfile`.
2. Mount a persistent volume at `/data`.
3. Add the required environment variables.
4. Generate or keep a public domain.
5. Open `https://<scraper-domain>/vnc.html`, enter `VNC_PASSWORD`, and sign into LinkedIn.
6. Check `https://<scraper-domain>/health`; it should return `{"ok":true,"cdp":true}`.

The live noVNC URL for the current Railway service is:

```text
https://enrich-scraper-production.up.railway.app/vnc.html
```

## Local Docker

Build from the repo root:

```bash
docker build -f linkedin-scraper/Dockerfile -t enrich-scraper .
```

Run with compose:

```bash
cd linkedin-scraper
docker compose up --build
open http://localhost:8080/vnc.html
```

## API

Health check:

```bash
curl https://<scraper-domain>/health
```

Run an allowed CDP script:

```bash
curl -X POST https://<scraper-domain>/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LINKEDIN_SCRAPER_SECRET" \
  -d '{"script":"enrich-builder-linkedin-cdp.mjs","args":["--linkedin-url=https://www.linkedin.com/in/example/","--json"]}'
```

Allowed scripts:
- `enrich-builder-linkedin-cdp.mjs`
- `enrich-founder-company-linkedin-cdp.mjs`

## Guardrails

Keep port `9222` private. Re-authenticate through noVNC when LinkedIn expires or
challenges the session. Keep enrichment batches small and use the script wait/delay
defaults.
