import type { APIRoute } from 'astro';
import { isValidEmail } from '../../../lib/auth.ts';
import { jsonWithCookies } from '../../../lib/authCookie.ts';
import { findWorkOSUserByEmail, getWorkOSClient } from '../../../lib/workosAuth';
import { runtimeEnvFromLocals } from '../../../lib/workosEnv';

const generic = {
  success: true,
  message: 'If an unverified account exists for that email, we sent a new code.',
};

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);

  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = String(body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) return jsonWithCookies(generic);

    const { workos } = getWorkOSClient(runtime);
    const user = await findWorkOSUserByEmail(workos, email);
    if (!user || user.emailVerified) return jsonWithCookies(generic);

    await workos.userManagement.sendVerificationEmail({ userId: user.id });
    return jsonWithCookies(generic);
  } catch (error) {
    console.error('Resend verification error:', error);
    return jsonWithCookies(generic);
  }
};
