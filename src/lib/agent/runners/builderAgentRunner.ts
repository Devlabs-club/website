import ProjectRecord from '@/models/talent/ProjectRecord';
import EventRecord from '@/models/talent/EventRecord';
import MomentumUpdate from '@/models/talent/MomentumUpdate';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { upsertBuilderEmbedding, upsertProjectEmbedding } from '@/lib/talent/embeddings/upsertTalentEmbedding';
import { scheduleTalentStatsRefresh } from '@/lib/talent/talentDatabaseStats';
import { computeBuilderScores } from '@/lib/talent/matching';
import { evaluateBuilderProfileQuality } from '@/lib/talent/profileQuality';
import { generateOpenRouterAgentTurn, getOpenRouterChatModel, type AgentMessage, type ToolDefinition } from '@/lib/openrouter';
import { getBuilderIntroInbox } from '@/lib/talent/introFlow';
import { getBuilderActiveTrials } from '@/lib/talent/trialFlow';
import { getBuilderUpcomingCalls } from '@/lib/talent/callSchedule';
import { getBuilderThreads, getThreadMessages } from '@/lib/talent/messageFlow';
import { addBuilderMemory, getBuilderMemoryProfile } from '@/lib/talent/supermemory';
import {
  writeBuilderAvailabilityMemory,
  writeBuilderLinksMemory,
  writeBuilderProjectImportMemory,
  writeBuilderHeadlineBioMemory,
} from '@/lib/agent/memoryWriter';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, ...(data as object) }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function reloadBuilder(builderId: unknown) {
  return BuilderProfile.findById(builderId);
}

async function updateBuilderScores(builder: any) {
  const [projects, events, momentum] = await Promise.all([
    ProjectRecord.find({ builderId: builder._id }).lean(),
    EventRecord.find({ builderId: builder._id }).lean(),
    MomentumUpdate.find({ builderId: builder._id }).lean(),
  ]);
  const completion = computeBuilderScores(builder, projects);
  builder.profileCompletion = completion;
  try {
    const quality = await evaluateBuilderProfileQuality(builder, projects, events, momentum);
    builder.profileQuality = quality;
    builder.profileQuality.evaluatedAt = new Date();
  } catch (err) {
    console.error('[builderAgentRunner] quality eval failed:', err);
  }
  await builder.save();
  return completion;
}

function normalizeProjectUrl(input: string) {
  try {
    const parsed = new URL(input);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw new Error('Invalid URL');
  }
}

