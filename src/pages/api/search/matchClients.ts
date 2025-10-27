import type { APIRoute } from "astro";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
  const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return normA && normB ? dot / (normA * normB) : 0;
}

export const POST: APIRoute = async ({ request }) => {
  await connectDB();
  const db = mongoose.connection.db;

  try {
    const { clientId, topK = 5 } = await request.json();
    if (!clientId)
      return new Response(
        JSON.stringify({ success: false, error: "clientId is required" }),
        { status: 400 }
      );

  
    const clientEmb = await db.collection("embclients").findOne({
      client_id: new mongoose.Types.ObjectId(clientId),
    });

    if (!clientEmb)
      return new Response(
        JSON.stringify({ success: false, error: "Client embedding not found" }),
        { status: 404 }
      );

    const clientVector = clientEmb.vector;

 
    const resumes = await db.collection("embresumes").find().toArray();
    const scored = [];

    for (const res of resumes) {
      const score = cosineSimilarity(clientVector, res.vector || []);
      const userId = res.metadata?.user_id;
      let email = "unknown";
      let major = "unknown";
      let resumeUrl = res.resumeUrl || "";

      if (userId) {
     
        const user = await db
          .collection("users")
          .findOne({ _id: new mongoose.Types.ObjectId(userId) });
        if (user?.email) email = user.email;
        if (user?.resumeUrl) resumeUrl = user.resumeUrl;


        const app = await db
          .collection("applications")
          .findOne({ "metadata.user_id": userId });
        if (app?.metadata?.major) major = app.metadata.major;
      }

      scored.push({
        email,
        resumeUrl,
        score,
      });
    }

    const topMatches = scored.sort((a, b) => b.score - a.score).slice(0, topK);

    return new Response(
      JSON.stringify({
        success: true,
        client: clientEmb.metadata,
        topMatches,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in matchClients:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500 }
    );
  }
};
