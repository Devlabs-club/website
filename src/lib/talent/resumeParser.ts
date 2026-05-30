import pdfParse from 'pdf-parse';
import { generateOpenRouterReply } from '@/lib/openrouter';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';

export async function parseAndExtractResume(buffer: Buffer, builderId: string) {
  try {
    // 1. Extract text from PDF
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      console.log('[resumeParser] No text extracted from PDF');
      return null;
    }

    // 2. Call LLM to extract structured data
    const systemPrompt = `You are an expert resume parser for a developer talent marketplace. 
Extract the following information from the provided resume text and return it as a strict JSON object. 
Do not include any markdown formatting or extra text.

Schema:
{
  "headline": "string | null (short professional title, max 120 chars)",
  "bio": "string | null (2-4 sentence professional summary, max 500 chars)",
  "skills": ["string"],
  "links": {
    "github": "string | null",
    "linkedin": "string | null",
    "portfolio": "string | null"
  },
  "projects": [
    {
      "projectName": "string",
      "description": "string",
      "techStack": ["string"],
      "builderContribution": "string (what the person actually did/built)",
      "links": {
        "github": "string | null",
        "demo": "string | null"
      }
    }
  ]
}

Rules:
- headline: One-line professional title (e.g. "Full-stack developer · React & Node").
- bio: Concise summary of background, strengths, and what they want to build.
- skills: Extract programming languages, frameworks, and tools.
- links: Extract URLs for GitHub, LinkedIn, and personal portfolio/website.
- projects: Extract any personal, academic, or work projects. 
  - description: A brief summary of the project.
  - techStack: Technologies used in the project.
  - builderContribution: Specific details about what the candidate built or achieved.
  - links: Any URLs associated with the project.`;

    const responseText = await generateOpenRouterReply({
      systemPrompt,
      userPrompt: `Resume Text:\n\n${text.substring(0, 15000)}`, // limit text length just in case
      temperature: 0.1,
      maxTokens: 2000,
    });

    const jsonStr = responseText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const extractedData = JSON.parse(jsonStr);

    // 3. Update Builder Profile
    const builder = await BuilderProfile.findById(builderId);
    if (builder) {
      let updated = false;

      // Update headline & bio
      if (extractedData.headline && !builder.headline) {
        builder.headline = String(extractedData.headline).trim().slice(0, 120);
        updated = true;
      }
      if (extractedData.bio && !builder.bio) {
        builder.bio = String(extractedData.bio).trim().slice(0, 2000);
        updated = true;
      }

      // Update skills
      if (Array.isArray(extractedData.skills) && extractedData.skills.length > 0) {
        const existingSkills = new Set((builder.rolePreference || []).map((s: string) => s.trim()));
        extractedData.skills.forEach((s: string) => existingSkills.add(s.trim()));
        builder.rolePreference = Array.from(existingSkills);
        updated = true;
      }

      // Update links
      if (extractedData.links) {
        builder.links = builder.links || {};
        if (extractedData.links.github && !builder.links.github) {
          builder.links.github = extractedData.links.github;
          updated = true;
        }
        if (extractedData.links.linkedin && !builder.links.linkedin) {
          builder.links.linkedin = extractedData.links.linkedin;
          updated = true;
        }
        if (extractedData.links.portfolio && !builder.links.portfolio) {
          builder.links.portfolio = extractedData.links.portfolio;
          updated = true;
        }
      }

      if (updated) {
        await builder.save();
      }
    }

    // 4. Create/Update Projects
    if (Array.isArray(extractedData.projects) && extractedData.projects.length > 0) {
      for (const proj of extractedData.projects) {
        if (!proj.projectName) continue;

        await ProjectRecord.findOneAndUpdate(
          { 
            builderId, 
            projectName: { $regex: new RegExp(`^${proj.projectName}$`, 'i') } 
          },
          {
            $setOnInsert: {
              builderId,
              projectName: proj.projectName,
              source: 'resume_parser',
              verificationStatus: 'builder_confirmed'
            },
            $set: {
              description: proj.description || null,
              techStack: Array.isArray(proj.techStack) ? proj.techStack : [],
              builderContribution: proj.builderContribution || null,
              'links.github': proj.links?.github || null,
              'links.demo': proj.links?.demo || null,
            }
          },
          { upsert: true, new: true }
        );
      }
    }

    return extractedData;

  } catch (error) {
    console.error('[resumeParser] Error parsing resume:', error);
    return null;
  }
}
