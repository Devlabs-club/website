import type { APIRoute } from 'astro';
import { WorkOS } from '@workos-inc/node';
import { connectAdminDB } from '../../../../lib/mongodb.ts';
import User from '../../../../models/user.tsx';
import { generateToken } from '../../../../lib/auth.ts';

// Initialize WorkOS client with proper configuration
const workos = new WorkOS(process.env.WORKOS_API_KEY!, {
  clientId: process.env.WORKOS_CLIENT_ID!,
});

export const GET: APIRoute = async ({ request, redirect, url }) => {
  try {
    // Connect to database
    await connectAdminDB();

    // Extract code from query parameters
    const code = url.searchParams.get('code');

    if (!code) {
      console.error('OAuth callback: No authorization code provided');
      return redirect('/login?error=oauth_no_code');
    }

    // Exchange the authorization code for user session using WorkOS session management
    const authenticateResponse = await workos.userManagement.authenticateWithCode({
      clientId: process.env.WORKOS_CLIENT_ID!,
      code,
      session: {
        sealSession: true,
        cookiePassword: process.env.WORKOS_COOKIE_PASSWORD!,
      },
    });

    const { user: workosUser, sealedSession } = authenticateResponse;

    if (!workosUser) {
      console.error('OAuth callback: Failed to get user from WorkOS');
      return redirect('/login?error=oauth_user_fetch_failed');
    }

    // Check if user already exists in our database
    let user = await User.findOne({ 'profile.emailLower': workosUser.email.toLowerCase() });

    if (user) {
      // User exists - update their information if needed
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        {
          'profile.name': `${workosUser.firstName} ${workosUser.lastName}`.trim(),
          'profile.email': workosUser.email,
          'profile.emailLower': workosUser.email.toLowerCase(),
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
        profile: {
          name: `${workosUser.firstName} ${workosUser.lastName}`.trim(),
          email: workosUser.email,
          emailLower: workosUser.email.toLowerCase()
        },
        password: null,
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
        'Location': '/dashboard',
        'Set-Cookie': [
          `auth-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict`,
          `wos-session=${sealedSession}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`
        ].join(', ')
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Redirect to login with error
    return redirect('/login?error=oauth_callback_failed');
  }
};
