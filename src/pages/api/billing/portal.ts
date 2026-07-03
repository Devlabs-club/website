import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity } from '@/lib/founderAgent/service';
import FounderBillingAccount from '@/models/billing/FounderBillingAccount';
import { getStripe, siteOrigin } from '@/lib/billing/stripe';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return json({ success: false, error: identity.error }, identity.status);

  await connectAdminDB();
  const account = await FounderBillingAccount.findOne({ founderEmail: identity.email }).lean<{
    stripeCustomerId?: string | null;
  } | null>();
  if (!account?.stripeCustomerId) {
    return json({ success: false, error: 'No Stripe customer exists for this founder.' }, 404);
  }

  const runtime = runtimeEnvFromLocals(locals);
  const stripe = getStripe(runtime);
  if (!stripe) {
    return json(
      { success: false, code: 'BILLING_UNCONFIGURED', error: 'Payments aren’t enabled yet. Please try again soon.' },
      503
    );
  }
  const origin = siteOrigin(request, runtime);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: `${origin}/founder/home?billing=portal_return`,
    });
    return json({ success: true, url: session.url });
  } catch (error) {
    console.error('billing/portal: Stripe error', error);
    return json({ success: false, code: 'BILLING_ERROR', error: 'Could not open the billing portal.' }, 502);
  }
};

export const prerender = false;
