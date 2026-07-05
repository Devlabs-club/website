# Devlabs Website

A website for the Devlabs Club at Arizona State University.

## Production DevLabs OS

The public landing page routes hiring CTAs, including **start now**, to
`/auth/signup`. Signup then branches through `/auth/select-role` into the
founder and builder product flows:

- Founder: `/auth/signup` -> `/auth/select-role` -> `/founder/onboarding/*` -> `/founder/home`
- Builder: `/auth/signup` -> `/auth/select-role` -> `/builder/home`

Production runs on the Vercel project `devlabs-website` and is aliased to:

- `https://www.devlabs.club`
- `https://devlabs.club`

Deploy production from this workspace with:

```bash
vercel deploy --prod --yes --scope devlabs-projects-897ae3e7
```

## Production Environment Checklist

These variables must be present on the Vercel `devlabs-website` **Production**
environment for the product flows and integrations to work. Store only encrypted
values in Vercel; do not commit secret values.

- `MONGODB_URI`
- `ADMIN_MONGO_URI`
- `JWT_SECRET`
- `WEBSITE_ROOT`
- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`
- `WORKOS_COOKIE_PASSWORD`
- `WORKOS_REDIRECT_URI`
- `GITHUB_TOKEN`
- `LINKEDIN_SCRAPER_URL`
- `LINKEDIN_SCRAPER_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
- `AGENTPHONE_API_KEY`, `AGENTPHONE_FROM_NUMBER`, `AGENTPHONE_WEBHOOK_SECRET`
- `EXA_API_KEY`
- `OPENROUTER_API_KEY`

Optional or fallback variables:

- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `OPENROUTER_MODEL_CHAT`
- `OPENROUTER_MODEL_EMBEDDING`
- `OPENROUTER_HTTP_REFERER`
- `OPENROUTER_APP_NAME`
- `BUILDER_CLAIM_MESSAGE_WEBHOOK_URL`
- `BUILDER_CLAIM_MESSAGE_WEBHOOK_SECRET`
- `BUILDER_CLAIM_INBOUND_WEBHOOK_SECRET`

The LinkedIn scraper should point at the remote scraper service:

```text
https://enrich-scraper-production.up.railway.app
```

The app prefers `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` for Twilio Verify
when both account credentials and API key credentials are configured. API key
credentials are used only as a fallback.

## Production Smoke Checks

After changing production env vars or auth/product routing, redeploy first, then
run the product flow smoke test from the temporary Playwright runner:

```bash
cd .context/playwright-runner
npx playwright test prod-flow.spec.ts --browser=chromium --reporter=line
```

Expected result:

```text
2 passed
```

The smoke test covers:

- Landing page **start now** link
- Signup
- Founder role selection, onboarding, home, and role workspace creation
- Builder role selection and dashboard load

Quick integration checks:

- `GET https://www.devlabs.club/api/builders/github-contributions` should return
  `{ "success": true, ... }`.
- `GET https://enrich-scraper-production.up.railway.app/health` should return
  `{ "ok": true, "cdp": true }`.
- AgentPhone `/v1/messages`, Exa search,
  and OpenRouter chat completion should all return HTTP 200 with valid
  credentials.

## Conversational Agent (OpenRouter)

Set these environment variables to enable AI-generated conversational replies:

- `OPENROUTER_API_KEY=`
- `OPENROUTER_MODEL_CHAT=google/gemini-2.5-flash` (default if unset)
- `OPENROUTER_HTTP_REFERER=` (optional)
- `OPENROUTER_APP_NAME=` (optional)