function getAllowedProjectSource(input: string) {
  const normalizedUrl = normalizeProjectUrl(input);
  const parsed = new URL(normalizedUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const isDevpost = hostname === 'devpost.com' && /^\/software\/[^/]+\/?$/.test(parsed.pathname);
  const isGithub = hostname === 'github.com' && /^\/[^/]+\/[^/]+\/?$/.test(parsed.pathname);
  return { normalizedUrl, isDevpost, isGithub };
}

async function importProject(url: string, builderId: any) {
  const { normalizedUrl, isDevpost, isGithub } = getAllowedProjectSource(url);

  const projectData = {
    projectName: '',
    description: null as string | null,
    techStack: [] as string[],
    links: { devpost: null as string | null, github: null as string | null, demo: null as string | null, screenshots: null as string | null },
  };

  if (isDevpost) {
    const params = new URLSearchParams({ url: normalizedUrl, title: 'true', links: 'true', clean: 'true' });
    const mdRes = await fetch(`https://urltomarkdown.herokuapp.com/?${params}`);
    if (!mdRes.ok) throw new Error(`Failed to fetch Devpost page: HTTP ${mdRes.status}`);
    const markdown = await mdRes.text();
    if (!markdown.trim()) throw new Error('Empty response from Devpost page');

    const imageMatches = Array.from(markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/gi));
    const imageUrl = imageMatches.map((m) => m[1]).find((u) => !/badge|logo|avatar|profile/i.test(u)) || imageMatches[0]?.[1] || null;

    const { generateOpenRouterReply } = await import('@/lib/openrouter');
    const extraction = await generateOpenRouterReply({
      systemPrompt: 'Extract project details from Devpost markdown. Return strict JSON: projectName (string), description (string max 300 chars), techStack (string[]), githubUrl (string|null), demoUrl (string|null). No markdown.',
      userPrompt: `Extract from:\n\n${markdown.substring(0, 4000)}`,
      temperature: 0,
      maxTokens: 500,
    });
    const parsed = JSON.parse(extraction.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    projectData.projectName = parsed.projectName || 'Devpost Project';
    projectData.description = parsed.description || null;
    projectData.techStack = Array.isArray(parsed.techStack) ? parsed.techStack : [];
    projectData.links.devpost = normalizedUrl;
    projectData.links.github = typeof parsed.githubUrl === 'string' ? parsed.githubUrl : null;
    projectData.links.demo = typeof parsed.demoUrl === 'string' ? parsed.demoUrl : null;
    projectData.links.screenshots = imageUrl;
  } else if (isGithub) {
    const match = normalizedUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/i);
    if (!match) throw new Error('Invalid GitHub URL');
    const [, owner, repo] = match;
    const [repoRes, langRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`),
      fetch(`https://api.github.com/repos/${owner}/${repo}/languages`),
    ]);
    if (!repoRes.ok) throw new Error(`GitHub API: HTTP ${repoRes.status}`);
    const data = await repoRes.json();
    projectData.projectName = data.name || 'GitHub Project';
    projectData.description = data.description || null;
    projectData.links.github = data.html_url || normalizedUrl;
    projectData.links.demo = data.homepage || null;
    projectData.links.screenshots = data.owner?.avatar_url || null;
    if (langRes.ok) {
      const langs = await langRes.json();
      projectData.techStack = Object.keys(langs).slice(0, 5);
    }
  } else {
    throw new Error('Only Devpost and GitHub links are supported for import.');
  }

  const project = await ProjectRecord.findOneAndUpdate(
    { builderId, sourceId: normalizedUrl },
    {
      $set: {
        builderId,
        projectName: projectData.projectName,
        description: projectData.description,
        techStack: projectData.techStack,
        'links.devpost': projectData.links.devpost,
        'links.github': projectData.links.github,
        'links.demo': projectData.links.demo,
        'links.screenshots': projectData.links.screenshots,
        sourceId: normalizedUrl,
        source: isDevpost ? 'devpost_urltomarkdown' : 'github_api',
        verificationStatus: 'builder_confirmed',
      },
    },
    { upsert: true, new: true }
  );

  return project;
}

const BUILDER_SYSTEM_PROMPT = `You are the DevLabs Builder Agent — a proactive profile intelligence agent.

Read the builder's profile first using get_builder_profile before making ANY claim about what they have or don't have. Never assume a field is missing without checking.

Your job: find the most critical profile gap, tell the builder exactly what's wrong, and fix it. Sound like a senior engineer reviewing someone's profile the night before a founder evaluates it.

Lead with the real issue. When someone says "what can you do" or "hey" — call get_builder_profile, then tell them what's broken, not what you can do.

After any write action, call get_builder_profile again to confirm the change saved correctly, then tell the builder what you updated and what to fix next.

Rules:
- ALWAYS call get_builder_profile before making claims about the profile
- Chain tools: read → act → confirm → next issue
- Never say "Done." as a full response
- Never say "This will help you get matched", "improve your chances", "rank higher", or "get noticed"
- Say "This makes your profile easier to evaluate" / "This clarifies your proof-of-work"
- No emojis. No fluff. One concrete next step at the end of every response.
- When fewer than 6 options exist, list them — don't ask open-ended questions
- For imports: skip forks/tutorials/boilerplates, prioritize shipped projects with READMEs`;

