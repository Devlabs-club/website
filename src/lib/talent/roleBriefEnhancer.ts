import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import type { SanitizedRoleBriefFields } from './founderRoleBrief';
import type { TalentDatabaseStats } from './talentDatabaseStats';
import { formatStatsForPrompt } from './talentDatabaseStats';

export type EnhancedRoleBrief = {
  roleTitle: string | null;
  builderWillDo: string | null;
  skillsNeeded: string[];
  niceToHaveSkills: string[];
  enhancementNotes: string[];
};

function buildBriefSummary(fields: SanitizedRoleBriefFields): string {
  const parts: string[] = [];
  if (fields.roleTitle) parts.push(`Role: ${fields.roleTitle}`);
  if (fields.builderWillDo) parts.push(`What they'll build: ${fields.builderWillDo}`);
  if (fields.skillsNeeded.length) parts.push(`Required skills: ${fields.skillsNeeded.join(', ')}`);
  if (fields.niceToHaveSkills.length) parts.push(`Nice-to-have: ${fields.niceToHaveSkills.join(', ')}`);
  if (fields.hireType) parts.push(`Hire type: ${fields.hireType}`);
  if (fields.company) parts.push(`Company: ${fields.company}`);
  if (fields.startupSummary) parts.push(`Context: ${fields.startupSummary}`);
  return parts.join('\n');
}

export async function enhanceRoleBriefForTalentPool(params: {
  fields: SanitizedRoleBriefFields;
  talentStats: TalentDatabaseStats;
  userText: string;
}): Promise<EnhancedRoleBrief> {
  const { fields, talentStats } = params;

  if (!hasOpenRouterConfig()) {
    return {
      roleTitle: fields.roleTitle,
      builderWillDo: fields.builderWillDo,
      skillsNeeded: fields.skillsNeeded,
      niceToHaveSkills: fields.niceToHaveSkills,
      enhancementNotes: [],
    };
  }

  const poolContext = formatStatsForPrompt(talentStats);
  const briefSummary = buildBriefSummary(fields);

  const systemPrompt = `You are a talent matching expert for DevLabs, a proof-of-work hiring platform.

Your job is to enhance a founder's role brief so it better matches the actual builders in the DevLabs talent pool.

You have access to real statistics about the builder pool. Use these to:
1. Map vague skill names to specific skills that actually exist in the pool (e.g. "AI" → "Python, OpenAI API, LangChain")
2. Expand required skills with the most common co-occurring skills from builders who have the stated skills
3. Improve "builderWillDo" to be specific, proof-of-work oriented, and aligned with what builders in this pool can actually demonstrate
4. Suggest nice-to-have skills that commonly appear with the required ones in the pool
5. Keep role title concise and use language builders use to describe themselves

Rules:
- Only add skills that actually appear in the talent pool (use pool data)
- Never invent skills that aren't in the pool
- Keep skillsNeeded to the most critical 4-6 skills
- Keep niceToHaveSkills to 3-5 suggestions
- builderWillDo should be concrete (what they ship, not just responsibilities)
- Return strict JSON only — no markdown, no commentary

Return JSON with exactly these keys:
{
  "roleTitle": "string or null",
  "builderWillDo": "string or null",
  "skillsNeeded": ["skill1", "skill2"],
  "niceToHaveSkills": ["skill1", "skill2"],
  "enhancementNotes": ["note about what was changed and why"]
}`;

  const userPrompt = `${poolContext}

Founder's role brief (as provided):
${briefSummary || '(No brief fields provided yet)'}

Enhance this role brief to better match the talent pool. If the brief already looks well-specified, make minimal changes and explain why in enhancementNotes.`;

  try {
    const raw = await generateOpenRouterReply({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 600,
    });

    const json = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(json);

    return {
      roleTitle: typeof parsed.roleTitle === 'string' ? parsed.roleTitle.trim() || null : fields.roleTitle,
      builderWillDo: typeof parsed.builderWillDo === 'string' ? parsed.builderWillDo.trim() || null : fields.builderWillDo,
      skillsNeeded: Array.isArray(parsed.skillsNeeded) ? parsed.skillsNeeded.map(String).filter(Boolean) : fields.skillsNeeded,
      niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills) ? parsed.niceToHaveSkills.map(String).filter(Boolean) : fields.niceToHaveSkills,
      enhancementNotes: Array.isArray(parsed.enhancementNotes) ? parsed.enhancementNotes.map(String) : [],
    };
  } catch (err) {
    console.warn('[roleBriefEnhancer] Enhancement failed, using original fields:', err instanceof Error ? err.message : err);
    return {
      roleTitle: fields.roleTitle,
      builderWillDo: fields.builderWillDo,
      skillsNeeded: fields.skillsNeeded,
      niceToHaveSkills: fields.niceToHaveSkills,
      enhancementNotes: [],
    };
  }
}

export function mergeEnhancementIntoFields(
  original: SanitizedRoleBriefFields,
  enhanced: EnhancedRoleBrief
): SanitizedRoleBriefFields {
  return {
    ...original,
    // Only override if original was missing or the enhancement adds real value
    roleTitle: enhanced.roleTitle || original.roleTitle,
    builderWillDo: enhanced.builderWillDo && enhanced.builderWillDo.length > (original.builderWillDo?.length ?? 0)
      ? enhanced.builderWillDo
      : original.builderWillDo,
    // For skills, union original with enhancements but keep original intent
    skillsNeeded: enhanced.skillsNeeded.length > 0 ? enhanced.skillsNeeded : original.skillsNeeded,
    niceToHaveSkills: enhanced.niceToHaveSkills.length > 0
      ? [...new Set([...original.niceToHaveSkills, ...enhanced.niceToHaveSkills])].slice(0, 6)
      : original.niceToHaveSkills,
  };
}
