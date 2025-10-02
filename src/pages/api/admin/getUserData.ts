import type { APIRoute } from 'astro';
import { connectAdminDB, Application } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
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

    // Find user by ID
    const user = await User.findById(userId);
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

    // Find application by email
    let application = null;
    if (Application) {
      try {
        application = await Application.findOne({ email: user.email });
      } catch (error) {
        console.error('Error fetching application:', error);
        // Continue without application data if fetch fails
      }
    }

    // Return user data with application data
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          major: user.major,
          resumeUrl: user.resumeUrl,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        application: application ? {
          _id: application._id,
          name: application.name,
          age: application.age,
          email: application.email,
          phone: application.phone,
          major: application.major,
          yearOfStudy: application.yearOfStudy,
          expectedGradYear: application.expectedGradYear,
          linkedin: application.linkedin,
          website: application.website,
          workEligibility: application.workEligibility,
          needSponsorship: application.needSponsorship,
          sponsorshipType: application.sponsorshipType,
          progress: application.progress,
          resumeUrl: application.resumeUrl,
          createdAt: application.createdAt,
          updatedAt: application.updatedAt
        } : null
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
        message: 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
