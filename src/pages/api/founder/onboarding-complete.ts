import type { APIRoute } from 'astro';
import { resolveFounderIdentity, okJson, errorJson } from '@/lib/founderAgent/service';
import { updateUserAccount } from '@/lib/adminMongo';

export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return errorJson(identity.error, identity.status);
  await updateUserAccount(identity.founderId, { onboardingStatus: 'complete' });
  return okJson({ next: '/founder/home' });
};

export const prerender = false;
