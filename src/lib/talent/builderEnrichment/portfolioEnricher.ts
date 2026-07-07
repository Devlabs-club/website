import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import { crawlMarkdownFromUrl } from './crawlMarkdown';
import { fetchUrlMarkdown, normalizeUrl } from './urlToMarkdown';
import type { EnrichedProfileDraft, EnrichedProjectDraft, SourceEnrichmentResult } from './types';

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const PORTFOLIO_EXTRACT_PROMPT = `Extract builder profile and project proof from a personal portfolio website.
Return strict JSON:
{
  "headline": "string | null (max 120 chars)",
  "bio": "string | null (max 500 chars)",
  "skills": ["string"],
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
Only include real shipped projects — skip blog posts unless they demonstrate engineering work.`;

export async function enrichFromPortfolio(builder: any): Promise<SourceEnrichmentResult> {
  const portfolioUrl = builder?.links?.portfolio || builder?.links?.personalWebsite;
  if (!portfolioUrl) {
    return { source: 'portfolio', errors: ['no_portfolio_url'] };
  }

  const normalized = normalizeUrl(portfolioUrl);
  if (!normalized) {
    return { source: 'portfolio', errors: ['invalid_portfolio_url'] };
  }

  try {
    const crawled = await crawlMarkdownFromUrl(normalized, {
      maxDepth: 2,
      maxPages: 10,
      maxCharsPerPage: 5000,
    });
    const chunk = crawled.combinedMarkdown
      ? { markdown: crawled.combinedMarkdown, provider: 'crawl' as const }
      : await fetchUrlMarkdown(normalized, 'Portfolio', 7000);
    if (!chunk?.markdown) {
      let hint = 'portfolio_fetch_failed';
      try {
        await fetch(normalized, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/ENOTFOUND|Could not resolve/i.test(msg)) hint = 'portfolio_dns_failed';
      }
      return {
        source: 'portfolio',
        errors: [hint],
        meta: {
          portfolioUrl: normalized,
          pagesCrawled: crawled.pages.length,
          triedProviders: ['jina', 'heroku', 'direct_html', 'crawl'],
        },
      };
    }

    if (!hasOpenRouterConfig()) {
      return { source: 'portfolio', errors: ['openrouter_not_configured'] };
    }

    const extraction = await generateOpenRouterReply({
      systemPrompt: PORTFOLIO_EXTRACT_PROMPT,
      userPrompt: chunk.markdown,
      temperature: 0,
      maxTokens: 1200,
    });

    const parsed = parseJsonResponse(extraction);
    if (!parsed) {
      return { source: 'portfolio', errors: ['portfolio_parse_failed'] };
    }

    const profile: EnrichedProfileDraft = {
      headline: typeof parsed.headline === 'string' ? parsed.headline : null,
      bio: typeof parsed.bio === 'string' ? parsed.bio : null,
      rolePreference: Array.isArray(parsed.skills)
        ? parsed.skills.map(String).map((s) => s.trim()).filter(Boolean)
        : [],
      links: { portfolio: normalized, personalWebsite: normalized },
    };

    const projects: EnrichedProjectDraft[] = [];
    if (Array.isArray(parsed.projects)) {
      for (const raw of parsed.projects) {
        const proj = raw as Record<string, unknown>;
        const projectName = typeof proj.projectName === 'string' ? proj.projectName.trim() : '';
        if (!projectName) continue;
        const demo =
          typeof (proj.links as any)?.demo === 'string' ? (proj.links as any).demo : normalized;
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
            demo,
          },
          source: 'portfolio_urltomarkdown',
          sourceId: `portfolio:${projectName.toLowerCase()}:${normalized}`,
          verificationStatus: 'imported_unverified',
          confidence: 0.78,
        });
      }
    }

    return {
      source: 'portfolio',
      profile,
      projects,
      meta: {
        portfolioUrl: normalized,
        pagesCrawled: crawled.pages.length,
        crawledUrls: crawled.pages.map((p) => ({ url: p.url, depth: p.depth })),
        markdownProvider: 'provider' in chunk ? chunk.provider : 'crawl',
      },
    };
  } catch (err) {
    return {
      source: 'portfolio',
      errors: [err instanceof Error ? err.message : 'portfolio_enrichment_failed'],
    };
  }
}
