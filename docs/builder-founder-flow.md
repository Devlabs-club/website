# DevLabs Builder & Founder Flows

> Agent reference for the DevLabs OS product flows.  
> Production site: `https://www.devlabs.club`  
> Last updated from codebase: 2026-07-01

---

## Product Summary

DevLabs is a **proof-of-work hiring marketplace** connecting startup founders with **builders** (students/early-career engineers who ship real projects).

- **Builders** are onboarded and maintained primarily via **iMessage** after phone verification.
- **Founders** onboard via **LinkedIn enrichment**, create roles, run **AI-assisted talent search**, and invite builders.
- **Matching** uses a multi-stage discovery pipeline (semantic embeddings + heuristics + optional LLM rerank).
- **Connection** happens via **intro requests**: founder invites → builder gets in-app notification + personalized **iMessage ping**.

---

## Entry (Both Sides)

```
Landing page CTAs → /auth/signup → /auth/select-role → branch by role
```

| Role | Next route | Initial `onboardingStatus` |
|------|------------|----------------------------|
| Founder | `/founder/onboarding/linkedin` | `linkedin` |
| Builder | `/builder/home` | `imessage_claim` |

**Key files:**
- `src/pages/auth/signup.astro`
- `src/components/auth/AuthSelectRolePage.tsx`
- `src/pages/api/auth/role.ts`

Auth supports email signup and WorkOS OAuth. OAuth callback redirects by role.

---

## Builder Flow

### Philosophy

The builder dashboard is a **single surface**: profile preview ("what founders see"), gated behind phone verification. After verify, **everything else happens in iMessage**.

### Path A: Signup Flow

```
/auth/signup
  → /auth/select-role (builder)
  → /builder/home
  → Phone verify (Twilio OTP)
  → iMessage agent sends first texts
  → Profile built/confirmed in conversation
```

**Steps:**

1. **`/builder/home`** — loads profile via `GET /api/builder/profile`
2. **Phone gate** — if not verified, show `BuilderPhoneVerify`
3. **`POST /api/builder/verify`** — Twilio Verify OTP; on success:
   - Creates/links `BuilderProfileClaim`
   - Sets `phoneVerifiedAt`
   - Kicks off iMessage agent
4. **Profile preview** — after verify, show `BuilderProfilePreview`
5. **Ongoing updates** — via iMessage agent, not dashboard

**Key files:**
- `src/components/builder/BuilderHome.tsx`
- `src/pages/api/builder/verify.ts`
- `src/pages/api/builder/profile.ts`

### Path B: Email Claim Flow (No Signup Required)

For pre-enriched builders invited by email:

```
Email invite (talentEmail)
  → /builder/claim/[token]
  → Phone OTP
  → iMessage conversation
```

Private profile view: `/builder/p/[token]`

**Claim states (`BuilderProfileClaim`):**
```
email_sent → phone_verified → conversation_started → completed
```

**Key files:**
- `src/components/builder/BuilderClaimPhonePage.tsx`
- `src/lib/builderClaim.ts`
- `docs/prd-builder-imessage-claim.md`

### iMessage Conversation (Primary Builder Experience)

**Inbound webhook:**
```
POST /api/imessage/webhook
  → re-exports to claim handler
  → advanceClaimConversation()
  → runImessageBuilderAgentTurn()
  → sendReplies() over iMessage
```

**Conversation states (`ImessageConversation.claimState`):**
```
unresolved → resolved → confirming → activated
                                      ↘ opted_out (STOP → visibilityStatus: hidden)
```

**Agent capabilities:**
- Read/update `BuilderProfile`
- Import GitHub / Devpost projects
- Parse resumes
- LinkedIn / GitHub enrichment
- Deep research
- Memory (`builderAgentMemory`)
- Finalize claim → `verificationStatus: builder_confirmed`

**Key files:**
- `src/pages/api/builder/claim/message-webhook.ts`
- `src/lib/builderClaim.ts`
- `src/lib/agent/runners/imessageBuilderAgent.ts`
- `src/lib/builderClaimMessaging.ts`
- `src/lib/messaging/bluebubblesAttachments.ts`
- `docs/imessage-bluebubbles-setup.md`

### Builder Profile Model

