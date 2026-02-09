import type { APIRoute } from 'astro';
import { WorkOS } from '@workos-inc/node';

// Initialize WorkOS client with proper configuration (use import.meta.env - Vite injects .env here, not process.env)
const workos = new WorkOS(import.meta.env.WORKOS_API_KEY, {
  clientId: import.meta.env.WORKOS_CLIENT_ID,
});

export const GET: APIRoute = async ({ request, redirect }) => {
  try {
    // Get the authorization URL from WorkOS using AuthKit (not specific OAuth provider)
    const authorizationUrl = workos.userManagement.getAuthorizationUrl({
      provider: 'authkit', // Use authkit as the provider (not GoogleOAuth)
      redirectUri: import.meta.env.WORKOS_REDIRECT_URI,
      clientId: import.meta.env.WORKOS_CLIENT_ID,
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
    
    // Redirect to login page with error
    return redirect('/login?error=oauth_init_failed');
  }
};
