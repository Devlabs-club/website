import type { APIRoute } from "astro";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import { getMiniLM } from "../../../lib/MiniLMEmbeddings";

export const GET: APIRoute = async () => {
  await connectDB();
  const db = mongoose.connection.db;
  const embedder = await getMiniLM();

  try {
    const clients = await db.collection("clients").find().toArray();
    console.log(`Found ${clients.length} clients`);

    let processed = 0;

    for (const client of clients) {
      const existing = await db.collection("embclients").findOne({ client_id: client._id });
      if (existing) {
        console.log(`Skipped (already embedded): ${client.companyName}`);
        continue;
      }

      const skills = client.skills || "";
      const mindset = client.mindset || "";
      if (!skills && !mindset) continue;

      const combinedText = `${skills} ${mindset}`.trim();
      const vector = await embedder.embed(combinedText);

      await db.collection("embclients").insertOne({
        client_id: client._id,
        companyName: client.companyName,
        roleTitle: client.roleTitle,
        model: embedder.modelId,
        vector,
        metadata: {
          skills,
          mindset,
        },
        updatedAt: new Date(),
      });

      processed++;
      console.log(`Embedded client: ${client.companyName}`);
      await new Promise((r) => setTimeout(r, 500)); 
    }

    return new Response(
      JSON.stringify({ success: true, processed }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error embedding clients:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500 });
  }
};
