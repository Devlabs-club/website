import React from "react";
import { Check, Sparkles, X } from "lucide-react";
import { PLANS, type PlanId } from "@/components/founder/FounderBillingCard";

type FounderUpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  upgradeTarget?: PlanId;
  reason?: string;
};

const PRICING_PATH = "/founder/settings";

export const FounderUpgradeModal: React.FC<FounderUpgradeModalProps> = ({
  open,
  onClose,
  upgradeTarget = "growth",
  reason,
}) => {
  if (!open) return null;
  const plan = PLANS.find((p) => p.id === upgradeTarget) || PLANS[1];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md rounded-[28px] border border-[#ece7e1] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05),0_24px_70px_rgba(16,24,40,0.15)] sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-black/40 transition hover:bg-[#fdfaf7] hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#fdfaf7] text-[#ec9149]">
          <Sparkles className="h-6 w-6" />
        </div>

        <h2 className="mt-4 text-xl font-bold tracking-tight text-black">Upgrade to {plan.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-black/55">
          {reason || "This is a paid feature. Upgrade your plan to keep going."}
        </p>

        <ul className="mt-5 space-y-2">
          {plan.highlights.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-black/70">
              <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#fdfaf7] text-[#ec9149] ring-1 ring-[#ece7e1]">
                <Check className="h-3 w-3" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-[#ece7e1] text-sm font-semibold text-black/70 transition hover:bg-[#fdfaf7]"
          >
            Maybe later
          </button>
          <a
            href={PRICING_PATH}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[#ec9149] text-sm font-bold text-white transition hover:bg-[#dd7f36]"
          >
            Upgrade
          </a>
        </div>
      </div>
    </div>
  );
};

export default FounderUpgradeModal;
