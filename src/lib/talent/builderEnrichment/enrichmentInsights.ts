import BuilderProfile from '@/models/talent/BuilderProfile';
import { rememberBuilderFact, type MemoryRef } from '@/lib/talent/builderAgentMemory';
import type { DeepResearchResult } from '@/lib/talent/builderDeepResearch';
import type { SourceEnrichmentResult } from './types';

export type FounderHighlight = {
  title: string;
  detail: string;
  source: string;
};

function dedupeKey(...parts: string[]) {
  return parts.map((p) => p.trim().toLowerCase()).filter(Boolean).join('|');
}

function addHighlight(
  list: FounderHighlight[],
  seen: Set<string>,
  title: string,
  detail: string,
  source: string
) {
  const key = dedupeKey(title, detail);
  if (!title.trim() || !detail.trim() || seen.has(key)) return;
  seen.add(key);
  list.push({ title: title.trim(), detail: detail.trim(), source });
}

function addDerivedFounderSignals(builder: any, highlights: FounderHighlight[], seen: Set<string>) {
  const existing = Array.isArray(builder.enrichmentInsights?.founderHighlights)
    ? builder.enrichmentInsights.founderHighlights
    : [];
  const blob = [
    builder.headline,
    builder.bio,
    builder.universityOrCompany,
    ...(builder.experiences || []).flatMap((exp: any) => [exp?.title, exp?.company, exp?.description]),
    ...existing.flatMap((h: any) => [h?.title, h?.detail]),
    ...highlights.flatMap((h: any) => [h?.title, h?.detail]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const leadershipExperience = (builder.experiences || []).find((exp: any) =>
    /founder|co-?founder|president|organizer|captain|community|devlabs/i.test(
      `${exp?.title || ''} ${exp?.company || ''}`
    )
  );

  if (/community|founder|founded|runs|running|organizer|president|club|devlabs|500\+|builders/.test(blob)) {
    addHighlight(
      highlights,
      seen,
      'Leadership signal',
      leadershipExperience
        ? `${leadershipExperience.title || 'Leadership role'} at ${leadershipExperience.company || 'a builder community'} — evidence they can organize people around technical work.`
        : 'Public evidence points to community building or leadership work alongside technical projects.',
      leadershipExperience?.source === 'linkedin' ? 'linkedin' : 'profile'
    );
  }

  if (builder.links?.twitter || /twitter|x\/|tweet|public voice|posts/.test(blob)) {
    addHighlight(
      highlights,
      seen,
      'Public technical presence',
      'Public writing or X/Twitter activity gives founders another read on communication, taste, and momentum.',
      builder.links?.twitter ? 'twitter' : 'research'
    );
  }

  if (builder.links?.portfolio || builder.links?.personalWebsite) {
    addHighlight(
      highlights,
      seen,
      'Portfolio signal',
      'Personal site gives founders a fast way to inspect taste, positioning, and shipped work.',
      'portfolio'
    );
  }
}

function researchHighlightTitle(labelOrDetail: string) {
  const text = labelOrDetail.toLowerCase();
  if (/leader|community|founder|co-?founder|organizer|club|devlabs|president/.test(text)) return 'Leadership signal';
  if (/github|repo|oss|open source|shipped|built|launched|project/.test(text)) return 'Shipping proof';
  if (/twitter|x\/|post|writing|public|talk|demo/.test(text)) return 'Public technical presence';
  if (/hackathon|devpost|winner|award/.test(text)) return 'Hackathon proof';
  return 'Research proof';
}

/**
 * Store enrichment output in agent memory + founder-facing profile highlights.
 * De-dupes skills, experiences, and proof points across sources.
 */
export async function persistEnrichmentContext(params: {
  memRef: MemoryRef;
  builderId: string;
  sourceResults: SourceEnrichmentResult[];
  builder?: any;
  research?: DeepResearchResult | null;
}) {
  const { memRef, builderId, sourceResults } = params;
  const builder = params.builder || (await BuilderProfile.findById(builderId));
  if (!builder) return;

  const highlights: FounderHighlight[] = [];
  const seenHighlights = new Set<string>();

  for (const result of sourceResults) {
    if (result.errors?.length && !result.profile && !result.projects?.length) continue;

    if (result.source === 'twitter') {
      const profile = result.profile;
      const handle = result.meta?.handle ? `@${result.meta.handle}` : 'Twitter';

      if (profile?.headline) {
        await rememberBuilderFact(memRef, {
          content: `Twitter (${handle}) headline: ${profile.headline}`,
          kind: 'context',
          field: 'headline',
        });
      }
      if (profile?.bio) {
        await rememberBuilderFact(memRef, {
          content: `Twitter (${handle}) bio: ${profile.bio}`,
          kind: 'context',
          field: 'bio',
        });
      }
      const twitterInterests = profile?.rolePreference || [];
      if (twitterInterests.length) {
        await rememberBuilderFact(memRef, {
          content: `Twitter interests/skills: ${twitterInterests.join(', ')}`,
          kind: 'context',
          field: 'skills',
        });
      }

      for (const post of (result.meta?.topPosts as any[]) || []) {
        const text = String(post?.text || '').trim();
        if (!text || text.length < 8) continue;
        await rememberBuilderFact(memRef, {
          content: `Tweet (${post.likes || 0} likes): ${text.slice(0, 240)}`,
          kind: 'context',
          field: 'proof',
        });
      }

      for (const signal of (result.meta?.signals as string[]) || []) {
        await rememberBuilderFact(memRef, {
          content: `Twitter proof: ${signal}`,
          kind: 'context',
          field: 'proof',
        });
        addHighlight(highlights, seenHighlights, 'On X/Twitter', signal, 'twitter');
      }

      const postCount = ((result.meta?.topPosts as any[]) || []).length;
      if (postCount) {
        addHighlight(
          highlights,
          seenHighlights,
          'Public voice',
          `Active on X — ${postCount} high-signal posts scraped for proof-of-work and launches.`,
          'twitter'
        );
      }
    }

    if (result.source === 'linkedin') {
      const profile = result.profile;
      const writeResult = result.meta?.writeResult as Record<string, unknown> | undefined;

      const skills = [
        ...(profile?.skills || []),
        ...(profile?.rolePreference || []),
        ...(builder.skills || []),
      ];
      const uniqueSkills = [...new Set(skills.map((s) => String(s).trim()).filter(Boolean))];
      const experiences = (profile?.experiences?.length ? profile.experiences : builder.experiences) || [];

      if (profile?.headline) {
        await rememberBuilderFact(memRef, {
          content: `LinkedIn headline: ${profile.headline}`,
          kind: 'context',
          field: 'headline',
        });
      }
      if (profile?.bio) {
        await rememberBuilderFact(memRef, {
          content: `LinkedIn bio: ${profile.bio}`,
          kind: 'context',
          field: 'bio',
        });
      }

      if (uniqueSkills.length) {
        await rememberBuilderFact(memRef, {
          content: `LinkedIn skills: ${uniqueSkills.slice(0, 20).join(', ')}`,
          kind: 'context',
          field: 'skills',
        });
      }

      for (const exp of experiences) {
        const title = exp?.title || 'Role';
        const company = exp?.company || 'Company';
        const dates = exp?.dateRange ? ` (${exp.dateRange})` : '';
        const detail = `${title} at ${company}${dates}`;
        await rememberBuilderFact(memRef, {
          content: `LinkedIn experience: ${detail}`,
          kind: 'context',
          field: 'experiences',
        });
      }

      const expHighlights =
        (writeResult?.experienceHighlights as string[]) ||
        experiences.slice(0, 4).map((e: any) => {
          const dates = e?.dateRange ? ` (${e.dateRange})` : '';
          return `${e?.title || 'Role'} at ${e?.company || 'Company'}${dates}`;
        });

      if (expHighlights.length) {
        addHighlight(
          highlights,
          seenHighlights,
          'Work history',
          expHighlights.slice(0, 3).join(' · '),
          'linkedin'
        );
      }
      if (uniqueSkills.length >= 4) {
        addHighlight(
          highlights,
          seenHighlights,
          'Skill depth',
          `LinkedIn-endorsed stack includes ${uniqueSkills.slice(0, 8).join(', ')}.`,
          'linkedin'
        );
      }
    }

    if (result.source === 'github') {
      const meta = result.meta || {};
      const projects = result.projects || [];
      const additional = Number(meta.additionalProjectsCount || 0);
      const totalScanned = Number(meta.reposScanned || 0);
      const skills = (result.profile?.skills || []) as string[];

      if (projects.length) {
        const names = projects.map((p) => p.projectName).join(', ');
        const highlightDetail =
          additional > 0
            ? `Top picks: ${names}. Plus ${additional} more shipped repos on GitHub (${totalScanned} scanned).`
            : `Top picks: ${names}.`;

        addHighlight(highlights, seenHighlights, 'GitHub depth', highlightDetail, 'github');

        await rememberBuilderFact(memRef, {
          content: `GitHub showcase: ${highlightDetail}`,
          kind: 'context',
          field: 'proof',
        });

        for (const project of projects) {
          const stack = (project.techStack || []).join(', ');
          await rememberBuilderFact(memRef, {
            content: `GitHub project ${project.projectName}${stack ? ` (${stack})` : ''}: ${String(project.description || '').slice(0, 200)}`,
            kind: 'context',
            field: 'projects',
          });
        }
      }

      if (skills.length) {
        await rememberBuilderFact(memRef, {
          content: `GitHub skills across repos: ${skills.slice(0, 24).join(', ')}`,
          kind: 'context',
          field: 'skills',
        });
        addHighlight(
          highlights,
          seenHighlights,
          'Builder stack',
          `Shipped code using ${skills.slice(0, 12).join(', ')} across multiple projects.`,
          'github'
        );
      }

      if (typeof meta.founderHighlight === 'string' && meta.founderHighlight.trim()) {
        addHighlight(highlights, seenHighlights, 'Proof-of-work', meta.founderHighlight.trim(), 'github');
      }

      builder.enrichmentInsights = builder.enrichmentInsights || {};
      builder.enrichmentInsights.githubShowcase = {
        featuredCount: projects.length,
        additionalProjectCount: additional,
        reposScanned: totalScanned,
      };
    }

    if (result.source === 'devpost') {
      const projects = result.projects || [];
      if (projects.length) {
        const names = projects.map((p) => p.projectName).join(', ');
        addHighlight(
          highlights,
          seenHighlights,
          'Hackathon wins',
          `${projects.length} Devpost project${projects.length === 1 ? '' : 's'}: ${names}.`,
          'devpost'
        );
        for (const project of projects) {
          await rememberBuilderFact(memRef, {
            content: `Devpost ${project.projectName}: ${String(project.description || '').slice(0, 200)}`,
            kind: 'context',
            field: 'projects',
          });
        }
      }
    }
  }

  if (params.research) {
    for (const signal of params.research.signals || []) {
      const label = String(signal?.label || '').trim();
      const detail = String(signal?.detail || '').trim();
      if (!detail) continue;
      addHighlight(
        highlights,
        seenHighlights,
        label || researchHighlightTitle(detail),
        detail,
        signal?.source || 'research'
      );
    }

    for (const proof of (params.research.proofPoints || []).slice(0, 4)) {
      const detail = String(proof || '').trim();
      if (!detail) continue;
      addHighlight(highlights, seenHighlights, researchHighlightTitle(detail), detail, 'research');
    }
  }

  addDerivedFounderSignals(builder, highlights, seenHighlights);

  const shouldSaveHighlights = highlights.length > 0;
  if (!shouldSaveHighlights && !builder.enrichmentInsights?.githubShowcase) return;

  builder.enrichmentInsights = builder.enrichmentInsights || {};
  if (shouldSaveHighlights) {
    const existing = Array.isArray(builder.enrichmentInsights.founderHighlights)
      ? builder.enrichmentInsights.founderHighlights
      : [];

    const mergedHighlights = [...existing];
    const mergedSeen = new Set(existing.map((h: FounderHighlight) => dedupeKey(h.title, h.detail)));
    for (const h of highlights) {
      const key = dedupeKey(h.title, h.detail);
      if (mergedSeen.has(key)) continue;
      mergedSeen.add(key);
      mergedHighlights.push(h);
    }

    builder.enrichmentInsights.founderHighlights = mergedHighlights.slice(0, 12);
    builder.enrichmentInsights.updatedAt = new Date();

    const quality = builder.profileQuality || {};
    const existingStrengths = Array.isArray(quality.strengths) ? quality.strengths : [];
    const strengthSeen = new Set(
      existingStrengths.map((s: any) => dedupeKey(String(s.title || ''), String(s.detail || '')))
    );

    for (const h of highlights) {
      const key = dedupeKey(h.title, h.detail);
      if (strengthSeen.has(key)) continue;
      strengthSeen.add(key);
      existingStrengths.push({ title: h.title, detail: h.detail });
    }

    builder.profileQuality = builder.profileQuality || {};
    builder.profileQuality.strengths = existingStrengths.slice(0, 12);
  }

  await builder.save();
}
