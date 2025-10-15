import type { APIRoute } from 'astro';
import { connectAdminDB } from '../../../lib/mongodb.ts';
import User from '../../../models/user.tsx';
import { generateToken, isValidEmail } from '../../../lib/auth.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Connect to admin database
    await connectAdminDB();

    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Please provide email and password' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Please provide a valid email address' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Find user and include password for comparison
    const user = await User.findOne({ 'profile.emailLower': email.toLowerCase() }).select('+password');
    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid email or password'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if user has a password (OAuth-only users don't have passwords)
    if (!user.password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'This account uses OAuth login. Please login with Google.'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid email or password'
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Generate token
    const token = generateToken(user);

    // Return success response with token
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Login successful',
        user: {
          id: user._id,
          profile: user.profile,
          role: user.role,
          resumeUrl: user.resumeUrl,
          oauthProvider: user.oauthProvider,
          createdAt: user.createdAt
        },
        token
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `auth-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`
        }
      }
    );

  } catch (error) {
    console.error('Login error:', error);
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
