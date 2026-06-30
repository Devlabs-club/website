import type { APIRoute } from 'astro';
import { formatActivityForDisplay, getBuilderGithubActivity } from '@/lib/builderActivity/githubActivity';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const limit = Math.min(40, Math.max(6, Number(url.searchParams.get('limit') || 24)));
    const result = await getBuilderGithubActivity(limit);

    return new Response(
      JSON.stringify({
        success: true,
        activities: result.activities.map(formatActivityForDisplay),
        builderCount: result.builderCount,
        connectedCount: result.connectedCount,
        refreshedAt: result.refreshedAt,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[builders/github-activity] GET failed', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to load builder activity',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
