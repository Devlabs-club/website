import type { APIRoute } from 'astro';
import { isValidPassword } from '../../../lib/auth.ts';
import { jsonWithCookies } from '../../../lib/authCookie.ts';
import { signupEmailRejection } from '../../../lib/emailVerification';
import {
  createOrUpdateWorkOSPasswordUser,
  getWorkOSClient,
  parseWorkOSAuthError,
  publicAuthUser,
  upsertAppUserFromWorkOS,
  verificationRequiredCookies,
  workosSessionOptions,
  completeWorkOSAuthentication,
} from '../../../lib/workosAuth';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const body = await request.json();
    const { name, email, password, redirect } = body as {
      name?: string;
      email?: string;
      password?: string;
      redirect?: string;
    };

    if (!name || !email || !password) {
      return jsonWithCookies({ success: false, message: 'Please provide name, email, and password' }, 400);
    }

    const emailError = signupEmailRejection(email);
    if (emailError) {
      return jsonWithCookies({ success: false, message: emailError }, 400);
    }

    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return jsonWithCookies({ success: false, message: passwordValidation.message }, 400);
    }

    const { workos, clientId } = getWorkOSClient(runtime);
    const normalizedEmail = email.toLowerCase().trim();

    let workosUser;
    try {
      workosUser = await createOrUpdateWorkOSPasswordUser({
        workos,
        email: normalizedEmail,
        password,
        name: name.trim(),
      });
    } catch (error) {
      const parsed = parseWorkOSAuthError(error);
      if (
        (error as { code?: string }).code === 'user_already_exists' ||
        parsed.code === 'email_not_available' ||
        parsed.code === 'user_already_exists'
      ) {
        return jsonWithCookies({ success: false, message: 'User already exists with this email' }, 400);
      }
      const message =
        parsed.code === 'password_strength_error' || parsed.code === 'password_pwned'
          ? 'Choose a stronger password. Avoid common passwords and include mixed case, a number, and a symbol.'
          : parsed.message || 'Could not create this account';
      return jsonWithCookies({ success: false, message }, 400);
    }

    try {
      const authenticated = await workos.userManagement.authenticateWithPassword({
        clientId,
        email: normalizedEmail,
        password,
        session: workosSessionOptions(runtime),
      });
      const completed = await completeWorkOSAuthentication({
        workosUser: authenticated.user,
        sealedSession: authenticated.sealedSession,
        runtime,
        redirect: typeof redirect === 'string' ? redirect : null,
      });
      return jsonWithCookies(
        {
          success: true,
          message: 'Registration successful',
          user: publicAuthUser(completed.user),
          next: completed.next,
        },
        201,
        completed.cookies
      );
    } catch (error) {
      const parsed = parseWorkOSAuthError(error);
      if (parsed.code === 'email_verification_required' && parsed.pendingAuthenticationToken) {
        await upsertAppUserFromWorkOS(workosUser, runtime);
        return jsonWithCookies(
          {
            success: true,
            needsVerification: true,
            message: 'Check your email for a verification code before signing in.',
          },
          201,
          verificationRequiredCookies(parsed.pendingAuthenticationToken)
        );
      }
      console.error('WorkOS registration authenticate error:', error);
      return jsonWithCookies({ success: false, message: parsed.message || 'Could not create this account' }, 400);
    }
  } catch (error) {
    console.error('Registration error:', error);
    return jsonWithCookies({ success: false, message: 'Internal server error' }, 500);
  }
};
