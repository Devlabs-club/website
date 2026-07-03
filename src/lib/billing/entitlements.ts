import mongoose from 'mongoose';
import FounderBillingAccount from '@/models/billing/FounderBillingAccount';
import FounderUsageEvent from '@/models/billing/FounderUsageEvent';

export type FounderPlan = 'free' | 'growth' | 'custom';
export type BillingInterval = 'monthly' | 'yearly' | null;
export type EntitlementCode = 'PLAN_LIMIT_REACHED' | 'UPGRADE_REQUIRED' | 'PAYMENT_REQUIRED';

export type FounderBillingIdentity = {
  founderId: string;
  email: string;
};

export type FounderEntitlements = {
  plan: FounderPlan;
  status: string;
  billingInterval: BillingInterval;
  roleLimitPerMonth: number | null;
  profileLimitPerRole: number | null;
  visibilityMode: 'teaser' | 'full';
  traceAccess: 'teaser' | 'full';
  introAccess: 'locked' | 'enabled';
  outreachAccess: 'locked' | 'enabled';
  lifecycleAccess: 'locked' | 'enabled';
  managedHiring: boolean;
  unlimitedRoles: boolean;
  unlimitedProfiles: boolean;
};

export type EntitlementResult =
  | { ok: true; entitlements: FounderEntitlements; account: any; usage?: FounderUsageSummary }
  | {
      ok: false;
      code: EntitlementCode;
      message: string;
      status: number;
      entitlements: FounderEntitlements;
      usage?: FounderUsageSummary;
      upgradeTarget: 'growth' | 'custom';
    };

export type FounderUsageSummary = {
  periodKey: string;
  rolesUsed: number;
  roleLimit: number | null;
};

export const PLAN_ENTITLEMENTS: Record<FounderPlan, FounderEntitlements> = {
  free: {
    plan: 'free',
    status: 'free',
    billingInterval: null,
    roleLimitPerMonth: 3,
    profileLimitPerRole: 5,
    visibilityMode: 'teaser',
    traceAccess: 'teaser',
    introAccess: 'locked',
    outreachAccess: 'locked',
    lifecycleAccess: 'locked',
    managedHiring: false,
    unlimitedRoles: false,
    unlimitedProfiles: false,
  },
  growth: {
    plan: 'growth',
    status: 'active',
    billingInterval: 'monthly',
    roleLimitPerMonth: 5,
    profileLimitPerRole: 20,
    visibilityMode: 'full',
    traceAccess: 'full',
    introAccess: 'enabled',
    outreachAccess: 'enabled',
    lifecycleAccess: 'enabled',
    managedHiring: false,
    unlimitedRoles: false,
    unlimitedProfiles: false,
  },
  custom: {
    plan: 'custom',
    status: 'custom_active',
    billingInterval: null,
    roleLimitPerMonth: null,
    profileLimitPerRole: null,
    visibilityMode: 'full',
    traceAccess: 'full',
    introAccess: 'enabled',
    outreachAccess: 'enabled',
    lifecycleAccess: 'enabled',
    managedHiring: true,
    unlimitedRoles: true,
    unlimitedProfiles: true,
  },
};

export function currentPeriodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function entitlementSnapshot(entitlements: FounderEntitlements) {
  return {
    plan: entitlements.plan,
    status: entitlements.status,
    billingInterval: entitlements.billingInterval,
    roleLimitPerMonth: entitlements.roleLimitPerMonth,
    profileLimitPerRole: entitlements.profileLimitPerRole,
    visibilityMode: entitlements.visibilityMode,
    traceAccess: entitlements.traceAccess,
    introAccess: entitlements.introAccess,
    outreachAccess: entitlements.outreachAccess,
    lifecycleAccess: entitlements.lifecycleAccess,
    managedHiring: entitlements.managedHiring,
    unlimitedRoles: entitlements.unlimitedRoles,
    unlimitedProfiles: entitlements.unlimitedProfiles,
  };
}

function isPaidStatus(status: string | null | undefined) {
  return ['trialing', 'active', 'deposit_paid', 'custom_active'].includes(String(status || ''));
}

function applyAccountToPlan(account: any): FounderPlan {
  const override = account?.adminOverride;
  if (override?.plan && (!override.expiresAt || new Date(override.expiresAt) > new Date())) {
    return override.plan;
  }
  const plan = account?.plan as FounderPlan | undefined;
  if (plan === 'custom' && isPaidStatus(account?.status)) return 'custom';
  if (plan === 'growth' && isPaidStatus(account?.status)) return 'growth';
  return 'free';
}

