import { connectMomentumDB } from '@/lib/mongodb';
import { getMomentumApplicationModel } from '@/models/momentumApplication';
import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { isPlaceholderCompany } from '@/lib/talent/founderRoleBrief';

export type FounderConfirmInput = {
  founderId: string;
  founderEmail: string;
  founderName: string;
  company: string;
  companyWebsite?: string | null;
  linkedin?: string | null;
};

export type FounderEnrichmentResult = {
  company: string;
  startupSummary: string | null;
  industry: string | null;
  fundingStage: string | null;
  productDescription: string | null;
  techStackHints: string[];
  founderBio: string | null;
  logoUrl: string | null;
  enrichmentStatus: 'partial' | 'complete' | 'failed';
  enrichmentSources: string[];
};

type ScrapeChunk = {
  source: string;
  label: string;
  markdown: string;
};

function normalizeUrl(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) return null;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed);
  return hasScheme ? trimmed : `https://${trimmed}`;
}

function buildUrlToMarkdownUrl(url: string) {
  const params = new URLSearchParams({
    url,
    title: 'true',
    links: 'true',
    clean: 'true',
  });
  return `https://urltomarkdown.herokuapp.com/?${params.toString()}`;
}

async function fetchUrlMarkdown(url: string, label: string): Promise<ScrapeChunk | null> {
  const normalized = normalizeUrl(url);
  if (!normalized) return null;

  try {
    const markdownUrl = buildUrlToMarkdownUrl(normalized);
    console.log('[founderEnrichment] scrape:start', { label, url: normalized });
    const response = await fetch(markdownUrl, { signal: AbortSignal.timeout(15000) });
    const markdown = await response.text();
    console.log('[founderEnrichment] scrape:done', {
      label,
      ok: response.ok,
      status: response.status,
      length: markdown.length,
    });
    if (!response.ok || !markdown.trim() || markdown.length < 80) return null;
    return {
      source: normalized,
      label,
      markdown: markdown.slice(0, 6000),
    };
  } catch (err) {
    console.warn('[founderEnrichment] scrape:failed', {
      label,
      url: normalized,
      error: err instanceof Error ? err.message : err,
    });
    return null;
  }
}

function extractLogoFromMarkdown(markdown: string): string | null {
  const imageMatches = Array.from(markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/gi));
  const logo = imageMatches
    .map((match) => match[1])
    .find((imageUrl) => /logo|brand|icon|favicon/i.test(imageUrl) && !/badge|avatar|profile/i.test(imageUrl));
  return logo || imageMatches[0]?.[1] || null;
}

async function loadMomentumApplicationContext(email: string) {
  if (!process.env.MOMENTUM_MONGODB_URI) return null;
  try {
    const conn = await connectMomentumDB();
    const MomentumApplication = getMomentumApplicationModel(conn);
    const app = await MomentumApplication.findOne({ email: email.toLowerCase().trim() })
      .sort({ updatedAt: -1 })
      .lean();
    if (!app) return null;

    const lines = [
      `Startup name: ${app.startupName || ''}`,
      `Domain: ${app.startupDomain || ''}`,
      `Description: ${app.description || ''}`,
      `Accomplishments: ${app.accomplishments || ''}`,
      `Website/GitHub: ${app.websiteOrGithub || ''}`,
      `LinkedIn: ${app.linkedin || ''}`,
      `Key metrics: ${app.keyMetrics || ''}`,
      `Funding: raised=${app.hasRaisedMoney}, looking=${app.lookingToFundraise}`,
      `Revenue: ${app.hasRevenue}`,
    ].filter((line) => !line.endsWith(': ') && !line.endsWith(': '));

    return {
      source: 'momentum_application',
      label: 'Momentum application',
      markdown: lines.join('\n'),
    } satisfies ScrapeChunk;
  } catch (err) {
    console.warn('[founderEnrichment] momentum:failed', err instanceof Error ? err.message : err);
    return null;
  }
}