**Schema:** `src/models/talent/BuilderProfile.ts`  
**Proof-of-work:** `src/models/talent/ProjectRecord.ts`

| Field | Purpose |
|-------|---------|
| `verificationStatus` | `imported_unverified` → `builder_confirmed` |
| `visibilityStatus` | `public` \| `matched_only` \| `hidden` |
| `hiringIntent.optedIn` | Whether builder wants intros |
| `profileCompletion` | Profile / proof / match scores |
| `profileQuality` | LLM or deterministic quality score |
| Links | GitHub, LinkedIn, resume, etc. |

**Profile creation paths:**
- Signup + LinkedIn enrichment (`POST /api/onboarding/linkedin-enrichment`)
- Bootstrap script (`POST /api/talent/bootstrap-builders`)
- iMessage agent during claim kickoff
- Admin invite/enrichment scripts under `scripts/`

### Builder Post-Match Touchpoints

When a founder requests an intro:

1. In-app notification (`src/lib/talent/introFlow.ts`)
2. **iMessage surprise ping** via `notifyBuilderOfIntro()` in `builderClaim.ts`
   - Personalized agent message
   - Includes founder's Cal.com/Calendly link if set
3. Builder responds via intro inbox / iMessage

---

## Founder Flow

### Onboarding (Sequential)

```
/auth/signup
  → /auth/select-role (founder)
  → /founder/onboarding/linkedin
  → /founder/onboarding/profile
  → /founder/onboarding/company
  → /founder/home (product intro modals)
  → onboardingStatus: complete
```

| Step | Route | `onboardingStatus` after | API |
|------|-------|--------------------------|-----|
| 1. LinkedIn connect | `/founder/onboarding/linkedin` | `profile` | `POST /api/onboarding/linkedin-enrichment` |
| 2. Review profile | `/founder/onboarding/profile` | `company` | `GET/POST /api/founder/profile` (requires scheduling link) |
| 3. Review company | `/founder/onboarding/company` | `context` | `POST /api/founder/company` |
| 4. Product intro | overlay on `/founder/home` | `complete` | `POST /api/founder/onboarding-complete` |

**Scheduling link required:** Cal.com or Calendly URL on profile step.

**Models:**
- `src/models/talent/FounderProfile.ts`
- `src/models/founder/CompanyProfile.ts`

**Key files:**
- `src/components/founder/FounderLinkedInConnectPage.tsx`
- `src/components/founder/FounderProfileReviewPage.tsx`
- `src/components/founder/FounderCompanyReviewPage.tsx`
- `src/components/founder/FounderContextIntroModals.tsx`
- `src/lib/remoteLinkedInScraper.ts`

### Role Creation

**Route:** `/founder/home`  
**Component:** `src/components/founder/FounderHomePage.tsx`

**New founder (no roles):** 3-question intake:
1. Role title
2. Tech stack
3. Compensation

→ `POST /api/founder/roles` creates draft `JobPosting`  
→ Redirect to `/founder/roles/[jobId]`

**Returning founder:** lists existing roles via `GET /api/founder/roles`

### Role Workspace (Main Founder Surface)

**Route:** `/founder/roles/[roleId]`  
**Component:** `src/components/founder/FounderRoleWorkspacePage.tsx`

**Layout:**
- **Left pane:** conversational AI hiring agent chat
- **Right pane:** role editor | builder recommendations | full builder profile

**Founder agent:** `src/lib/founderAgent/service.ts`

**Agent tools:**
- `create_job`
- `edit_job`
- `fetch_job` / `fetch_jobs`
- `search_talent`
- `update_company_info`

**Search triggers:**
- Agent calls `search_talent` during chat (sets `searchRan: true`)
- Manual `POST /api/founder/roles/[id]/search`

**Chat API:** `POST /api/founder/roles/[id]/chat`

### Discovery / Matching Pipeline

**Entry:** `runFounderDiscoveryPipeline` in `src/lib/talent/discovery/index.ts`

**Stages:**
1. Build search strategy from role brief
2. Apply feedback weight adjustments
3. Semantic embedding similarity (`searchTalentEmbeddings`)
4. Heuristic scoring per builder
5. Optional LLM rerank
6. Persist to `Shortlist` + `MatchRecord`

