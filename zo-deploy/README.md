# Running the LinkedIn CDP scraper + enrichment

Two ways to host the logged-in-Chromium scraper:
- **Zo Computer** — manual service setup (sections below).
- **Docker** (Railway / Fly / VPS) — single image, `zo-deploy/Dockerfile` (see "Docker deploy").

Either way the architecture is identical; only the hosting differs.

## Docker deploy (Railway / Fly / VPS)

One image bundles Chromium + Xvfb + x11vnc + noVNC + the scraper API, fronted by nginx on a
**single public port** (path-routed: `/` → noVNC viewer, `/run` + `/health` → scraper API).

**Hosting requirement — read this:** the LinkedIn session lives in the Chrome profile on a
**persistent `/data` volume**. The host must keep a **long-running container with a persistent
volume**. ✅ Railway, Fly.io, a VPS. ❌ **Cloudflare Workers/Pages** (no containers at all) and
❌ **Cloudflare Containers** (ephemeral disk → you'd lose the login + redo 2FA on every redeploy).

Build context is the **repo root**:
```bash
docker build -f zo-deploy/Dockerfile -t enrich-scraper .
# local test:
cd zo-deploy && docker compose up --build
open http://localhost:8080/vnc.html      # password = VNC_PASSWORD from zo-deploy/.env
```

Required env (set as platform variables, or zo-deploy/.env for compose):
`MONGODB_URI`, `ADMIN_MONGO_URI`, `GITHUB_TOKEN`, `ZO_SCRAPER_SECRET`, `VNC_PASSWORD`.
Mount a volume at **`/data`**. Public port comes from `$PORT` (nginx binds it).

After deploy:
1. Open `https://<your-domain>/vnc.html` → enter `VNC_PASSWORD` → sign into LinkedIn + 2FA once.
2. `https://<your-domain>/health` → `{"ok":true,"cdp":true}`.
3. Point the website at it: `ZO_SCRAPER_URL=https://<your-domain>` + matching `ZO_SCRAPER_SECRET`.

### Railway quickstart
1. New service → Deploy from this repo; set Dockerfile path `zo-deploy/Dockerfile` (root build context).
2. Add a **Volume** mounted at `/data`.
3. Add the env vars above. Railway injects `PORT` automatically.
4. Generate a domain; use it as `ZO_SCRAPER_URL` on the website.

## The core idea

Your three flows — **builder enrichment**, **founder enrichment**, and **founder-company
enrichment** — all *connect to an already-running Chrome* at
`CHROME_CDP_URL=http://127.0.0.1:9222`. None of them launch Chrome or handle login;
they assume a Chrome that's already signed into LinkedIn.

Zo's **native browser** (Settings → Tools → Open Zo's browser) is where a human signs in,
but Zo does **not** expose that browser's CDP port to scripts. So we run **our own
Chromium** on the Zo box with `--remote-debugging-port=9222`, behind a virtual display
that you can view through a web page (noVNC). You sign into LinkedIn (and pass 2FA) in
that window once; the scrapers attach to the exact same browser over CDP. The Chrome
profile lives on Zo's persistent disk, so the session survives restarts.

```
 You (browser)  ──https──►  Zo noVNC viewer URL  ──►  Chromium (headed, on Xvfb)
                                                          │  remote-debugging :9222 (loopback)
 enrich-*-cdp.mjs  ──CDP──►  127.0.0.1:9222  ◄───────────┘
        │
        └──► writes/queues updates ──► MongoDB (MONGODB_URI)
```

---

## What YOU do manually (one-time, ~15 min)

1. **Provision the Zo computer** and get the repo onto it (persistent `/home/workspace`):
   ```bash
   cd /home/workspace
   git clone <this-repo-url> && cd <repo>
   ```
2. **Run setup** (installs Chromium + Xvfb + VNC + noVNC + Node 20, sets a VNC password):
   ```bash
   bash zo-deploy/setup.sh
   ```
   It will prompt you to **choose a VNC password** — remember it.
3. **Add secrets**: copy `zo-deploy/.env.zo.example` → `zo-deploy/.env` and paste your
   `MONGODB_URI` / `ADMIN_MONGO_URI`.
