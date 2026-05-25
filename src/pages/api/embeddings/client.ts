import type { APIRoute } from "astro";
import mongoose from "mongoose";
import { connectDB } from "../../../lib/mongodb";
import { getMiniLM } from "../../../lib/MiniLMEmbeddings";

export const GET: APIRoute = async () => {
  try {

    await connectDB();
    const db = mongoose.connection.db;

    const embedder = await getMiniLM();
    console.log("✅ Connected & Embedder ready:", embedder.modelId);


    const clients = await db.collection("clients").find().toArray();
    console.log(`Found ${clients.length} clients`);

    let processed = 0;
    let skipped = 0;

    for (const client of clients) {
      const existing = await db
        .collection("embclients")
        .findOne({ client_id: client._id });

      if (existing) {
        console.log(`⏭Skipped (already embedded): ${client.companyName}`);
        skipped++;
        continue;
      }

      const skills = Array.isArray(client.skills)
        ? client.skills.join(", ")
        : client.skills || "";
      const mindset = client.mindset || "";

      if (!skills && !mindset) {
        console.log(`Skipped (no skills/mindset): ${client.companyName}`);
        skipped++;
        continue;
      }

      const combinedText = `${client.roleTitle || ""} ${skills} ${mindset}`.trim();
      const vector = await embedder.embed(combinedText);

      await db.collection("embclients").insertOne({
        client_id: client._id,
        companyName: client.companyName || "Unknown",
        roleTitle: client.roleTitle || "Untitled Role",
        model: embedder.modelId,
        vector: Array.from(vector),
        metadata: { skills, mindset },
        updatedAt: new Date(),
      });

      console.log(`Embedded client: ${client.companyName}`);
      processed++;
      await new Promise((r) => setTimeout(r, 500)); 
    }

    return new Response(
      JSON.stringify({
        success: true,
        total: clients.length,
        processed,
        skipped,
      }),
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error embedding clients:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500 }
    );
  }
};
