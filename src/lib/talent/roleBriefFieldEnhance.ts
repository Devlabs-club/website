import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';

export type RoleBriefFieldKey =
  | 'roleTitle'
  | 'company'
  | 'startupSummary'
  | 'builderWillDo'
  | 'skillsNeeded'
  | 'niceToHaveSkills'
  | 'timeline'
  | 'budget'
  | 'locationPreference'
  | 'seniority'
  | 'hoursPerWeek'
  | 'deliverables';

const FIELD_META: Record<
  RoleBriefFieldKey,
  { label: string; instruction: string; list?: boolean }
> = {
  roleTitle: {
    label: 'Role title',
    instruction: 'Write one specific job title. No fluff, no "rockstar".',
  },
  company: {
    label: 'Company name',
    instruction: 'Return only the company or startup name.',
  },
  startupSummary: {
    label: 'Company context',
    instruction:
      'Write 2-3 sentences on what the company builds, who it serves, and stage. Direct, builder-native tone.',
  },
  builderWillDo: {
    label: 'What the builder will do',
    instruction:
      'Write a concrete scope: ownership areas, systems, and outcomes for the first 30-60 days.',
  },
  skillsNeeded: {
    label: 'Required skills',
    instruction: 'Return a comma-separated list of must-have skills only.',
    list: true,
  },
  niceToHaveSkills: {
    label: 'Nice-to-have skills',
    instruction: 'Return a comma-separated list of optional skills.',
    list: true,
  },
  timeline: {
    label: 'Timeline',
    instruction: 'Return a realistic hiring or start timeline (e.g. "Start in 2 weeks", "4-week sprint").',
  },
  budget: {
    label: 'Budget',
    instruction: 'Return compensation range or structure if inferable from context. Otherwise return the current value unchanged.',
  },
  locationPreference: {
    label: 'Location',
    instruction: 'Return location preference: Remote, hybrid city, or timezone requirements.',
  },
  seniority: {
    label: 'Seniority',
    instruction: 'Return expected experience level (e.g. "Mid-level", "2+ years shipping production code").',
  },
  hoursPerWeek: {
    label: 'Hours per week',
    instruction: 'Return expected weekly hours or commitment.',
  },
  deliverables: {
    label: 'Deliverables',
    instruction: 'Return comma-separated concrete deliverables for the role.',
    list: true,
  },
};

export function isEnhanceableRoleBriefField(field: string): field is RoleBriefFieldKey {
  return field in FIELD_META;
}

function buildBriefContext(context: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: ${value.join(', ')}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.length ? lines.join('\n') : 'No other brief fields filled yet.';
}

export async function enhanceRoleBriefField(params: {
  field: RoleBriefFieldKey;
  currentValue: string;
  briefContext: Record<string, unknown>;
}): Promise<string> {
  const meta = FIELD_META[params.field];
  const trimmed = params.currentValue.trim();

  if (!hasOpenRouterConfig()) {
    if (meta.list && trimmed) {
      return trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join(', ');
    }
    return trimmed || `Add details for ${meta.label.toLowerCase()}.`;
  }

  const systemPrompt = `You improve one field of a founder hiring brief for DevLabs.
Return ONLY the improved field value — no quotes, labels, markdown, or explanation.
${meta.list ? 'Use comma-separated values when listing skills or deliverables.' : 'Keep it concise.'}
Do not invent compensation unless the brief context already mentions budget or pay.`;

  const userPrompt = `Field: ${meta.label}
Goal: ${meta.instruction}

Current value:
${trimmed || '(empty)'}

Rest of brief for context:
${buildBriefContext(params.briefContext)}

Return the improved ${meta.label.toLowerCase()} only.`;

  const raw = await generateOpenRouterReply({
    systemPrompt,
    userPrompt,
    temperature: 0.35,
    maxTokens: meta.list ? 200 : 400,
  });

  return raw.replace(/^["']|["']$/g, '').trim();
}
