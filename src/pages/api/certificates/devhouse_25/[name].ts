import type { APIRoute } from 'astro';
import { connectDB } from '../../../../lib/mongodb';
// Use dynamic import for the User model to avoid typing issues
import { generateCertificate } from '../../../../lib/certificateGenerator';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const name = params.name as string;
    const searchName = name.replace(/_/g, ' ');
    const isDownload = url.searchParams.get('download') === 'true';
    
    // Connect to database
    await connectDB();
    
    // Find participant by user profile.name
  const userModel = (await import('../../../../models/user')).default as any;
  const participantUser = await userModel.findOne({ 'profile.name': { $regex: `^${searchName}$`, $options: 'i' } });
    
    if (!participantUser) {
      return new Response('Participant not found', { status: 404 });
    }
    
    // Generate certificate PDF
  const pdfBytes = await generateCertificate(participantUser.profile.name);
    
    // Set response headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
    };
    
    if (isDownload) {
  headers['Content-Disposition'] = `attachment; filename="${participantUser.profile.name}_DevHouse25_Certificate.pdf"`;
    }
    
  return new Response(Buffer.from(pdfBytes), { headers });
    
  } catch (error) {
    console.error('Certificate generation error:', error);
    return new Response('Error generating certificate', { status: 500 });
  }
};
