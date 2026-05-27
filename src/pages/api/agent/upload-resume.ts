import type { APIRoute } from 'astro';
import { connectDB } from '@/lib/mongodb';
import BuilderProfile from '@/models/talent/BuilderProfile';
import { uploadResumeToCloudinary } from '@/lib/cloudinary';
import { extractTokenFromCookies, extractTokenFromHeader, verifyToken } from '@/lib/auth';
import { parseAndExtractResume } from '@/lib/talent/resumeParser';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    await connectDB();

    const authHeader = request.headers.get('Authorization');
    const cookieHeader = request.headers.get('Cookie') || '';
    const token = extractTokenFromHeader(authHeader) || extractTokenFromCookies(cookieHeader);
    if (!token) return json(401, { success: false, message: 'Unauthorized' });

    const decoded = verifyToken(token);
    if (!decoded?.email) return json(401, { success: false, message: 'Invalid session' });

    const builder = await BuilderProfile.findOne({
      $or: [{ userId: decoded.userId }, { email: decoded.email.toLowerCase() }],
    });
    if (!builder) return json(404, { success: false, message: 'Builder profile not found' });

    const formData = await request.formData();
    const file = formData.get('resume');
    if (!(file instanceof File)) return json(400, { success: false, message: 'No file uploaded' });

    if (file.type !== 'application/pdf') return json(400, { success: false, message: 'Only PDF resumes are supported' });
    if (file.size > 10 * 1024 * 1024) return json(400, { success: false, message: 'Resume must be under 10MB' });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeFilename = `builder-resume-${decoded.userId}-${Date.now()}`;
    const resumeUrl = await uploadResumeToCloudinary(buffer, safeFilename);

    builder.links = {
      ...builder.links,
      resume: resumeUrl,
    };
    await builder.save();

    // Fire and forget parsing to not block the upload response too long, 
    // or we can await it if we want to return the extracted data.
    // Let's await it so the frontend can immediately see the results.
    const extractedData = await parseAndExtractResume(buffer, builder._id.toString());

    return json(200, {
      success: true,
      message: 'Resume uploaded',
      resumeUrl,
      extractedData,
    });
  } catch (error) {
    console.error('[agent/upload-resume] failed', error);
    return json(500, { success: false, message: 'Failed to upload resume' });
  }
};
