import type { APIRoute } from 'astro';
import { WorkOS } from '@workos-inc/node';

const workos = new WorkOS(import.meta.env.WORKOS_API_KEY, {
  clientId: import.meta.env.WORKOS_CLIENT_ID,
});

export const POST: APIRoute = async ({ request }) => {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const match = cookieHeader.match(/wos-session=([^;]+)/);
    const wosSession = match ? match[1] : null;

    let logoutUrl = '/login';
    if (wosSession) {
      try {
        const url = new URL(request.url);
        const returnTo = `${url.protocol}//${url.host}/login`;
        
        logoutUrl = await workos.userManagement.getLogoutUrlFromSessionCookie({
          sessionData: wosSession,
          cookiePassword: import.meta.env.WORKOS_COOKIE_PASSWORD,
        });
        
        // Append returnTo if not already present
        if (logoutUrl && !logoutUrl.includes('return_to=')) {
          const logoutUrlObj = new URL(logoutUrl);
          logoutUrlObj.searchParams.set('return_to', returnTo);
          logoutUrl = logoutUrlObj.toString();
        }
      } catch (e) {
        console.error('Failed to get WorkOS logout URL', e);
      }
    }

    // Clear the auth cookie and WorkOS session cookie
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Logout successful',
        logoutUrl
      }),
      {
        status: 200,
        headers: new Headers([
          ['Content-Type', 'application/json'],
          ['Set-Cookie', `auth-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict`],
          ['Set-Cookie', `wos-session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`]
        ])
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
