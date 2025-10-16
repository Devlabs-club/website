import type { APIRoute } from 'astro';
import { getVectorStore } from '../../../lib/vectorStore';
import { connectAdminDB } from '../../../lib/mongodb';

async function runCloudflareLLM(query: string, candidateProfiles: any[]) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const model = process.env.CLOUDFLARE_MODEL || '@cf/baai/bge-small-en-v1.5';
  if (!accountId || !apiToken) throw new Error('Cloudflare credentials missing');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const system = 'You are a ranking system. Given candidate profiles and a query, output JSON {"candidates": [{"candidate_id": string, "score": number}] } sorted by score desc.';
  const user = `Query: ${query}\nCandidates: ${JSON.stringify(candidateProfiles)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
      top_p: 1,
      max_tokens: 1000,
    }),
  });

  const data = await response.json();
  return data.result?.response as string;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { query, filters } = body || {};
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid query' }), { status: 400 });
    }

    await connectAdminDB();
    const vectorStore: any = await getVectorStore();

    const metadataFilter: Record<string, string> = {};
    if (filters?.major) metadataFilter.major = String(filters.major);
    const hasFilters = Object.keys(metadataFilter).length > 0;

    let results: any[] = [];
    try {
      results = await vectorStore.similaritySearchWithScore(query, 50, hasFilters ? metadataFilter : undefined);
    } catch (error: any) {
      console.error('Vector search with score failed:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('not authorized')) {
        return new Response(JSON.stringify({ 
          error: 'Database authorization error. Please check MongoDB user permissions for aggregate operations.' 
        }), { status: 403 });
      }
      try {
        results = await vectorStore.similaritySearch(query, 50, hasFilters ? metadataFilter : undefined);
      } catch (fallbackError: any) {
        console.error('Fallback vector search failed:', fallbackError);
        if (fallbackError.message?.includes('Unauthorized') || fallbackError.message?.includes('not authorized')) {
          return new Response(JSON.stringify({ 
            error: 'Database authorization error. Please check MongoDB user permissions for aggregate operations.' 
          }), { status: 403 });
        }
        throw fallbackError;
      }
    }

    // Group chunks by user_id and aggregate scores
  const userChunksMap: Map<string, any[]> = new Map();
    
    results.forEach((result: any) => {
      const doc = Array.isArray(result) ? result[0] : result;
      const score = Array.isArray(result) ? result[1] : (doc.score || 0);
      const userId = doc.metadata?.user_id;
      
      if (!userId) return;
      
      if (!userChunksMap.has(userId)) {
        userChunksMap.set(userId, []);
      }
      const arr = userChunksMap.get(userId)!;
      arr.push({
        score,
        doc,
        pageContent: doc.pageContent,
        metadata: doc.metadata
      });
    });

    // Create candidates for LLM with aggregated user data
    const candidates: any[] = [];
    
    for (const [userId, chunks] of userChunksMap.entries()) {
      // Sort chunks by score descending
  chunks.sort((a: any, b: any) => b.score - a.score);
      
      // Calculate aggregate score: average of top 3 chunks
      const topChunks = chunks.slice(0, 3);
  const aggregateScore = topChunks.reduce((sum: number, chunk: any) => sum + chunk.score, 0) / topChunks.length;
      
      // Get the best matching chunk for context
      const bestChunk = chunks[0];
      
      candidates.push({
        candidate_id: String(userId),
        text: bestChunk.pageContent,
        major: bestChunk.metadata?.major,
        track: bestChunk.metadata?.track,
        retrieval_score: aggregateScore,
      });
    }

    const llmResponseText = await runCloudflareLLM(query, candidates);
    const jsonMatcher = /^\s*\{\s*"candidates"\s*:\s*\[[\s\S]*?\]\s*\}\s*$/ms;
    const jsonMatch = llmResponseText?.match(jsonMatcher);
    const llmCandidates = jsonMatch ? JSON.parse(jsonMatch[0]).candidates : [];

    // Format final results with actual user data
    const formatted: any[] = [];
    
    for (const c of llmCandidates) {
      const userId = c.candidate_id;
      
      // Fetch user data for actual email
      let userData: any = null;
      try {
        const userModel = (await import('../../../models/user')).default as any;
        userData = await userModel.findById(userId);
      } catch (error) {
        console.error(`Error fetching user data for ${userId}:`, error);
      }
      
      // Fetch application data for major and other details (by user ID)
      let applicationData: any = null;
      try {
        const appModel = (await import('../../../lib/mongodb')).Application as any;
        if (appModel) {
          applicationData = await appModel.findOne({ user: userId });
        }
      } catch (error) {
        console.error(`Error fetching application data for ${userId}:`, error);
      }

      // Get the best chunk for this user
  const userChunks: any[] = userChunksMap.get(userId) || [];
      const bestChunk = userChunks[0];

      formatted.push({
        user_id: c.candidate_id,
        match_score: c.score,
        text: bestChunk?.pageContent || '',
        major: applicationData?.major || bestChunk?.metadata?.major || 'Not specified',
        tags: bestChunk?.metadata?.tags || [],
        contact_number: bestChunk?.metadata?.contact_number || null,
        email: userData?.profile.email || bestChunk?.metadata?.email || null, // Use actual user email
        socials: bestChunk?.metadata?.socials || [],
        status: applicationData?.status || null,
        track: applicationData?.track || null,
        teamName: applicationData?.teamName || null,
        dietaryRestrictions: applicationData?.dietaryRestrictions || null,
        whyJoin: applicationData?.whyJoin || null,
      });
    }

    return new Response(JSON.stringify({ results: formatted }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), { status: 500 });
  }
};


