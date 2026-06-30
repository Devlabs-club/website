import type { APIRoute } from 'astro';
import { getBuilderContributionWalls } from '@/lib/builderActivity/githubContributions';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const result = await getBuilderContributionWalls();

    return new Response(
      JSON.stringify({
        success: true,
        walls: result.walls,
        builderCount: result.builderCount,
        wallCount: result.wallCount,
        refreshedAt: result.refreshedAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (error) {
    console.error('[builders/github-contributions] GET failed', error);
    const message = error instanceof Error ? error.message : 'Failed to load contribution walls';
    return new Response(
      JSON.stringify({
        success: false,
        message,
      }),
      {
        status: message.includes('GITHUB_TOKEN') ? 503 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
