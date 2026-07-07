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
import { formatDossierForAgent } from '@/lib/talent/builderDossier';
import { appendSessionMemory, formatSessionMemoryBlock } from '@/lib/talent/builderSessionMemory';
import { extractResumeFields, writeResumeExtractionToBuilder, type ExtractedResume } from '@/lib/talent/builderResumeExtract';
import { enrichBuilderProfile, type EnrichmentSource } from '@/lib/talent/builderEnrichment';
import { aggregateInferredSkills } from '@/lib/talent/builderEnrichment/apply';
import { deepResearchBuilder } from '@/lib/talent/builderDeepResearch';
import { extractUrls, classifyLink, processGenericLink } from '@/lib/talent/builderLinkProcessor';
import IntroRequest from '@/models/talent/IntroRequest';
import MatchRecord from '@/models/talent/MatchRecord';
import MessageThread from '@/models/talent/MessageThread';
import Opportunity from '@/models/talent/Opportunity';
import { submitTrialByBuilder } from '@/lib/talent/trialFlow';
import { respondToIntro, notifyFounderOfBuilderInterest } from '@/lib/talent/introFlow';
import { sendThreadMessage } from '@/lib/talent/messageFlow';

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

function builderFirstName(claim: any, snapshot: { name?: string | null }): string {
  const raw = claim.metadata?.builderName || snapshot.name || 'there';
  return raw.trim().split(/\s+/)[0] || 'there';
}