**Key files:**
- `src/lib/talent/discovery/index.ts`
- `src/lib/talent/founderSearchPersist.ts`
- `src/lib/talent/builderSearch.ts`
- `src/lib/talent/founderCandidate.ts`

**Models:**
- `src/models/talent/Shortlist.ts`
- `src/models/talent/MatchRecord.ts`
- `src/models/founder/JobPosting.ts` (Mongo collection: `opportunities`)

**Full builder profile view:** `/founder/builders/[builderId]` → `BuilderFullProfilePage.tsx`

---

## How Builders and Founders Connect

### Matching

```
Founder defines JobPosting
  → search_talent / POST .../search
  → runFounderDiscoveryPipeline
  → Shortlist (ranked preview candidates)
  → MatchRecord per (builderId, opportunityId)
```

### Intro Request (Primary Connection Event)

**API:** `POST /api/founder/invite`  
**File:** `src/pages/api/founder/invite.ts`

**Flow:**
1. Creates/updates `IntroRequest` with status `requested`
2. `notifyBuilderIntroReceived()` — in-app notification
3. `notifyBuilderOfIntro()` — personalized iMessage from builder agent

**Legacy path (still in code):** `request_intro` action in `src/lib/agent/actionsHandler.ts`

### State Machines

#### IntroRequest.status
```
requested → builder_accepted | builder_declined | cancelled | completed
```

#### MatchRecord.status (hiring pipeline)
```
generated
  → approved
  → intro_requested
  → builder_interested
  → interviewing
  → trial
  → offer
  → hired
  ↘ closed / rejected (at various stages)
```

**Pipeline mapping:** `src/lib/talent/founderPipeline.ts`  
**Kanban columns (legacy UI):** `src/lib/talent/kanbanColumns.ts`

### Downstream Actions (Mostly Legacy)

These exist in `/api/agent/actions` and legacy modals; not the primary live surface:

- Messaging: `src/lib/talent/messageFlow.ts`
- Call scheduling: `CallSchedule` model, `CallScheduleModal.tsx`
- Work trial: `generate_trial_project`, `send_trial_project` in `actionsHandler.ts`
- Hire: `HireConfirmModal.tsx`

---

## User Account States

**Model:** `src/models/user.tsx`

| `onboardingStatus` | Meaning |
|--------------------|---------|
| `linkedin` | Founder: needs LinkedIn connect |
| `profile` | Founder: review personal details |
| `company` | Founder: review company |
| `context` | Founder: product intro modals pending |
| `complete` | Onboarding done |
| `imessage_claim` | Builder: needs phone verify + iMessage |

---

## Triggers & Touchpoints

| Trigger | System Response | Channel |
|---------|-----------------|---------|
| Founder completes 3 questions | Create `JobPosting`, open workspace | Web |
| Founder agent gathers enough brief | `search_talent` runs discovery | Web chat |
| Search completes | Recommendations pane populates | Web |
| Founder clicks invite | `IntroRequest` + notification + iMessage | Web → iMessage |
| Builder verifies phone | Agent sends first texts | SMS OTP → iMessage |
| Builder texts inbound | `advanceClaimConversation` | iMessage webhook |
| Builder accepts intro | `MatchRecord` → `builder_interested`, founder notified | App / iMessage |
| Founder schedules call | `CallSchedule` created | Web (legacy) |
| Trial sent/submitted | `MatchRecord.trialProject.status` updates | Web (legacy) |

---

## Integrations

| Integration | Purpose | Key file |
|-------------|---------|----------|
| BlueBubbles iMessage | Inbound/outbound builder messages | `src/pages/api/builder/claim/message-webhook.ts` |
| Twilio Verify | Phone OTP | `src/lib/twilioVerify.ts` |
| LinkedIn CDP scraper (Railway) | Profile enrichment | `src/lib/remoteLinkedInScraper.ts` |
| OpenRouter | AI agents (chat, enrichment, rerank) | `src/lib/openrouter.ts` |
| WorkOS | OAuth auth | `src/lib/workosEnv.ts` |
| SendGrid | Email (claim invites, talent email) | `src/lib/talent/talentEmail.ts` |

---

## Live vs Legacy Code

