# PRD — Builder Profile Claim over iMessage

**Owner:** Product (DevLabs OS) · **Status:** Draft v1 · **Surface:** Builder (iMessage only)

## 1. Problem
Builders won't maintain a dashboard. A dashboard makes profile-building feel like work → effort → expectation → disappointment when nothing happens. We already hold enriched profiles for builders (scraped LinkedIn/GitHub/resume in MongoDB) — they just aren't *confirmed* or *visible to founders*.

## 2. Goal
Get builders to **claim and confirm** their pre-built profile in under 2 minutes, entirely inside iMessage, with zero forms — then go silent until a founder actually wants them. The opportunity later should feel like a surprise, not the payoff of an application.

## 3. Success metrics
- **Primary:** claim rate per email sent (target pilot ≥ 25%).
- **Guardrail:** median time-to-claim < 2 min; ≤ 3 agent turns to activation for builders with good enriched data.
- **Anti-goal (kill if seen):** builders feeling they "applied" and are now "waiting." No "complete your profile" nagging. No engagement loops.

## 4. Pre-step — the Contact Card (before any text)
Builder must save **"DevLabs"** as a contact *before* the agent ever messages them, so the agent appears as a known name + face, not an unknown number.
- Asset: `public/contact/devlabs.vcf` + branded avatar (`devlabs-avatar.svg` → exported PNG, orange `#fa7d22`).
- Distribution: link in the claim email ("Save us first → then text"), and the vCard auto-attached/linked so it's one tap to "Add Contact."
- Also set the **Apple ID Contact Poster** on the device/line running the number so the name + photo render in the thread header.

## 5. Entry flow
1. **Email** (existing `talentEmail.ts`, orange CTA) — proof-first: shows 2–3 specific enriched facts ("We pulled your 3 GitHub projects incl. `<repo>`, your role at `<company>`"). Frame: *"We already built your profile — it's currently private. Save our contact and text us to confirm it and make it founder-readable."*
2. **Save contact** (vCard, one tap).
3. **Builder texts first** (inbound-initiated — protects deliverability, fits the low-pressure psychology). Pre-filled body via `sms:`/`imessage:` deep link, e.g. "Claim my profile".

> Hard rule: never cold-blast outbound iMessages. Email is the trigger; builders initiate the thread.

## 6. Conversation script (turn-by-turn)
Confirm existing data with tap-friendly yes/no. Never present a blank field. Reuse `AgentOptionsBlock` patterns.

**Builder:** Claim my profile
**Agent:** Hey `<FirstName>` 👋 I'm the DevLabs profile agent. We already built a profile for you from your public work — I just need you to confirm a few things so founders can read it right. Takes ~90 seconds. Ready?  `[Yes]` `[What's DevLabs?]`

**Agent:** Quick check — still building at **`<company>`** as **`<title>`**?  `[Yep]` `[Update]`

**Agent:** I found these as your strongest proof-of-work:
• `<project 1>` — `<one-line>`
• `<project 2>` — `<one-line>`
Are these yours and worth showing founders?  `[Both]` `[Only #1]` `[Add another]`

**Agent:** Top skills I pulled: **`<skill, skill, skill>`**. Accurate?  `[Yes]` `[Edit]`

**Agent:** Last one — work authorization. I have **`<inferred status>`**. Right?  `[Correct]` `[Fix]`

**Agent:** Done ✅ Your profile is **live and founder-readable**. You don't need to do anything else — I'll text you right here the moment a founder wants to interview you. (No spam, I promise. You won't hear from me until it's real.)

→ Then **silence.**

## 7. Profile resolution logic
1. Inbound arrives → normalize → extract `fromPhone` (+ email if provided).
2. Match against `BuilderProfile` by `phone`, else `email`, else fuzzy `name + school/company` from the claim-email token.
3. **Match found** → run confirm flow above.
4. **No match** → "I don't have a profile for this number yet — what's the email you got our note on?" → re-resolve. Fall back to lightweight create ("send your resume/LinkedIn and I'll build it").
5. **Multiple matches** → disambiguate with one option card.

On full confirm: `verificationStatus: imported_unverified → builder_confirmed`, `visibilityStatus: matched_only → public`, set `hiringIntent.optedIn = true`, write Supermemory `builder_profile_fact` events + audit log. Trigger re-embed (headline/projects/skills changed).

## 8. Edge cases
- **Android / non-iMessage:** detect on send failure → SMS/WhatsApp fallback via the same provider abstraction. Same script.
- **Ghosts mid-flow:** save partial confirmations; one (and only one) gentle re-ping after 24–48h, then stop forever.
- **Wrong data / disputes:** any "Fix/Edit" branch accepts free text or resume; never force-fits.
- **Privacy / opt-out:** "STOP" → set `visibilityStatus: hidden`, confirm, never contact again.
- **Duplicate inbound:** idempotent on provider message id.

## 9. Data model touchpoints
- `BuilderProfile.phone` → add unique sparse index; primary resolution key.
- Reuse `MessageThread.ts` keyed by phone for iMessage threads.
- New: inbound dedupe store (provider msg id), claim-token → builderId mapping for email attribution.

## 10. Non-goals
- No builder dashboard. No profile-completion gamification. No notifications beyond a real founder intro. No "matches"/visibility/ranking language (see banned list).

## 11. Phases
- **P0 Pilot (≈50–100 top builders):** Mac-bridge provider (BlueBubbles/LoopMessage), manual email send, hard-coded happy path + no-match. Measure claim rate + time-to-claim.
- **P1:** Migrate to Spectrum-TS, provider abstraction, idempotent webhook, fallback channels, Supermemory + audit writes, re-embed trigger.
- **P2:** Batched throttled email waves, disambiguation + edge cases, the dormant founder-intro ping (the wow moment).