export function entitlementsForAccount(account: any): FounderEntitlements {
  const plan = applyAccountToPlan(account);
  return {
    ...PLAN_ENTITLEMENTS[plan],
    status: account?.adminOverride?.status || account?.status || PLAN_ENTITLEMENTS[plan].status,
    billingInterval: account?.billingInterval || PLAN_ENTITLEMENTS[plan].billingInterval,
  };
}

export async function getOrCreateFounderBillingAccount(identity: FounderBillingIdentity) {
  const email = identity.email.toLowerCase().trim();
  return FounderBillingAccount.findOneAndUpdate(
    { founderEmail: email },
    {
      $setOnInsert: {
        founderId: identity.founderId,
        founderEmail: email,
        plan: 'free',
        status: 'free',
        entitlementsSnapshot: entitlementSnapshot(PLAN_ENTITLEMENTS.free),
      },
    },
    { upsert: true, new: true }
  );
}

export async function getFounderEntitlements(identity: FounderBillingIdentity) {
  const account = await getOrCreateFounderBillingAccount(identity);
  const entitlements = entitlementsForAccount(account);
  const nextSnapshot = entitlementSnapshot(entitlements);
  if (JSON.stringify(account.entitlementsSnapshot || {}) !== JSON.stringify(nextSnapshot)) {
    account.entitlementsSnapshot = nextSnapshot;
    await account.save();
  }
  return { account, entitlements };
}

export async function getFounderUsage(identity: FounderBillingIdentity, periodKey = currentPeriodKey()): Promise<FounderUsageSummary> {
  const email = identity.email.toLowerCase().trim();
  const roleEvents = await FounderUsageEvent.aggregate([
    {
      $match: {
        founderEmail: email,
        eventType: 'role_created',
        periodKey,
      },
    },
    {
      $group: {
        _id: '$opportunityId',
        quantity: { $max: '$quantity' },
      },
    },
  ]);
  const { entitlements } = await getFounderEntitlements(identity);
  return {
    periodKey,
    rolesUsed: roleEvents.length,
    roleLimit: entitlements.roleLimitPerMonth,
  };
}

export async function canCreateRole(identity: FounderBillingIdentity): Promise<EntitlementResult> {
  const { account, entitlements } = await getFounderEntitlements(identity);
  const usage = await getFounderUsage(identity);
  if (entitlements.roleLimitPerMonth !== null && usage.rolesUsed >= entitlements.roleLimitPerMonth) {
    return {
      ok: false,
      code: 'PLAN_LIMIT_REACHED',
      message: `You've used ${usage.rolesUsed}/${usage.roleLimit} roles for this month. Upgrade to continue this search.`,
      status: 402,
      entitlements,
      usage,
      upgradeTarget: entitlements.plan === 'free' ? 'growth' : 'custom',
    };
  }
  return { ok: true, account, entitlements, usage };
}

export function canUseLifecycle(entitlements: FounderEntitlements): EntitlementResult | null {
  if (entitlements.lifecycleAccess === 'enabled') return null;
  return {
    ok: false,
    code: 'UPGRADE_REQUIRED',
    message: 'Unlock Growth to continue with this builder.',
    status: 402,
    entitlements,
    upgradeTarget: 'growth',
  };
}

export function applyCandidateLimit<T>(items: T[], entitlements: FounderEntitlements): T[] {
  if (entitlements.profileLimitPerRole === null) return items;
  return items.slice(0, entitlements.profileLimitPerRole);
}

export async function recordUsageEvent(params: {
  identity: FounderBillingIdentity;
  eventType: 'role_created' | 'search_run' | 'profile_revealed' | 'intro_requested' | 'hire_marked';
  opportunityId?: string | null;
  builderId?: string | null;
  planAtEvent: FounderPlan;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) {
  const opportunityId = params.opportunityId && mongoose.Types.ObjectId.isValid(params.opportunityId)
    ? new mongoose.Types.ObjectId(params.opportunityId)
    : null;
  const builderId = params.builderId && mongoose.Types.ObjectId.isValid(params.builderId)
    ? new mongoose.Types.ObjectId(params.builderId)
    : null;

  return FounderUsageEvent.create({
    founderId: params.identity.founderId,
    founderEmail: params.identity.email.toLowerCase().trim(),
    eventType: params.eventType,
    periodKey: currentPeriodKey(),
    opportunityId,
    builderId,
    planAtEvent: params.planAtEvent,
    quantity: params.quantity ?? 1,
    metadata: params.metadata || {},
  });
}

export function entitlementErrorResponse(result: Extract<EntitlementResult, { ok: false }>) {
  return {
    code: result.code,
    error: result.message,
    upgradeTarget: result.upgradeTarget,
    entitlements: entitlementSnapshot(result.entitlements),
    usage: result.usage || null,
  };
}
