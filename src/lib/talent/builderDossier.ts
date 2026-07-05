import BuilderProfile from '@/models/talent/BuilderProfile';
import { generateOpenRouterReply } from '@/lib/openrouter';
import { exaSearch, hasExaConfig } from '@/lib/talent/exaClient';
import { urlsToMarkdown } from '@/lib/talent/urlToMarkdown';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';
import { updateLinks } from '@/lib/agent/builderProfileTools';

export type DossierGap = {
  id: string;
  question: string;
  founderImpact: number;
  reason: string;
};

export type BuilderDossier = {
  identityConfidence: number;
  narrativeSummary: string;
  proofPoints: string[];
  suggestedOpeners: string[];
  suggestedConfirmations: string[];
  inferredLinks: {
    github?: string | null;
    linkedin?: string | null;
    devpost?: string | null;
    twitter?: string | null;
    portfolio?: string | null;
  };
  draftedHeadline?: string | null;
  draftedBio?: string | null;
  gaps: DossierGap[];
  sources: string[];
  builtAt: string;
};

const EMPTY: BuilderDossier = {
  identityConfidence: 0,
  narrativeSummary: '',
  proofPoints: [],
  suggestedOpeners: [],
  suggestedConfirmations: [],
  inferredLinks: {},
  gaps: [],
  sources: [],
  builtAt: new Date().toISOString(),
};

function emailDomain(email: string) {
  const part = email.split('@')[1];
  return part?.toLowerCase() || '';
}

function isEduDomain(domain: string) {
  return domain.endsWith('.edu') || domain.includes('.ac.');
}

async function githubUserByEmail(email: string, runtime?: RuntimeEnv): Promise<{ login: string; url: string } | null> {
  const token = readEnv('GITHUB_TOKEN', runtime);
  if (!token || !email) return null;
  try {
    const res = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<{ login?: string; html_url?: string }> };
    const first = data.items?.[0];
    if (!first?.login) return null;
    return { login: first.login, url: first.html_url || `https://github.com/${first.login}` };
  } catch {
    return null;
  }
}

function classifyUrl(url: string): keyof BuilderDossier['inferredLinks'] | null {
  const u = url.toLowerCase();
  if (u.includes('github.com') && !u.includes('gist')) return 'github';
  if (u.includes('linkedin.com/in')) return 'linkedin';
  if (u.includes('devpost.com')) return 'devpost';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  return 'portfolio';
}

function buildSearchQuery(name: string, email: string, university?: string | null) {
  const domain = emailDomain(email);
  const schoolHint = university || (isEduDomain(domain) ? domain.split('.')[0] : '');
  return [name, schoolHint, 'github', 'linkedin', 'devpost', 'projects'].filter(Boolean).join(' ');
}

/**
 * Pre-kickoff research: Exa finds relevant URLs → Jina pulls page markdown →
 * GitHub PAT resolves email → one LLM pass builds a founder-ready dossier.
 */
