import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity } from '@/lib/founderAgent/service';
import FounderBillingAccount from '@/models/billing/FounderBillingAccount';
import HiringLedger from '@/models/billing/HiringLedger';
import { entitlementSnapshot, PLAN_ENTITLEMENTS } from '@/lib/billing/entitlements';
import { getStripeConfig, requireStripe } from '@/lib/billing/stripe';
import { runtimeEnvFromLocals } from '@/lib/workosEnv';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function intervalFromPrice(priceId: string | null | undefined, yearlyPriceId?: string | null) {
  if (!priceId) return null;
  if (priceId === yearlyPriceId) return 'yearly';
  return 'monthly';
}

function activeSubscriptionStatus(status?: string | null) {
  return status === 'active' || status === 'trialing';
}

export const POST: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return json({ success: false, error: identity.error }, identity.status);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = String(body.sessionId || '').trim();
  if (!sessionId.startsWith('cs_')) return json({ success: false, error: 'Missing checkout session.' }, 400);

  const runtime = runtimeEnvFromLocals(locals);
  const stripe = requireStripe(runtime);
  const config = getStripeConfig(runtime);
  const session: any = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'payment_intent'],
  });
  const metadata = session.metadata || {};
  const founderEmail = String(metadata.founderEmail || '').toLowerCase().trim();
  if (!founderEmail || founderEmail !== identity.email) {
    return json({ success: false, error: 'Checkout session does not belong to this founder.' }, 403);
  }
  if (session.payment_status !== 'paid') {
    return json({ success: false, status: session.payment_status || 'open' }, 409);
  }

  await connectAdminDB();

  if (metadata.plan === 'custom') {
    await FounderBillingAccount.findOneAndUpdate(
      { founderEmail },
      {
        $set: {
          founderId: metadata.founderId || identity.founderId,
          founderEmail,
          plan: 'custom',
          status: 'deposit_paid',
          billingInterval: null,
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          entitlementsSnapshot: entitlementSnapshot(PLAN_ENTITLEMENTS.custom),
        },
      },
      { upsert: true, new: true }
    );
    await HiringLedger.updateMany(
      { founderEmail, depositStatus: { $in: ['pending', 'not_required'] } },
      {
        $set: {
          depositStatus: 'paid',
          depositCheckoutSessionId: session.id,
          depositPaymentIntentId:
            typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null,
        },
      }
    );
    return json({ success: true, plan: 'custom', status: 'deposit_paid' });
  }

  if (metadata.plan === 'growth') {
    const subscription =
      typeof session.subscription === 'string'
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
    const priceId = subscription?.items?.data?.[0]?.price?.id || null;
    const status = activeSubscriptionStatus(subscription?.status)
      ? subscription.status
      : subscription?.status === 'past_due'
        ? 'past_due'
        : 'canceled';

    await FounderBillingAccount.findOneAndUpdate(
      { founderEmail },
      {
        $set: {
          founderId: metadata.founderId || identity.founderId,
          founderEmail,
          plan: activeSubscriptionStatus(subscription?.status) ? 'growth' : 'free',
          status,
          billingInterval: metadata.interval || intervalFromPrice(priceId, config.growthYearlyPriceId),
          stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          stripeSubscriptionId: subscription?.id,
          stripePriceId: priceId,
          currentPeriodStart: subscription?.current_period_start
            ? new Date(subscription.current_period_start * 1000)
            : null,
          currentPeriodEnd: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
          cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
          entitlementsSnapshot: entitlementSnapshot(
            activeSubscriptionStatus(subscription?.status) ? PLAN_ENTITLEMENTS.growth : PLAN_ENTITLEMENTS.free
          ),
        },
      },
      { upsert: true, new: true }
    );
    return json({ success: true, plan: activeSubscriptionStatus(subscription?.status) ? 'growth' : 'free', status });
  }

  return json({ success: false, error: 'Unsupported checkout plan.' }, 400);
};

export const prerender = false;
