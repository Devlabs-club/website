import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import mongoose from 'mongoose';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';

export const GET: APIRoute = async ({ request, url }) => {
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

    // Get user ID from query parameters
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'User ID is required' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Get connection and users collection directly (unified schema)
    const connection = mongoose.connection;
    const usersCollection = connection.db?.collection('users');
    
    if (!usersCollection) {
      throw new Error('Failed to get users collection');
    }

    // Find user by ID
    const user = await usersCollection.findOne({ 
      _id: new mongoose.Types.ObjectId(userId) 
    });

    if (!user) {
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

    // Return user data in unified schema format, with backward compatibility
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          _id: user._id,
          name: user.fullName || user.name || 'Unknown',
          email: user.email || '',
          major: user.major || '',
          resumeUrl: user.resumeUrl || null,
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date(),
          // Include unified schema fields
          fullName: user.fullName,
          age: user.age,
          phone: user.phone,
          photoUrl: user.photoUrl,
          yearOfStudy: user.yearOfStudy,
          expectedGraduationYear: user.expectedGraduationYear,
          linkedinUrl: user.linkedinUrl,
          githubOrPortfolioUrl: user.githubOrPortfolioUrl,
          eligibleToWorkInUS: user.eligibleToWorkInUS,
          requiresVisaSponsorship: user.requiresVisaSponsorship,
          visaType: user.visaType,
          role: user.role,
          season: user.season,
          checkedIn: user.checkedIn,
          flag: user.flag || null
        },
        // Format as application for backward compatibility
        application: {
          _id: user._id,
          name: user.fullName || user.name || 'Unknown',
          age: user.age || null,
          email: user.email || '',
          phone: user.phone || null,
          major: user.major || '',
          yearOfStudy: user.yearOfStudy || null,
          expectedGradYear: user.expectedGraduationYear || null,
          linkedin: user.linkedinUrl || null,
          website: user.githubOrPortfolioUrl || null,
          workEligibility: user.eligibleToWorkInUS ? 'Yes' : 'No',
          needSponsorship: user.requiresVisaSponsorship ? 'Yes' : 'No',
          sponsorshipType: user.visaType || null,
          progress: 100,
          resumeUrl: user.resumeUrl || null,
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date(),
          flag: user.flag || null
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Get user data error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
