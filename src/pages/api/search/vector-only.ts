import type { APIRoute } from 'astro';
import { getVectorStore } from '../../../lib/vectorStore';
import { connectAdminDB, Application } from '../../../lib/mongodb';
import User from '../../../models/user.tsx';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { query, filters } = body || {};
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid query' }), { status: 400 });
    }

    await connectAdminDB();
    const vectorStore: any = await getVectorStore();

    const searchOptions: any = { k: 50 };
    const metadataFilter: Record<string, string> = {};
    if (filters?.major) metadataFilter.major = String(filters.major);
    const hasFilters = Object.keys(metadataFilter).length > 0;

    let results: any[] = [];
    try {
      results = await vectorStore.similaritySearchWithScore(
        query,
        searchOptions.k,
        hasFilters ? metadataFilter : undefined
      );
    } catch (error: any) {
      console.error('Vector search with score failed:', error);
      if (error.message?.includes('Unauthorized') || error.message?.includes('not authorized')) {
        return new Response(JSON.stringify({ 
          error: 'Database authorization error. Please check MongoDB user permissions for aggregate operations.' 
        }), { status: 403 });
      }
      try {
        results = await vectorStore.similaritySearch(
          query,
          searchOptions.k,
          hasFilters ? metadataFilter : undefined
        );
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
    const userChunksMap = new Map();
    
    results.forEach((result: any) => {
      const doc = Array.isArray(result) ? result[0] : result;
      const score = Array.isArray(result) ? result[1] : (doc.score || 0);
      const userId = doc.metadata?.user_id;
      
      if (!userId) return;
      
      if (!userChunksMap.has(userId)) {
        userChunksMap.set(userId, []);
      }
      userChunksMap.get(userId).push({
        score,
        doc,
        pageContent: doc.pageContent,
        metadata: doc.metadata
      });
    });

    // Aggregate results by user
    const userProfiles: any[] = [];
    
    for (const [userId, chunks] of userChunksMap.entries()) {
      // Sort chunks by score descending
      chunks.sort((a, b) => b.score - a.score);
      
      // Calculate aggregate score: average of top 3 chunks
      const topChunks = chunks.slice(0, 3);
      const aggregateScore = topChunks.reduce((sum, chunk) => sum + chunk.score, 0) / topChunks.length;
      
      // Get the best matching chunk for context
      const bestChunk = chunks[0];
      
      // Fetch user data for actual email
      let userData: any = null;
      try {
        userData = await User.findById(userId);
      } catch (error) {
        console.error(`Error fetching user data for ${userId}:`, error);
      }

      // Fetch application data for major and other details
      let applicationData: any = null;
      try {
        if (Application) {
          applicationData = await Application.findOne({ email: userData?.email });
        }
      } catch (error) {
        console.error(`Error fetching application data for ${userId}:`, error);
      }

      userProfiles.push({
        user_id: userId,
        match_score: aggregateScore,
        text: bestChunk.pageContent,
        tags: bestChunk.metadata?.tags || [],
        contact_number: bestChunk.metadata?.contact_number || null,
        email: userData?.email || bestChunk.metadata?.email || null, // Use actual user email
        socials: bestChunk.metadata?.socials || [],
        major: applicationData?.major || userData?.major || bestChunk.metadata?.major || 'Not specified',
      });
    }

    // Sort by aggregate score
    userProfiles.sort((a, b) => b.match_score - a.match_score);

    return new Response(JSON.stringify({ results: userProfiles }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), { status: 500 });
  }
};


