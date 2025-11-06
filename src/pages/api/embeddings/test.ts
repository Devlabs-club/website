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


function extractResumeData(text: string) {

  const nameMatch = text.match(/^[A-Z][a-z]+(?:\s[A-Z][a-z]+)+/m);
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/\+?\d[\d\s-]{8,}/);
  const links = Array.from(text.matchAll(/https?:\/\/[^\s)]+/g), (m) => m[0]);

  
  const skillSection = text.match(/Skills[\s\S]*?(Projects|Experience|Publications|$)/i);
  const skillBlock = skillSection ? skillSection[0] : "";
  const rawSkills = skillBlock
    .split(/,|:|\n|•|-/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

  const stop = ["skills", "projects", "experience", "education", "publications"];
  const skills = Array.from(new Set(rawSkills.filter((s) => !stop.includes(s.toLowerCase()))));

  

  const projectSection = text.match(/Projects[\s\S]*?(Experience|Education|Skills|$)/i);
  const projectBlock = projectSection ? projectSection[0] : "";
  const projectEntries = projectBlock
    .split(/\n\s*(?=[A-Z].+?(?:\d{4}|–|-|:))/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 25);

  const projects = projectEntries.map((p) => {
    const titleMatch = p.match(/^[A-Za-z0-9\s&()]+?(?=\s*(\d{4}|–|-|:|,))/);
    const description = p.replace(/\s+/g, " ").trim();
    const inferredSkills = Array.from(
      new Set(
        description
          .split(/[\s,]+/)
          .filter(
            (w) =>
              w.length > 2 &&
              /^[A-Z][a-zA-Z]+$/.test(w) &&
              !["Project", "Projects", "Experience", "Education", "Skills"].includes(w)
          )
      )
    );

    return {
      title: titleMatch ? titleMatch[0].trim() : p.slice(0, 50),
      description,
      inferredSkills,
    };
  });


  
  
  const expSection = text.match(/Experience[\s\S]*?(Education|Projects|$)/i);
  const expBlock = expSection ? expSection[0] : "";
  const expEntries = expBlock
    .split(/\n\s*(?=[A-Z].+?(?:at|@|\d{4}))/g)
    .map((e) => e.trim())
    .filter((e) => e.length > 25);

  const experiences = expEntries.map((e) => {
    const titleMatch = e.match(/^[A-Za-z\s&]+?(?=\d{4}|at|@|–|-)/);
    const companyMatch = e.match(/(?:at|@)\s*([A-Za-z\s&]+)/);
    const description = e.replace(/\s+/g, " ").trim();

    
    const inferredSkills = Array.from(
      new Set(
        description
          .split(/[\s,]+/)
          .filter(
            (w) =>
              w.length > 2 &&
              /^[A-Z][a-zA-Z]+$/.test(w) &&
              !["Experience", "Responsibilities", "Education"].includes(w)
          )
      )
    );

    return {
      title: titleMatch ? titleMatch[0].trim() : e.slice(0, 50),
      company: companyMatch ? companyMatch[1].trim() : "",
      description,
      inferredSkills,
    };
  });


  return {
    name: nameMatch ? nameMatch[0] : "Unknown",
    email: emailMatch ? emailMatch[0] : "Unknown",
    phone: phoneMatch ? phoneMatch[0] : "Unknown",
    links,
    skills,
    projects,
    experiences,
  };
}


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

  // Get applications with resume URLs
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
      // Get user details from the application's user field
      const user = await db
        .collection("users")
        .findOne({ _id: application.user });
      
      if (!user) {
        console.log(`Skipping application ${application._id}: user not found`);
        continue;
      }
      
      const email = user.email || application.email || "unknown";
      const name = user.name || application.name || "unknown";

      try {
        const existing = await db.collection("embresumes").findOne({ resumeUrl });
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
                skillEmbeddings.reduce((sum, v) => sum + (v[i] || 0), 0) /
                skillEmbeddings.length
              )
            : [];

        const toFloat32 = (arr: number[]) => Array.from(new Float32Array(arr));
        const meanVector32 = toFloat32(meanVector);

       

        await db.collection("embresumes").insertOne({
          model: embedder.modelId || null,
          metadata: {
            user_id: user._id?.toString() || "",
            tags: [...new Set(skills)],
          },
          vector: meanVector32,
          resumeUrl,
          updatedAt: new Date(),
        });
        processed.push(email);
        processedCount++;
        console.log(`Stored parsed data for ${email}`);

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