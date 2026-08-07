/**
 * Conversation agenda for the founder hiring agent.
 * Turns enrichment + job state into what we already know, what's missing,
 * and the single best next question — so every founder gets a personalized path.
 */

export type ConversationPhase =
  | 'bootstrap'
  | 'gathering'
  | 'confirming'
  | 'searching'
  | 'post_search';

export type ConversationGapId =
  | 'description'
  | 'skills_core'
  | 'experience'
  | 'preferences'
  | 'salary'
  | 'visa_equity';

export type ConversationAgenda = {
  phase: ConversationPhase;
  knownFacts: Record<string, unknown>;
  gaps: ConversationGapId[];
  doNotAsk: string[];
  nextQuestionHint: string | null;
  guidance: string[];
  companyLabel: string | null;
  productSnippet: string | null;
};

function clean(value: unknown): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function listLen(value: unknown): number {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function companyProductSnippet(company: any, founderProfile: any): string | null {
  const meta = company?.metadata || {};
  const candidates = [
    meta.whatTheyBuild,
    company?.productSummary,
    company?.description,
    founderProfile?.productDescription,
    founderProfile?.startupSummary,
    meta.researchHighlights?.[0],
  ];
  for (const c of candidates) {
    const text = clean(c);
    if (text.length > 20) return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
  }
  return null;
}

function hasRealDescription(job: any, productSnippet: string | null): boolean {
  const description = clean(job?.description || job?.builderWillDo);
  if (description.length > 40) return true;
  // Enrichment already tells us what the company builds — treat as known if role is
  // clearly "build the product" and we have a product snippet.
  return Boolean(productSnippet && productSnippet.length > 40 && description.length > 0);
}

function skillsAreBloated(job: any): boolean {
  const skills = Array.isArray(job?.skillsNeeded) ? job.skillsNeeded : [];
  return skills.length > 12;
}

/**
 * Build the agenda the agent must follow this turn.
 */
export function buildConversationAgenda(params: {
  founderProfile?: any | null;
  company?: any | null;
  job?: any | null;
  historyLength?: number;
  hasSearchResults?: boolean;
}): ConversationAgenda {
  const { founderProfile, company, job } = params;
  const productSnippet = companyProductSnippet(company, founderProfile);
  const companyLabel = clean(company?.name || founderProfile?.company) || null;
  const title = clean(job?.title || job?.roleTitle) || null;
  const skills = Array.isArray(job?.skillsNeeded) ? job.skillsNeeded.filter(Boolean).map(String) : [];
  const nice = Array.isArray(job?.niceToHaveSkills) ? job.niceToHaveSkills.filter(Boolean).map(String) : [];
  const prefs = Array.isArray(job?.searchRequirements) ? job.searchRequirements : [];
  const description = clean(job?.description || job?.builderWillDo);
  const salary = clean(job?.salary || job?.budget);
  const visaConfirmed = job?.visaConfirmed === true;
  const equityConfirmed = job?.equityConfirmed === true;
  const descriptionKnown = hasRealDescription(job, productSnippet);
  const hasPrefs = prefs.length > 0;
  const hasCoreSkills = skills.length >= 2 && !skillsAreBloated(job);
  const hasExperienceSignal =
    hasPrefs ||
    Boolean(clean(job?.seniority)) ||
    prefs.some((p: any) => /entry|junior|senior|intern|hackathon|school|experience/i.test(String(p?.text || p)));

  const knownFacts: Record<string, unknown> = {
    founderName: clean(founderProfile?.founderName) || null,
    company: companyLabel,
    industry: clean(company?.industry || founderProfile?.industry) || null,
    productSnippet,
    researchHighlights: Array.isArray(company?.metadata?.researchHighlights)
      ? company.metadata.researchHighlights.slice(0, 5)
      : [],
    whatTheyBuild: clean(company?.metadata?.whatTheyBuild) || null,
    roleTitle: title,
    stackFromIntake: skills.slice(0, 8),
    salary: salary || null,
    visa: job?.visa || null,
    visaConfirmed,
    equity: job?.equity || null,
    equityConfirmed,
    descriptionPreview: description ? description.slice(0, 160) : null,
    preferenceCount: prefs.length,
    niceToHaveCount: nice.length,
    enrichmentStatus: founderProfile?.enrichmentStatus || company?.metadata?.enrichmentStatus || null,
  };

  const gaps: ConversationGapId[] = [];
  const doNotAsk: string[] = [];
  const guidance: string[] = [];

  if (descriptionKnown) {
    doNotAsk.push('what_will_they_build');
    if (productSnippet) {
      guidance.push(
        `We already know what ${companyLabel || 'the company'} builds. Do NOT ask "what will they build." Use the product context and ask a sharper ownership/scope question only if the brief is still empty.`
      );
    }
  } else {
    gaps.push('description');
  }

  if (skillsAreBloated(job)) {
    gaps.unshift('skills_core');
    guidance.push(
      'The skills list is bloated. Distill to a small must-have core (role-critical stack) and move the rest to nice-to-have. Confirm that distillation with the founder — do not store 20+ must-haves.'
    );
  } else if (!hasCoreSkills) {
    gaps.push('skills_core');
  } else {
    doNotAsk.push('skills_list');
  }

  if (!hasExperienceSignal) {
    gaps.push('experience');
  } else {
    doNotAsk.push('experience_level');
  }

  if (!hasPrefs) {
    gaps.push('preferences');
  } else {
    doNotAsk.push('preferences');
  }

  if (!salary) {
    gaps.push('salary');
  } else {
    doNotAsk.push('salary');
  }

  if (!visaConfirmed || !equityConfirmed) {
    gaps.push('visa_equity');
  } else {
    doNotAsk.push('visa_equity');
  }

  guidance.push(
    'Ask ONE focused question per turn. Persist answers with edit_job before asking the next thing.',
    'If the founder pastes a huge skill list, distill must vs nice — do not accept everything as must-have.',
    'If the founder complains that a builder needs sponsorship while they do not sponsor, REMOVE/EXCLUDE that builder and enforce visa=No. Do NOT flip visa to Yes.',
    'After a search, mention the Recommended tab once. Do not repeat "look at the pane on the right" on every follow-up.'
  );

  let phase: ConversationPhase = 'gathering';
  if (params.hasSearchResults) {
    phase = 'post_search';
  } else if (!params.historyLength) {
    phase = 'bootstrap';
  } else if (gaps.length === 0 || (gaps.length === 1 && gaps[0] === 'visa_equity')) {
    phase = 'confirming';
  } else if (descriptionKnown && hasCoreSkills && hasPrefs && salary && visaConfirmed && equityConfirmed) {
    phase = 'searching';
  }

  const nextQuestionHint = pickNextQuestionHint({
    gaps,
    companyLabel,
    productSnippet,
    title,
    salary,
    visaConfirmed,
    equityConfirmed,
    descriptionKnown,
  });

  return {
    phase,
    knownFacts,
    gaps,
    doNotAsk,
    nextQuestionHint,
    guidance,
    companyLabel,
    productSnippet,
  };
}

function pickNextQuestionHint(params: {
  gaps: ConversationGapId[];
  companyLabel: string | null;
  productSnippet: string | null;
  title: string | null;
  salary: string;
  visaConfirmed: boolean;
  equityConfirmed: boolean;
  descriptionKnown: boolean;
}): string | null {
  const role = params.title || 'this role';
  const company = params.companyLabel || 'your company';
  const gap = params.gaps[0];
  if (!gap) {
    return `Brief looks solid. Confirm you're ready and run search_talent for ${role}.`;
  }
  switch (gap) {
    case 'description':
      if (params.productSnippet) {
        return `We know ${company} builds: "${params.productSnippet.slice(0, 120)}". Ask what this ${role} will own first — a specific feature, or the broader product.`;
      }
      return `Ask what the ${role} will actually build and own at ${company}.`;
    case 'skills_core':
      return `Ask for the 3–6 must-have technologies for ${role}. If they dump a long list, propose a distilled must/nice split.`;
    case 'experience':
      return `Ask for seniority/experience bar for ${role} (e.g. entry-level, 2+ years) and any must-have background.`;
    case 'preferences':
      return `Ask for search-sharpening preferences: companies, schools, hackathons, project evidence — or explicit "no preferences".`;
    case 'salary':
      return `Confirm compensation for ${role}.`;
    case 'visa_equity':
      if (!params.visaConfirmed && !params.equityConfirmed) {
        return `Confirm once: visa sponsorship default Yes, equity default No — or capture their overrides in one turn.`;
      }
      if (!params.visaConfirmed) return `Confirm visa sponsorship for ${role} once.`;
      return `Confirm equity for ${role} once.`;
    default:
      return null;
  }
}

/**
 * Deterministic fallback opener when Luna bootstrap generation fails.
 */
export function buildFallbackOpener(agenda: ConversationAgenda): string {
  const company = agenda.companyLabel || 'your company';
  const title = clean(agenda.knownFacts.roleTitle) || 'this role';
  const product = agenda.productSnippet;

  if (agenda.gaps[0] === 'description' && product) {
    const snippet = product.length > 100 ? `${product.slice(0, 97).trimEnd()}...` : product;
    return `Hey! Based on what ${company} is building (${snippet}), what should this ${title} own first, a specific feature or the broader product?`;
  }
  if (agenda.gaps[0] === 'description' && !product) {
    return `Hey! I've got the ${title} brief started for ${company}. What will this person actually build and own first?`;
  }
  if (product && agenda.doNotAsk.includes('what_will_they_build')) {
    const snippet = product.length > 100 ? `${product.slice(0, 97).trimEnd()}...` : product;
    if (agenda.gaps[0] === 'skills_core') {
      return `Hey! For ${title} at ${company} (${snippet}), what are the 3–6 must-have technologies? I'll treat the rest as nice-to-haves.`;
    }
    if (agenda.gaps[0] === 'experience') {
      return `Hey! I've got ${title} at ${company} started. What experience level are you looking for, and anything that would be a big plus?`;
    }
    if (agenda.gaps[0] === 'preferences') {
      return `Hey! ${title} at ${company} is shaping up. Any must-have preferences, or should I search with no extras?`;
    }
  }
  if (agenda.gaps[0] === 'skills_core') {
    return `Hey! For the ${title} role at ${company}, what are the 3–6 must-have technologies? I'll treat the rest as nice-to-haves.`;
  }
  if (agenda.gaps[0] === 'experience') {
    return `Hey! I've got ${title} at ${company} started. What experience level are you looking for, and anything that would be a big plus (companies, schools, hackathons)?`;
  }
  if (agenda.gaps[0] === 'preferences') {
    return `Hey! ${title} at ${company} is shaping up. Any must-have preferences (domain, companies, schools, proof), or should I search with no extras?`;
  }
  if (agenda.gaps[0] === 'visa_equity') {
    return `Hey! ${title} at ${company} looks ready. Cool if I set visa sponsorship to Yes and equity to No, or do you want different defaults?`;
  }
  return `Hey! Let's get the ${title} role at ${company} tight so I can find the right builder. What matters most for this hire?`;
}

/**
 * Detect a bloated skill paste in founder text so the agent can distill.
 */
export function looksLikeSkillDump(text: string): boolean {
  const raw = clean(text);
  if (raw.length < 80) return false;
  const commaParts = raw.split(/,|•|\n|\|/g).map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 10) return true;
  const techHits = (
    raw.match(
      /\b(python|javascript|typescript|java|react|next\.?js|node\.?js|fastapi|django|flask|aws|gcp|azure|docker|kubernetes|sql|mongodb|postgres|redis|tailwind|figma|html|css)\b/gi
    ) || []
  ).length;
  return techHits >= 8;
}

