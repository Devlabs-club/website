import type { APIRoute } from 'astro';
import { verifyUserPassword } from '../../../lib/adminMongo';
import { isValidEmail } from '../../../lib/auth.ts';
import { jsonWithCookies } from '../../../lib/authCookie.ts';
import {
  completeWorkOSAuthentication,
  createOrUpdateWorkOSPasswordUser,
  getWorkOSClient,
  parseWorkOSAuthError,
  publicAuthUser,
  upsertAppUserFromWorkOS,
  verificationRequiredCookies,
  workosSessionOptions,
} from '../../../lib/workosAuth';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const body = await request.json();
    const { email, password, redirect } = body as {
      email?: string;
      password?: string;
      redirect?: string;
    };

    if (!email || !password) {
      return jsonWithCookies({ success: false, message: 'Please provide email and password' }, 400);
    }

    if (!isValidEmail(email)) {
      return jsonWithCookies({ success: false, message: 'Please provide a valid email address' }, 400);
    }

    const { workos, clientId } = getWorkOSClient(runtime);
    const normalizedEmail = email.toLowerCase().trim();

    const authenticate = () =>
      workos.userManagement.authenticateWithPassword({
        clientId,
        email: normalizedEmail,
        password,
        session: workosSessionOptions(runtime),
      });

    try {
      const authenticated = await authenticate();
      const completed = await completeWorkOSAuthentication({
        workosUser: authenticated.user,
        sealedSession: authenticated.sealedSession,
        runtime,
        redirect: typeof redirect === 'string' ? redirect : null,
      });
      return jsonWithCookies(
        {
          success: true,
          message: 'Login successful',
          user: publicAuthUser(completed.user),
          next: completed.next,
        },
        200,
        completed.cookies
      );
    } catch (error) {
      const parsed = parseWorkOSAuthError(error);

      if (parsed.code === 'email_verification_required' && parsed.pendingAuthenticationToken) {
        const workosUser = await workos.userManagement.listUsers({ email: normalizedEmail });
        if (workosUser.data[0]) await upsertAppUserFromWorkOS(workosUser.data[0], runtime);
        return jsonWithCookies(
          {
            success: false,
            needsVerification: true,
            message: 'Check your email for a verification code before signing in.',
          },
          403,
          verificationRequiredCookies(parsed.pendingAuthenticationToken)
        );
      }

      const localUser = await verifyUserPassword(normalizedEmail, password, runtime);
      if (localUser) {
        try {
          await createOrUpdateWorkOSPasswordUser({
            workos,
            email: normalizedEmail,
            password,
            name: localUser.name || normalizedEmail,
          });
          const authenticated = await authenticate();
          const completed = await completeWorkOSAuthentication({
            workosUser: authenticated.user,
            sealedSession: authenticated.sealedSession,
            runtime,
            redirect: typeof redirect === 'string' ? redirect : null,
          });
          return jsonWithCookies(
            {
              success: true,
              message: 'Login successful',
              user: publicAuthUser(completed.user),
              next: completed.next,
            },
            200,
            completed.cookies
          );
        } catch (migrateError) {
          const migrateParsed = parseWorkOSAuthError(migrateError);
          if (migrateParsed.code === 'email_verification_required' && migrateParsed.pendingAuthenticationToken) {
            return jsonWithCookies(
              {
                success: false,
                needsVerification: true,
                message: 'Check your email for a verification code before signing in.',
              },
              403,
              verificationRequiredCookies(migrateParsed.pendingAuthenticationToken)
            );
          }
        }
      }

      if (parsed.code === 'sso_required') {
        return jsonWithCookies(
          { success: false, message: 'This email needs Google sign-in. Use Continue with Google.' },
          401
        );
      }

      return jsonWithCookies({ success: false, message: 'Invalid email or password' }, 401);
    }
  } catch (error) {
    console.error('Login error:', error);
    return jsonWithCookies({ success: false, message: 'Internal server error' }, 500);
  }
};
