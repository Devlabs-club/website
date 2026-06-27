import { generateOpenRouterReply } from '@/lib/openrouter';
import { addExperience, getProjects, updateBuilderScores, buildProfileSnapshot } from '@/lib/agent/builderProfileTools';

export type ExtractedResume = {
  headline?: string | null;
  bio?: string | null;
  location?: string | null;
  currentStatus?: string | null;
  universityOrCompany?: string | null;
  graduationYear?: number | null;
  workAuthorization?: string | null;
  rolePreference?: string[];
  skills?: string[];
  links?: { github?: string | null; linkedin?: string | null; portfolio?: string | null };
  experiences?: Array<{ title: string; company: string; dateRange?: string | null; description?: string | null; skills?: string[]; isCurrent?: boolean }>;
};

/** Turn raw resume bytes into plain text. Handles PDF + text; flags everything else. */
export async function resumeBytesToText(buffer: Buffer, contentType?: string | null, filename?: string | null): Promise<string> {
  const name = (filename || '').toLowerCase();
  const type = (contentType || '').toLowerCase();
  const isPdf = type.includes('pdf') || name.endsWith('.pdf') || buffer.subarray(0, 5).toString('latin1') === '%PDF-';

  if (isPdf) {
    const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdf(buffer);
    return String(data.text || '').replace(/\s+/g, ' ').trim();
  }

  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return buffer.toString('utf8').replace(/\s+/g, ' ').trim();
  }

  throw new Error('Unsupported resume format. Send a PDF.');
}

/** LLM-extract structured BuilderProfile fields from resume text. */
export async function extractResumeFields(resumeText: string): Promise<ExtractedResume> {
  const trimmed = resumeText.slice(0, 12000);
  const raw = await generateOpenRouterReply({
    systemPrompt: `You extract a builder's profile from their resume text. Return STRICT JSON only, no markdown.
Schema:
{
  "headline": string|null,          // one-line role description, e.g. "Full-stack engineer shipping AI products"
  "bio": string|null,               // 1-2 sentence summary of what they build
  "location": string|null,          // city, country
  "currentStatus": "student"|"full_time"|"unemployed"|"founder"|"freelancer"|"other"|null,
  "universityOrCompany": string|null,
  "graduationYear": number|null,
  "workAuthorization": string|null, // e.g. "US citizen", "F1 OPT", "needs sponsorship"
  "rolePreference": string[],       // e.g. ["Backend engineer","ML engineer"]
  "skills": string[],               // top technical skills
  "links": { "github": string|null, "linkedin": string|null, "portfolio": string|null },
  "experiences": [ { "title": string, "company": string, "dateRange": string|null, "description": string|null, "skills": string[], "isCurrent": boolean } ]
}
Only include facts present in the resume. Use null / empty arrays when unknown. Max 6 experiences, most recent first.`,
    userPrompt: `Resume text:\n\n${trimmed}`,
    temperature: 0,
    maxTokens: 1500,
    responseFormat: 'json_object',
  });

  try {
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim());
    return parsed as ExtractedResume;
  } catch {
    return {};
  }
}

/**
 * Apply extracted resume data to a builder profile.
 * Fills empty fields only (never clobbers what the builder already confirmed),
 * adds experiences, and recomputes scores. Returns a fresh snapshot + a summary
 * of what changed so the agent can tell the builder.
 */
export async function applyResumeToBuilder(builder: any, extracted: ExtractedResume) {
  const applied: string[] = [];

  if (!builder.headline && extracted.headline) { builder.headline = extracted.headline; applied.push('headline'); }
  if (!builder.bio && extracted.bio) { builder.bio = extracted.bio; applied.push('bio'); }
  if (!builder.location && extracted.location) { builder.location = extracted.location; applied.push('location'); }
  if (!builder.universityOrCompany && extracted.universityOrCompany) { builder.universityOrCompany = extracted.universityOrCompany; applied.push('school/company'); }
  if (!builder.graduationYear && typeof extracted.graduationYear === 'number') { builder.graduationYear = extracted.graduationYear; applied.push('grad year'); }
  if (!builder.workAuthorization && extracted.workAuthorization) { builder.workAuthorization = extracted.workAuthorization; applied.push('work authorization'); }
  if (extracted.currentStatus && ['student', 'full_time', 'unemployed', 'founder', 'freelancer', 'other'].includes(extracted.currentStatus)) {
    builder.currentStatus = extracted.currentStatus;
  }
  if ((!builder.rolePreference || builder.rolePreference.length === 0) && extracted.rolePreference?.length) {
    builder.rolePreference = extracted.rolePreference.slice(0, 5);
    applied.push('role preferences');
  }

  builder.links = builder.links || {};
  if (!builder.links.github && extracted.links?.github) { builder.links.github = extracted.links.github; applied.push('GitHub'); }
  if (!builder.links.linkedin && extracted.links?.linkedin) { builder.links.linkedin = extracted.links.linkedin; applied.push('LinkedIn'); }
  if (!builder.links.portfolio && extracted.links?.portfolio) { builder.links.portfolio = extracted.links.portfolio; applied.push('portfolio'); }

  await builder.save();

  let experiencesAdded = 0;
  for (const exp of (extracted.experiences || []).slice(0, 6)) {
    if (!exp?.title || !exp?.company) continue;
    try {
      await addExperience(builder, {
        title: exp.title,
        company: exp.company,
        dateRange: exp.dateRange || undefined,
        description: exp.description || undefined,
        skills: exp.skills || [],
        isCurrent: !!exp.isCurrent,
      });
      experiencesAdded += 1;
    } catch (err) {
      console.error('[builderResumeExtract] addExperience failed', err);
    }
  }
  if (experiencesAdded) applied.push(`${experiencesAdded} experience${experiencesAdded === 1 ? '' : 's'}`);

  await updateBuilderScores(builder);
  const snapshot = buildProfileSnapshot(builder, await getProjects(builder._id));
  return { applied, experiencesAdded, snapshot };
}
