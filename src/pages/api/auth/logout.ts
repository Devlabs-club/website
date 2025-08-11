import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Clear the auth cookie
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Logout successful'
      }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': `auth-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`
        }
      }
    );

  } catch (error) {
    console.error('Logout error:', error);
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
