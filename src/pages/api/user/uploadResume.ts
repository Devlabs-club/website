import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';
import { uploadResumeToCloudinary, deleteResumeFromCloudinary } from '../../../lib/cloudinary.ts';
import { upsertResume } from '../../../lib/resumeProcessor.ts';
import pdf from 'pdf-parse/lib/pdf-parse.js';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Connect to admin database
    await connectAdminDB();

    // Get token from Authorization header or cookies
    const authHeader = request.headers.get('Authorization');
    const cookieHeader = request.headers.get('Cookie');
    
    let token = extractTokenFromHeader(authHeader);
    if (!token && cookieHeader) {
      token = extractTokenFromCookies(cookieHeader);
    }

    if (!token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No authentication token provided' 
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Invalid authentication token' 
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('resume') as File;

    if (!file) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No file provided' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Only PDF files are allowed' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Optional: You can parse pages if needed; not required for limit change
    const pdfBuffer = await file.arrayBuffer();
    await pdf(Buffer.from(pdfBuffer));

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'File size must be less than 10MB' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate safe filename using user ID
    const safeFilename = `${decoded.userId}-${Date.now()}`;

    // Get current user to check for existing resume
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'User not found' 
        }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Delete old resume from Cloudinary if it exists
    if (currentUser.resumeUrl) {
      console.log('Deleting old resume from Cloudinary:', currentUser.resumeUrl);
      try {
        const deleteResult = await deleteResumeFromCloudinary(currentUser.resumeUrl);
        if (deleteResult) {
          console.log('Successfully deleted old resume from Cloudinary');
        } else {
          console.log('Failed to delete old resume, but continuing with upload');
        }
      } catch (deleteError) {
        console.error('Error deleting old resume:', deleteError);
        // Continue with upload even if deletion fails
      }
    }

    // Upload to Cloudinary
    let resumeUrl;
    try {
      resumeUrl = await uploadResumeToCloudinary(buffer, safeFilename);
      console.log('Cloudinary upload successful:', resumeUrl); // Debug log
    } catch (cloudinaryError) {
      console.error('Cloudinary upload error:', cloudinaryError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to upload to cloud storage' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Update user in database
    const user = await User.findByIdAndUpdate(
      decoded.userId,
      { resumeUrl },
      { new: true }
    );

    console.log('User updated with resumeUrl:', user?.resumeUrl); // Debug log

    if (!user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Failed to update user record' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Process resume for embedding storage
    // Note: major field is now fetched from Application collection inside upsertResume
    try {
      console.log('Processing resume for embeddings...');
      await upsertResume(buffer, decoded.userId, 'Not specified'); // Pass placeholder, will be fetched from Application
      console.log('Resume embeddings processed successfully');
    } catch (embeddingError) {
      console.error('Error processing resume embeddings:', embeddingError);
      // Don't fail the upload if embedding processing fails
      // The resume is still uploaded to Cloudinary successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Resume uploaded successfully',
        resumeUrl
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Resume upload error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