function parseEnrichmentJson(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw
      .replace(/^```json/i, '')
      .replace(/^```/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function fallbackEnrichment(input: FounderConfirmInput, chunks: ScrapeChunk[]): FounderEnrichmentResult {
  const websiteChunk = chunks.find((c) => c.label === 'Company website');
  const firstParagraph =
    websiteChunk?.markdown
      .split('\n')
      .map((line) => line.replace(/^#+\s*/, '').trim())
      .find((line) => line.length > 40) || null;

  return {
    company: input.company,
    startupSummary: firstParagraph?.slice(0, 400) || `${input.company} — details pending founder input.`,
    industry: null,
    fundingStage: null,
    productDescription: firstParagraph?.slice(0, 300) || null,
    techStackHints: [],
    founderBio: null,
    logoUrl: websiteChunk ? extractLogoFromMarkdown(websiteChunk.markdown) : null,
    enrichmentStatus: chunks.length > 0 ? 'partial' : 'failed',
    enrichmentSources: chunks.map((c) => c.source),
  };
}

export async function enrichFounderProfile(input: FounderConfirmInput): Promise<FounderEnrichmentResult> {
  const company = input.company.trim();
  if (!company || isPlaceholderCompany(company)) {
    throw new Error('A real company name is required.');
  }

  const scrapeTargets = [
    input.companyWebsite ? fetchUrlMarkdown(input.companyWebsite, 'Company website') : Promise.resolve(null),
    input.linkedin ? fetchUrlMarkdown(input.linkedin, 'Founder LinkedIn') : Promise.resolve(null),
    loadMomentumApplicationContext(input.founderEmail),
  ];

  const chunks = (await Promise.all(scrapeTargets)).filter(Boolean) as ScrapeChunk[];

  if (!hasOpenRouterConfig()) {
    return fallbackEnrichment(input, chunks);
  }

  const researchBlock = chunks.length
    ? chunks.map((c) => `### ${c.label} (${c.source})\n${c.markdown}`).join('\n\n')
    : 'No public pages could be scraped. Use only the confirmed founder inputs.';

  const extractionResponse = await generateOpenRouterReply({
    systemPrompt:
      'You synthesize founder and startup research for a hiring platform. Return strictly JSON with keys: startupSummary (string, 1-2 sentences), industry (string|null), fundingStage (string|null), productDescription (string, what they build), techStackHints (string array, inferred product/engineering stack), founderBio (string|null, brief background if known), logoUrl (string|null, best logo URL from research). Be factual — only include details supported by the research. No markdown.',
    userPrompt: `Confirmed founder inputs:
- Founder: ${input.founderName}
- Email: ${input.founderEmail}
- Company: ${company}
- Website: ${input.companyWebsite || 'not provided'}
- LinkedIn: ${input.linkedin || 'not provided'}

Public research:
${researchBlock}`,
    temperature: 0,
    maxTokens: 700,
  });

  const parsed = parseEnrichmentJson(extractionResponse);
  if (!parsed) {
    console.warn('[founderEnrichment] llm:parse_failed', extractionResponse.slice(0, 300));
    return fallbackEnrichment(input, chunks);
  }

  const techStackHints = Array.isArray(parsed.techStackHints)
    ? parsed.techStackHints.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12)
    : [];

  const logoFromResearch =
    typeof parsed.logoUrl === 'string' && parsed.logoUrl.trim()
      ? parsed.logoUrl.trim()
      : chunks.find((c) => c.label === 'Company website')
        ? extractLogoFromMarkdown(chunks.find((c) => c.label === 'Company website')!.markdown)
        : null;

  return {
    company,
    startupSummary: typeof parsed.startupSummary === 'string' ? parsed.startupSummary.trim() : null,
    industry: typeof parsed.industry === 'string' ? parsed.industry.trim() : null,
    fundingStage: typeof parsed.fundingStage === 'string' ? parsed.fundingStage.trim() : null,
    productDescription:
      typeof parsed.productDescription === 'string' ? parsed.productDescription.trim() : null,
    techStackHints,
    founderBio: typeof parsed.founderBio === 'string' ? parsed.founderBio.trim() : null,
    logoUrl: logoFromResearch,
    enrichmentStatus: chunks.length > 0 ? 'complete' : 'partial',
    enrichmentSources: chunks.map((c) => c.source),
  };
}

export function serializeFounderProfile(doc: any) {
  if (!doc) return null;
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    userId: plain.userId,
    founderEmail: plain.founderEmail,
    founderName: plain.founderName,
    company: plain.company,
    companyWebsite: plain.companyWebsite,
    linkedin: plain.linkedin,
    startupSummary: plain.startupSummary,
    industry: plain.industry,
    fundingStage: plain.fundingStage,
    productDescription: plain.productDescription,
    techStackHints: plain.techStackHints || [],
    founderBio: plain.founderBio,
    logoUrl: plain.logoUrl,
    enrichmentStatus: plain.enrichmentStatus,
    enrichmentSources: plain.enrichmentSources || [],
    onboardingCompletedAt: plain.onboardingCompletedAt,
    enrichedAt: plain.enrichedAt,
  };
}

export function profileToStartupContext(profile: any) {
  if (!profile) return null;
  const company =
    profile.company && !isPlaceholderCompany(String(profile.company))
      ? String(profile.company)
      : null;
  if (!company && !profile.startupSummary) return null;

  return {
    company,
    startupSummary: profile.startupSummary ? String(profile.startupSummary) : null,
    industry: profile.industry ? String(profile.industry) : null,
    fundingStage: profile.fundingStage ? String(profile.fundingStage) : null,
    productDescription: profile.productDescription ? String(profile.productDescription) : null,
    techStackHints: Array.isArray(profile.techStackHints) ? profile.techStackHints : [],
    founderBio: profile.founderBio ? String(profile.founderBio) : null,
    enriched: ['complete', 'partial'].includes(String(profile.enrichmentStatus)),
  };
}
