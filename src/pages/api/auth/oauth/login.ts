import type { APIRoute } from 'astro';
import { WorkOS } from '@workos-inc/node';

// Initialize WorkOS client with proper configuration (use import.meta.env - Vite injects .env here, not process.env)
const workos = new WorkOS(import.meta.env.WORKOS_API_KEY, {
  clientId: import.meta.env.WORKOS_CLIENT_ID,
});

export const GET: APIRoute = async ({ request, redirect }) => {
  try {
    const url = new URL(request.url);
    const redirectParam = url.searchParams.get('redirect') || '';

    // Get the authorization URL from WorkOS for Google OAuth
    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      provider: 'GoogleOAuth', // Use GoogleOAuth directly to skip AuthKit page
      redirectUri: import.meta.env.WORKOS_REDIRECT_URI,
      clientId: import.meta.env.WORKOS_CLIENT_ID,
      state: redirectParam ? JSON.stringify({ redirect: redirectParam }) : undefined,
      prompt: 'select_account',
    });

    // Create redirect response
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authorizationUrl
      }
    });

  } catch (error) {
    console.error('OAuth login initiation failed:', error);
    
    const url = new URL(request.url);
    const redirectParam = url.searchParams.get('redirect');
    const redirectQuery = redirectParam ? `&redirect=${encodeURIComponent(redirectParam)}` : '';
    
    // Redirect to login page with error
    return redirect(`/login?error=oauth_init_failed${redirectQuery}`);
  }
};
