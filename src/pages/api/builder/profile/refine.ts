import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { findUserById, updateUserAccount } from '@/lib/adminMongo';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { generateOpenRouterReply, hasOpenRouterConfig } from '@/lib/openrouter';
import BuilderProfile from '@/models/talent/BuilderProfile';
import ProjectRecord from '@/models/talent/ProjectRecord';
import { refreshBuilderScores } from '@/lib/talent/builderEnrichment/apply';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function skillsFrom(text: string) {
  const known = [
    'React', 'Next.js', 'TypeScript', 'JavaScript', 'Python', 'Node.js', 'Express', 'MongoDB',
    'Postgres', 'PostgreSQL', 'Supabase', 'Prisma', 'Redis', 'Cloudflare', 'Durable Objects',
    'Workers', 'WebSockets', 'OpenAI', 'LLM', 'RAG', 'Tailwind', 'Swift', 'React Native',
    'Flutter', 'Dart', 'Kotlin', 'Java', 'Android SDK', 'Jetpack Compose', 'Firebase',
    'Docker', 'AWS', 'Vercel', 'Stripe',
  ];
  return known.filter((skill) => text.toLowerCase().includes(skill.toLowerCase()));
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseJsonResponse(raw: string): Record<string, unknown> | null {
  try {
    const cleaned = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    return JSON.parse(start >= 0 && end >= 0 ? cleaned.slice(start, end + 1) : cleaned);
  } catch {
    return null;
  }
}

type RefinePatch = {
  headline?: string | null;
  bio?: string | null;
  skills?: string[];
  experiences?: Array<{
    title?: string | null;
    company?: string | null;
    dateRange?: string | null;
    description?: string | null;
    skills?: string[];
  }>;
  projects?: Array<{
    projectName?: string | null;
    description?: string | null;
    builderContribution?: string | null;
    techStack?: string[];
    links?: { github?: string | null; demo?: string | null };
  }>;
};

function fallbackExperiencePatch(message: string): RefinePatch {
  const skills = skillsFrom(message);
  const chunks = message
    .split(/\b(?:and|also|then|,)\s+(?=(?:i\s+)?(?:was|am|worked|interned|built|joined)\b)/i)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const experiences = (chunks.length ? chunks : [message]).map((chunk) => {
    const atMatch = chunk.match(/(?:as\s+(?:an?\s+)?)?(.{2,80}?)\s+(?:at|for|with)\s+([A-Za-z0-9 .&-]{2,80})/i);
    const internAtMatch = chunk.match(/(?:intern|interned)\s+(?:at|for)\s+([A-Za-z0-9 .&-]{2,80})/i);
    const title = atMatch?.[1]
      ?.replace(/^(i\s*(am|'m|was)|worked|interned|as)\s+/i, '')
      .replace(/\b(i was|i am|i'm)\b/gi, '')
      .trim();
    const company = atMatch?.[2] || internAtMatch?.[1] || null;
    return {
      title: title ? titleCase(title) : (internAtMatch ? 'Intern' : null),
      company: company ? titleCase(company.replace(/\s+i\s+was.*$/i, '').trim()) : null,
      description: chunk,
      skills,
    };
  }).filter((experience) => experience.title || experience.company);

  return { experiences, skills };
}

function fallbackProjectPatch(message: string): RefinePatch {
  const skills = skillsFrom(message);
  return {
    projects: [{
      projectName: message.split(/[.!?]/)[0].slice(0, 80) || 'New project',
      description: message,
      builderContribution: message,
      techStack: skills,
    }],
    skills,
  };
}

async function extractRefinePatch(params: {
  intent: string;
  message: string;
  profile: any;
}): Promise<RefinePatch> {
  const { intent, message, profile } = params;

  if (hasOpenRouterConfig()) {
    const response = await generateOpenRouterReply({
      systemPrompt: `You convert a builder's plain-English profile edit into strict JSON only.
Schema:
{
  "headline": "string | null",
  "bio": "string | null",
  "skills": ["string"],
  "experiences": [{"title": "string | null", "company": "string | null", "dateRange": "string | null", "description": "string | null", "skills": ["string"]}],
  "projects": [{"projectName": "string | null", "description": "string | null", "builderContribution": "string | null", "techStack": ["string"], "links": {"github": "string | null", "demo": "string | null"}}]
}
Rules:
- Use the user's words. Do not invent companies, dates, or projects.
- For experience, extract the actual role title and company. Never use generic "Builder" unless the user literally says that was the title.
- If the user mentions multiple jobs, return multiple experiences.
- Keep descriptions concise and founder-facing.`,
      userPrompt: `Intent: ${intent}
Existing profile: ${JSON.stringify({
  name: profile.name,
  headline: profile.headline,
  company: profile.universityOrCompany,
  skills: profile.rolePreference || [],
}, null, 2)}
User message:
${message}`,
      temperature: 0,
      maxTokens: 1200,
      responseFormat: 'json_object',
    });
    const parsed = parseJsonResponse(response);
    if (parsed) return parsed as RefinePatch;
  }

  const skills = skillsFrom(message);
  if (intent === 'experience') return fallbackExperiencePatch(message);
  if (intent === 'project') return fallbackProjectPatch(message);

  if (intent === 'skills') return { skills: [...skills, ...message.split(',').map((s) => s.trim()).filter(Boolean)] };
  return { bio: message, skills };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return json({ success: false, error: 'Please log in to continue.' }, 401);
  const decoded = verifyToken(token, runtime);
  if (!decoded) return json({ success: false, error: 'Session expired.' }, 401);
  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ success: false, error: 'User not found.' }, 404);

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const intent = typeof body.intent === 'string' ? body.intent : 'something';
  if (!message) return json({ success: false, error: 'message is required' }, 400);

  await connectAdminDB();
  const profile = await BuilderProfile.findOne({ $or: [{ userId: user._id }, { email: user.email }] });
  if (!profile) return json({ success: false, error: 'Create your profile first.' }, 404);

  let patch = await extractRefinePatch({ intent, message, profile });
  if (intent === 'experience' && !patch.experiences?.length) patch = fallbackExperiencePatch(message);
  if (intent === 'project' && !patch.projects?.length) patch = fallbackProjectPatch(message);
  const skills = Array.isArray(patch.skills) ? patch.skills.map(String).map((s) => s.trim()).filter(Boolean) : skillsFrom(message);

  if (cleanString(patch.headline)) profile.headline = cleanString(patch.headline);
  if (cleanString(patch.bio)) profile.bio = profile.bio && intent === 'something' ? `${profile.bio}\n\n${patch.bio}` : cleanString(patch.bio);
  if (skills.length) profile.rolePreference = [...new Set([...(profile.rolePreference || []), ...skills])];

  if (intent === 'project' || patch.projects?.length) {
    for (const [index, project] of (patch.projects || []).entries()) {
      const projectName = cleanString(project.projectName) || message.split(/[.!?]/)[0].slice(0, 80) || 'New project';
      await ProjectRecord.create({
        builderId: profile._id,
        projectName,
        description: cleanString(project.description) || message,
        techStack: Array.isArray(project.techStack) ? project.techStack.map(String).map((s) => s.trim()).filter(Boolean) : skills,
        builderContribution: cleanString(project.builderContribution) || message,
        links: project.links || {},
        source: 'manual',
        sourceId: `refine-project-${Date.now()}-${index}`,
        verificationStatus: 'builder_confirmed',
      });
    }
  }

  if (intent === 'experience' || patch.experiences?.length) {
    for (const [index, experience] of (patch.experiences || []).entries()) {
      const title = cleanString(experience.title);
      const company = cleanString(experience.company);
      if (!title && !company) continue;
      profile.experiences.push({
        title: title || 'Team member',
        company: company || profile.universityOrCompany || 'Independent',
        dateRange: cleanString(experience.dateRange),
        description: cleanString(experience.description) || message,
        skills: Array.isArray(experience.skills) && experience.skills.length
          ? experience.skills.map(String).map((s) => s.trim()).filter(Boolean)
          : skills,
        source: 'manual',
        sourceId: `refine-experience-${Date.now()}-${index}`,
        importedAt: new Date(),
      });
    }
  }

  await profile.save();

  const projects = await ProjectRecord.find({ builderId: profile._id }).sort({ updatedAt: -1 }).limit(20).lean();
  return json({
    success: true,
    message: 'Updated your profile preview.',
    profile: {
      id: String(profile._id),
      name: profile.name,
      headline: profile.headline,
      bio: profile.bio,
      location: profile.location,
      rolePreference: profile.rolePreference || [],
      preferredWorkType: profile.preferredWorkType || [],
      experiences: profile.experiences || [],
      projects: projects.map((project) => ({
        id: String(project._id),
        projectName: project.projectName,
        description: project.description,
        techStack: project.techStack || [],
      })),
    },
  });
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const token =
    extractTokenFromHeader(request.headers.get('Authorization')) ||
    extractTokenFromCookies(request.headers.get('Cookie') || '');
  if (!token) return json({ success: false, error: 'Please log in to continue.' }, 401);
  const decoded = verifyToken(token, runtime);
  if (!decoded) return json({ success: false, error: 'Session expired.' }, 401);
  const user = await findUserById(decoded.userId, runtime);
  if (!user) return json({ success: false, error: 'User not found.' }, 404);

  await connectAdminDB();
  const profile = await BuilderProfile.findOne({ $or: [{ userId: user._id }, { email: user.email }] });
  if (!profile) return json({ success: false, error: 'Create your profile first.' }, 404);

  await refreshBuilderScores(profile._id, {
    skipStatsRefresh: false,
    skipEmbeddings: false,
  });

  await updateUserAccount(String(user._id), {
    role: 'builder',
    accountType: 'builder',
    onboardingStatus: 'pending_verification',
    name: profile.name,
  }, runtime);

  return json({
    success: true,
    message: 'Profile saved and prepared for founder discovery.',
    next: '/builder/home',
  });
};

export const prerender = false;