/** Soft context about what's missing — facts for the agent to reason over, not a script. */
function buildProfileGapHint(
  snapshot: any,
  dossier?: { draftedHeadline?: string | null; inferredLinks?: Record<string, string | null | undefined> } | null
): string {
  const gaps: string[] = [];
  if (!snapshot.links?.github) {
    const inferred = dossier?.inferredLinks?.github;
    gaps.push(inferred ? `GitHub URL (research found ${inferred} — confirm or ask them to drop the link)` : 'GitHub URL');
  }
  if (!snapshot.links?.linkedin) {
    const inferred = dossier?.inferredLinks?.linkedin;
    gaps.push(inferred ? `LinkedIn URL (research found ${inferred} — confirm or ask them to drop the link)` : 'LinkedIn URL');
  }
  if (!snapshot.links?.devpost) gaps.push('Devpost (if they have hackathon projects)');
  if (!snapshot.links?.portfolio && !snapshot.links?.personalWebsite) gaps.push('portfolio / personal site');
  if (!snapshot.headline?.trim()) {
    gaps.push(dossier?.draftedHeadline ? `headline (dossier draft: "${dossier.draftedHeadline}")` : 'headline');
  }
  if (!snapshot.bio?.trim()) gaps.push('bio');
  if ((snapshot.experiences?.length || 0) < 1) gaps.push('work history');
  if ((snapshot.projectCount || 0) < 1) gaps.push('proof-of-work projects');
  if (!String(snapshot.workAuthorization || '').trim()) gaps.push('visa / work authorization');
  if (snapshot.availability?.availableNow !== true) gaps.push('availability (available now?)');
  if (!gaps.length) return '';
  return `PROFILE GAPS (proactively work these — prefer asking for a link over making them type things out): ${gaps.join('; ')}.`;
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
The builder verified by texting you from their phone (linked to their email + DevLabs profile) — identity is settled, don't re-verify. Your job: fill the gaps and make their proof-of-work clear to founders.

HOW YOU THINK (reason, don't run a script):
- Each turn, look at the SNAPSHOT (missingFields + what's thin) and the DOSSIER homework. Ask yourself: what's the ONE highest-impact thing that makes this profile more convincing to a founder right now? Do that. Never follow a rigid step list — let the conversation flow naturally while always moving the profile forward.
- You are judged on the FINISHED profile, not on asking lots of questions. Fewer, smarter moves win — but stay proactive; don't go passive waiting for them to volunteer info.

ONBOARDING A NEW BUILDER (natural conversation, not a form):
- You've already done homework before the first text (DOSSIER). Open like a friend who genuinely looked them up: welcome them, reflect something specific and impressive about their work, ask a real question about what they're doing now. Let the chat breathe — react to their answers before jumping ahead.
- As you learn who they are, weave in headline/role confirmation naturally ("i've got you down as X — still accurate?"). When they correct you, write it that turn.
- Never open with a profile link, never say "locked in" on the first message, never dump GitHub + LinkedIn + visa in one text.

LINKS ARE YOUR SUPERPOWER — make profile-building effortless:
- The easiest thing for a builder is to drop a URL. You scrape it quietly and fill the profile. Proactively ask for whatever link would help most right now: GitHub, LinkedIn, Devpost, portfolio, a repo they're proud of, a demo, a resume PDF. One link ask at a time, casual ("what's your github?" / "drop your linkedin if you've got one" / "got a devpost for that hackathon win?").
- ANY link they send is auto-saved and checked in the background — react casually ("oh sick", "love it"), never announce scraping. Findings land next turn; then reference specifics naturally.
- Prefer asking for a link over making them type out work history, project lists, or skills you could pull from that link. If they don't have a link, then ask the fact directly.
- After GitHub/LinkedIn land, confirm imported work history with ONE yes/no before treating it as final. Ask if anything cool is missing from their public profile.

STAY PROACTIVE every turn:
- If the PROFILE GAPS block (or missingFields) shows something thin, go after it — don't wait. If you need GitHub and don't have it, ask. If headline is empty but dossier has a draft, propose it. If visa status is missing, ask when the moment fits.
- Balance: one question per turn, but always nudge toward the next gap. You're building their profile WITH them, not interviewing them.

ACT — don't narrate (this is critical):
- The moment a builder tells you a fact — a job/internship, school, location, skill, work authorization, a link — WRITE it to the profile with update_builder_data THAT SAME TURN, before you move on. A job or internship is an EXPERIENCE entry (title + company + what they did); "interning at Google" must become an experience, not just a sentence in chat.
- NEVER say "I've updated / got that updated / added that" unless you actually called update_builder_data this turn and it succeeded. Claiming a change you didn't make is the worst thing you can do — the profile stays empty and you look broken.
- When you make a tool call, also produce a real reply. Don't go silent after acting.

ALWAYS:
- Call get_builder_profile before claiming anything about their profile. Never guess what's missing.
- Read the MEMORY block below — stuff they already told you. NEVER re-ask anything covered there; if a fact there fills a gap, write it instead of asking.
- Read PROFILE GAPS if present — that's your proactive to-do list. Ask for links first when they'd fill multiple gaps at once.
- After you learn something useful, call remember_fact (we also auto-capture, but log preferences/constraints explicitly).
- After a write, briefly confirm what landed, then go after the next gap — one ask at a time.

DO THE WORK — don't make them fill out a form:
- Draft headline/bio/skills from research or scraped links — propose for confirmation rather than silently writing. When they confirm or send a link, apply it.
- If they push back ("you scraped my github, you know", "you come up with something", "too many questions", "just assume") — STOP asking. Draft it from what you have, apply it, and move on. Friction means you're interrogating; switch to doing.

PROJECTS — ask once, then batch (never go project-by-project):
- Ask ONE question: "did you build these solo, or were some team efforts?"
- If solo / "all me": the whole project is theirs — don't single out a "contribution". RIGHT THAT TURN, draft a concrete one-line contribution for EACH project from its description + tech stack and write them ALL in ONE update_builder_data call (projects[] with id + builderContribution), then tell them you did it. Do NOT reply "what's next" and wait — act first.
- If team: ask only about the 1-2 strongest projects; for the rest, write a sensible default in the same call.
- For events/programs (hackathons, etc.), "founded it / ran it / organized it" IS a complete contribution. Never re-ask it.

GET TO KNOW THEM — homework informs the chat, links build the profile:
- Dossier/research is background knowledge — don't auto-write it to the profile without confirmation.
- Links they send are auto-saved and scraped quietly; react casually, reference findings naturally next turn.
- run_enrichment / deep_research once you have their URLs. Verify work history before writing as fact.

YOUR WRITE TOOL: update_builder_data is your single tool to change ANYTHING — profile fields, projects, or their user account — in one call. You have full rights; no permission needed. See BUILDER_DATA_SCHEMA below for every field. Batch related changes into one call.

WRITING RULES (bio/headline/experience — founders READ these):
- Plain, concrete, builder language. Lead with what they've actually shipped and their real skills. The bio is the first thing a founder sees on a recommendation — make it specific and convincing, not flowery. Tight enough that a founder knows in one line whether to talk to them.
- Fold their TOP technical skills (from github/projects/linkedin) into builder.skills via update_builder_data — NOT rolePreference. rolePreference is for job types ("full-stack engineer"), skills is for tech ("React", "Python", "TypeScript").
- After LinkedIn/GitHub enrichment lands, confirm imported work history with ONE yes/no ("pulled [Title] at [Company] from linkedin — that track?"). Only write experiences after they confirm. Never ask them to re-list jobs you already scraped.
- BANNED (LinkedIn-bluff, never use): "passionate", "process-focused", "community-first", "technologist", "innovative", "loves connecting", "driven", "results-oriented", "synergy", "leverage", "transformative", "cutting-edge".
- The bio is about the BUILDER's proof-of-work — NEVER paste a description of a program/company as their bio. Good: "Ships mobile apps in Flutter; 3 hackathon wins; runs DevLabs." Bad: "Process-focused builder passionate about innovative solutions."

ENRICHMENT PRIORITY (chase the biggest gap — usually a missing link):
1. GitHub + LinkedIn URLs (ask for them — highest leverage) 2. Devpost / portfolio / flagship repo 3. resume PDF if still thin 4. project contributions + headline/bio 5. work authorization 6. availability. NEVER ask hours per week.

RESUME (high value — ask at the right moment):
- After github/linkedin homework lands, if work history, skills, or projects are still thin, ask ONCE: "got a resume pdf? just drop it in here — i'll cross-check it against what we already pulled and fill the gaps."
- When they send a PDF (BlueBubbles attachment), we parse it automatically and cross-check against their existing profile — new skills/experiences/projects get added; we only overwrite empty or clearly weaker fields.
- Acknowledge specifics ("pulled your cloudflare internship + 3 projects from the resume"). Confirm imported jobs with ONE yes/no. Never ask them to re-type what's already on the resume.

PROFILE LINK: only when they ask to see/view their profile, or after you've confirmed their experience, projects, and visa status through real back-and-forth — then call send_profile_link. Never send the profile link on your first message or before they've had a chance to correct wrong info.

FINISHING: when it's genuinely founder-ready (confirmed proof links + a solid project/experience + clear headline + work authorization + availableNow set), call finalize_profile, then tell them in your own warm voice that their profile is locked in and you'll ping them right here when a founder wants to hire them — and share the link send_profile_link returns. Don't finalize a thin profile or one you haven't confirmed with them. Never finalize on kickoff or before they've replied at least once. Once finalized, DON'T keep manufacturing gaps to ask about — but DO stay available: answer their questions and help with anything they bring up.

NEVER say "this helps you get matched / rank higher / get noticed." Say "this makes your profile easy for a founder to read."`;

// Full editable schema the agent can write via update_builder_data. Keep in sync
// with src/models/talent/BuilderProfile.ts, ProjectRecord.ts, and the User model.
const BUILDER_DATA_SCHEMA = `BUILDER_DATA_SCHEMA — everything you can set via update_builder_data (use dot-notation for nested):

builder (BuilderProfile):
- name (string), headline (string), bio (string), avatarUrl (string), email (string), phone (string)
- location (string), timezone (string), universityOrCompany (string), graduationYear (number)
- currentStatus (enum: student | full_time | unemployed | founder | freelancer | other)
- workAuthorization (string, e.g. "US citizen" / "F1 OPT" / "needs sponsorship")
- rolePreference (string[] — job types they want, e.g. "Full-stack engineer"), skills (string[] — technical skills, e.g. "React", "Python")
- preferredWorkType (string[])
- links.{ linkedin, github, portfolio, personalWebsite, resume, devpost, twitter } (string)
- availability.{ availableNow (bool), desiredCompensation (string), salaryExpectationMin (number), salaryExpectationMax (number), remotePreference (enum: remote | in_person | hybrid | unspecified) }
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
            description: 'BuilderProfile fields to set. Nested allowed, e.g. {"headline": "...", "links.github": "...", "workAuthorization": "US citizen", "rolePreference": ["..."]}.',
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
      description: 'Mark the profile claimed + founder-ready (only when proof links, confirmed project/experience, clear headline, work authorization, and availableNow are set — and you have confirmed details with the builder in conversation). Returns the private profile link to share.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'submit_trial_by_text',
      description: "Submit the builder's completed trial project (a video walkthrough link + GitHub repo link) when they tell you it's done over text. Only call this when the builder has an OPEN trial (see OPEN ITEMS) and has given you both a video link and a GitHub link this conversation. If they only give one, ask for the other before calling.",
      parameters: {
        type: 'object',
        properties: {
          opportunityId: { type: 'string', description: "Omit to use the builder's current open trial from OPEN ITEMS/active context." },
          videoUrl: { type: 'string', description: 'Walkthrough video link (Loom, Google Drive, YouTube, etc).' },
          githubUrl: { type: 'string', description: 'GitHub repo URL for the trial submission.' },
          notes: { type: 'string' },
        },
        required: ['videoUrl', 'githubUrl'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'respond_to_intro',
      description: "Record the builder's response to an open intro request from a founder. Use 'interested' the MOMENT they show any positive signal at all — even casual ('sounds good', 'yeah tell me more', 'sure I'd talk to them') — this just notifies the founder they're warm, it is NOT a commitment and you can call it once and keep talking normally after. Use 'accept' only for a clear, explicit yes to actually connect/schedule. Use 'decline' for a clear no.",
      parameters: {
        type: 'object',
        properties: {
          introRequestId: { type: 'string', description: "Omit to use the builder's current open/pending intro from OPEN ITEMS/active context." },
          response: { type: 'string', enum: ['interested', 'accept', 'decline'] },
          note: { type: 'string' },
        },
        required: ['response'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reply_to_founder_message',
      description: "Send the builder's reply back to the founder on the DevLabs message thread. Call this when the builder is clearly replying to a founder's direct message (see OPEN ITEMS / active context) rather than talking about their profile.",
      parameters: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'Omit to use the current active thread from active context.' },
          body: { type: 'string', description: "The builder's reply text, verbatim." },
        },
        required: ['body'],
      },
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

/** Summarize what enrichment wrote so the agent can confirm with the builder. */
function formatProfileWritebackNote(builder: any, projects: any[]): string {
  const lines: string[] = [];
  const exps = (builder.experiences || []).slice(0, 4);
  if (exps.length) {
    lines.push(
      `Work history now on profile: ${exps
        .map((e: any) => {
          const dates = e.dateRange ? ` (${e.dateRange})` : '';
          return `${e.title || 'Role'} at ${e.company || 'Company'}${dates}`;
        })
        .join('; ')}`
    );
  }
  if (builder.headline) lines.push(`Headline: ${builder.headline}`);
  const skills = (builder.skills || []).slice(0, 12);
  if (skills.length) lines.push(`Technical skills saved: ${skills.join(', ')}`);
  const stacks = [...new Set(projects.flatMap((p: any) => p.techStack || []).slice(0, 12))];
  if (stacks.length) lines.push(`Project tech stacks: ${stacks.join(', ')}`);
  return lines.join('\n');
}

function formatLinkedInEnrichmentSummary(sourceResult: any): string {
  const writeResult = sourceResult?.meta?.writeResult;
  const extractedCount = sourceResult?.meta?.extractedExperienceCount;
  if (!writeResult && !extractedCount) return '';
  const lines: string[] = [];
  if (writeResult?.experienceHighlights?.length) {
    lines.push(`LinkedIn roles imported: ${writeResult.experienceHighlights.join('; ')}`);
  } else if (typeof extractedCount === 'number' && extractedCount > 0) {
    lines.push(`LinkedIn: ${extractedCount} experience cards parsed`);
  }
  if (writeResult.experiencesAdded > 0) {
    lines.push(`Added ${writeResult.experiencesAdded} new experience${writeResult.experiencesAdded === 1 ? '' : 's'} to profile`);
  }
  if (writeResult.skillsAdded > 0) {
    lines.push(`Added ${writeResult.skillsAdded} skill${writeResult.skillsAdded === 1 ? '' : 's'} from LinkedIn`);
  }
  if (writeResult.headline) lines.push(`Headline from LinkedIn: ${writeResult.headline}`);
  return lines.join('\n');
}

/** Run the scheduled scrape/research, save what it found, and return a note for the model. */
async function executeFollowUpJob(
  builderId: string,
  memRef: MemoryRef,
  job: FollowUpJob,
  runtime?: RuntimeEnv,
  claim?: any
): Promise<string> {
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
      const hasLinkedin = job.sources.includes('linkedin');
      const enrichmentTimeoutMs = hasLinkedin ? 150_000 : 45_000;
      const inboundCount = (claim?.messages || []).filter((m: any) => m.direction === 'inbound').length;
      const deferExperiences = inboundCount < 4;
      const res = await withTimeout(
        enrichBuilderProfile({ builderId, sources: job.sources, runtime, deferExperiences }),
        enrichmentTimeoutMs,
        'enrichment'
      );
      for (const f of res.profileFieldsUpdated) await resolveBuilderMemoryField(memRef, f);
      await aggregateInferredSkills(builderId);
      const builder = await reloadBuilder(builderId);
      const projects = await getProjects(builderId);
      const writeback = builder ? formatProfileWritebackNote(builder, projects) : '';
      const linkedinSummary = formatLinkedInEnrichmentSummary(res.sources.find((s) => s.source === 'linkedin'));

      if (claim && res.profileFieldsUpdated.length) {
        const memoryBits = [
          linkedinSummary || null,
          res.profileFieldsUpdated.length ? `fields: ${res.profileFieldsUpdated.join(', ')}` : null,
          res.projectsCreated ? `projects +${res.projectsCreated}` : null,
        ].filter(Boolean);
        appendSessionMemory(claim, `Enrichment writeback — ${memoryBits.join('; ')}`);
      }

      parts.push(
        `Scraped ${job.sources.join(' + ')}: filled [${res.profileFieldsUpdated.join(', ') || 'nothing new'}], projects +${res.projectsCreated} new / ${res.projectsUpdated} updated.${linkedinSummary ? `\n${linkedinSummary}` : ''}${writeback ? `\n${writeback}` : ''}`
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
  resume?: { text: string; extracted?: Record<string, unknown> } | null;
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
  /** A founder just sent a real trial project — one-shot notification, same shape as `intro`. */
  trialAssigned?: {
    founderName: string;
    company: string;
    roleTitle: string;
    trialTitle: string;
    goal?: string | null;
    deliverables?: string[];
    successCriteria?: string[];
    timeline?: string | null;
    deadlineAt?: string | null;
  };
  /** A founder just hired this builder — one-shot notification, same shape as `intro`. */
  hired?: {
    founderName: string;
    company: string;
    roleTitle: string;
    note?: string | null;
  };
  /**
   * Last thing we proactively pinged the builder about — the default target when
   * their reply doesn't explicitly name an opportunity/thread. See BuilderProfileClaim.activeContext.
   */
  activeContext?: {
    kind: 'intro' | 'trial' | 'thread' | null;
    opportunityId?: string | null;
    introRequestId?: string | null;
    threadId?: string | null;
  } | null;
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
  const followUp: FollowUpJob = { sources: [], research: false, links: [] };
  if (isFollowup && params.followUpJob) {
    followupNote = await executeFollowUpJob(builderId, memRef, params.followUpJob, runtime, claim);
  }

  // Resume came in this turn → extract, cross-check, and write back to profile (same pipeline as enrichment).
  let resumeNote = '';
  if (params.resume?.text) {
    try {
      const extracted =
        (params.resume.extracted as ExtractedResume | undefined) || (await extractResumeFields(params.resume.text));
      const writeResult = await writeResumeExtractionToBuilder(builderId, extracted);

      for (const field of writeResult.profileFieldsUpdated) {
        await resolveBuilderMemoryField(memRef, field);
      }
      appendSessionMemory(
        claim,
        `Resume PDF processed — new: ${writeResult.added.join(', ') || 'none'}; improved: ${writeResult.improved.join(', ') || 'none'}`
      );

      const reloaded = (await reloadBuilder(builderId)) || builder;
      const projects = await getProjects(builderId);
      const writeback = formatProfileWritebackNote(reloaded, projects);

      if (writeResult.added.length || writeResult.improved.length) {
        const highlights = [...writeResult.added, ...writeResult.improved].slice(0, 8).join(', ');
        resumeNote = `[system: resume PDF cross-checked and written to builder profile (scores, search index, embeddings refreshed).
NEW: ${writeResult.added.join(', ') || 'none'}
IMPROVED: ${writeResult.improved.join(', ') || 'none'}
${writeback ? `Profile now:\n${writeback}` : ''}
Acknowledge 1-2 specific things you pulled (a job, project, or skill). Confirm imported work history with ONE yes/no if experiences changed. Ask only about gaps still in missingFields — do NOT re-ask for info already on the resume.
Summary: ${highlights}]`;
        if (writeResult.newLinks.github && !followUp.sources.includes('github')) followUp.sources.push('github');
        if (writeResult.newLinks.linkedin && !followUp.sources.includes('linkedin')) followUp.sources.push('linkedin');
      } else {
        resumeNote = `[system: resume PDF cross-checked — mostly matched existing profile (${writeResult.unchanged.slice(0, 6).join(', ') || 'no major changes'}). Thank them, mention you're aligned, and ask ONE thing still thin in missingFields.]`;
      }
    } catch (err) {
      resumeNote = `[system: couldn't read that resume file (${err instanceof Error ? err.message : 'parse error'}). Ask them to resend a text-based PDF (not a scanned image-only PDF).]`;
    }
  }

  let finalizeCalled = false;
  // Stable private link to this builder's own profile page (token gated to them).
  const profileLink = claimProfileViewUrl(ensureClaimViewToken(claim), runtime);

  // Kickoff: dossier is research-only — do NOT auto-scrape GitHub/LinkedIn until the builder confirms links.

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
  const sessionMemory = formatSessionMemoryBlock(claim);
  const dossierText = formatDossierForAgent(claim.metadata?.dossier);
  const freshBuilder = (await reloadBuilder(builderId)) || builder;
  const snapshot = buildProfileSnapshot(freshBuilder, await getProjects(builderId));

  // OPEN ITEMS: everything currently live for this builder, so the agent can resolve
  // an ambiguous reply to the right opportunity/thread without asking every time.
  const [openIntros, openTrialMatches, openThreads] = await Promise.all([
    IntroRequest.find({ builderId, status: 'requested' }).select('_id opportunityId founderName').lean(),
    MatchRecord.find({ builderId, 'trialProject.status': { $in: ['sent', 'in_progress', 'rejected'] } })
      .select('opportunityId trialProject')
      .lean(),
    MessageThread.find({ builderId }).select('_id opportunityId founderName lastMessagePreview').lean(),
  ]);
  const openOppIds = [
    ...openIntros.map((i: any) => i.opportunityId),
    ...openTrialMatches.map((m: any) => m.opportunityId),
    ...openThreads.map((t: any) => t.opportunityId),
  ];
  const openOpportunities = openOppIds.length
    ? await Opportunity.find({ _id: { $in: openOppIds } }).select('roleTitle company').lean()
    : [];
  const oppById = new Map(openOpportunities.map((o: any) => [String(o._id), o]));

  const openItemLines: string[] = [];
  for (const i of openIntros as any[]) {
    const opp = oppById.get(String(i.opportunityId));
    openItemLines.push(`- Pending intro from ${i.founderName || 'a founder'} for ${opp?.roleTitle || 'a role'} at ${opp?.company || ''} (introRequestId: ${i._id})`);
  }
  for (const m of openTrialMatches as any[]) {
    const opp = oppById.get(String(m.opportunityId));
    openItemLines.push(`- Open trial "${m.trialProject?.title || 'trial'}" for ${opp?.roleTitle || 'a role'} at ${opp?.company || ''} (opportunityId: ${m.opportunityId})`);
  }
  for (const t of openThreads as any[]) {
    const opp = oppById.get(String(t.opportunityId));
    openItemLines.push(
      `- Open conversation with ${t.founderName || 'a founder'} about ${opp?.roleTitle || 'a role'} at ${opp?.company || ''} (threadId: ${t._id})${t.lastMessagePreview ? ` — last: "${t.lastMessagePreview}"` : ''}`
    );
  }
  const openItemsNote = openItemLines.length ? `\nOPEN ITEMS FOR THIS BUILDER:\n${openItemLines.join('\n')}` : '';

  const activeContext = params.activeContext || null;
  const activeContextNote = activeContext?.kind
    ? `\nACTIVE CONTEXT (default target if the reply is a clear continuation and doesn't name a company/role): kind=${activeContext.kind}${activeContext.opportunityId ? ` opportunityId=${activeContext.opportunityId}` : ''}${activeContext.introRequestId ? ` introRequestId=${activeContext.introRequestId}` : ''}${activeContext.threadId ? ` threadId=${activeContext.threadId}` : ''}. If OPEN ITEMS shows more than one live thing and the reply is ambiguous, ask a quick clarifying question instead of guessing.`
    : '';

  // Fallbacks the new tools use server-side when the model omits an explicit ID.
  const fallbackOpportunityId = activeContext?.opportunityId || (openTrialMatches[0] ? String((openTrialMatches[0] as any).opportunityId) : null);
  const fallbackIntroRequestId = activeContext?.introRequestId || (openIntros[0] ? String((openIntros[0] as any)._id) : null);
  const fallbackThreadId = activeContext?.threadId || (openThreads[0] ? String((openThreads[0] as any)._id) : null);

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
                const inboundTurns = (claim.messages || []).filter((m: any) => m.direction === 'inbound').length;
                const enr = await withTimeout(
                  enrichBuilderProfile({
                    builderId,
                    sources: res.linksChanged,
                    runtime,
                    deferExperiences: inboundTurns < 4,
                  }),
                  res.linksChanged.includes('linkedin') ? 150_000 : 45_000,
                  'enrichment'
                );
                for (const f of enr.profileFieldsUpdated) await resolveBuilderMemoryField(memRef, f);
              } catch { /* best effort */ }
            } else {
              for (const s of res.linksChanged) if (!followUp.sources.includes(s)) followUp.sources.push(s);
            }
          }

          const snap = buildProfileSnapshot((await reloadBuilder(builderId)) || b, await getProjects(builderId));
          if (res.builderUpdated.some((k: string) => k === 'headline' || k.startsWith('headline'))) {
            claim.metadata = { ...(claim.metadata || {}), headlineConfirmed: true };
          }
          if (res.linksChanged.length) {
            claim.metadata = { ...(claim.metadata || {}), linksDiscussed: true };
          }
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

      case 'send_profile_link': {
        const inboundTurns = (claim.messages || []).filter((m: any) => m.direction === 'inbound').length;
        if (params.kickoff || inboundTurns < 2) {
          return { success: false, error: 'Too early — confirm their experience and projects in conversation before sharing the profile link.' };
        }
        return { success: true, profileLink, note: 'Text them this private link; remind them only they can open it.' };
      }

      case 'finalize_profile': {
        const inboundTurns = (claim.messages || []).filter((m: any) => m.direction === 'inbound').length;
        const b = (await reloadBuilder(builderId)) || builder;
        const snap = buildProfileSnapshot(b, await getProjects(builderId));
        if (params.kickoff || inboundTurns < 2) {
          return { success: false, error: 'Too early — need real back-and-forth confirming experience, projects, and visa status first.' };
        }
        if (!String(snap.workAuthorization || '').trim()) {
          return { success: false, error: 'Ask about visa / work authorization status before finalizing.' };
        }
        b.verificationStatus = 'builder_confirmed';
        b.visibilityStatus = 'public';
        await b.save();
        await updateBuilderScores(b);
        finalizeCalled = true;
        return { success: true, profileLink, message: 'Profile locked in and visible to founders.' };
      }

      case 'submit_trial_by_text': {
        const opportunityId = (typeof args.opportunityId === 'string' && args.opportunityId) || fallbackOpportunityId;
        if (!opportunityId) return { success: false, error: 'No open trial found for this builder.' };
        const videoUrl = typeof args.videoUrl === 'string' ? args.videoUrl : '';
        const githubUrl = typeof args.githubUrl === 'string' ? args.githubUrl : '';
        if (!videoUrl || !githubUrl) return { success: false, error: 'Need both a video link and a GitHub link.' };
        const res = await submitTrialByBuilder({
          opportunityId,
          builderId,
          videoUrl,
          githubUrl,
          notes: typeof args.notes === 'string' ? args.notes : undefined,
        });
        if ('error' in res && res.error) return { success: false, error: res.error };
        return { success: true, trialProject: (res as any).trialProject };
      }

      case 'respond_to_intro': {
        const introRequestId = (typeof args.introRequestId === 'string' && args.introRequestId) || fallbackIntroRequestId;
        if (!introRequestId) return { success: false, error: 'No open intro request found for this builder.' };
        const response = args.response as 'interested' | 'accept' | 'decline';
        if (response === 'interested') {
          const res = await notifyFounderOfBuilderInterest({
            introRequestId,
            builderId,
            note: typeof args.note === 'string' ? args.note : undefined,
          });
          if ('error' in res && res.error) return { success: false, error: res.error };
          return { success: true, notified: (res as any).notified };
        }
        const res = await respondToIntro({
          introRequestId,
          builderId,
          response,
          note: typeof args.note === 'string' ? args.note : undefined,
        });
        if ('error' in res && res.error) return { success: false, error: res.error };
        return { success: true, status: (res as any).intro?.status };
      }

      case 'reply_to_founder_message': {
        const threadId = (typeof args.threadId === 'string' && args.threadId) || fallbackThreadId;
        if (!threadId) return { success: false, error: 'No open founder conversation found.' };
        const body = typeof args.body === 'string' ? args.body : '';
        if (!body.trim()) return { success: false, error: 'No reply text given.' };
        const res = await sendThreadMessage({ threadId, senderType: 'builder', senderEmail: claim.builderEmail, body });
        if ('error' in res && res.error) return { success: false, error: res.error };
        return { success: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  // Founder-ready: enough to confidently put in front of a founder → wrap up.
  const inboundUserTurns = (claim.messages || []).filter((m: any) => m.direction === 'inbound').length;
  const hasWorkAuthorization = Boolean(String(snapshot.workAuthorization || '').trim());
  const hasContribProject = (snapshot.projects || []).some((p: any) => p.contribution);
  const hasAvailability = snapshot.availability?.availableNow === true;
  const conversationReady = inboundUserTurns >= 2 && hasWorkAuthorization;
  const founderReady =
    !params.kickoff &&
    conversationReady &&
    (snapshot.profileScore ?? 0) >= 70 &&
    hasContribProject &&
    hasAvailability &&
    Boolean(snapshot.links?.github || snapshot.links?.linkedin);
  const founderReadyNote = founderReady && !isFollowup && !params.intro && !params.trialAssigned && !params.hired
    ? `\n[system: profile looks strong (score ${snapshot.profileScore}). If they've confirmed their details, you can finalize_profile and send_profile_link — otherwise keep proactively filling gaps.]`
    : '';

  const profileGapHint = buildProfileGapHint(snapshot, claim.metadata?.dossier);

  const systemContext = [
    AGENT_PERSONA,
    `\n${BUILDER_DATA_SCHEMA}`,
    created ? '\nThis builder had no profile yet — you just started a fresh one. Use the DOSSIER below; propose drafts, don\'t interrogate.' : '',
    params.kickoff ? '\nContext: first text after phone verification — you have dossier homework. Welcome them, show you know their work, converse naturally toward a founder-ready profile.' : '',
    dossierText ? `\n${dossierText}` : '',
    profileGapHint ? `\n${profileGapHint}` : '',
    sessionMemory ? `\n${sessionMemory}` : '',
    memoryText ? `\nMEMORY (already told you — never re-ask):\n${memoryText}` : '',
    `\nCURRENT PROFILE SNAPSHOT (may be stale; call get_builder_profile to confirm):\n${JSON.stringify(snapshot)}`,
    founderReadyNote,
    openItemsNote,
    activeContextNote,
  ].join('\n');

  const profileStillThin =
    (snapshot.experiences?.length || 0) < 2 ||
    (snapshot.skills?.length || 0) < 4 ||
    !snapshot.bio ||
    (snapshot.projectCount || 0) < 1;
  const alreadySentResume = (claim.messages || []).some(
    (m: any) => m.direction === 'inbound' && /\(sent a resume\)|resume|\.pdf/i.test(String(m.body || ''))
  );
  const shouldAskResume = isFollowup && !params.resume?.text && profileStillThin && !alreadySentResume;
  const resumeAskSuffix = shouldAskResume
    ? `\nProfile is still thin on work history/projects/skills. After you react to findings, end with ONE casual ask: "got a resume pdf? just drop it here — i'll cross-check it against what we already pulled and fill the gaps." Don't make it sound like homework.`
    : '';

  const followupTurnNote = isFollowup
    ? `[system: background scrape finished. FINDINGS:\n${followupNote || '(nothing useful)'}\n\nReact naturally in 1-3 short bubbles — reference specifics without saying you scraped. Confirm work history before writing experiences. Then proactively ask for the next useful link or fact from PROFILE GAPS.${resumeAskSuffix}]`
    : '';

  const introTurnNote = params.intro
    ? `[system: THE BIG MOMENT — a founder just asked to be introduced to this builder. This is the surprise we promised: they did nothing, and now a real founder wants them.
Founder: ${params.intro.founderName} at ${params.intro.company}. Role: ${params.intro.roleTitle}.${params.intro.schedulingLink ? `\nFounder's booking link: ${params.intro.schedulingLink}` : ''}
Write the notification YOURSELF in 2-4 SHORT bubbles (blank line between each). It MUST be personalized to THIS builder using MEMORY + their profile snapshot above — open with something specific you genuinely know about their work (a project, a win, a skill they're known for) so it reads like a person who follows them, never a mass alert. Then tell them THIS founder at THIS company wants to talk about THIS role and why they'd be a fit given what you know. ${params.intro.schedulingLink ? "Hand them the booking link so they can grab an interview slot themselves — work it in naturally, don't say 'here is a link'." : "Tell them to reply here and you'll set up a time."} Close by asking if they're interested. Never a template, never job-board language, no buzzwords, no emojis.]`
    : '';

  const trialAssignedTurnNote = params.trialAssigned
    ? `[system: a founder just sent this builder a real trial project — this is their shot. Founder: ${params.trialAssigned.founderName} at ${params.trialAssigned.company}. Role: ${params.trialAssigned.roleTitle}. Trial: ${params.trialAssigned.trialTitle}.${params.trialAssigned.goal ? `\nGoal: ${params.trialAssigned.goal}` : ''}${params.trialAssigned.deliverables?.length ? `\nDeliverables: ${params.trialAssigned.deliverables.join('; ')}` : ''}${params.trialAssigned.successCriteria?.length ? `\nSuccess criteria (what "done" looks like to the founder): ${params.trialAssigned.successCriteria.join('; ')}` : ''}${params.trialAssigned.timeline ? `\nTimeline: ${params.trialAssigned.timeline}` : ''}${params.trialAssigned.deadlineAt ? `\nDeadline: ${params.trialAssigned.deadlineAt}` : ''}
Write the notification YOURSELF, personalized to THIS builder using MEMORY + profile snapshot above. This is a real brief, not a teaser — the builder must be able to start building from your text ALONE without opening a dashboard, so relay the FULL project: the goal, EVERY deliverable, the success criteria, and the deadline. Use a few short bubbles: (1) hype the moment + name the founder/company/role and trial title, (2) the goal in one line, (3) the deliverables as a short list (one per line, e.g. "• ..."), (4) the success criteria / what "done" means, (5) the deadline + tell them to just text you the GitHub link and a walkthrough video (Loom/Drive/YouTube) here when it's done. Keep each bubble tight, but do NOT drop any deliverable or criterion. Never a template, no buzzwords, no emojis.]`
    : '';

  const hiredTurnNote = params.hired
    ? `[system: THE BIGGEST MOMENT — a founder just hired this builder. Founder: ${params.hired.founderName} at ${params.hired.company}. Role: ${params.hired.roleTitle}.${params.hired.note ? `\nFounder's note: ${params.hired.note}` : ''}
Write the notification YOURSELF in 2-4 SHORT bubbles (blank line between each), personalized to THIS builder using MEMORY + profile snapshot above. Celebrate specifically — reference real work of theirs, not generic hype. Work in the founder's note if given (paraphrase it naturally, don't paste it verbatim). Close by saying the founder will be in touch on next steps. Never a template, no buzzwords, no emojis.]`
    : '';

  // Intro/trial/hire/follow-up turns are one-shot notifications — no scheduling tools.
  const isNotifyTurn = Boolean(params.intro || params.trialAssigned || params.hired);
  const tools = isFollowup || isNotifyTurn ? BASE_TOOLS : [...BASE_TOOLS, ...SCHEDULING_TOOLS];

  const messages: AgentMessage[] = [
    { role: 'system', content: systemContext },
    ...history,
    ...(resumeNote ? [{ role: 'system' as const, content: resumeNote }] : []),
    ...(autoLinkNote ? [{ role: 'system' as const, content: autoLinkNote }] : []),
    ...(followupTurnNote ? [{ role: 'system' as const, content: followupTurnNote }] : []),
    ...(introTurnNote ? [{ role: 'system' as const, content: introTurnNote }] : []),
    ...(trialAssignedTurnNote ? [{ role: 'system' as const, content: trialAssignedTurnNote }] : []),
    ...(hiredTurnNote ? [{ role: 'system' as const, content: hiredTurnNote }] : []),
    ...(params.kickoff || isFollowup || isNotifyTurn ? [] : [{ role: 'user' as const, content: userText }]),
  ];

  // Trial notifications relay a full project brief (goal + deliverables +
  // success criteria) across several bubbles, so they need more room than a
  // normal conversational turn.
  const notifyMaxTokens = params.trialAssigned ? 800 : 450;
  let agentResponse = await generateOpenRouterAgentTurn({ messages, tools, temperature: 0.6, maxTokens: notifyMaxTokens });
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
    const retry = await generateOpenRouterAgentTurn({ messages, tools, temperature: 0.7, maxTokens: notifyMaxTokens });
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
    } else if (params.trialAssigned) {
      const t = params.trialAssigned;
      replies = [`${first} — ${t.founderName} at ${t.company} just sent you a trial project: ${t.trialTitle}.`];
      if (t.goal) replies.push(`Goal: ${t.goal}`);
      if (t.deliverables?.length) replies.push(`What to build:\n${t.deliverables.map((d) => `• ${d}`).join('\n')}`);
      if (t.successCriteria?.length) replies.push(`Done means:\n${t.successCriteria.map((s) => `• ${s}`).join('\n')}`);
      replies.push(t.deadlineAt ? `Due ${t.deadlineAt}. Text me the GitHub link and a walkthrough video here when it's ready.` : `Text me the GitHub link and a walkthrough video here when it's ready.`);
    } else if (params.hired) {
      const h = params.hired;
      replies = [`${first} — congrats, ${h.founderName} at ${h.company} just hired you for ${h.roleTitle}.`];
      replies.push(`they'll be in touch on next steps.`);
    } else if (finalizeCalled) {
      replies = [`okay cool — we've got your profile locked in.`, `i'll text you right here when a founder wants to hire you. peek anytime: ${profileLink}`];
    } else if (params.kickoff) {
      const first = builderFirstName(claim, builder).toLowerCase();
      replies = [`hey ${first} — welcome to devlabs.`];
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
      appendSessionMemory(claim, userText.slice(0, 280));
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
