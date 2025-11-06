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
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "clientId is required" }),
        { status: 400 }
      );
    }

    const clientEmb = await db.collection("embclients").findOne({
      client_id: new mongoose.Types.ObjectId(clientId),
    });

    if (!clientEmb) {
      return new Response(
        JSON.stringify({ success: false, error: "Client embedding not found" }),
        { status: 404 }
      );
    }

    const clientVector = clientEmb.vector || [];
    const mindsetVector = clientEmb.mindsetVector || clientVector; 


    const resumes = await db.collection("newembresumes").find().toArray();
    const scored: any[] = [];

    for (const res of resumes) {
      const userVector = res.vector || [];
      if (userVector.length === 0) continue;

 
      
      const skillSim = cosineSimilarity(clientVector, userVector);
      const scaledScore = skillSim * 100;


      const rawRecruiterSkills = clientEmb.metadata?.skills || [];
      const recruiterSkills = Array.isArray(rawRecruiterSkills)
        ? rawRecruiterSkills.map((s: string) => s.toLowerCase().trim())
        : typeof rawRecruiterSkills === "string"
        ? rawRecruiterSkills.split(/[,|]/).map((s: string) => s.toLowerCase().trim())
        : [];

      const candidateSkills = Array.isArray(res.metadata?.tags)
        ? res.metadata.tags.map((s: string) => s.toLowerCase().trim())
        : [];

      const overlap = candidateSkills.filter((s) => recruiterSkills.includes(s));
      const precision =
        candidateSkills.length > 0 ? overlap.length / candidateSkills.length : 0;
      const recall =
        recruiterSkills.length > 0 ? overlap.length / recruiterSkills.length : 0;
      const f1 =
        precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;


      let finalScore = scaledScore * (0.5 + 0.5 * f1);


      finalScore = Math.min(Math.max(finalScore, 0), 100);
      const minDisplay = 30; 
      const maxDisplay = 95; 
      const scaledDisplay = minDisplay + (finalScore / 100) * (maxDisplay - minDisplay);

     
      const displayScore = Math.round(scaledDisplay * 100) / 100;




      const metadata = res.metadata || {};
      let email = metadata.email || "unknown";  
      const userId = metadata.user_id;
      let resumeUrl = res.resumeUrl || "";
      const skills: string[] = metadata.tags || [];

      if (!resumeUrl && userId) {
        const application = await db
          .collection("applications")
          .findOne({ user: new mongoose.Types.ObjectId(userId) });
        if (application?.resumeUrl) resumeUrl = application.resumeUrl;
      }

   
      if (email === "unknown" && userId) {
        const user = await db
          .collection("users")
          .findOne({ _id: new mongoose.Types.ObjectId(userId) });
        if (user?.email) email = user.email;
      }


      scored.push({
        email,
        resumeUrl,
        score: displayScore,
        skills,
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
