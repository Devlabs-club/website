import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import type { EnrichedProfileDraft, EnrichedProjectDraft, SourceEnrichmentResult } from './types';
import { downloadResumeAsPdf } from './resumeUrl';
import {
  applyResumeToBuilder,
  recordToExtractedResume,
} from '@/lib/talent/builderResumeExtract';

const RESUME_EXTRACT_PROMPT = `You are an expert resume parser for a developer talent marketplace.
Extract information from the resume text and return strict JSON only — no markdown fences, no commentary.

Use EXACTLY this schema (do not rename keys or add extra top-level fields):
{
  "headline": "string | null (max 120 chars)",
  "bio": "string | null (2-4 sentences, max 500 chars)",
  "skills": ["string"],
  "universityOrCompany": "string | null",
  "graduationYear": "number | null",
  "links": {
    "github": "string | null",
    "linkedin": "string | null",
    "portfolio": "string | null"
  },
  "experiences": [
    {
      "title": "string | null",
      "company": "string | null",
      "dateRange": "string | null",
      "description": "string | null",
      "skills": ["string"],
      "isCurrent": "boolean"
    }
  ],
  "projects": [
    {
      "projectName": "string",
      "description": "string",
      "techStack": ["string"],
      "builderContribution": "string",
      "links": { "github": "string | null", "demo": "string | null" }
    }
  ]
}

Rules:
- Include at most 6 experiences (most recent first) and at most 4 projects (most relevant only).
- Keep descriptions concise (1-2 sentences each).
- If a field is unknown, use null or [] — never omit required keys.`;

function parseJsonFromLlmResponse(responseText: string): Record<string, unknown> {
  const cleaned = responseText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error('resume_llm_no_json');
  }
  const jsonStr = cleaned.slice(jsonStart, jsonEnd + 1);
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    // Common failure: truncated JSON when max_tokens cuts off mid-response.
    throw new Error('resume_llm_invalid_json');
  }
}

function normalizeAlternateResumeSchema(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.headline || raw.bio || raw.skills) return raw;

  const personal = raw.personal_details as Record<string, unknown> | undefined;
  const summary =
    (typeof raw.summary === 'string' && raw.summary) ||
    (typeof raw.professional_summary === 'string' && raw.professional_summary) ||
    null;

  const skills = new Set<string>();
  if (Array.isArray(raw.skills)) raw.skills.forEach((s) => skills.add(String(s)));
  if (Array.isArray(raw.technical_skills)) raw.technical_skills.forEach((s) => skills.add(String(s)));

  const projectsRaw = Array.isArray(raw.projects)
    ? raw.projects
    : Array.isArray(raw.experience)
      ? raw.experience
      : [];

  const projects = projectsRaw.slice(0, 4).map((item) => {
    const p = item as Record<string, unknown>;
    const tech = Array.isArray(p.techStack)
      ? p.techStack
      : Array.isArray(p.technologies)
        ? p.technologies
        : typeof p.technologies === 'string'
          ? p.technologies.split(/[,;|/]+/)
          : [];
    tech.forEach((t) => skills.add(String(t).trim()));
    const desc = typeof p.description === 'string' ? p.description : Array.isArray(p.description) ? p.description.join(' ') : '';
    return {
      projectName: p.projectName || p.name || p.title || p.company || 'Project',
      description: desc,
      techStack: tech.map(String).map((s) => s.trim()).filter(Boolean),
      builderContribution: typeof p.builderContribution === 'string' ? p.builderContribution : desc,
      links: { github: null, demo: null },
    };
  });

  const name = typeof personal?.name === 'string' ? personal.name : null;
  return {
    headline: name ? `${name} — software builder`.slice(0, 120) : null,
    bio: summary,
    skills: [...skills].filter(Boolean).slice(0, 30),
    universityOrCompany: null,
    graduationYear: null,
    links: {
      github: null,
      linkedin: typeof personal?.linkedin === 'string' ? personal.linkedin : null,
      portfolio: typeof personal?.website === 'string' ? personal.website : null,
    },
    projects,
  };
}

export async function extractResumeData(buffer: Buffer, options?: { localPdfPath?: string }) {
  await import('@/lib/workerPolyfills');
  const pdfBuffer = options?.localPdfPath
    ? (await import('fs')).readFileSync(options.localPdfPath)
    : buffer;

  let text = '';
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const pdfData = await pdfParse(pdfBuffer);
    text = String(pdfData.text || '').trim();
  } catch (error) {
    // Common with exported/scanned PDFs: "bad XRef entry" from the bundled pdf.js.
    // Never fail the builder intake on resume parse — LinkedIn/GitHub enrichment still runs.
    console.warn(
      '[resumeEnricher] pdf-parse failed; continuing without resume text',
      error instanceof Error ? error.message : error
    );
    return { text: '', extracted: null, reason: 'pdf_parse_failed' as const };
  }

  if (!text) return { text: '', extracted: null, reason: 'scanned_pdf_no_text' as const };
  if (text.length < 200) {
    return { text, extracted: null, reason: 'resume_insufficient_text' as const };
  }

  if (!hasOpenRouterConfig()) {
    return { text, extracted: null, reason: 'openrouter_not_configured' as const };
  }

  try {
    const responseText = await generateOpenRouterReply({
      systemPrompt: RESUME_EXTRACT_PROMPT,
      userPrompt: `Resume Text:\n\n${text.substring(0, 12000)}`,
      temperature: 0.1,
      maxTokens: 8192,
      responseFormat: 'json_object',
    });

    const parsed = normalizeAlternateResumeSchema(parseJsonFromLlmResponse(responseText));
    return { text, extracted: parsed, reason: null };
  } catch (error) {
    return {
      text,
      extracted: null,
      reason: error instanceof Error ? error.message : 'resume_llm_failed',
    };
  }
}

