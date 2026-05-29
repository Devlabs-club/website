import { generateOpenRouterReply, getOpenRouterChatModel, hasOpenRouterConfig } from '@/lib/openrouter';

export type ProfileQualityLabel = 'Unclear' | 'Needs Sharpening' | 'Understandable' | 'Founder-Friendly' | 'Standout';

export interface ProfileQualityEvaluation {
  overallScore: number;
  label: ProfileQualityLabel;
  oneLineSummary: string;
  founderClarity: {
    score: number;
    label: string;
    summary: string;
  };
  strengths: Array<{ title: string; detail: string }>;
  issues: Array<{ field: string; severity: 'low' | 'medium' | 'high'; title: string; detail: string }>;
  suggestedFixes: Array<{ field: string; priority: 'low' | 'medium' | 'high'; action: string; example: string }>;
  fieldScores: {
    headline: number;
    bio: number;
    roles: number;
    skills: number;
    projects: number;
    contributions: number;
    proofLinks: number;
    availability: number;
  };
  source: 'llm' | 'deterministic';
}

function getLabel(score: number): ProfileQualityLabel {
  if (score >= 90) return 'Standout';
  if (score >= 75) return 'Founder-Friendly';
  if (score >= 60) return 'Understandable';
  if (score >= 40) return 'Needs Sharpening';
  return 'Unclear';
}

export function evaluateDeterministicQuality(builder: any, projects: any[]): ProfileQualityEvaluation {
  let score = 0;
  
  const headlineLen = (builder?.headline || '').split(' ').length;
  if (headlineLen > 3) score += 10;
  else if (headlineLen > 0) score += 5;

  const bioLen = (builder?.bio || '').split(' ').length;
  if (bioLen > 30) score += 10;
  else if (bioLen > 10) score += 5;

  if (Array.isArray(builder?.rolePreference) && builder.rolePreference.length > 0) score += 10;
  
  const projectSkills = projects.flatMap(p => p.techStack || []);
  if (projectSkills.length > 0) score += 10;

  if (projects.length > 0) score += 10;

  let maxDescScore = 0;
  let maxContribScore = 0;
  let hasLinks = false;

  for (const p of projects) {
    const descLen = (p.description || '').length;
    if (descLen > 100) maxDescScore = Math.max(maxDescScore, 10);
    else if (descLen > 30) maxDescScore = Math.max(maxDescScore, 5);

    const contribLen = (p.builderContribution || '').length;
    if (contribLen > 80) maxContribScore = Math.max(maxContribScore, 15);
    else if (contribLen > 20) maxContribScore = Math.max(maxContribScore, 7);

    if (p.links?.github || p.links?.devpost || p.links?.demo) hasLinks = true;
  }

  score += maxDescScore;
  score += maxContribScore;

  if (hasLinks || builder?.links?.github || builder?.links?.portfolio) score += 15;

  if (builder?.availability?.hoursPerWeek && builder?.preferredWorkType?.length > 0) score += 10;

  // Add 10 points if there's any verification
  if (projects.some(p => ['admin_verified', 'founder_verified', 'peer_confirmed'].includes(p.verificationStatus))) {
    score += 10;
  }

  score = Math.min(100, score);

  const issues: any[] = [];
  const suggestedFixes: any[] = [];
  const strengths: any[] = [];

  if (score >= 70) {
    strengths.push({ title: 'Good foundation', detail: 'You have the basics down.' });
  }

  if (maxContribScore < 15 && projects.length > 0) {
    issues.push({ field: 'contributions', severity: 'high', title: 'Vague contributions', detail: 'Founders need to know exactly what you built.' });
    suggestedFixes.push({ field: 'contributions', priority: 'high', action: 'Detail your specific technical contributions for each project.', example: 'Built the Flutter mobile app and Firebase auth flow.' });
  } else if (projects.length === 0) {
    issues.push({ field: 'projects', severity: 'high', title: 'No proof of work', detail: 'You need at least one project to show founders.' });
    suggestedFixes.push({ field: 'projects', priority: 'high', action: 'Add a project you built.', example: 'Add your latest hackathon project.' });
  }

  if (bioLen < 30) {
    issues.push({ field: 'bio', severity: 'medium', title: 'Short bio', detail: 'A longer bio helps founders understand your background.' });
    suggestedFixes.push({ field: 'bio', priority: 'medium', action: 'Expand your bio to explain your strengths and what you want to build.', example: 'I am a full-stack developer passionate about healthcare...' });
  }

  return {
    overallScore: score,
    label: getLabel(score),
    oneLineSummary: score >= 70 ? 'Your profile is looking good, but could use more specific details.' : 'Your profile needs more detail before founders can evaluate you.',
    founderClarity: {
      score: score,
      label: getLabel(score),
      summary: score >= 70 ? 'Founders can generally understand your value.' : 'Founders will struggle to understand what you can build.',
    },
    strengths,
    issues,
    suggestedFixes,
    fieldScores: {
      headline: headlineLen > 3 ? 100 : 50,
      bio: bioLen > 30 ? 100 : 50,
      roles: builder?.rolePreference?.length ? 100 : 0,
      skills: projectSkills.length ? 100 : 0,
      projects: projects.length ? 100 : 0,
      contributions: maxContribScore > 0 ? (maxContribScore / 15) * 100 : 0,
      proofLinks: hasLinks ? 100 : 0,
      availability: builder?.availability?.hoursPerWeek ? 100 : 0,
    },
    source: 'deterministic'
  };
}