const BUILDER_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_builder_profile',
      description: 'Read the full builder profile: name, headline, bio, GitHub/LinkedIn/portfolio links, availability, preferred hire type, project count, and profile quality issues. Call this before making any claim about the profile.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_projects',
      description: 'List all builder projects with title, description, tech stack, and personal contribution.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_availability',
      description: 'Update the builder availability status.',
      parameters: {
        type: 'object',
        properties: {
          availableNow: { type: 'boolean', description: 'Whether the builder is currently open to work' },
          hoursPerWeek: { type: 'number', description: 'Hours per week available' },
          remotePreference: { type: 'string', enum: ['remote', 'hybrid', 'in_person', 'unspecified'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_links',
      description: 'Update profile links (GitHub, LinkedIn, portfolio URL).',
      parameters: {
        type: 'object',
        properties: {
          github: { type: 'string' },
          linkedin: { type: 'string' },
          portfolio: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_profile_basics',
      description: 'Update the builder headline and/or bio.',
      parameters: {
        type: 'object',
        properties: {
          headline: { type: 'string', description: 'One-line role description' },
          bio: { type: 'string', description: 'Short paragraph describing what the builder ships' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'import_project',
      description: 'Import a project from a GitHub repo URL or Devpost project URL.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Full GitHub repo URL or Devpost project URL' } },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluate_profile',
      description: 'Run a full quality evaluation of the builder profile.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_intros',
      description: 'Fetch all pending intro requests from founders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_work_trials',
      description: 'Fetch all active and submitted work trials.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_calls',
      description: 'Fetch all upcoming and pending calls with founders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_messages',
      description: 'Fetch all message threads with founders.',
      parameters: {
        type: 'object',
        properties: {
          threadId: { type: 'string', description: 'Optional: specific thread ID to fetch full history' },
        },
      },
    },
  },
];

export async function runBuilderAgentTurn(params: {
  builder: any;
  builderId: string;
  userText: string;
  history: Array<{ role: string; content: string }>;
}): Promise<Response> {
  const { builder, builderId, userText, history } = params;

  const memoryProfile = await getBuilderMemoryProfile(builderId, userText).catch(() => null);
  const memoryBlock = memoryProfile
    ? '\n\n[Builder memory]\n' + [
        ...(memoryProfile.static.slice(0, 5)),
        ...(memoryProfile.dynamic.slice(0, 3)),
      ].map((s) => `- ${s}`).join('\n')
    : '';

  async function runTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const freshB = await reloadBuilder(builder._id);
    const freshProjects = await ProjectRecord.find({ builderId: builder._id })
      .select('projectName description techStack builderContribution verificationStatus source links')
      .lean();

    switch (name) {
      case 'get_builder_profile': {
        const completion = computeBuilderScores(freshB || builder, freshProjects);
        return {
          name: (freshB || builder).name,
          headline: (freshB || builder).headline || null,
          bio: (freshB || builder).bio || null,
          links: {
            github: (freshB || builder).links?.github || null,
            linkedin: (freshB || builder).links?.linkedin || null,
            portfolio: (freshB || builder).links?.portfolio || null,
            devpost: (freshB || builder).links?.devpost || null,
            resume: (freshB || builder).links?.resume || null,
          },
          availability: {
            availableNow: (freshB || builder).availability?.availableNow ?? false,
            hoursPerWeek: (freshB || builder).availability?.hoursPerWeek ?? null,
            remotePreference: (freshB || builder).availability?.remotePreference ?? 'unspecified',
          },
          preferredHireType: (freshB || builder).preferredWorkType || [],
          projectCount: freshProjects.length,
          profileScore: completion.profileScore,
          proofScore: completion.proofScore,
          missingFields: completion.missingItems || [],
          qualityIssues: ((freshB || builder).profileQuality?.issues || []).slice(0, 3).map((i: any) => i.title),
          qualitySummary: (freshB || builder).profileQuality?.oneLineSummary || null,
        };
      }

      case 'get_projects': {
        return {
          projects: freshProjects.map((p: any) => ({
            id: String(p._id),
            title: p.projectName,
            description: p.description || null,
            techStack: p.techStack || [],
            personalContribution: p.builderContribution || null,
            verificationStatus: p.verificationStatus || 'self_reported',
            source: p.source || 'manual',
            githubUrl: p.links?.github || null,
            demoUrl: p.links?.demo || null,
            devpostUrl: p.links?.devpost || null,
          })),
        };
      }

      case 'update_availability': {
        const b = freshB || builder;
        b.availability = {
          ...b.availability,
          ...(typeof args.availableNow === 'boolean' ? { availableNow: args.availableNow, refreshedAt: new Date() } : {}),
          ...(typeof args.hoursPerWeek === 'number' ? { hoursPerWeek: args.hoursPerWeek } : {}),
          ...(typeof args.remotePreference === 'string' ? { remotePreference: args.remotePreference } : {}),
        };
        await updateBuilderScores(b);
        void writeBuilderAvailabilityMemory(addBuilderMemory, {
          builderId,
          builderName: b.name,
          availableNow: b.availability?.availableNow,
          hoursPerWeek: b.availability?.hoursPerWeek,
          remotePreference: b.availability?.remotePreference,
        });
        void upsertBuilderEmbedding({ builderId, builder: b, projects: freshProjects });
        scheduleTalentStatsRefresh();
        return { success: true, updated: { availableNow: b.availability?.availableNow, hoursPerWeek: b.availability?.hoursPerWeek, remotePreference: b.availability?.remotePreference } };
      }

      case 'update_links': {
        const b = freshB || builder;
        b.links = {
          ...b.links,
          ...(typeof args.github === 'string' ? { github: args.github } : {}),
          ...(typeof args.linkedin === 'string' ? { linkedin: args.linkedin } : {}),
          ...(typeof args.portfolio === 'string' ? { portfolio: args.portfolio } : {}),
        };
        await updateBuilderScores(b);
        void writeBuilderLinksMemory(addBuilderMemory, {
          builderId,
          builderName: b.name,
          github: args.github as string | null,
          linkedin: args.linkedin as string | null,
          portfolio: args.portfolio as string | null,
        });
        scheduleTalentStatsRefresh();
        return { success: true, updated: { github: args.github ?? null, linkedin: args.linkedin ?? null, portfolio: args.portfolio ?? null } };
      }

      case 'update_profile_basics': {
        const b = freshB || builder;
        if (typeof args.headline === 'string') b.headline = args.headline.trim() || null;
        if (typeof args.bio === 'string') b.bio = args.bio.trim() || null;
        await b.save();
        await updateBuilderScores(b);
        void writeBuilderHeadlineBioMemory(addBuilderMemory, {
          builderId,
          builderName: b.name,
          headline: args.headline as string | null,
          bio: args.bio as string | null,
        });
        scheduleTalentStatsRefresh();
        return { success: true, updated: { headline: args.headline ?? null, bio: typeof args.bio === 'string' ? (args.bio as string).slice(0, 80) + '...' : null } };
      }

      case 'import_project': {
        const url = typeof args.url === 'string' ? args.url : null;
        if (!url) return { success: false, error: 'No URL provided' };
        try {
          const project = await importProject(url, builder._id);
          void writeBuilderProjectImportMemory(addBuilderMemory, {
            builderId,
            builderName: (freshB || builder).name,
            projectId: String(project._id),
            projectName: project.projectName,
            source: project.source || 'unknown',
            techStack: project.techStack || [],
          });
          void upsertProjectEmbedding({ projectId: String(project._id), builderId, project });
          void upsertBuilderEmbedding({ builderId, builder: freshB || builder, projects: [...freshProjects, project] });
          scheduleTalentStatsRefresh();
          return { success: true, project: { title: project.projectName, description: project.description, techStack: project.techStack, source: project.source } };
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : 'Import failed' };
        }
      }

      case 'evaluate_profile': {
        const b = freshB || builder;
        const events = await EventRecord.find({ builderId: builder._id }).lean();
        const momentum = await MomentumUpdate.find({ builderId: builder._id }).lean();
        const quality = await evaluateBuilderProfileQuality(b, freshProjects, events, momentum);
        b.profileQuality = quality;
        b.profileQuality.evaluatedAt = new Date();
        await b.save();
        return {
          overallScore: quality.overallScore,
          label: quality.label,
          summary: quality.oneLineSummary,
          issues: (quality.issues || []).slice(0, 4).map((i: any) => ({ title: i.title, detail: i.detail })),
          suggestedFixes: (quality.suggestedFixes || []).slice(0, 3).map((f: any) => f.action),
        };
      }

      case 'fetch_intros': {
        const intros = await getBuilderIntroInbox(builderId);
        return {
          count: intros.length,
          intros: intros.map((i: any) => ({
            introId: i._id,
            status: i.status,
            founderName: i.founderName,
            company: i.company,
            roleTitle: i.roleTitle,
            hireType: i.hireType || null,
            introMessage: i.introMessage,
            budget: i.budget || null,
            timeline: i.timeline || null,
            receivedAt: i.createdAt,
            viewedAt: i.viewedAt || null,
            threadId: i.threadId || null,
          })),
        };
      }

      case 'fetch_work_trials': {
        const trials = await getBuilderActiveTrials(builderId);
        return {
          count: trials.length,
          trials: trials.map((t: any) => ({
            matchId: t.matchId,
            company: t.company,
            roleTitle: t.roleTitle,
            founderName: t.founderName,
            matchStatus: t.matchStatus,
            trial: t.trialProject ? {
              title: t.trialProject.title,
              goal: t.trialProject.goal,
              deliverables: t.trialProject.deliverables || [],
              timeline: t.trialProject.timeline,
              deadline: t.trialProject.deadlineAt || null,
              status: t.trialProject.status,
              compensation: t.trialProject.compensation || null,
              submission: t.trialProject.submission || null,
            } : null,
          })),
        };
      }

      case 'fetch_calls': {
        const calls = await getBuilderUpcomingCalls(builderId);
        return {
          count: calls.length,
          calls: calls.map((c: any) => ({
            callId: c._id,
            company: c.company,
            roleTitle: c.roleTitle,
            founderName: c.founderName,
            status: c.status,
            proposedSlot: c.proposedSlot || null,
            confirmedSlot: c.confirmedSlot || null,
            meetingUrl: c.meetingUrl || null,
          })),
        };
      }

      case 'fetch_messages': {
        const threadId = typeof args.threadId === 'string' ? args.threadId : null;
        if (threadId) {
          const result = await getThreadMessages(threadId, { type: 'builder', builderId });
          if ('error' in result) return { error: (result as any).error };
          return {
            threadId,
            messages: ((result as any).messages || []).map((m: any) => ({
              sender: m.senderType,
              text: m.body,
              sentAt: m.createdAt,
            })),
            introStatus: (result as any).intro?.status || null,
          };
        }
        const threads = await getBuilderThreads(builderId);
        return {
          count: threads.length,
          threads: threads.map((t: any) => ({
            threadId: t._id,
            company: t.company || null,
            roleTitle: t.roleTitle || null,
            founderName: t.founderName || null,
            lastMessageAt: t.lastMessageAt || null,
            lastMessagePreview: t.lastMessagePreview || null,
            unreadCount: t.builderUnreadCount || 0,
          })),
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  const messages: AgentMessage[] = [
    { role: 'system', content: BUILDER_SYSTEM_PROMPT + memoryBlock },
    ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: userText },
  ];

  let agentResponse = await generateOpenRouterAgentTurn({ messages, tools: BUILDER_TOOLS, temperature: 0.3, maxTokens: 600 });
  let uiBlocks: any[] = [];
  const MAX_ITERATIONS = 5;
  let iterations = 0;

  while (agentResponse.tool_calls?.length && iterations < MAX_ITERATIONS) {
    iterations++;
    messages.push({ role: 'assistant', content: agentResponse.content ?? null, tool_calls: agentResponse.tool_calls });

    const toolResults = await Promise.all(
      agentResponse.tool_calls.map(async (tc) => {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch {}
        console.log(`[builderAgentRunner] tool_call: ${tc.function.name}`, args);
        const result = await runTool(tc.function.name, args);

        if (tc.function.name === 'evaluate_profile' && result.issues) {
          uiBlocks = [{ type: 'profile_quality', title: `Profile: ${result.label}`, body: result.summary, items: (result.issues as any[]).map((i: any) => i.title) }];
        }
        if (tc.function.name === 'import_project' && result.success) {
          uiBlocks.push({ type: 'summary_card', title: `Imported: ${(result.project as any)?.title}`, body: (result.project as any)?.description });
        }

        return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
      })
    );

    messages.push(...toolResults);
    agentResponse = await generateOpenRouterAgentTurn({ messages, tools: BUILDER_TOOLS, temperature: 0.3, maxTokens: 600 });
  }

  const finalMessage = agentResponse.content || 'I ran into an issue. Try asking again.';

  const finalBuilder = await reloadBuilder(builder._id);
  const finalProjects = await ProjectRecord.find({ builderId: builder._id }).lean();
  const profileForClient = finalBuilder
    ? {
        _id: String(finalBuilder._id),
        name: finalBuilder.name,
        email: finalBuilder.email,
        headline: finalBuilder.headline,
        bio: finalBuilder.bio,
        links: finalBuilder.links,
        availability: finalBuilder.availability,
        rolePreference: finalBuilder.rolePreference,
        preferredWorkType: finalBuilder.preferredWorkType,
        profileCompletion: computeBuilderScores(finalBuilder, finalProjects),
        profileQuality: finalBuilder.profileQuality,
      }
    : null;

  console.log('[builderAgentRunner] done', { builderId, iterations, toolsCalled: messages.filter((m) => m.role === 'tool').length });

  return ok({ message: finalMessage, uiBlocks, builder: profileForClient, meta: { model: getOpenRouterChatModel(), iterations } });
}
