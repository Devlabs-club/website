import mongoose from 'mongoose';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { generateOpenRouterAgentTurn, type AgentMessage, type ToolDefinition } from '@/lib/openrouter';
import { type RuntimeEnv } from '@/lib/workosEnv';
import { claimProfileViewUrl, ensureClaimViewToken } from '@/lib/builderClaim';
import {
  reloadBuilder,
  getProjects,
  buildProfileSnapshot,
  updateLinks,
  importProject,
  evaluateProfile,
  updateBuilderScores,
  applyBuilderDataPatch,
} from '@/lib/agent/builderProfileTools';
import {
  recallBuilderMemoryText,
  rememberBuilderFact,
  resolveBuilderMemoryField,
  linkBuilderMemory,
  extractAndStoreFacts,
  type MemoryRef,
} from '@/lib/talent/builderAgentMemory';
import { extractResumeFields, applyResumeToBuilder } from '@/lib/talent/builderResumeExtract';
import { enrichBuilderProfile, type EnrichmentSource } from '@/lib/talent/builderEnrichment';
import { deepResearchBuilder } from '@/lib/talent/builderDeepResearch';
import { extractUrls, classifyLink, processGenericLink } from '@/lib/talent/builderLinkProcessor';

/** Run a promise with a hard timeout so a slow scrape can't hang the iMessage turn. */
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Split the model's output into separate iMessage bubbles (blank-line separated). */
function splitIntoBubbles(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

const AGENT_PERSONA = `You are DevLabs's builder agent — you text builders on iMessage to get their DevLabs builder profile founder-ready.

YOUR NAME: you DON'T have one. You text in the voice/feel of Poke (sharp, fun, texty — see VOICE), but you are NOT "Poke" and you never call yourself Poke or any other name. Never introduce yourself with a name ("it's poke", "this is X"). If someone asks who/what you are or your name, keep it light and nameless — "just the devlabs agent, here to get your profile founder-ready" — and move on. Never claim a persona/brand name.

VOICE — text like a sharp, fun, slightly sassy friend:
- Short. iMessage, not email. Casual, lowercase-friendly, dry wit. No corporate tone.
- A little cheeky and persistent — you WANT them to finish their profile and you nudge them to. Tease lightly ("c'mon, a github with zero links? we can do better than that") but NEVER insult, mock, or make them feel dumb or insecure. They should always feel liked and want to keep going. Encourage > criticize.
- One question at a time. Never dump a list of questions.
- NEVER use emojis. Not a single one. Plain text only.
- Be precise. When you change something, say exactly what you changed.

SEND MULTIPLE SHORT TEXTS, never one wall of text:
- Reply in 1-3 short bubbles. Put a BLANK LINE between each bubble — each blank-line-separated chunk becomes its own text.
- e.g. bubble 1: react to what they said. bubble 2: the one question. Keep each bubble to a sentence or two.

WHAT YOU'RE DOING:
The builder already verified their phone (linked to their email + DevLabs profile) — identity is settled, don't re-verify. Your job: fill the gaps and make their proof-of-work clear to founders.

HOW YOU THINK (reason, don't run a script):
- Each turn, look at the SNAPSHOT (its missingFields + what's thin) and ask: what's the ONE highest-impact thing that makes this profile more convincing to a founder right now? Do that. Infer and write everything you reasonably can from the data you have; ask only what you genuinely can't derive.
- You are judged on the FINISHED profile, not on asking lots of questions. Fewer, smarter moves win.

ACT — don't narrate (this is critical):
- The moment a builder tells you a fact — a job/internship, school, location, skill, work authorization, a link — WRITE it to the profile with update_builder_data THAT SAME TURN, before you move on. A job or internship is an EXPERIENCE entry (title + company + what they did); "interning at Google" must become an experience, not just a sentence in chat.
- NEVER say "I've updated / got that updated / added that" unless you actually called update_builder_data this turn and it succeeded. Claiming a change you didn't make is the worst thing you can do — the profile stays empty and you look broken.
- When you make a tool call, also produce a real reply. Don't go silent after acting.

ALWAYS:
- Call get_builder_profile before claiming anything about their profile. Never guess what's missing.
- Read the MEMORY block below — stuff they already told you. NEVER re-ask anything covered there; if a fact there fills a gap, write it instead of asking.
- Get BOTH their github AND their linkedin early — they're your two highest-value sources. LinkedIn is where their real work history, internships, and education live (founders need these); github is their code. If you don't have linkedin yet, ask for it — don't skip it.
- After you learn something useful, call remember_fact (we also auto-capture, but log preferences/constraints explicitly).
- After a write, briefly confirm what landed, then go after the next gap — one ask at a time.

DO THE WORK — don't make them fill out a form:
- You can DRAFT. You have all their scraped data (github, linkedin, resume, projects). Default to PROPOSING values (bio, headline, top skills, project contributions) from that data and asking only "this look right?" — never ask them to author something you can write yourself.
- If they push back ("you scraped my github, you know", "you come up with something", "too many questions", "just assume") — STOP asking. Draft it from what you have, apply it, and move on. Friction means you're interrogating; switch to doing.
- One question per turn, max. Bias hard toward finishing, not completeness for its own sake.

PROJECTS — ask once, then batch (never go project-by-project):
- Ask ONE question: "did you build these solo, or were some team efforts?"
- If solo / "all me": the whole project is theirs — don't single out a "contribution". RIGHT THAT TURN, draft a concrete one-line contribution for EACH project from its description + tech stack and write them ALL in ONE update_builder_data call (projects[] with id + builderContribution), then tell them you did it. Do NOT reply "what's next" and wait — act first.
- If team: ask only about the 1-2 strongest projects; for the rest, write a sensible default in the same call.
- For events/programs (hackathons, etc.), "founded it / ran it / organized it" IS a complete contribution. Never re-ask it.

GET TO KNOW THEM — be the agent that already did its homework:
- ANY link they drop (github, linkedin, devpost, personal site, X, a blog post, a project page — anything) is AUTOMATICALLY saved and quietly checked in the background. You don't ask permission or announce it. When a link comes in, just react in ONE casual line ("oh sick", "love that") — NEVER say "I'm running enrichment / scraping / doing deep research / looking into it." Keep the magic hidden.
- The findings come back to you on the NEXT turn. Then SURPRISE them: drop a specific, concrete thing as if you just know it ("wait, you won HackMIT? what'd you build?"). Never reveal you looked anything up. The whole point is they think "how does it know that?" — that's what keeps them hooked and trusting the product.
- You also have run_enrichment(sources) and deep_research to go deeper on your own initiative. Same rule: don't narrate mechanics, just come back with something cool.
- Trust but verify the genuinely impressive stuff before writing it as hard fact ("this you?").

YOUR WRITE TOOL: update_builder_data is your single tool to change ANYTHING — profile fields, projects, or their user account — in one call. You have full rights; no permission needed. See BUILDER_DATA_SCHEMA below for every field. Batch related changes into one call.

WRITING RULES (bio/headline/experience — founders READ these):
- Plain, concrete, builder language. Lead with what they've actually shipped and their real skills. The bio is the first thing a founder sees on a recommendation — make it specific and convincing, not flowery. Tight enough that a founder knows in one line whether to talk to them.
- Fold their TOP skills (from their github/projects) into the headline/bio — don't ask them to list skills, you already have them.
- BANNED (LinkedIn-bluff, never use): "passionate", "process-focused", "community-first", "technologist", "innovative", "loves connecting", "driven", "results-oriented", "synergy", "leverage", "transformative", "cutting-edge".
- The bio is about the BUILDER's proof-of-work — NEVER paste a description of a program/company as their bio. Good: "Ships mobile apps in Flutter; 3 hackathon wins; runs DevLabs." Bad: "Process-focused builder passionate about innovative solutions."

ENRICHMENT PRIORITY (chase the biggest gap first):
1. github + linkedin (proof links) 2. one real project/experience with what THEY did 3. clear headline + bio 4. role preference + availability 5. location + work authorization.

RESUME: if they offer one, tell them to just drop the PDF in here — you'll read it and fill everything. When applied you'll get a system note of what you pulled; acknowledge and ask only about what's still thin.

PROFILE LINK: when they ask to see/view their profile, or once it's looking solid, call send_profile_link and text them the link. Tell them it's their private page — only they can open it — and it's exactly what founders see.

FINISHING: when it's genuinely founder-ready (proof links + a solid project/experience + clear headline + availability), call finalize_profile, then tell them in your own warm voice that their profile is locked in and you'll ping them right here when a founder wants to hire them — and share the link send_profile_link returns. Don't finalize a thin profile just to be done. Once finalized, DON'T keep manufacturing gaps to ask about — but DO stay available: answer their questions and help with anything they bring up.

NEVER say "this helps you get matched / rank higher / get noticed." Say "this makes your profile easy for a founder to read."`;

// Full editable schema the agent can write via update_builder_data. Keep in sync
// with src/models/talent/BuilderProfile.ts, ProjectRecord.ts, and the User model.
const BUILDER_DATA_SCHEMA = `BUILDER_DATA_SCHEMA — everything you can set via update_builder_data (use dot-notation for nested):

builder (BuilderProfile):
- name (string), headline (string), bio (string), avatarUrl (string), email (string), phone (string)
- location (string), timezone (string), universityOrCompany (string), graduationYear (number)
- currentStatus (enum: student | full_time | unemployed | founder | freelancer | other)
- workAuthorization (string, e.g. "US citizen" / "F1 OPT" / "needs sponsorship")
- rolePreference (string[]), preferredWorkType (string[])
- links.{ linkedin, github, portfolio, personalWebsite, resume, devpost, twitter } (string)
- availability.{ availableNow (bool), hoursPerWeek (number), desiredCompensation (string), salaryExpectationMin (number), salaryExpectationMax (number), remotePreference (enum: remote | in_person | hybrid | unspecified) }
- hiringIntent.{ internship, contract, fullTime, cofounder, projectSprint, optedIn } (bool)
- experiences (array of { title, company, dateRange, description, skills[], isCurrent }), education (array of { school, degree, field })
- visibilityStatus (enum: public | matched_only | hidden)

projects[] (ProjectRecord — pass "id" to edit an existing one, else "projectName" to add):
- projectName (string), description (string), problemSolved (string)
- builderContribution (string — what THEY did), contributionTags (string[]), techStack (string[])
- status (enum: prototype | launched | abandoned | active | incorporated | unknown)
- links.{ demo, github, devpost, pitchDeck, videoDemo, screenshots } (string)
- traction.{ users (number), revenue (number), waitlist (number), notes (string) }

user (User account):
- name, email, phone, major, avatarUrl, resumeUrl (string)
- role (enum: user | admin | founder | builder), accountType (enum: founder | builder | null), onboardingStatus (string)`;

// Tools available on every turn.
const BASE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_builder_profile',
      description: 'Read the full builder profile: name, headline, bio, location, links, availability, role preferences, work authorization, experiences, projects, and current quality issues/missing fields. Call before claiming anything about the profile.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_builder_data',
      description: "Your one write tool. Update ANYTHING about this builder — their profile, their projects, or their user account — in a single call. You have full rights; no permission needed. Use dot-notation for nested fields. See BUILDER_DATA_SCHEMA in your context for every field you can set. To edit an existing project, pass its id (from get_builder_profile); to add one, pass projectName. Batch many changes (e.g. all project contributions) into ONE call.",
      parameters: {
        type: 'object',
        properties: {
          builder: {
            type: 'object',
            description: 'BuilderProfile fields to set. Nested allowed, e.g. {"headline": "...", "links.github": "...", "availability.hoursPerWeek": 40, "rolePreference": ["..."]}.',
            additionalProperties: true,
          },
          projects: {
            type: 'array',
            description: 'Projects to patch (with "id") or add (with "projectName"). Fields: projectName, description, builderContribution, techStack[], status, contributionTags[], links{}.',
            items: { type: 'object', additionalProperties: true },
          },
          user: {
            type: 'object',
            description: 'User account fields: name, email, phone, role, accountType, onboardingStatus, major, avatarUrl, resumeUrl.',
            additionalProperties: true,
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'import_project',
      description: 'Import a project from a GitHub repo URL or Devpost project URL.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_profile',
      description: 'Run a quality evaluation to see what is still weak or missing.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember_fact',
      description: 'Remember something the builder told you so you never re-ask it (a preference, constraint, or detail still to apply).',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: "The fact, in the builder's framing." },
          kind: { type: 'string', enum: ['preference', 'constraint', 'fact', 'todo', 'context'] },
          field: { type: 'string', description: 'Optional profile field this is about, e.g. "availability".' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_profile_link',
      description: "Get the builder's PRIVATE profile-view link to text them — when they ask to see their profile, or when you think it's ready to view. Only this builder can open it.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finalize_profile',
      description: 'Mark the profile claimed + founder-ready (only when it has proof links, a real project/experience, a clear headline, and availability). Returns the private profile link to share.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// Tools that schedule slow background work — only offered on a normal (non-follow-up) turn.
const SCHEDULING_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'run_enrichment',
      description: "Scrape the builder's own GitHub/LinkedIn/Devpost/portfolio and auto-fill their profile. Runs in the BACKGROUND — call it, tell them 'give me a sec', and react to the results next turn.",
      parameters: {
        type: 'object',
        properties: {
          sources: {
            type: 'array',
            items: { type: 'string', enum: ['github', 'linkedin', 'devpost', 'portfolio', 'resume', 'twitter'] },
            description: 'Which sources to scrape. Default: github + linkedin.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deep_research',
      description: "Web-search the builder's public presence (X/Twitter, personal site, Devpost, press) for founder-grade proof-of-work + the sharpest follow-up questions. Runs in the BACKGROUND — call it, say 'give me a sec', and react to results next turn.",
      parameters: { type: 'object', properties: {} },
    },
  },
];

/** Resolve the builder profile for this claim, creating a fresh one if none exists. */
async function resolveOrCreateBuilder(claim: any) {
  if (claim.builderId && mongoose.Types.ObjectId.isValid(String(claim.builderId))) {
    const existing = await reloadBuilder(claim.builderId);
    if (existing) return { builder: existing, created: false };
  }

  const byEmail = claim.builderEmail ? await BuilderProfile.findOne({ email: claim.builderEmail }) : null;
  if (byEmail) {
    claim.builderId = byEmail._id;
    if (claim.phone && (!byEmail.phone || !byEmail.phoneVerifiedAt)) {
      byEmail.phone = claim.phone;
      byEmail.phoneVerifiedAt = claim.phoneVerifiedAt || new Date();
      await byEmail.save();
    }
    return { builder: byEmail, created: false };
  }

  const byPhone = claim.phone ? await BuilderProfile.findOne({ phone: claim.phone }) : null;
  if (byPhone) {
    claim.builderId = byPhone._id;
    if (!byPhone.phoneVerifiedAt) {
      byPhone.phoneVerifiedAt = claim.phoneVerifiedAt || new Date();
      await byPhone.save();
    }
    return { builder: byPhone, created: false };
  }

  const name = claim.metadata?.builderName || (claim.builderEmail ? claim.builderEmail.split('@')[0] : 'DevLabs builder');
  const builder = await BuilderProfile.create({
    name,
    email: claim.builderEmail || undefined,
    phone: claim.phone || undefined,
    phoneVerifiedAt: claim.phoneVerifiedAt || new Date(),
    verificationStatus: 'builder_confirmed',
    visibilityStatus: 'matched_only',
  });
  claim.builderId = builder._id;
  return { builder, created: true };
}

export type FollowUpJob = { sources: EnrichmentSource[]; research: boolean; links: string[] };

export type ImessageAgentResult = {
  replies: string[];
  completed: boolean;
  builderId: string;
  /** Slow work to run AFTER the immediate replies go out; caller re-invokes in follow-up mode. */
  followUp?: FollowUpJob;
};

/** Run the scheduled scrape/research, save what it found, and return a note for the model. */
async function executeFollowUpJob(builderId: string, memRef: MemoryRef, job: FollowUpJob, runtime?: RuntimeEnv): Promise<string> {
  const parts: string[] = [];
  const coolFacts: string[] = [];

  // Any arbitrary links the builder dropped (personal site, X, blog, project page).
  if (job.links?.length) {
    const builder = await reloadBuilder(builderId);
    for (const url of job.links.slice(0, 4)) {
      try {
        const r = await withTimeout(processGenericLink(builder, url, memRef), 25000, 'link');
        if (r.ok) {
          coolFacts.push(...r.coolFacts);
          parts.push(`From ${url}: ${r.summary || 'read it'}${r.coolFacts.length ? ` — ${r.coolFacts.join('; ')}` : ''}${r.applied.length ? ` (saved ${r.applied.join(', ')})` : ''}.`);
        } else {
          parts.push(`Couldn't open ${url}.`);
        }
      } catch (e) {
        parts.push(`Couldn't read ${url} (${e instanceof Error ? e.message : 'error'}).`);
      }
    }
  }

  if (job.sources?.length) {
    try {
      const res = await withTimeout(enrichBuilderProfile({ builderId, sources: job.sources }), 30000, 'enrichment');
      for (const f of res.profileFieldsUpdated) await resolveBuilderMemoryField(memRef, f);
      parts.push(
        `Scraped ${job.sources.join(' + ')}: filled [${res.profileFieldsUpdated.join(', ') || 'nothing new'}], projects +${res.projectsCreated} new / ${res.projectsUpdated} updated.`
      );
    } catch (e) {
      parts.push(`Couldn't fully scrape ${job.sources.join(' + ')} (${e instanceof Error ? e.message : 'error'}).`);
    }
  }

  if (job.research) {
    try {
      const builder = await reloadBuilder(builderId);
      const projects = await getProjects(builderId);
      const r = await withTimeout(deepResearchBuilder({ builder, projects, memRef, runtime }), 30000, 'deep_research');
      // Save any links we discovered (only if not already set).
      const linkUpdates: Record<string, string> = {};
      if (r.discoveredLinks.devpost && !builder.links?.devpost) linkUpdates.devpost = r.discoveredLinks.devpost;
      if (r.discoveredLinks.personalWebsite && !builder.links?.personalWebsite) linkUpdates.personalWebsite = r.discoveredLinks.personalWebsite;
      if (r.discoveredLinks.twitter && !builder.links?.twitter) linkUpdates.twitter = r.discoveredLinks.twitter;
      if (Object.keys(linkUpdates).length) await updateLinks(builder, linkUpdates);

      const found = [
        r.summary,
        r.proofPoints.length ? `Proof points: ${r.proofPoints.slice(0, 4).join(' | ')}` : '',
        Object.values(linkUpdates).length ? `Found links: ${Object.entries(linkUpdates).map(([k, v]) => `${k}=${v}`).join(', ')}` : '',
        r.suggestedQuestions.length ? `Best questions to ask: ${r.suggestedQuestions.slice(0, 3).join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      parts.push(found || 'Web search turned up little I could verify.');
    } catch (e) {
      parts.push(`Research hiccup (${e instanceof Error ? e.message : 'error'}).`);
    }
  }

  const note = parts.join('\n');
  return coolFacts.length ? `SURPRISING THINGS TO DROP: ${coolFacts.join(' | ')}\n${note}` : note;
}

export async function runImessageBuilderAgentTurn(params: {
  claim: any;
  userText?: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  resume?: { text: string } | null;
  /** Open the conversation (no inbound message yet) right after phone verification. */
  kickoff?: boolean;
  /**
   * A founder just requested an intro to this builder — generate the surprise
   * notification (no inbound message). The agent writes it personalized from the
   * builder's memory + profile; nothing here is a fixed template.
   */
  intro?: {
    founderName: string;
    company: string;
    roleTitle: string;
    schedulingLink?: string | null;
  };
  /** Follow-up turn: execute previously scheduled scrape/research, then react to it. */
  mode?: 'normal' | 'followup';
  followUpJob?: FollowUpJob;
  runtime?: RuntimeEnv;
}): Promise<ImessageAgentResult> {
  const { claim, history, runtime } = params;
  const userText = params.userText || '';
  const isFollowup = params.mode === 'followup';

  const { builder, created } = await resolveOrCreateBuilder(claim);
  const builderId = String(builder._id);
  const memRef: MemoryRef = { builderId, builderEmail: claim.builderEmail, phone: claim.phone };
  await linkBuilderMemory(memRef, builderId);

  // Follow-up turn: do the heavy scraping/research first, then let the model react.
  let followupNote = '';
  if (isFollowup && params.followUpJob) {
    followupNote = await executeFollowUpJob(builderId, memRef, params.followUpJob, runtime);
  }

  // Resume came in this turn → extract + apply before the model runs.
  let resumeNote = '';
  if (params.resume?.text) {
    try {
      const extracted = await extractResumeFields(params.resume.text);
      const result = await applyResumeToBuilder(builder, extracted);
      resumeNote = result.applied.length
        ? `[system: builder just sent a resume. I auto-filled: ${result.applied.join(', ')}. Acknowledge casually and ask only about what's still thin.]`
        : `[system: builder sent a resume but it didn't add much new. Ask them what they want to highlight.]`;
    } catch (err) {
      resumeNote = `[system: couldn't read that resume file (${err instanceof Error ? err.message : 'parse error'}). Ask them to send a PDF.]`;
    }
  }

  let finalizeCalled = false;
  // Stable private link to this builder's own profile page (token gated to them).
  const profileLink = claimProfileViewUrl(ensureClaimViewToken(claim), runtime);
  const followUp: FollowUpJob = { sources: [], research: false, links: [] };

  // PROACTIVE: auto-detect any link the builder dropped and queue it for background
  // processing — no need for them to ask. We save it + scan it, then surprise them next turn.
  let autoLinkNote = '';
  if (!params.kickoff && !isFollowup && userText) {
    const handled: string[] = [];
    for (const url of extractUrls(userText)) {
      const kind = classifyLink(url);
      if (kind === 'github') { await updateLinks(builder, { github: url }); if (!followUp.sources.includes('github')) followUp.sources.push('github'); handled.push('github'); }
      else if (kind === 'linkedin') { await updateLinks(builder, { linkedin: url }); if (!followUp.sources.includes('linkedin')) followUp.sources.push('linkedin'); handled.push('linkedin'); }
      else if (kind === 'devpost') { await updateLinks(builder, { devpost: url }); if (!followUp.sources.includes('devpost')) followUp.sources.push('devpost'); handled.push('devpost'); }
      else if (kind === 'twitter') { await updateLinks(builder, { twitter: url }); if (!followUp.sources.includes('twitter')) followUp.sources.push('twitter'); handled.push('twitter'); }
      else { followUp.links.push(url); handled.push('a link'); }
    }
    if (handled.length) {
      autoLinkNote = `[system: the builder just dropped ${handled.join(', ')}; you're already quietly checking it in the background. Reply in ONE short, casual line — do NOT mention scraping/enrichment/research or anything technical, don't say "I'm looking into it." Just be natural ("oh nice", "love it"). The interesting findings land next turn for you to surprise them with.]`;
    }
  }

  const memoryText = await recallBuilderMemoryText(memRef);
  const freshBuilder = (await reloadBuilder(builderId)) || builder;
  const snapshot = buildProfileSnapshot(freshBuilder, await getProjects(builderId));

  async function runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const b = (await reloadBuilder(builderId)) || builder;
    switch (name) {
      case 'get_builder_profile':
        return buildProfileSnapshot(b, await getProjects(builderId)) as unknown as Record<string, unknown>;

      case 'update_builder_data': {
        try {
          const res = await applyBuilderDataPatch(builderId, args as any, runtime);
          for (const k of res.builderUpdated) await resolveBuilderMemoryField(memRef, k.split('.')[0]);

          // If a github/linkedin/devpost/portfolio link changed, scrape it.
          if (res.linksChanged.length) {
            if (isFollowup) {
              try {
                const enr = await withTimeout(enrichBuilderProfile({ builderId, sources: res.linksChanged }), 28000, 'enrichment');
                for (const f of enr.profileFieldsUpdated) await resolveBuilderMemoryField(memRef, f);
              } catch { /* best effort */ }
            } else {
              for (const s of res.linksChanged) if (!followUp.sources.includes(s)) followUp.sources.push(s);
            }
          }

          const snap = buildProfileSnapshot((await reloadBuilder(builderId)) || b, await getProjects(builderId));
          return {
            success: true,
            builderUpdated: res.builderUpdated,
            projectsWritten: res.projectsWritten,
            userUpdated: res.userUpdated,
            ...(res.linksChanged.length && !isFollowup
              ? { scheduledScrape: res.linksChanged, note: "reply with ONE casual line — don't mention scraping. Findings land next turn." }
              : {}),
            profile: snap,
          };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : 'Update failed.' };
        }
      }

      case 'import_project': {
        const url = typeof args.url === 'string' ? args.url : null;
        if (!url) return { success: false, error: 'No URL provided.' };
        try {
          const project = await importProject(url, b._id);
          return { success: true, project: { title: project.projectName, description: project.description, techStack: project.techStack } };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : 'Import failed.' };
        }
      }

      case 'run_enrichment': {
        const sources = (Array.isArray(args.sources) && args.sources.length ? args.sources : ['github', 'linkedin']) as EnrichmentSource[];
        for (const s of sources) if (!followUp.sources.includes(s)) followUp.sources.push(s);
        return { success: true, scheduled: sources, note: "reply with ONE casual line — don't mention scraping/enrichment. Findings come next turn to surprise them." };
      }

      case 'deep_research': {
        followUp.research = true;
        return { success: true, scheduled: 'deep_research', note: "reply with ONE casual line — don't mention research/digging. Findings come next turn to surprise them." };
      }

      case 'evaluate_profile':
        return (await evaluateProfile(b)) as unknown as Record<string, unknown>;

      case 'remember_fact': {
        const content = typeof args.content === 'string' ? args.content : '';
        if (!content) return { success: false, error: 'No content.' };
        await rememberBuilderFact(memRef, {
          content,
          kind: typeof args.kind === 'string' ? args.kind : 'fact',
          field: typeof args.field === 'string' ? args.field : null,
        });
        return { success: true };
      }

      case 'send_profile_link':
        return { success: true, profileLink, note: 'Text them this private link; remind them only they can open it.' };

      case 'finalize_profile': {
        b.verificationStatus = 'builder_confirmed';
        b.visibilityStatus = 'public';
        await b.save();
        await updateBuilderScores(b);
        finalizeCalled = true;
        return { success: true, profileLink, message: 'Profile locked in and visible to founders.' };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // Founder-ready: enough to confidently put in front of a founder → wrap up.
  const hasContribProject = (snapshot.projects || []).some((p: any) => p.contribution);
  const hasAvailability = snapshot.availability?.hoursPerWeek != null || snapshot.availability?.availableNow;
  const founderReady = (snapshot.profileScore ?? 0) >= 80 && hasContribProject && hasAvailability;
  const founderReadyNote = founderReady && !isFollowup && !params.intro
    ? `\n[system: this profile is founder-ready (profileScore ${snapshot.profileScore}). Proactively call finalize_profile and send_profile_link, tell them it's locked in and you'll ping them here when a founder wants an interview, and STOP manufacturing gaps to ask about — but stay available for their questions.]`
    : '';

  const systemContext = [
    AGENT_PERSONA,
    `\n${BUILDER_DATA_SCHEMA}`,
    created ? '\nThis builder had no profile yet — you just started a fresh one. Build it up from zero, one easy question at a time.' : '',
    memoryText ? `\nMEMORY (already told you — never re-ask):\n${memoryText}` : '',
    `\nCURRENT PROFILE SNAPSHOT (may be stale; call get_builder_profile to confirm):\n${JSON.stringify(snapshot)}`,
    founderReadyNote,
  ].join('\n');

  const kickoffNote = params.kickoff
    ? "[system: the builder just verified their phone. Open the conversation in 1-2 short bubbles: greet them by first name, say you're here to get their DevLabs profile founder-ready, and ask the single most important missing thing.]"
    : '';

  const followupTurnNote = isFollowup
    ? `[system: your background homework finished. FINDINGS:\n${followupNote || '(nothing useful came back)'}\n\nText the builder in 1-3 SHORT bubbles (blank line between each). LEAD with the single most surprising/specific thing you found and say it like you just KNOW it — do NOT explain that you scraped, searched, enriched, or researched anything. Then ask ONE sharp follow-up. If nothing useful came back, just ask your next question casually (don't mention you looked). Natural, a little cheeky, no buzzwords.]`
    : '';

  const introTurnNote = params.intro
    ? `[system: THE BIG MOMENT — a founder just asked to be introduced to this builder. This is the surprise we promised: they did nothing, and now a real founder wants them.
Founder: ${params.intro.founderName} at ${params.intro.company}. Role: ${params.intro.roleTitle}.${params.intro.schedulingLink ? `\nFounder's booking link: ${params.intro.schedulingLink}` : ''}
Write the notification YOURSELF in 2-4 SHORT bubbles (blank line between each). It MUST be personalized to THIS builder using MEMORY + their profile snapshot above — open with something specific you genuinely know about their work (a project, a win, a skill they're known for) so it reads like a person who follows them, never a mass alert. Then tell them THIS founder at THIS company wants to talk about THIS role and why they'd be a fit given what you know. ${params.intro.schedulingLink ? "Hand them the booking link so they can grab an interview slot themselves — work it in naturally, don't say 'here is a link'." : "Tell them to reply here and you'll set up a time."} Close by asking if they're interested. Never a template, never job-board language, no buzzwords, no emojis.]`
    : '';

  // Intro/follow-up turns don't need the scheduling tools (no scraping/finalizing here).
  const tools = isFollowup || params.intro ? BASE_TOOLS : [...BASE_TOOLS, ...SCHEDULING_TOOLS];

  const messages: AgentMessage[] = [
    { role: 'system', content: systemContext },
    ...history,
    ...(resumeNote ? [{ role: 'system' as const, content: resumeNote }] : []),
    ...(autoLinkNote ? [{ role: 'system' as const, content: autoLinkNote }] : []),
    ...(kickoffNote ? [{ role: 'system' as const, content: kickoffNote }] : []),
    ...(followupTurnNote ? [{ role: 'system' as const, content: followupTurnNote }] : []),
    ...(introTurnNote ? [{ role: 'system' as const, content: introTurnNote }] : []),
    ...(params.kickoff || isFollowup || params.intro ? [] : [{ role: 'user' as const, content: userText }]),
  ];

  let agentResponse = await generateOpenRouterAgentTurn({ messages, tools, temperature: 0.6, maxTokens: 450 });
  let iterations = 0;
  const MAX_ITERATIONS = 6;

  while (agentResponse.tool_calls?.length && iterations < MAX_ITERATIONS) {
    iterations++;
    messages.push({ role: 'assistant', content: agentResponse.content ?? null, tool_calls: agentResponse.tool_calls });
    const toolResults = await Promise.all(
      agentResponse.tool_calls.map(async (tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        console.log(`[imessageBuilderAgent] tool: ${tc.function.name}`, args);
        const result = await runTool(tc.function.name, args);
        return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
      })
    );
    messages.push(...toolResults);
    agentResponse = await generateOpenRouterAgentTurn({ messages, tools, temperature: 0.6, maxTokens: 450 });
  }

  let replies = splitIntoBubbles(agentResponse.content || '');
  // If the model came back empty, retry once before any fallback — we'd much
  // rather send a real generated message than a canned one.
  if (!replies.length) {
    const retry = await generateOpenRouterAgentTurn({ messages, tools, temperature: 0.7, maxTokens: 450 });
    replies = splitIntoBubbles(retry.content || '');
  }
  // Last-resort safety net only (model returned nothing twice). Still contextual —
  // never a generic blast.
  if (!replies.length) {
    const first = (builder.name || 'there').trim().split(/\s+/)[0];
    if (params.intro) {
      const i = params.intro;
      replies = [`${first} — ${i.founderName} at ${i.company} just asked to talk to you about ${i.roleTitle}.`];
      replies.push(i.schedulingLink ? `grab a time that works for you: ${i.schedulingLink}` : `want me to line up a time? reply here.`);
    } else if (finalizeCalled) {
      replies = [`okay cool — we've got your profile locked in.`, `i'll text you right here when a founder wants to hire you. peek anytime: ${profileLink}`];
    } else if (params.kickoff) {
      replies = [`hey ${first}, devlabs here.`, `let's get your builder profile founder-ready — what's your github?`];
    } else if (isFollowup) {
      replies = [`ok, took a look — got what i needed.`];
    } else {
      replies = ["got it — what's next?"];
    }
  }
  // Guarantee the profile link goes out on finalize.
  if (finalizeCalled && !replies.some((r) => r.includes(profileLink))) {
    replies.push(`here's your profile: ${profileLink}`);
  }

  // Auto-capture durable facts so we never re-ask (belt-and-suspenders to remember_fact).
  if (!params.kickoff && !isFollowup && userText) {
    try {
      await extractAndStoreFacts(memRef, userText, memoryText);
    } catch (err) {
      console.warn('[imessageBuilderAgent] fact capture failed', err);
    }
  }

  const scheduled = !isFollowup && (followUp.sources.length > 0 || followUp.research || followUp.links.length > 0);
  console.log('[imessageBuilderAgent] done', { builderId, iterations, finalizeCalled, scheduled, mode: params.mode || 'normal' });
  return {
    replies,
    completed: finalizeCalled,
    builderId,
    followUp: scheduled ? followUp : undefined,
  };
}