The codebase has two generations. **Use the "Live" column for product work.**

| Area | Live (production) | Legacy (in code, partially unwired) |
|------|-------------------|-------------------------------------|
| Founder UI | `FounderHomePage` → `FounderRoleWorkspacePage` | `FounderOSDashboard`, `FounderUnifiedWorkspace`, kanban |
| Founder agent | `founderAgent/service.ts` | `actionsHandler.ts` (`founder_chat`, `run_builder_search`) |
| Role model | `JobPosting` | `Opportunity` (same Mongo collection) |
| Builder UI | `BuilderHome` (profile preview only) | `BuilderOSDashboard` (removed from routes) |
| Builder agent | `imessageBuilderAgent.ts` | `builder_chat` in `actionsHandler.ts` |
| Intro API | `POST /api/founder/invite` | `request_intro` in `/api/agent/actions` |

**Canonical live surface:**
- `src/lib/founderAgent/service.ts`
- `src/components/founder/FounderRoleWorkspacePage.tsx`
- `src/lib/builderClaim.ts`
- `src/lib/agent/runners/imessageBuilderAgent.ts`

---

## End-to-End Diagram

```mermaid
flowchart TB
  subgraph entry [Entry]
    L[Landing /auth/signup]
    SR[Select role]
  end

  subgraph builder [Builder OS]
    BH[/builder/home]
    PV[Phone verify Twilio]
    IM[iMessage agent]
    BP[(BuilderProfile + Projects)]
    BH --> PV --> IM --> BP
  end

  subgraph founder [Founder OS]
    FO[Onboarding LinkedIn → profile → company]
    FH[/founder/home 3 questions]
    RW[/founder/roles/id workspace]
    AG[Founder hiring agent]
    SRCH[Discovery pipeline]
    FH --> RW --> AG --> SRCH
    FO --> FH
  end

  subgraph connect [Connection]
    SL[(Shortlist)]
    MR[(MatchRecord)]
    IR[IntroRequest]
    SRCH --> SL --> MR
    RW -->|invite| IR
    IR -->|iMessage ping| IM
    IR -->|notification| BH
  end

  L --> SR
  SR -->|builder| BH
  SR -->|founder| FO
```

---

## Key File Index

| Area | Path |
|------|------|
| Auth & routing | `src/pages/api/auth/role.ts`, `src/components/auth/AuthSelectRolePage.tsx` |
| Builder home | `src/components/builder/BuilderHome.tsx`, `src/pages/api/builder/verify.ts` |
| iMessage claim | `src/lib/builderClaim.ts`, `src/lib/agent/runners/imessageBuilderAgent.ts` |
| iMessage webhook | `src/pages/api/builder/claim/message-webhook.ts` |
| Builder schema | `src/models/talent/BuilderProfile.ts`, `ProjectRecord.ts` |
| Founder onboarding | `src/pages/founder/onboarding/*.astro`, `src/pages/api/founder/profile.ts` |
| Founder home/workspace | `src/components/founder/FounderHomePage.tsx`, `FounderRoleWorkspacePage.tsx` |
| Founder agent + search | `src/lib/founderAgent/service.ts`, `src/lib/talent/discovery/index.ts` |
| Intro + connection | `src/pages/api/founder/invite.ts`, `src/lib/talent/introFlow.ts` |
| Pipeline states | `src/models/talent/MatchRecord.ts`, `src/lib/talent/founderPipeline.ts` |
| Legacy actions RPC | `src/lib/agent/actionsHandler.ts`, `src/pages/api/agent/actions.ts` |
| Product docs | `docs/builder-founder-talent-system.html`, `docs/prd-builder-imessage-claim.md` |

---

## Environment Variables (Production)

Required on Vercel `devlabs-website` Production:

- `MONGODB_URI`, `ADMIN_MONGO_URI`, `JWT_SECRET`, `WEBSITE_ROOT`
- `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`
- `GITHUB_TOKEN`
- `LINKEDIN_SCRAPER_URL`, `LINKEDIN_SCRAPER_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- `BLUEBUBBLES_SERVER_URL`, `BLUEBUBBLES_PASSWORD`
- `EXA_API_KEY`, `OPENROUTER_API_KEY`

See `README.md` for full checklist.