4. **Register three Zo services** (Settings → Tools / Sites dashboard → register service):
   | label            | mode    | entrypoint                          | port  | purpose |
   |------------------|---------|-------------------------------------|-------|---------|
   | `linkedin-chrome`| process | `bash zo-deploy/start-chrome-cdp.sh`| —     | logged-in Chromium + CDP :9222 |
   | `linkedin-vnc`   | http    | `bash zo-deploy/start-vnc.sh`       | 6080  | you view/sign in via the Proxy URL |
   | `zo-scraper`     | http    | `node zo-deploy/server.mjs`         | 6090  | the website calls this to scrape |

   Working dir for all three: the repo root. Set the `.env` values as the service
   environment (or they're loaded from `zo-deploy/.env`). Zo auto-restarts these on boot.
   The **Proxy URL of `zo-scraper`** is what the website uses (see "Website integration").
5. **Sign into LinkedIn (the only truly manual, human step):** open the **Proxy URL** Zo
   gives the `linkedin-vnc` http service → noVNC viewer (enter your VNC password) → you'll
   see Chromium on the LinkedIn page → **log in and complete 2FA**. Close nothing; just
   leave the service running. The session persists in `/home/workspace/.linkedin-chrome-profile`.

That's it for manual work. **2FA only happens here, the first time** (and again only if
LinkedIn later challenges/expires the session — re-open the viewer and re-auth).

---

## What's AUTOMATED (scripts / Zo agent do it)

- Installing Chromium, virtual display, VNC, Node — `zo-deploy/setup.sh`.
- Keeping a logged-in Chromium alive with CDP on 9222 — `start-chrome-cdp.sh` (Zo service).
- The viewer bridge — `start-vnc.sh` (Zo service).
- Running enrichment against that Chromium — `run-enrichment.sh`:
  ```bash
  bash zo-deploy/run-enrichment.sh builder --first
  bash zo-deploy/run-enrichment.sh builder --all --limit=25 --resume
  bash zo-deploy/run-enrichment.sh builder --linkedin-url=https://www.linkedin.com/in/foo
  bash zo-deploy/run-enrichment.sh founder-company   # founder company "About" scrape
  bash zo-deploy/run-enrichment.sh apply --limit=50  # push dry-run artifacts into Mongo
  ```
- **Scheduling** (optional): wrap `run-enrichment.sh ... --resume` in a Zo **Automation**
  (cron) to drip through profiles on a schedule and stay under LinkedIn rate limits.

---

## Website integration (the onboarding bridge)

The deployed website triggers scraping by calling the `zo-scraper` service instead of
running scripts locally. Two pieces:

1. On the **website** (Vercel env), set:
   ```
   ZO_SCRAPER_URL=https://<zo-scraper-proxy-url>
   ZO_SCRAPER_SECRET=<same secret as zo-deploy/.env>
   ```
2. The onboarding routes (`src/pages/api/onboarding/linkedin-enrichment.ts` and
   `founder-company-enrichment.ts`) call `POST $ZO_SCRAPER_URL/run` with
   `{ script, args }` and a `Bearer` token, then apply the returned artifact to Mongo
   exactly as they do today. **When `ZO_SCRAPER_URL` is unset they fall back to the
   current local behavior**, so dev on your laptop is unchanged.
   *(This route change is applied separately — see the chat thread.)*

GitHub enrichment needs no browser: it uses `GITHUB_TOKEN` against `api.github.com`.
Set `GITHUB_TOKEN` wherever the github enricher runs.

## Founder vs builder, in this setup

- **Builder & founder profile enrichment** both run through
  `enrich-builder-linkedin-cdp.mjs` (the website API routes `founder` to the same CDP
  script with the founder's LinkedIn URL). Use `run-enrichment.sh builder ...`.
- **Founder *company*** "About" page → `run-enrichment.sh founder-company ...`.
- All three need the one logged-in Chromium above — no extra setup per flow.

---

## Notes / guardrails

- **Never expose port 9222 publicly.** It's bound to `127.0.0.1`. Only the noVNC http
  service (6080) is public, and it's password-protected — keep the Proxy URL private.
- **Rate limits / bans:** scrape gently. Keep the script defaults (`--wait-ms`, `--delay-ms`),
  prefer `--limit` + `--resume` batches over `--all` in one shot, and run during reasonable
  hours. A logged-in residential-style session is your scarcest resource.
- **Re-login cadence:** LinkedIn sessions can last weeks but will eventually challenge.
  When a run reports `session_expired` / login redirects, reopen the noVNC viewer and re-auth.
- **Lighter alternative (Voyager-only):** if you ever only need *builder* profile fields
  (not the founder-company About scrape), you can skip Chromium entirely: sign into Zo's
  native browser, copy `li_at` + `JSESSIONID` cookies into `zo-deploy/.env`, and the builder
  enricher's Voyager API path works cookie-only. The CDP browser above is required for the
  full set, so it's the recommended primary path.
```