export async function evaluateBuilderProfileQuality(builder: any, projects: any[], events: any[] = [], momentumUpdates: any[] = []): Promise<ProfileQualityEvaluation> {
  const deterministic = evaluateDeterministicQuality(builder, projects);

  if (!hasOpenRouterConfig()) {
    return deterministic;
  }

  const promptData = {
    name: builder.name,
    headline: builder.headline,
    bio: builder.bio,
    roles: builder.rolePreference,
    skills: projects.flatMap(p => p.techStack || []),
    workPreferences: builder.preferredWorkType,
    availability: builder.availability,
    links: builder.links,
    projects: projects.map(p => ({
      title: p.projectName,
      description: p.description,
      techStack: p.techStack,
      contribution: p.builderContribution,
      source: p.source,
      verificationStatus: p.verificationStatus,
      links: p.links
    })),
    eventsCount: events.length,
    momentumCount: momentumUpdates.length
  };

  const systemPrompt = `You are evaluating a builder profile for DevLabs, a proof-of-work hiring marketplace for early-stage startups. Your job is to judge profile quality, not field completion. A profile is high quality only if a startup founder can quickly understand what the builder is good at, what they have actually built, what they personally contributed, and why they are credible. Be strict but constructive. Do not reward vague or generic content just because fields are filled. Separate roles from skills. Prefer specific, evidence-backed profiles. Return only valid JSON matching the requested schema.

Schema:
{
  "overallScore": number (0-100),
  "label": "Unclear" | "Needs Sharpening" | "Understandable" | "Founder-Friendly" | "Standout",
  "oneLineSummary": string,
  "founderClarity": {
    "score": number (0-100),
    "label": "Unclear" | "Needs Sharpening" | "Understandable" | "Founder-Friendly" | "Standout",
    "summary": string
  },
  "strengths": [ { "title": string, "detail": string } ],
  "issues": [ { "field": string, "severity": "low" | "medium" | "high", "title": string, "detail": string } ],
  "suggestedFixes": [ { "field": string, "priority": "low" | "medium" | "high", "action": string, "example": string } ],
  "fieldScores": {
    "headline": number,
    "bio": number,
    "roles": number,
    "skills": number,
    "projects": number,
    "contributions": number,
    "proofLinks": number,
    "availability": number
  }
}`;

  try {
    const responseText = await generateOpenRouterReply({
      systemPrompt,
      userPrompt: `Evaluate this builder profile:\n\n${JSON.stringify(promptData, null, 2)}`,
      temperature: 0.1,
      maxTokens: 1000,
    });

    const jsonStr = responseText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const result = JSON.parse(jsonStr);

    return {
      overallScore: typeof result.overallScore === 'number' ? result.overallScore : deterministic.overallScore,
      label: result.label || deterministic.label,
      oneLineSummary: result.oneLineSummary || deterministic.oneLineSummary,
      founderClarity: result.founderClarity || deterministic.founderClarity,
      strengths: Array.isArray(result.strengths) ? result.strengths : deterministic.strengths,
      issues: Array.isArray(result.issues) ? result.issues : deterministic.issues,
      suggestedFixes: Array.isArray(result.suggestedFixes) ? result.suggestedFixes : deterministic.suggestedFixes,
      fieldScores: result.fieldScores || deterministic.fieldScores,
      source: 'llm'
    };
  } catch (error) {
    console.error('[profileQuality] LLM evaluation failed, falling back to deterministic:', error);
    return deterministic;
  }
}
