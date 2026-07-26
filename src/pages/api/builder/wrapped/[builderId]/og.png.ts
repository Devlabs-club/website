import type { APIRoute } from 'astro';
import { buildWrappedOgImage } from '@/lib/agentWrapped/buildWrappedOgImage';
import { parseShareCardParam } from '@/lib/agentWrapped/buildprintAttribution';
import { loadWrappedOgData } from '@/lib/agentWrapped/loadWrappedOgData';

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  const builderId = params.builderId || '';
  const origin = `${url.protocol}//${url.host}`;
  const featuredCard = parseShareCardParam(url.searchParams.get('c') || url.searchParams.get('card'));

  try {
    const data = await loadWrappedOgData(builderId, origin);
    if (!data) {
      return new Response('Builder not found', { status: 404 });
    }

    return await buildWrappedOgImage(data, origin, { featuredCard });
  } catch (error) {
    console.error('[builder-wrapped-og]', error);
    return new Response('Could not generate OG image', { status: 500 });
  }
};
