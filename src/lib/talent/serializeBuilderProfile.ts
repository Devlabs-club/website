import { dedupeProjectsForDisplay, mergeExperiences, mergeStringList } from '@/lib/talent/profileDedup';
import {
  getMissingProofFields,
  isProfileEnriched,
} from '@/lib/talent/builderProofGaps';

/** Shared API shape for founder + builder profile views (top projects + enrichment highlights). */
export function serializeBuilderProfile(profile: any, projects: any[] = []) {
  if (!profile) return null;

  const githubShowcase = profile.enrichmentInsights?.githubShowcase || {};
  const displayProjects = dedupeProjectsForDisplay(projects);
  const sortedProjects = [...displayProjects].sort((a, b) => {
    const confA = typeof a.confidence === 'number' ? a.confidence : 0;
    const confB = typeof b.confidence === 'number' ? b.confidence : 0;
    return confB - confA;
  });
  const featuredProjects = sortedProjects.slice(0, 3);
  const insightProjects = sortedProjects.slice(0, 6);
  const additionalGithubProjects = Number(githubShowcase.additionalProjectCount || 0);
  const inferredTechStack = mergeStringList(
    [],
    [
      ...(profile.skills || []),
      ...displayProjects.flatMap((project: any) => project.techStack || []),
      ...(profile.experiences || []).flatMap((experience: any) => experience.skills || []),
    ]
  ).slice(0, 24);
  const enrichmentSources = (profile.enrichmentInsights?.sourcesCompleted || [])
    .map((row: any) => ({
      source: String(row?.source || ''),
      projectCount: typeof row?.projectCount === 'number' ? row.projectCount : 0,
    }))
    .filter((row: { source: string }) => row.source);
  const profileQuality = profile.profileQuality || {};
  const serializedBase = {
    headline: profile.headline || null,
    bio: profile.bio || null,
    skills: mergeStringList(profile.skills || [], []),
    experiences: mergeExperiences(profile.experiences || [], []),
    founderHighlights: profile.enrichmentInsights?.founderHighlights || [],
    enrichmentSources,
    workAuthorization: profile.workAuthorization || null,
    links: profile.links || {},
    availability: profile.availability || {},
    projects: [] as unknown[],
  };

  return {
    id: String(profile._id),
    name: profile.name,
    email: profile.email || null,
    avatarUrl: profile.avatarUrl || null,
    headline: serializedBase.headline,
    bio: serializedBase.bio,
    location: profile.location || null,
    universityOrCompany: profile.universityOrCompany || null,
    graduationYear: profile.graduationYear || null,
    education: profile.education || [],
    experiences: serializedBase.experiences,
    rolePreference: mergeStringList(profile.rolePreference || [], []),
    skills: serializedBase.skills,
    workAuthorization: serializedBase.workAuthorization,
    preferredWorkType: mergeStringList(profile.preferredWorkType || [], []),
    links: serializedBase.links,
    availability: serializedBase.availability,
    verificationStatus: profile.verificationStatus || 'imported_unverified',
    visibilityStatus: profile.visibilityStatus || 'matched_only',
    founderHighlights: serializedBase.founderHighlights,
    enrichmentSources,
    profileEnriched: isProfileEnriched({
      ...serializedBase,
      projects: dedupeProjectsForDisplay(projects),
    }),
    missingProofFields: getMissingProofFields(serializedBase),
    inferredTechStack,
    totalProjectCount: displayProjects.length,
    profileQuality: {
      overallScore: Number(profileQuality.overallScore || 0),
      label: profileQuality.label || null,
      oneLineSummary: profileQuality.oneLineSummary || null,
      strengths: Array.isArray(profileQuality.strengths)
        ? profileQuality.strengths
            .filter((item: any) => item?.title && item?.detail)
            .map((item: any) => ({ title: String(item.title), detail: String(item.detail) }))
            .slice(0, 8)
        : [],
    },
    githubShowcase: {
      featuredCount: featuredProjects.length,
      additionalProjectCount: additionalGithubProjects,
      reposScanned: Number(githubShowcase.reposScanned || 0),
    },
    projects: featuredProjects.map((project) => ({
      id: String(project._id),
      projectName: project.projectName,
      description: project.description || null,
      problemSolved: project.problemSolved || null,
      builderContribution: project.builderContribution || null,
      techStack: project.techStack || [],
      links: project.links || {},
      source: project.source || 'manual',
      sourceId: project.sourceId || null,
      verificationStatus: project.verificationStatus,
    })),
    insightProjects: insightProjects.map((project) => ({
      id: String(project._id),
      projectName: project.projectName,
      description: project.description || null,
      builderContribution: project.builderContribution || null,
      techStack: project.techStack || [],
      source: project.source || 'manual',
    })),
  };
}
