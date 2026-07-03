import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity } from '@/lib/founderAgent/service';
import FounderBillingAccount from '@/models/billing/FounderBillingAccount';
import { getStripe, getStripeConfig, siteOrigin } from '@/lib/billing/stripe';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';
import { onboardingResumePath } from '@/lib/onboarding/resume';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return json({ success: false, error: identity.error }, identity.status);

  const runtime = runtimeEnvFromLocals(locals);
  const stripe = getStripe(runtime);
  const config = getStripeConfig(runtime);

  // Billing isn't wired up in this environment yet — degrade cleanly instead of
  // throwing a 500 so the pricing/dashboard flow can show a friendly message.
  if (!stripe) {
    return json(
      { success: false, code: 'BILLING_UNCONFIGURED', error: 'Payments aren’t enabled yet. Please try again soon.' },
      503
    );
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checkoutPlan = String(body.plan || '').trim();
  const interval = String(body.interval || '').trim();
  const requestedReturnPath = typeof body.returnPath === 'string' ? body.returnPath.trim() : '';

  const priceId =
    checkoutPlan === 'growth' && interval === 'yearly'
      ? config.growthYearlyPriceId
      : checkoutPlan === 'growth'
        ? config.growthMonthlyPriceId
        : checkoutPlan === 'custom'
          ? config.customDepositPriceId
          : null;

  if (!priceId) {
    return json({ success: false, error: 'Stripe price is not configured for this plan.' }, 501);
  }

  await connectAdminDB();
  const account = await FounderBillingAccount.findOneAndUpdate(
    { founderEmail: identity.email },
    {
      $setOnInsert: {
        founderId: identity.founderId,
        founderEmail: identity.email,
        plan: 'free',
        status: 'free',
      },
    },
    { upsert: true, new: true }
  );

  try {
  let customerId = account.stripeCustomerId;
  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
    } catch (error: any) {
      if (error?.code === 'resource_missing' || error?.raw?.code === 'resource_missing') {
        customerId = null;
        account.stripeCustomerId = null;
        await account.save();
      } else {
        throw error;
      }
    }
  }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: identity.email,
      name: identity.founderName,
      metadata: { founderId: identity.founderId, founderEmail: identity.email },
    });
    customerId = customer.id;
    account.stripeCustomerId = customerId;
    await account.save();
  }

  const origin = siteOrigin(request, runtime);
  const mode = checkoutPlan === 'custom' ? 'payment' : 'subscription';
  // After paying, resume onboarding at the exact step the founder left off
  // (start of the flow if they haven't begun) rather than a blank dashboard.
  const resumePath = onboardingResumePath('founder', identity.onboardingStatus);
  const returnPath =
    requestedReturnPath.startsWith('/') && !requestedReturnPath.startsWith('//')
      ? requestedReturnPath
      : resumePath;
  const session = await stripe.checkout.sessions.create({
    mode,
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: checkoutPlan === 'growth',
    success_url: `${origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${returnPath}${returnPath.includes('?') ? '&' : '?'}billing=cancelled`,
    metadata: {
      founderId: identity.founderId,
      founderEmail: identity.email,
      plan: checkoutPlan,
      interval: checkoutPlan === 'growth' ? (interval === 'yearly' ? 'yearly' : 'monthly') : '',
    },
    subscription_data: checkoutPlan === 'growth'
      ? {
          metadata: {
            founderId: identity.founderId,
            founderEmail: identity.email,
            plan: 'growth',
            interval: interval === 'yearly' ? 'yearly' : 'monthly',
          },
        }
      : undefined,
    payment_intent_data: checkoutPlan === 'custom'
      ? {
          metadata: {
            founderId: identity.founderId,
            founderEmail: identity.email,
            plan: 'custom',
            purpose: 'custom_deposit',
          },
        }
      : undefined,
  });

  return json({ success: true, url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('billing/checkout: Stripe error', error);
    return json(
      { success: false, code: 'BILLING_ERROR', error: 'Could not start checkout. Please try again.' },
      502
    );
  }
};

export const prerender = false;
