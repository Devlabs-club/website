import type { APIRoute } from 'astro';
import { findApplicationResumeUrl, findUserById } from '../../../lib/adminMongo';
import { verifyToken, extractTokenFromHeader, extractTokenFromCookies } from '../../../lib/auth.ts';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
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
          message: 'No authentication token provided',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const decoded = verifyToken(token, runtime);
    if (!decoded) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid or expired token',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const user = await findUserById(decoded.userId, runtime);
    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'User not found',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const resumeUrl = await findApplicationResumeUrl(decoded.userId, runtime);

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          resumeUrl,
          createdAt: user.createdAt,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Get user error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
