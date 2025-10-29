import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
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

  // Find user by ID (dynamic import to avoid typing issues)
  console.log('getUserData: Looking up user with ID:', userId);
  const userModel = (await import('../../../models/user')).default as any;
  const user = await userModel.findById(userId);
    if (!user) {
      console.error('getUserData: User not found for ID:', userId);
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
    console.log('getUserData: User found:', user.profile.email);

    // Find application by user ID only (new schema)
    let application = null;
    {
      try {
        console.log('getUserData: Looking up application by user ID:', userId);
  const appModel = (await import('../../../lib/mongodb')).Application as any;
  application = await appModel.findOne({ user: userId });
        if (application) {
          console.log('getUserData: Application found, _id:', application._id);
          console.log('getUserData: Application has resumeUrl:', !!application.resumeUrl);
        } else {
          console.warn('getUserData: No application found for user');
        }
      } catch (error) {
        console.error('getUserData: Error fetching application:', error);
        // Continue without application data if fetch fails
      }
    }

    console.log('getUserData: User has resumeUrl:', !!user.resumeUrl);

    // Return user data with application data (profile structure)
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          _id: user._id.toString(),
          profile: user.profile,
          role: user.role,
          resumeUrl: user.resumeUrl,
          oauthProvider: user.oauthProvider,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        application: application ? {
          _id: application._id,
          major: application.major,
          resumeUrl: application.resumeUrl,
          status: application.status,
          track: application.track,
          dietaryRestrictions: application.dietaryRestrictions,
          tShirtSize: application.tShirtSize,
          teamPreference: application.teamPreference,
          teamName: application.teamName,
          whyJoin: application.whyJoin,
          createdAt: application.createdAt,
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