export async function buildBuilderDossier(params: {
  email: string;
  name?: string | null;
  builderId?: string | null;
  runtime?: RuntimeEnv;
}): Promise<BuilderDossier> {
  const email = params.email.trim().toLowerCase();
  const name = (params.name || email.split('@')[0] || 'builder').trim();
  if (!email) return EMPTY;

  const builder = params.builderId
    ? await BuilderProfile.findById(params.builderId).lean()
    : await BuilderProfile.findOne({ email }).lean();

  const existingLinks = (builder as any)?.links || {};
  const inferredLinks: BuilderDossier['inferredLinks'] = {
    github: existingLinks.github || null,
    linkedin: existingLinks.linkedin || null,
    devpost: existingLinks.devpost || null,
    twitter: existingLinks.twitter || null,
    portfolio: existingLinks.portfolio || existingLinks.personalWebsite || null,
  };

  const sources: string[] = [];
  let exaExcerpts = '';
  let pageMarkdown = '';

  const [exaResults, ghByEmail] = await Promise.all([
    hasExaConfig(params.runtime)
      ? exaSearch(buildSearchQuery(name, email, (builder as any)?.universityOrCompany), { numResults: 6, category: 'people' }, params.runtime)
      : Promise.resolve([]),
    githubUserByEmail(email, params.runtime),
  ]);

  if (ghByEmail && !inferredLinks.github) {
    inferredLinks.github = ghByEmail.url;
    sources.push(`github-email:${ghByEmail.login}`);
  }

  for (const r of exaResults) {
    if (!r.url) continue;
    sources.push(r.url);
    const kind = classifyUrl(r.url);
    if (kind && !inferredLinks[kind]) inferredLinks[kind] = r.url;
    exaExcerpts += `\n[${r.title || r.url}]\n${r.url}\n${(r.highlights || []).join(' … ')}\n`;
  }

  const urlsToFetch = [
    ...exaResults.map((r) => r.url),
    inferredLinks.github,
    inferredLinks.linkedin,
    inferredLinks.devpost,
    inferredLinks.portfolio,
  ].filter(Boolean) as string[];

  const pages = await urlsToMarkdown(urlsToFetch.slice(0, 5), 6000);
  pageMarkdown = pages.map((p) => `--- ${p.url} ---\n${p.markdown}`).join('\n\n').slice(0, 24000);

  const profileContext = builder
    ? JSON.stringify({
        headline: (builder as any).headline,
        bio: (builder as any).bio,
        universityOrCompany: (builder as any).universityOrCompany,
        experiences: ((builder as any).experiences || []).slice(0, 4),
        links: existingLinks,
      })
    : '(no existing profile)';

  let raw = '';
  try {
    raw = await generateOpenRouterReply({
      systemPrompt: `You are a talent researcher building a founder-ready dossier on ONE builder.
You get: name, email, optional existing profile, Exa search excerpts, and markdown pulled from their public pages.
Match everything to THIS person (email domain, handles, school, employer). Ignore namesakes.

Return STRICT JSON:
{
  "identityConfidence": number,          // 0-1 how sure this is the right person
  "narrativeSummary": string,            // 2-3 sentences, founder-facing
  "proofPoints": string[],               // 3-6 concrete verifiable wins
  "suggestedOpeners": string[],          // 2-3 Poke-style surprise openers for iMessage (specific, casual, no "I scraped")
  "suggestedConfirmations": string[],    // 2-3 yes/no checks ("still at X as Y?")
  "draftedHeadline": string|null,
  "draftedBio": string|null,
  "inferredLinks": { "github": string|null, "linkedin": string|null, "devpost": string|null, "twitter": string|null, "portfolio": string|null },
  "gaps": [ { "id": string, "question": string, "founderImpact": number, "reason": string } ]
}
gaps: max 5, ranked by founderImpact (1-10). Ask only what you CANNOT infer.`,
      userPrompt: `Name: ${name}\nEmail: ${email}\nDomain: ${emailDomain(email)}\n\nExisting profile:\n${profileContext}\n\nExa excerpts:\n${exaExcerpts || '(none)'}\n\nPage markdown:\n${pageMarkdown || '(none)'}\n\nKnown links:\n${JSON.stringify(inferredLinks)}`,
      temperature: 0.15,
      maxTokens: 1400,
      responseFormat: 'json_object',
    });
  } catch (err) {
    console.warn('[builderDossier] synthesis failed', err);
    return {
      ...EMPTY,
      inferredLinks,
      sources,
      identityConfidence: ghByEmail || inferredLinks.github ? 0.5 : 0.2,
      suggestedOpeners: [`hey ${name.split(/\s+/)[0]} — devlabs here.`],
    };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    parsed = {};
  }

  const mergedLinks = { ...inferredLinks, ...(parsed.inferredLinks || {}) };
  for (const k of Object.keys(mergedLinks) as (keyof typeof mergedLinks)[]) {
    if (!mergedLinks[k]) delete mergedLinks[k];
  }

  return {
    identityConfidence: typeof parsed.identityConfidence === 'number' ? parsed.identityConfidence : 0.4,
    narrativeSummary: parsed.narrativeSummary || '',
    proofPoints: Array.isArray(parsed.proofPoints) ? parsed.proofPoints.slice(0, 6) : [],
    suggestedOpeners: Array.isArray(parsed.suggestedOpeners) ? parsed.suggestedOpeners.slice(0, 3) : [],
    suggestedConfirmations: Array.isArray(parsed.suggestedConfirmations) ? parsed.suggestedConfirmations.slice(0, 3) : [],
    inferredLinks: mergedLinks,
    draftedHeadline: parsed.draftedHeadline || null,
    draftedBio: parsed.draftedBio || null,
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5) : [],
    sources,
    builtAt: new Date().toISOString(),
  };
}

/** Persist dossier links + drafts onto the builder profile before kickoff. */
export async function applyDossierToProfile(builderId: string, dossier: BuilderDossier) {
  const builder = await BuilderProfile.findById(builderId);
  if (!builder) return;

  const linkPatch: Record<string, string> = {};
  for (const [k, v] of Object.entries(dossier.inferredLinks)) {
    if (!v) continue;
    const existing = (builder.links as any)?.[k === 'portfolio' ? 'portfolio' : k];
    if (!existing) linkPatch[k === 'portfolio' ? 'portfolio' : k] = v;
  }
  if (Object.keys(linkPatch).length) await updateLinks(builder, linkPatch);

  if (dossier.draftedHeadline && !builder.headline) builder.headline = dossier.draftedHeadline;
  if (dossier.draftedBio && !builder.bio) builder.bio = dossier.draftedBio;
  await builder.save();
}

export function formatDossierForAgent(dossier: BuilderDossier | null | undefined): string {
  if (!dossier) return '';
  return [
    'PRE-BUILT DOSSIER (research done before first text — use this, do NOT ask for GitHub/LinkedIn if links are present):',
    `Identity confidence: ${dossier.identityConfidence}`,
    dossier.narrativeSummary ? `Summary: ${dossier.narrativeSummary}` : '',
    dossier.proofPoints.length ? `Proof points: ${dossier.proofPoints.join(' | ')}` : '',
    Object.keys(dossier.inferredLinks).length ? `Links: ${JSON.stringify(dossier.inferredLinks)}` : '',
    dossier.draftedHeadline ? `Draft headline: ${dossier.draftedHeadline}` : '',
    dossier.draftedBio ? `Draft bio: ${dossier.draftedBio}` : '',
    dossier.suggestedOpeners.length ? `Suggested openers: ${dossier.suggestedOpeners.join(' / ')}` : '',
    dossier.suggestedConfirmations.length ? `Confirm: ${dossier.suggestedConfirmations.join(' / ')}` : '',
    dossier.gaps.length ? `Best gaps to probe: ${dossier.gaps.map((g) => g.question).join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
