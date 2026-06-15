import {
  getBuilderMemoryProfile,
  getFounderMemoryProfile,
  getOpportunityMemoryProfile,
  searchOpportunityMemories,
  searchCandidateFitMemories,
  formatMultiMemoryForPrompt,
} from '@/lib/talent/supermemory';
import { formatFounderStartupContextForPrompt } from '@/lib/talent/founderRoleBrief';

export type BuilderAgentContext = {
  builderId: string;
  builderName: string;
  headline: string | null;
  bio: string | null;
  rolePreference: string[];
  preferredWorkType: string[];
  availability: {
    availableNow: boolean;
    hoursPerWeek: number | null;
    remotePreference: string;
  };
  links: {
    github: string | null;
    linkedin: string | null;
    portfolio: string | null;
    resume: string | null;
  };
  profileScore: number;
  proofScore: number;
  missingItems: string[];
  qualityIssues: string[];
  qualitySummary: string | null;
  projectCount: number;
  memoryBlock: string;
};

export type FounderAgentContext = {
  founderId: string;
  founderName: string;
  email: string;
  currentOpportunityId: string | null;
  currentRoleBrief: Record<string, unknown> | null;
  founderStartupContext: {
    company: string | null;
    startupSummary: string | null;
    industry: string | null;
  };
  memoryBlock: string;
};

export async function buildFounderAgentContext(params: {
  founderId: string;
  founderName: string;
  email: string;
  currentOpportunity: any | null;
  founderStartupContext: { company: string | null; startupSummary: string | null; industry: string | null };
  userMessage: string;
}): Promise<FounderAgentContext> {
  const { founderId, founderName, email, currentOpportunity, founderStartupContext, userMessage } = params;

  const oppId = currentOpportunity ? String(currentOpportunity._id) : null;
  const query = userMessage || 'hiring preferences search strategy candidate feedback';

  const [founderProfile, oppMemories] = await Promise.all([
    getFounderMemoryProfile(founderId, query).catch(() => null),
    oppId ? searchOpportunityMemories(oppId, query).catch(() => [] as string[]) : Promise.resolve([] as string[]),
  ]);

  const memoryBlock = formatMultiMemoryForPrompt({
    founderProfile,
    opportunityMemories: oppMemories,
  });

  const startupBlock = formatFounderStartupContextForPrompt(founderStartupContext);

  return {
    founderId,
    founderName,
    email,
    currentOpportunityId: oppId,
    currentRoleBrief: currentOpportunity ? (currentOpportunity.toObject ? currentOpportunity.toObject() : currentOpportunity) : null,
    founderStartupContext,
    memoryBlock: startupBlock + (memoryBlock ? '\n\n' + memoryBlock : ''),
  };
}

export async function buildBuilderAgentContext(params: {
  builderId: string;
  builder: any;
  projects: any[];
  profileCompletion: { score: number; proofScore?: number; missingItems?: string[] };
  userMessage: string;
}): Promise<BuilderAgentContext> {
  const { builderId, builder, projects, profileCompletion, userMessage } = params;

  const query = userMessage || 'builder profile projects proof skills availability';

  const builderProfile = await getBuilderMemoryProfile(builderId, query).catch(() => null);

  const memoryBlock = formatMultiMemoryForPrompt({ builderProfile });

  return {
    builderId,
    builderName: builder.name || 'Builder',
    headline: builder.headline || null,
    bio: builder.bio || null,
    rolePreference: builder.rolePreference || [],
    preferredWorkType: builder.preferredWorkType || [],
    availability: {
      availableNow: builder.availability?.availableNow ?? false,
      hoursPerWeek: builder.availability?.hoursPerWeek ?? null,
      remotePreference: builder.availability?.remotePreference ?? 'unspecified',
    },
    links: {
      github: builder.links?.github || null,
      linkedin: builder.links?.linkedin || null,
      portfolio: builder.links?.portfolio || null,
      resume: builder.links?.resume || null,
    },
    profileScore: profileCompletion.score ?? 0,
    proofScore: profileCompletion.proofScore ?? 0,
    missingItems: profileCompletion.missingItems ?? [],
    qualityIssues: (builder.profileQuality?.issues || []).slice(0, 3).map((i: any) => i.title),
    qualitySummary: builder.profileQuality?.oneLineSummary || null,
    projectCount: projects.length,
    memoryBlock,
  };
}
