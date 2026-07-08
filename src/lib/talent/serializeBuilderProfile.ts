import { dedupeProjectsForDisplay, mergeExperiences, mergeStringList } from '@/lib/talent/profileDedup';

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
  const additionalGithubProjects = Number(githubShowcase.additionalProjectCount || 0);

  return {
    id: String(profile._id),
    name: profile.name,
    email: profile.email || null,
    avatarUrl: profile.avatarUrl || null,
    headline: profile.headline || null,
    bio: profile.bio || null,
    location: profile.location || null,
    universityOrCompany: profile.universityOrCompany || null,
    education: profile.education || [],
    experiences: mergeExperiences(profile.experiences || [], []),
    rolePreference: mergeStringList(profile.rolePreference || [], []),
    skills: mergeStringList(profile.skills || [], []),
    preferredWorkType: mergeStringList(profile.preferredWorkType || [], []),
    links: profile.links || {},
    availability: profile.availability || {},
    verificationStatus: profile.verificationStatus || 'imported_unverified',
    visibilityStatus: profile.visibilityStatus || 'matched_only',
    founderHighlights: profile.enrichmentInsights?.founderHighlights || [],
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
  };
}
