import type { APIRoute } from 'astro';
// Lightweight token estimation without external deps

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { query } = body || {};
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid query' }), { status: 400 });
    }

    const trimmedQuery = query.trim();
    // Approximate token count: words * 1.3
    const words = trimmedQuery.split(/\s+/).filter(Boolean);
    const tokenCount = Math.round(words.length * 1.3);
    let searchType: 'vector' | 'rag' = tokenCount > 50 ? 'rag' : 'vector';

    return new Response(JSON.stringify({ searchType, tokenCount }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};


