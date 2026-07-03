import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Loader2, Sparkles } from "lucide-react";

type PlanId = "free" | "growth" | "custom";
type Interval = "monthly" | "yearly";

type BillingSummary = {
  plan: PlanId;
  status: string;
  billingInterval: Interval | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasSubscription: boolean;
  canManageBilling: boolean;
  usage: { rolesUsed: number; roleLimit: number | null };
};

type PlanDef = {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: string;
  priceYearly?: string;
  highlights: string[];
};

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Explore the talent pool before you commit.",
    priceMonthly: "$0",
    highlights: ["3 roles / month", "5 profiles / role", "Teaser signals"],
  },
  {
    id: "growth",
    name: "Growth",
    tagline: "For startups actively hiring builders.",
    priceMonthly: "$20/mo",
    priceYearly: "$200/yr",
    highlights: ["5 roles / month", "20 profiles / role", "Full agent traces & outreach"],
  },
  {
    id: "custom",
    name: "Custom",
    tagline: "DevLabs runs the hire end-to-end.",
    priceMonthly: "$499 deposit",
    highlights: ["Unlimited roles & profiles", "Warm intros", "Success-based pricing"],
  },
];

/** Tier ordering so switch buttons read "Upgrade" vs "Downgrade" correctly. */
const PLAN_RANK: Record<PlanId, number> = { free: 0, growth: 1, custom: 2 };

const STATUS_LABELS: Record<string, string> = {
  free: "Free plan",
  trialing: "Trialing",
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
  deposit_paid: "Deposit paid",
  custom_active: "Active",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data } as { res: Response; data: any };
}

