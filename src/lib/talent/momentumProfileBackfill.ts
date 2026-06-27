import type { IMomentumApplication } from '@/models/momentumApplication';
import type { EnrichedProfileDraft, EnrichedProjectDraft } from './builderEnrichment/types';

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function parseWebsiteOrGithub(value: unknown): { github: string | null; portfolio: string | null } {
  if (!isHttpUrl(value)) return { github: null, portfolio: null };
  const url = value.trim();
  if (/github\.com/i.test(url)) return { github: url, portfolio: null };
  return { github: null, portfolio: url };
}

function splitTags(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(/[,;|/\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^https?:\/\//i.test(part));
}

function buildBio(app: IMomentumApplication): string | null {
  const parts = [app.description?.trim(), app.accomplishments?.trim()].filter(Boolean);
  if (!parts.length) return null;
  return parts.join('\n\n').slice(0, 2000);
}

function buildHeadline(app: IMomentumApplication): string | null {
  const startup = app.startupName?.trim();
  if (!startup) return null;
  const founderType = app.founderType?.trim();
  if (founderType) return `${startup} · ${founderType} founder`.slice(0, 120);
  return `${startup} founder`.slice(0, 120);
}

export function profileDraftFromMomentumApplication(
  app: IMomentumApplication
): EnrichedProfileDraft | null {
  const bio = buildBio(app);
  const headline = buildHeadline(app);
  const fromSite = parseWebsiteOrGithub(app.websiteOrGithub);
  const rolePreference = [
    ...splitTags(app.adjectives),
    ...splitTags(app.startupDomain),
  ];

  if (!bio && !headline && !fromSite.github && !fromSite.portfolio && !isHttpUrl(app.linkedin) && !rolePreference.length) {
    return null;
  }

  return {
    headline,
    bio,
    rolePreference: rolePreference.length ? rolePreference : undefined,
    links: {
      github: fromSite.github,
      linkedin: isHttpUrl(app.linkedin) ? app.linkedin.trim() : null,
      portfolio: fromSite.portfolio,
      personalWebsite: fromSite.portfolio,
    },
  };
}

export function projectDraftFromMomentumApplication(
  app: IMomentumApplication,
  applicationId: string
): EnrichedProjectDraft | null {
  const projectName = app.startupName?.trim();
  if (!projectName) return null;

  const fromSite = parseWebsiteOrGithub(app.websiteOrGithub);
  const pitchDeck = isHttpUrl(app.pitchDeck) ? app.pitchDeck.trim() : null;
  const demoVideo = isHttpUrl(app.demoVideo) ? app.demoVideo.trim() : null;
  const demo = fromSite.portfolio || fromSite.github;

  const techStack = splitTags(app.startupDomain);
  const keyMetrics = app.keyMetrics?.trim();

  let status: EnrichedProjectDraft['status'] = 'unknown';
  if (app.isIncorporated) status = 'incorporated';
  else if (app.hasRevenue) status = 'launched';
  else if (demo || demoVideo) status = 'active';

  return {
    projectName,
    description: app.description?.trim() || null,
    problemSolved: keyMetrics || null,
    techStack,
    status,
    source: 'momentum',
    sourceId: `momentum:${applicationId}`,
    verificationStatus: 'imported_unverified',
    confidence: 0.85,
    links: {
      github: fromSite.github,
      demo,
      videoDemo: demoVideo,
      pitchDeck,
    },
  };
}
