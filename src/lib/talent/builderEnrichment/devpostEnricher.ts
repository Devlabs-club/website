import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { fetchUrlMarkdown, normalizeUrl } from './urlToMarkdown';
import type { EnrichedProjectDraft, SourceEnrichmentResult } from './types';

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const DEVPOST_EXTRACT_PROMPT = `Extract hackathon project details from Devpost page markdown.
Return strict JSON:
{
  "projectName": "string",
  "description": "string (max 400 chars, what the product does)",
  "problemSolved": "string | null (max 200 chars)",
  "techStack": ["string"],
  "builderContribution": "string | null (what THIS builder did — infer from team section if needed, max 250 chars)",
  "githubUrl": "string | null",
  "demoUrl": "string | null",
  "videoDemoUrl": "string | null",
  "awardOrRanking": "string | null"
}`;

export async function enrichDevpostUrl(
  devpostUrl: string,
  builderName?: string
): Promise<EnrichedProjectDraft | null> {
  const normalized = normalizeUrl(devpostUrl);
  if (!normalized) return null;

  const chunk = await fetchUrlMarkdown(normalized, 'Devpost submission', 5000);
  if (!chunk) return null;

  let parsed: Record<string, unknown> = {
    projectName: 'Devpost Project',
    description: null,
    techStack: [],
  };

  if (hasOpenRouterConfig()) {
    const extraction = await generateOpenRouterReply({
      systemPrompt: DEVPOST_EXTRACT_PROMPT,
      userPrompt: `Builder name: ${builderName || 'unknown'}\n\n${chunk.markdown}`,
      temperature: 0,
      maxTokens: 700,
    });
    parsed = parseJsonResponse(extraction) || parsed;
  } else {
    const titleLine = chunk.markdown.split('\n').find((line) => line.startsWith('# '));
    if (titleLine) parsed.projectName = titleLine.replace(/^#\s+/, '').trim();
  }

  const imageMatches = Array.from(
    chunk.markdown.matchAll(/!\[[^\]]*]\((https?:\/\/[^)\s]+)[^)]*\)/gi)
  );
  const screenshots =
    imageMatches
      .map((m) => m[1])
      .filter((u) => !/badge|logo|avatar|profile/i.test(u))
      .slice(0, 8)
      .join(', ') || null;

  return {
    projectName: String(parsed.projectName || 'Devpost Project'),
    description: typeof parsed.description === 'string' ? parsed.description : null,
    problemSolved: typeof parsed.problemSolved === 'string' ? parsed.problemSolved : null,
    techStack: Array.isArray(parsed.techStack)
      ? parsed.techStack.map(String).map((s) => s.trim()).filter(Boolean)
      : [],
    builderContribution:
      typeof parsed.builderContribution === 'string' ? parsed.builderContribution : null,
    links: {
      devpost: normalized,
      github: typeof parsed.githubUrl === 'string' ? parsed.githubUrl : null,
      demo: typeof parsed.demoUrl === 'string' ? parsed.demoUrl : null,
      videoDemo: typeof parsed.videoDemoUrl === 'string' ? parsed.videoDemoUrl : null,
      screenshots,
    },
    source: 'devpost_urltomarkdown',
    sourceId: normalized,
    verificationStatus: 'imported_unverified',
    confidence: 0.82,
  };
}

export async function enrichFromDevpost(
  builder: any,
  options?: { includeExistingProjects?: boolean }
): Promise<SourceEnrichmentResult> {
  const projects: EnrichedProjectDraft[] = [];
  const errors: string[] = [];

  const targets = new Set<string>();
  if (builder?.links?.devpost) targets.add(builder.links.devpost);

  if (options?.includeExistingProjects !== false) {
    const existing = await ProjectRecord.find({
      builderId: builder._id,
      'links.devpost': { $exists: true, $nin: [null, ''] },
    })
      .select('links.devpost')
      .lean();

    for (const row of existing) {
      if (row.links?.devpost) targets.add(row.links.devpost);
    }
  }

  for (const url of targets) {
    try {
      const draft = await enrichDevpostUrl(url, builder.name);
      if (draft) projects.push(draft);
      else errors.push(`devpost_empty:${url}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : `devpost_failed:${url}`);
    }
  }

  return {
    source: 'devpost',
    projects,
    errors: errors.length ? errors : undefined,
    meta: { urlsProcessed: targets.size },
  };
}