export function mapResumeExtractionToDraft(extracted: Record<string, unknown>): {
  profile: EnrichedProfileDraft;
  projects: EnrichedProjectDraft[];
} {
  const profile: EnrichedProfileDraft = {
    headline: typeof extracted.headline === 'string' ? extracted.headline : null,
    bio: typeof extracted.bio === 'string' ? extracted.bio : null,
    universityOrCompany:
      typeof extracted.universityOrCompany === 'string' ? extracted.universityOrCompany : null,
    graduationYear:
      typeof extracted.graduationYear === 'number' ? extracted.graduationYear : null,
    rolePreference: Array.isArray(extracted.rolePreference)
      ? extracted.rolePreference.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 6)
      : [],
    skills: Array.isArray(extracted.skills)
      ? extracted.skills.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 24)
      : [],
    links: {
      github:
        typeof (extracted.links as any)?.github === 'string' ? (extracted.links as any).github : null,
      linkedin:
        typeof (extracted.links as any)?.linkedin === 'string' ? (extracted.links as any).linkedin : null,
      portfolio:
        typeof (extracted.links as any)?.portfolio === 'string'
          ? (extracted.links as any).portfolio
          : null,
    },
  };

  const projects: EnrichedProjectDraft[] = [];
  if (Array.isArray(extracted.projects)) {
    for (const raw of extracted.projects) {
      const proj = raw as Record<string, unknown>;
      const projectName = typeof proj.projectName === 'string' ? proj.projectName.trim() : '';
      if (!projectName) continue;
      projects.push({
        projectName,
        description: typeof proj.description === 'string' ? proj.description : null,
        techStack: Array.isArray(proj.techStack)
          ? proj.techStack.map(String).map((s) => s.trim()).filter(Boolean)
          : [],
        builderContribution:
          typeof proj.builderContribution === 'string' ? proj.builderContribution : null,
        links: {
          github: typeof (proj.links as any)?.github === 'string' ? (proj.links as any).github : null,
          demo: typeof (proj.links as any)?.demo === 'string' ? (proj.links as any).demo : null,
        },
        source: 'resume_parser',
        sourceId: `resume:${projectName.toLowerCase()}`,
        verificationStatus: 'imported_unverified',
        confidence: 0.8,
      });
    }
  }

  return { profile, projects };
}

export async function enrichFromResume(builder: any): Promise<SourceEnrichmentResult> {
  const resumeUrl = builder?.links?.resume;
  if (!resumeUrl) {
    return { source: 'resume', errors: ['no_resume_url'] };
  }

  try {
    const downloaded = await downloadResumeAsPdf(resumeUrl, {
      signal: AbortSignal.timeout(30000),
    });
    try {
      const parsed = await extractResumeData(downloaded.buffer, {
        localPdfPath: downloaded.localPdfPath,
      });
      if (!parsed?.extracted) {
        const reason = parsed?.reason || 'no_extracted_data';
        return {
          source: 'resume',
          errors: [reason],
          meta: {
            resumeUrl,
            fetchUrl: downloaded.fetchUrl,
            localPdfPath: downloaded.localPdfPath,
            textLength: parsed?.text?.length ?? 0,
          },
        };
      }

      const { profile, projects } = mapResumeExtractionToDraft(parsed.extracted);
      const extracted = recordToExtractedResume(parsed.extracted as Record<string, unknown>);
      const writeResult = await applyResumeToBuilder(builder, extracted);
      return {
        source: 'resume',
        meta: {
          appliedInEnricher: true,
          writeResult,
          resumeUrl,
          fetchUrl: downloaded.fetchUrl,
          localPdfPath: downloaded.localPdfPath,
          // Legacy fields for callers that read profile/projects without cross-check apply
          profileDraft: profile,
          projectDrafts: projects,
        },
      };
    } finally {
      downloaded.cleanup();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'resume_enrichment_failed';
    if (message.startsWith('fetch_failed_') || message === 'downloaded_file_is_not_pdf') {
      return { source: 'resume', errors: [message], meta: { resumeUrl } };
    }
    return {
      source: 'resume',
      errors: [err instanceof Error ? err.message : 'resume_enrichment_failed'],
    };
  }
}