export const FounderBillingCard: React.FC = () => {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedInterval, setSelectedInterval] = useState<Interval>("monthly");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<{ tone: "success" | "info"; text: string } | null>(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/summary", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setSummary(data as BillingSummary);
        if (data.billingInterval === "yearly") setSelectedInterval("yearly");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle return from Stripe checkout / portal, then load the current plan.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    const sessionId = params.get("session_id");

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      ["billing", "session_id"].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    };

    (async () => {
      if (billing === "success" && sessionId) {
        // Sync immediately instead of waiting on the async webhook.
        await postJson("/api/billing/reconcile", { sessionId }).catch(() => ({}));
        setBanner({ tone: "success", text: "Payment received — your plan is now active." });
        cleanUrl();
      } else if (billing === "cancelled") {
        setBanner({ tone: "info", text: "Checkout was cancelled. No changes were made." });
        cleanUrl();
      } else if (billing === "portal_return") {
        cleanUrl();
      }
      await loadSummary();
    })();
  }, [loadSummary]);

  const startCheckout = async (plan: PlanId, chosenInterval?: Interval) => {
    setError("");
    setBusyAction(`checkout:${plan}`);
    try {
      const { data } = await postJson("/api/billing/checkout", {
        plan,
        interval: chosenInterval || selectedInterval,
      });
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Could not start checkout. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const openPortal = async () => {
    setError("");
    setBusyAction("portal");
    try {
      const { data } = await postJson("/api/billing/portal");
      if (data.success && data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Could not open the billing portal.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  const currentPlan = summary?.plan ?? "free";
  const renewsOn = useMemo(() => formatDate(summary?.currentPeriodEnd ?? null), [summary]);
  const statusLabel = summary ? STATUS_LABELS[summary.status] || summary.status : "";

  const usagePct = useMemo(() => {
    if (!summary || summary.usage.roleLimit == null) return null;
    if (summary.usage.roleLimit === 0) return 0;
    return Math.min(100, Math.round((summary.usage.rolesUsed / summary.usage.roleLimit) * 100));
  }, [summary]);

  if (loading) {
    return (
      <section className="w-full rounded-2xl border border-border bg-card p-6">
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </section>
    );
  }

  return (
    <section className="w-full rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <CreditCard className="h-4 w-4" /> Plan &amp; billing
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold capitalize text-foreground">{currentPlan}</span>
            {statusLabel && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {statusLabel}
              </span>
            )}
            {summary?.billingInterval && currentPlan === "growth" && (
              <span className="text-xs text-muted-foreground">· billed {summary.billingInterval}</span>
            )}
          </div>
          {summary?.cancelAtPeriodEnd && renewsOn ? (
            <p className="mt-1 text-xs text-amber-600">Cancels on {renewsOn}</p>
          ) : renewsOn && currentPlan === "growth" ? (
            <p className="mt-1 text-xs text-muted-foreground">Renews {renewsOn}</p>
          ) : null}
        </div>
        {summary?.canManageBilling && (
          <button
            type="button"
            onClick={() => void openPortal()}
            disabled={busyAction === "portal"}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {busyAction === "portal" && <Loader2 className="h-4 w-4 animate-spin" />}
            Manage billing
          </button>
        )}
      </div>

      {/* Roles usage for metered plans */}
      {summary && summary.usage.roleLimit != null && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Roles this month</span>
            <span className="tabular-nums">
              {summary.usage.rolesUsed} / {summary.usage.roleLimit}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${usagePct ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
            banner.tone === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-border bg-muted/50 text-muted-foreground"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Plan options */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const price =
            plan.id === "growth" && selectedInterval === "yearly"
              ? plan.priceYearly || plan.priceMonthly
              : plan.priceMonthly;
          return (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl border p-4 transition-colors ${
                isCurrent ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{plan.name}</span>
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-primary-foreground">
                    <Check className="h-3 w-3" /> Current
                  </span>
                )}
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">{price}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
              <ul className="mt-3 space-y-1.5">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>

              {plan.id === "growth" && !isCurrent && (
                <div className="mt-3 inline-flex rounded-lg border border-border p-0.5 text-xs">
                  {(["monthly", "yearly"] as Interval[]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSelectedInterval(opt)}
                      className={`rounded-md px-2 py-1 font-medium capitalize transition-colors ${
                        selectedInterval === opt ? "bg-foreground text-background" : "text-muted-foreground"
                      }`}
                    >
                      {opt === "yearly" ? "Yearly · save 17%" : "Monthly"}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 pt-1">{renderPlanAction(plan.id, isCurrent)}</div>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );

  function renderPlanAction(planId: PlanId, isCurrent: boolean) {
    if (isCurrent) {
      return (
        <p className="text-center text-xs font-medium text-muted-foreground">You&apos;re on this plan</p>
      );
    }

    // Changing an existing subscription (interval switch / downgrade) is safest
    // through the Stripe portal, which handles proration and cancellation.
    const usesPortalToChange = summary?.hasSubscription && (planId === "free" || (planId === "growth" && currentPlan === "growth"));

    if (planId === "free") {
      if (!summary?.hasSubscription) return null;
      return (
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={busyAction === "portal"}
          className="w-full rounded-xl border border-border py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          {busyAction === "portal" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Cancel / downgrade"}
        </button>
      );
    }

    if (usesPortalToChange) {
      return (
        <button
          type="button"
          onClick={() => void openPortal()}
          disabled={busyAction === "portal"}
          className="w-full rounded-xl border border-border py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50"
        >
          {busyAction === "portal" ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Change plan"}
        </button>
      );
    }

    const isDowngrade = PLAN_RANK[planId] < PLAN_RANK[currentPlan];
    const label =
      planId === "custom" ? "Start with deposit" : isDowngrade ? "Downgrade" : "Upgrade";
    const key = `checkout:${planId}`;
    return (
      <button
        type="button"
        onClick={() => void startCheckout(planId)}
        disabled={busyAction === key}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
          isDowngrade
            ? "border border-border text-foreground hover:bg-muted"
            : "bg-primary text-primary-foreground"
        }`}
      >
        {busyAction === key ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {planId === "growth" && !isDowngrade && <Sparkles className="h-4 w-4" />}
            {label}
          </>
        )}
      </button>
    );
  }
};

export default FounderBillingCard;
