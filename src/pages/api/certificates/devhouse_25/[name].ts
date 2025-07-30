import type { APIRoute } from 'astro';
import { connectDB, Application } from '../../../../lib/mongodb';
import { generateCertificate } from '../../../../lib/certificateGenerator';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const name = params.name as string;
    const searchName = name.replace(/_/g, ' ');
    const isDownload = url.searchParams.get('download') === 'true';
    
    // Connect to database
    await connectDB();
    
    // Find participant
    const participant = await Application.findOne({
      name: { $regex: `^${searchName}$`, $options: 'i' }
    });
    
    if (!participant) {
      return new Response('Participant not found', { status: 404 });
    }
    
    // Generate certificate PDF
    const pdfBytes = await generateCertificate(participant.name);
    
    // Set response headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
    };
    
    if (isDownload) {
      headers['Content-Disposition'] = `attachment; filename="${participant.name}_DevHouse25_Certificate.pdf"`;
    }
    
    return new Response(pdfBytes, { headers });
    
  } catch (error) {
    console.error('Certificate generation error:', error);
    return new Response('Error generating certificate', { status: 500 });
  }
};
