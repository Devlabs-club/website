# iMessage Gateway — BlueBubbles Pilot Setup

The Builder Agent talks to builders over iMessage. For the pilot we use **BlueBubbles**,
a free server app running on this Mac (signed into iMessage as `hi@geekydan.dev`).
Because BlueBubbles and the Astro dev server both run on this machine, **no tunnel
(ngrok/Cloudflare) is required** — everything is localhost.

```
Builder's iPhone ──iMessage──> this Mac (iMessage app)
                                   │
                          BlueBubbles Server (:1234)
                                   │ webhook (New Messages)
                                   ▼
   http://localhost:4321/api/imessage/webhook   (Astro)
                                   │
                          imessageGateway.handleInbound
                                   │
                          runBuilderAgentTurn  (existing agent)
                                   │ reply text
                                   ▼
        POST :1234/api/v1/message/text  ──iMessage──> Builder
```

## 1. Install BlueBubbles Server
```bash
brew install --cask bluebubbles
open -a BlueBubbles
```
On first launch, grant the macOS permissions it asks for:
- **Full Disk Access** (to read the Messages database) — System Settings → Privacy & Security → Full Disk Access → enable BlueBubbles.
- **Automation / Accessibility** (to send messages).
Restart BlueBubbles after granting.

## 2. Configure the server
In the BlueBubbles app:
1. Set a **server password** → put it in `.env` as `BLUEBUBBLES_PASSWORD`.
2. Note the local API port (default **1234**) → `BLUEBUBBLES_SERVER_URL=http://localhost:1234`.
3. (Recommended) Enable the **Private API** for typing indicators / reliable sending.
   This requires disabling SIP and installing the helper bundle — follow the in-app
   "Private API" guide. Without it, sending falls back to AppleScript (still works).

## 3. Point the webhook at Astro
BlueBubbles app → **Settings → API & Webhooks → Webhooks → Add**:
- **URL:** `http://localhost:4321/api/imessage/webhook?secret=<BLUEBUBBLES_WEBHOOK_SECRET>`
  (drop the `?secret=` part if you leave `BLUEBUBBLES_WEBHOOK_SECRET` unset)
- **Events:** check **New Messages** (only).

## 4. Env vars
Add to `.env` / `.dev.vars`:
```
IMESSAGE_PROVIDER=bluebubbles
BLUEBUBBLES_SERVER_URL=http://localhost:1234   # or your Cloudflare tunnel URL
BLUEBUBBLES_PASSWORD=...
BLUEBUBBLES_IMESSAGE_ADDRESS=hi@geekydan.dev   # Apple ID on the Mac; builders text this
BLUEBUBBLES_WEBHOOK_SECRET=...        # optional; ?password= also works
BLUEBUBBLES_SEND_METHOD=apple-script  # or private-api
```

When using a remote tunnel (e.g. Cloudflare), point the BlueBubbles webhook at:
`https://<your-app>/api/imessage/webhook?password=<BLUEBUBBLES_PASSWORD>`

## 5. Run + test
```bash
npm run dev          # Astro on :4321
```
From another phone, text the Apple ID's number/email. You should see the agent reply.
Watch logs for `[imessageGateway]` / `[imessage/webhook]`.

Quick send test (bypasses iMessage inbound):
```bash
curl -X POST "http://localhost:1234/api/v1/message/text?password=$BLUEBUBBLES_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"chatGuid":"iMessage;-;+1XXXXXXXXXX","tempGuid":"t1","message":"test from devlabs","method":"private-api"}'
```

## Files
- `src/pages/api/imessage/webhook.ts` — inbound route (alias)
- `src/pages/api/builder/claim/message-webhook.ts` — inbound route (provider-aware)
- `src/lib/messaging/getProvider.ts` — selects BlueBubbles vs AgentPhone via `IMESSAGE_PROVIDER`
- `src/lib/messaging/providers/bluebubbles.ts` — BlueBubbles send/parse
- `src/lib/messaging/bluebubblesClient.ts` — outbound REST client
- `src/lib/messaging/imessageGateway.ts` — orchestration (resolve → agent → reply)
- `src/lib/messaging/builderResolver.ts` — phone/email → BuilderProfile
- `src/models/talent/ImessageConversation.ts` — per-handle thread + history + dedupe

## Swapping providers
Set `IMESSAGE_PROVIDER=agentphone` to revert to AgentPhone without code changes.
Default auto-detects BlueBubbles when `BLUEBUBBLES_*` env vars are present.

## Migrating to Spectrum-TS later
Implement the same `MessageProvider` interface in `src/lib/messaging/providers/spectrum.ts`
and swap the import in `webhook.ts`. Nothing in the agent core changes.
