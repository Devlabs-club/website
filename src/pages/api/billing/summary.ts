import type { APIRoute } from 'astro';
import { connectAdminDB } from '@/lib/mongodb';
import { resolveFounderIdentity } from '@/lib/founderAgent/service';
import {
  getFounderEntitlements,
  getFounderUsage,
  entitlementSnapshot,
} from '@/lib/billing/entitlements';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Current plan + entitlements + usage for the founder billing UI. */
export const GET: APIRoute = async ({ request, locals }) => {
  const identity = await resolveFounderIdentity(request, locals);
  if ('error' in identity) return json({ success: false, error: identity.error }, identity.status);

  await connectAdminDB();
  const { account, entitlements } = await getFounderEntitlements({
    founderId: identity.founderId,
    email: identity.email,
  });
  const usage = await getFounderUsage({ founderId: identity.founderId, email: identity.email });

  return json({
    success: true,
    plan: entitlements.plan,
    status: entitlements.status,
    billingInterval: entitlements.billingInterval,
    cancelAtPeriodEnd: Boolean(account.cancelAtPeriodEnd),
    currentPeriodEnd: account.currentPeriodEnd ? new Date(account.currentPeriodEnd).toISOString() : null,
    hasSubscription: Boolean(account.stripeSubscriptionId),
    canManageBilling: Boolean(account.stripeCustomerId),
    entitlements: entitlementSnapshot(entitlements),
    usage: { rolesUsed: usage.rolesUsed, roleLimit: usage.roleLimit },
  });
};

export const prerender = false;
