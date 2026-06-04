import { containers } from './containerTags';

export type RetrievedMemory = {
  content: string;
  source: string;
};

export type LayeredMemoryContext = {
  builderProfile?: RetrievedMemory[];
  founderProfile?: RetrievedMemory[];
  opportunityContext?: RetrievedMemory[];
  projectContext?: RetrievedMemory[];
  candidateFeedback?: RetrievedMemory[];
  searchStrategy?: RetrievedMemory[];
};

export type RetrievalInput =
  | {
      role: 'builder';
      builderId: string;
      query?: string;
      projectId?: string;
    }
  | {
      role: 'founder';
      founderId: string;
      query?: string;
      opportunityId?: string;
      builderId?: string;
    };

export async function buildLayeredMemoryContext(
  input: RetrievalInput,
  searchMemoryFn: (containerTag: string, query: string) => Promise<string[]>,
  profileFn: (containerTag: string, query?: string) => Promise<{ static: string[]; dynamic: string[] } | null>
): Promise<LayeredMemoryContext> {
  const ctx: LayeredMemoryContext = {};

  if (input.role === 'builder') {
    const query = input.query ?? 'builder profile projects proof skills';
    const [profile, projectMems] = await Promise.all([
      profileFn(containers.builder(input.builderId), query),
      input.projectId
        ? searchMemoryFn(containers.project(input.projectId), query)
        : Promise.resolve([] as string[]),
    ]);

    if (profile) {
      ctx.builderProfile = [
        ...profile.static.map((s) => ({ content: s, source: 'builder_static' })),
        ...profile.dynamic.map((d) => ({ content: d, source: 'builder_dynamic' })),
      ];
    }
    if (projectMems.length) {
      ctx.projectContext = projectMems.map((m) => ({ content: m, source: 'project_memory' }));
    }
  }

  if (input.role === 'founder') {
    const query = input.query ?? 'hiring preferences search strategy candidate feedback';

    const fetchOps: Promise<unknown>[] = [
      profileFn(containers.founder(input.founderId), query),
    ];

    if (input.opportunityId) {
      fetchOps.push(searchMemoryFn(containers.opportunity(input.opportunityId), query));
    }
    if (input.opportunityId && input.builderId) {
      fetchOps.push(
        searchMemoryFn(containers.candidateFit(input.opportunityId, input.builderId), query)
      );
    }

    const [founderProfile, oppMems, fitMems] = await (Promise.all(fetchOps) as Promise<[any, string[]?, string[]?]>);

    if (founderProfile) {
      ctx.founderProfile = [
        ...(founderProfile.static || []).map((s: string) => ({ content: s, source: 'founder_static' })),
        ...(founderProfile.dynamic || []).map((d: string) => ({ content: d, source: 'founder_dynamic' })),
      ];
    }
    if (oppMems?.length) {
      ctx.opportunityContext = oppMems.map((m) => ({ content: m, source: 'opportunity_memory' }));
    }
    if (fitMems?.length) {
      ctx.candidateFeedback = fitMems.map((m) => ({ content: m, source: 'candidate_fit_memory' }));
    }
  }

  return ctx;
}

export function formatLayeredContextForPrompt(ctx: LayeredMemoryContext): string {
  const sections: string[] = [];

  if (ctx.founderProfile?.length) {
    sections.push('[Founder memory]\n' + ctx.founderProfile.slice(0, 6).map((m) => `- ${m.content}`).join('\n'));
  }
  if (ctx.builderProfile?.length) {
    sections.push('[Builder memory]\n' + ctx.builderProfile.slice(0, 6).map((m) => `- ${m.content}`).join('\n'));
  }
  if (ctx.opportunityContext?.length) {
    sections.push('[Role context]\n' + ctx.opportunityContext.slice(0, 4).map((m) => `- ${m.content}`).join('\n'));
  }
  if (ctx.candidateFeedback?.length) {
    sections.push('[Candidate feedback]\n' + ctx.candidateFeedback.slice(0, 4).map((m) => `- ${m.content}`).join('\n'));
  }
  if (ctx.projectContext?.length) {
    sections.push('[Project context]\n' + ctx.projectContext.slice(0, 3).map((m) => `- ${m.content}`).join('\n'));
  }

  return sections.join('\n\n');
}
