# Builder Messaging — AgentPhone Setup

Builder onboarding and the profile agent use [AgentPhone](https://docs.agentphone.ai) for SMS/MMS/iMessage (replaces the BlueBubbles Mac bridge).

```
Builder taps "Open Messages" → sends hi devlabs:TOKEN
        ↓
AgentPhone inbound webhook → POST /api/builder/claim/message-webhook
        ↓
advanceClaimConversation → dossier + agent kickoff
        ↓
Agent replies via AgentPhone POST /v1/messages
```

## 1. AgentPhone project setup

1. Create a project at [agentphone.ai](https://agentphone.ai)
2. Provision a phone number (this becomes your builder-facing line)
3. Create an agent and attach the number
4. Copy **API key**, **agent ID**, and **from number** (E.164)

## 2. Environment variables

```bash
AGENTPHONE_API_KEY=...
AGENTPHONE_AGENT_ID=agt_...          # or use AGENTPHONE_FROM_NUMBER alone
AGENTPHONE_FROM_NUMBER=+1XXXXXXXXXX  # E.164 — also used for "Open Messages" handoff links
AGENTPHONE_WEBHOOK_SECRET=...        # from AgentPhone webhook settings

# Optional alias (handoff UI falls back to AGENTPHONE_FROM_NUMBER)
DEVLABS_IMESSAGE_PHONE=+1XXXXXXXXXX
```

## 3. Webhook

In AgentPhone → **Webhooks**, set the project endpoint to:

```
https://www.devlabs.club/api/builder/claim/message-webhook
```

Legacy alias (same handler): `/api/imessage/webhook`

AgentPhone signs deliveries with `X-Webhook-Signature` + `X-Webhook-Timestamp`. Set `AGENTPHONE_WEBHOOK_SECRET` to the secret shown in the dashboard.

## 4. Outbound messages

All agent texts go through `POST https://api.agentphone.ai/v1/messages` via `src/lib/builderClaimMessaging.ts`.

For **US SMS outbound**, complete **10DLC Sole Proprietor registration** in AgentPhone before sending to non-iMessage numbers.

## 5. Local testing

Inbound requires a public URL (AgentPhone cannot hit localhost). Use your Vercel preview URL or a tunnel:

```bash
# preview deploy webhook URL example
https://<preview>.vercel.app/api/builder/claim/message-webhook
```

Send a test message to your AgentPhone number with body: `hi devlabs:<token>` from the builder handoff page.

## Key files

| File | Role |
|------|------|
| `src/lib/messaging/agentPhoneClient.ts` | Send + webhook verify + parse |
| `src/lib/builderClaimMessaging.ts` | Outbound claim/agent messages |
| `src/pages/api/builder/claim/message-webhook.ts` | Inbound webhook |
| `src/lib/builderImessageHandoff.ts` | "Open Messages" deep links |
