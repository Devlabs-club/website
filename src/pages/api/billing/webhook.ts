import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
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

async function upsertAccountFromSubscription(subscription: any, yearlyPriceId?: string | null) {
  const metadata = subscription.metadata || {};
  const founderEmail = String(metadata.founderEmail || '').toLowerCase().trim();
  if (!founderEmail) return;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const status = subscription.status === 'active' || subscription.status === 'trialing'
    ? subscription.status
    : subscription.status === 'past_due'
      ? 'past_due'
      : 'canceled';

  await FounderBillingAccount.findOneAndUpdate(
    { founderEmail },
    {
      $set: {
        founderId: metadata.founderId || founderEmail,
        founderEmail,
        plan: status === 'active' || status === 'trialing' ? 'growth' : 'free',
        status,
        billingInterval: metadata.interval || intervalFromPrice(priceId, yearlyPriceId),
        stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : null,
        currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        entitlementsSnapshot: entitlementSnapshot(
          status === 'active' || status === 'trialing' ? PLAN_ENTITLEMENTS.growth : PLAN_ENTITLEMENTS.free
        ),
      },
    },
    { upsert: true, new: true }
  );
}

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = runtimeEnvFromLocals(locals);
  const stripe = requireStripe(runtime);
  const config = getStripeConfig(runtime);
  if (!config.webhookSecret) return json({ success: false, error: 'STRIPE_WEBHOOK_SECRET is not configured' }, 501);

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) return json({ success: false, error: 'Missing Stripe signature' }, 400);

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Invalid signature' }, 400);
  }

  await connectAdminDB();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const metadata = session.metadata || {};
    const founderEmail = String(metadata.founderEmail || '').toLowerCase().trim();
    if (founderEmail && metadata.plan === 'custom') {
      await FounderBillingAccount.findOneAndUpdate(
        { founderEmail },
        {
          $set: {
            founderId: metadata.founderId || founderEmail,
            founderEmail,
            plan: 'custom',
            status: 'deposit_paid',
            billingInterval: null,
            stripeCustomerId: session.customer,
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
            depositPaymentIntentId: session.payment_intent || null,
          },
        }
      );
    }
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    await upsertAccountFromSubscription(event.data.object, config.growthYearlyPriceId);
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const founderEmail = String(subscription.metadata?.founderEmail || '').toLowerCase().trim();
    if (founderEmail) {
      await FounderBillingAccount.findOneAndUpdate(
        { founderEmail },
        {
          $set: {
            plan: 'free',
            status: 'canceled',
            billingInterval: null,
            stripeSubscriptionId: subscription.id,
            entitlementsSnapshot: entitlementSnapshot(PLAN_ENTITLEMENTS.free),
          },
        }
      );
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (subscriptionId) {
      await FounderBillingAccount.findOneAndUpdate(
        { stripeSubscriptionId: subscriptionId },
        { $set: { status: 'past_due' } }
      );
    }
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
    if (subscriptionId) {
      await FounderBillingAccount.findOneAndUpdate(
        { stripeSubscriptionId: subscriptionId },
        { $set: { status: 'active', plan: 'growth', entitlementsSnapshot: entitlementSnapshot(PLAN_ENTITLEMENTS.growth) } }
      );
    }
    if (invoice.metadata?.ledgerId) {
      await HiringLedger.findByIdAndUpdate(invoice.metadata.ledgerId, {
        $set: { successFeeInvoiceId: invoice.id, successFeeStatus: invoice.status || 'paid' },
      });
    }
  }

  return json({ success: true, received: true });
};

export const prerender = false;
