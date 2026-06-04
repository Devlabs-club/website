import type { APIRoute } from 'astro';
import { verifyUserPassword } from '../../../lib/adminMongo';
import { generateToken, isValidEmail } from '../../../lib/auth.ts';
import { buildAuthTokenCookie } from '../../../lib/authCookie.ts';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {

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

    const user = await verifyUserPassword(email, password, runtime);
    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid email or password',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Generate token
    const token = generateToken(user, runtime);

    // Return success response with token
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Login successful',
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': buildAuthTokenCookie(token)
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
