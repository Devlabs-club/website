import type { APIRoute } from 'astro';
import { WorkOS } from '@workos-inc/node';
import { connectAdminDB } from '../../../../lib/mongodb.ts';
import User from '../../../../models/user.tsx';
import { generateToken } from '../../../../lib/auth.ts';

// Initialize WorkOS client with proper configuration (use import.meta.env - Vite injects .env here, not process.env)
const workos = new WorkOS(import.meta.env.WORKOS_API_KEY, {
  clientId: import.meta.env.WORKOS_CLIENT_ID,
});

export const GET: APIRoute = async ({ request, redirect, url }) => {
  try {
    // Connect to database
    await connectAdminDB();

    // Extract code from query parameters
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    let redirectUrl = '/dashboard';
    let redirectParamStr = '';

    if (stateParam) {
      try {
        // Try parsing as JSON first
        const stateObj = JSON.parse(stateParam);
        if (stateObj.redirect) {
          redirectUrl = stateObj.redirect;
          redirectParamStr = `&redirect=${encodeURIComponent(stateObj.redirect)}`;
        }
      } catch (e) {
        console.log('State param is not JSON, trying as plain string');
        // If it's not JSON, maybe it's just the plain redirect string
        if (stateParam.startsWith('/')) {
          redirectUrl = stateParam;
          redirectParamStr = `&redirect=${encodeURIComponent(stateParam)}`;
        }
      }
    }

    if (!code) {
      console.error('OAuth callback: No authorization code provided');
      return redirect(`/login?error=oauth_no_code${redirectParamStr}`);
    }

    // Exchange the authorization code for user session using WorkOS session management
    const authenticateResponse = await workos.userManagement.authenticateWithCode({
      clientId: import.meta.env.WORKOS_CLIENT_ID,
      code,
      session: {
        sealSession: true,
        cookiePassword: import.meta.env.WORKOS_COOKIE_PASSWORD,
      },
    });

    const { user: workosUser, sealedSession } = authenticateResponse;

    if (!workosUser) {
      console.error('OAuth callback: Failed to get user from WorkOS');
      return redirect(`/login?error=oauth_user_fetch_failed${redirectParamStr}`);
    }

    // Check if user already exists in our database
    let user = await User.findOne({ email: workosUser.email.toLowerCase() });

    if (user) {
      // User exists - update their information if needed
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          name: `${workosUser.firstName} ${workosUser.lastName}`.trim(),
          // Add OAuth provider info if not already present
          ...(user.oauthProvider ? {} : { 
            oauthProvider: 'google',
            oauthId: workosUser.id 
          })
        },
        { new: true }
      );
      user = updatedUser;
    } else {
      // Create new user from OAuth profile
      user = new User({
        name: `${workosUser.firstName} ${workosUser.lastName}`.trim(),
        email: workosUser.email.toLowerCase(),
        password: crypto.randomUUID(), // Generate random password for OAuth users
        role: 'user',
        oauthProvider: 'google',
        oauthId: workosUser.id,
      });

      await user.save();
    }

    // Generate JWT token for the user
    const token = generateToken(user);

    // Create response with redirect to dashboard and set cookies
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        'Set-Cookie': [
          `auth-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`,
          `wos-session=${sealedSession}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
        ].join(', ')
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Extract redirect URL to preserve it on error
    let redirectParamStr = '';
    const stateParam = url.searchParams.get('state');
    if (stateParam) {
      try {
        const stateObj = JSON.parse(stateParam);
        if (stateObj.redirect) {
          redirectParamStr = `&redirect=${encodeURIComponent(stateObj.redirect)}`;
        }
      } catch (e) {
        if (stateParam.startsWith('/')) {
          redirectParamStr = `&redirect=${encodeURIComponent(stateParam)}`;
        }
      }
    }
    
    // Redirect to login with error
    return redirect(`/login?error=oauth_callback_failed${redirectParamStr}`);
  }
};
