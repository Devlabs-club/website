export type MatchEvidenceItem = {
  label: string;
  url: string | null;
};

function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collectProofLinks(builder: any, projects: any[]): MatchEvidenceItem[] {
  const items: MatchEvidenceItem[] = [];

  for (const project of projects || []) {
    const url =
      cleanUrl(project?.links?.github) ||
      cleanUrl(project?.links?.demo) ||
      cleanUrl(project?.links?.devpost);
    if (url) {
      items.push({
        label: project.projectName ? `Project: ${project.projectName}` : 'Project proof',
        url,
      });
    }
  }

  const builderLinks = builder?.links || {};
  if (cleanUrl(builderLinks.github)) {
    items.push({ label: 'GitHub profile', url: cleanUrl(builderLinks.github) });
  }
  if (cleanUrl(builderLinks.portfolio) || cleanUrl(builderLinks.personalWebsite)) {
    items.push({
      label: 'Portfolio',
      url: cleanUrl(builderLinks.portfolio) || cleanUrl(builderLinks.personalWebsite),
    });
  }
  if (cleanUrl(builderLinks.linkedin)) {
    items.push({ label: 'LinkedIn', url: cleanUrl(builderLinks.linkedin) });
  }

  return items;
}

/** Normalize legacy/bad evidence values when reading from Mongo. */
export function normalizeMatchEvidence(input: unknown): MatchEvidenceItem[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      if (typeof item === 'string' && item.trim()) {
        return { label: item.trim(), url: null };
      }
      if (item && typeof item === 'object') {
        const label = String((item as any).label || (item as any).text || '').trim();
        if (!label) return null;
        return { label, url: cleanUrl((item as any).url) };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 6) as MatchEvidenceItem[];
}

export function buildMatchEvidenceFromExplanation(params: {
  strongestSignals: string[];
  builder: any;
  projects: any[];
}): MatchEvidenceItem[] {
  const signals = (params.strongestSignals || []).map((s) => String(s).trim()).filter(Boolean);
  const proofLinks = collectProofLinks(params.builder, params.projects);

  if (!signals.length) {
    return proofLinks.slice(0, 4);
  }

  return signals.slice(0, 4).map((signal, index) => ({
    label: signal,
    url: proofLinks[index]?.url ?? proofLinks[0]?.url ?? null,
  }));
}

export function buildMatchEvidenceFromRankedBuilder(params: {
  builder: any;
  projects: any[];
  whyTheyMatch?: string | null;
}): MatchEvidenceItem[] {
  const proofLinks = collectProofLinks(params.builder, params.projects);
  if (proofLinks.length) return proofLinks.slice(0, 4);

  const summary = params.whyTheyMatch?.trim();
  return summary ? [{ label: summary, url: null }] : [];
}
