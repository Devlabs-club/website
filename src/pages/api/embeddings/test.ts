import type { APIRoute } from "astro";
import mongoose from "mongoose";
import fetch from "node-fetch";
import pdf from "pdf-parse";
import { connectDB } from "../../../lib/mongodb";
import { getMiniLM } from "../../../lib/MiniLMEmbeddings";
import { sha256 } from "../../../lib/hash";

const EmbResume =
  mongoose.models.EmbResume ||
  mongoose.model(
    "EmbResume",
    new mongoose.Schema({
      name: String,
      email: String,
      phone: String,
      links: [String],
      skills: [String],
      skillEmbeddings: [[Number]],
      projects: [
        {
          title: String,
          description: String,
          inferredSkills: [String],
        },
      ],
      experiences: [
        {
          title: String,
          company: String,
          description: String,
          inferredSkills: [String],
        },
      ],
      contextEmbeddings: [[Number]],
      textHash: String,
      resumeUrl: String,
      model: String,
      updatedAt: Date,
    })
  );

export const GET: APIRoute = async () => {
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    return new Response(
      JSON.stringify({ success: false, message: "Database connection failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const embedder = await getMiniLM();
  const BATCH_SIZE = 100;

  const applications = await db
    .collection("applications")
    .find({ resumeUrl: { $exists: true, $ne: "" } })
    .toArray();

  console.log(`Found ${applications.length} applications with resume URLs`);

  let processedCount = 0;
  const skipped: string[] = [];
  const processed: string[] = [];

  for (let i = 0; i < applications.length; i += BATCH_SIZE) {
    const batch = applications.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
        applications.length / BATCH_SIZE
      )} (${batch.length} applications)`
    );

    for (const application of batch) {
      const resumeUrl = application.resumeUrl;

      const user = await db.collection("users").findOne({ _id: application.user });
      if (!user) {
        console.log(`Skipping ${application._id}: user not found`);
        skipped.push(resumeUrl);
        continue;
      }

      const email = user.email || "unknown";
      const name = user.name || "unknown";

      try {
        const existing = await db.collection("newembresumes").findOne({ resumeUrl });
        if (existing) {
          skipped.push(resumeUrl);
          console.log(`Skipped (already processed): ${resumeUrl}`);
          continue;
        }

        console.log(`Fetching resume for ${email}`);
        const res = await fetch(resumeUrl, { headers: { Accept: "application/pdf" } });
        if (!res.ok) throw new Error(`Failed to fetch ${resumeUrl} (${res.status})`);

        const buffer = await res.arrayBuffer();
        const parsed = await pdf(Buffer.from(buffer));
        const text = parsed.text.slice(0, 20000);
        const hash = sha256(text);


        const skillSection = text.match(/Skills[\s\S]*?(Projects|Experience|Publications|$)/i);
        const skillBlock = skillSection ? skillSection[0] : "";
        const rawSkills = skillBlock
          .split(/,|:|\n|•|-/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1);
        const stop = ["skills", "projects", "experience", "education", "publications"];
        const skills = Array.from(
          new Set(rawSkills.filter((s) => !stop.includes(s.toLowerCase())))
        );

       
        const skillEmbeddings: number[][] = [];
        for (const skill of skills) {
          const emb = await embedder.embed(skill);
          skillEmbeddings.push(emb);
        }

        
        const meanVector =
          skillEmbeddings.length > 0
            ? skillEmbeddings[0].map((_, i) =>
                skillEmbeddings.reduce((sum, v) => sum + (v[i] || 0), 0) / skillEmbeddings.length
              )
            : [];
        const meanVector32 = Array.from(new Float32Array(meanVector));

        
        await db.collection("newembresumes").insertOne({
          model: embedder.modelId || null,
          metadata: {
            user_id: user._id?.toString() || "",
            application_id: application._id?.toString() || "",
            email,
            tags: [...new Set(skills)],
          },
          vector: meanVector32,
          resumeUrl,
          updatedAt: new Date(),
        });

        processed.push(email);
        processedCount++;
        console.log(`Stored parsed embedding for ${email}`);

        // slow down fetch rate
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err: any) {
        console.error(`Error processing ${email}:`, err.message);
      }
    }

    console.log(`Finished batch ${i / BATCH_SIZE + 1}`);
  }

  console.log(`Processed: ${processedCount}, Skipped: ${skipped.length}`);

  return new Response(
    JSON.stringify({
      success: true,
      total: applications.length,
      processed: processedCount,
      skipped: skipped.length,
      processedEmails: processed,
      skippedUrls: skipped,
    }),
    { status: 200 }
  );
};
