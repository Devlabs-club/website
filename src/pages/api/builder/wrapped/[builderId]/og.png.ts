import type { APIRoute } from 'astro';
import { buildWrappedOgImage } from '@/lib/agentWrapped/buildWrappedOgImage';
import { loadWrappedOgData } from '@/lib/agentWrapped/loadWrappedOgData';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const builderId = params.builderId || '';
  const origin = `${url.protocol}//${url.host}`;

  try {
    const data = await loadWrappedOgData(builderId, origin);
    if (!data) {
      return new Response('Builder not found', { status: 404 });
    }

    return await buildWrappedOgImage(data, origin);
  } catch (error) {
    console.error('[builder-wrapped-og]', error);
    return new Response('Could not generate OG image', { status: 500 });
  }
};
