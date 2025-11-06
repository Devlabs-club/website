import type { APIRoute } from 'astro';
import { connectAdminDB, Application } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';

export const GET: APIRoute = async ({ request }) => {
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
          message: 'Invalid or expired token' 
        }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Find user
    const user = await User.findById(decoded.userId);
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

    // Get resume URL from application collection
    const application = await Application.findOne({ user: decoded.userId });
    const resumeUrl = application?.resumeUrl || null;

    // Return user data with resume URL from application
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          resumeUrl: resumeUrl,
          createdAt: user.createdAt
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Get user error:', error);
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