/**
 * Compact founder + company payload for the model context (avoid dumping whole docs).
 */
export function compactFounderContext(founderProfile: any | null, company: any | null) {
  const meta = company?.metadata || {};
  return {
    founder: founderProfile
      ? {
          name: founderProfile.founderName || null,
          bio: founderProfile.founderBio ? clean(founderProfile.founderBio).slice(0, 280) : null,
          company: founderProfile.company || null,
          industry: founderProfile.industry || null,
          productDescription: founderProfile.productDescription
            ? clean(founderProfile.productDescription).slice(0, 320)
            : null,
          startupSummary: founderProfile.startupSummary
            ? clean(founderProfile.startupSummary).slice(0, 320)
            : null,
          techStackHints: Array.isArray(founderProfile.techStackHints)
            ? founderProfile.techStackHints.slice(0, 12)
            : [],
          enrichmentStatus: founderProfile.enrichmentStatus || null,
        }
      : null,
    company: company
      ? {
          name: company.name || null,
          website: company.website || null,
          industry: company.industry || null,
          location: company.location || null,
          fundingStage: company.fundingStage || null,
          description: company.description ? clean(company.description).slice(0, 360) : null,
          productSummary: company.productSummary ? clean(company.productSummary).slice(0, 360) : null,
          mission: company.mission ? clean(company.mission).slice(0, 240) : null,
          whatTheyBuild: meta.whatTheyBuild || null,
          researchHighlights: Array.isArray(meta.researchHighlights)
            ? meta.researchHighlights.slice(0, 5)
            : [],
          companySize: meta.companySize || null,
          specialties: Array.isArray(meta.specialties) ? meta.specialties.slice(0, 8) : [],
        }
      : null,
  };
}
