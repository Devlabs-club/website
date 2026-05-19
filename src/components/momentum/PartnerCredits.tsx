import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, X, Copy, Check, Gift } from "lucide-react";
import { isMomentumKickoffRevealed } from "../../lib/momentumKickoff";
import type { MomentumApplicationRecord } from "./types";

interface Partner {
  id: string;
  name: string;
  logo: string | null;
  description: string;
  code: string | null;
  link: string;
}

export function PartnerCredits({ application }: { application: MomentumApplicationRecord }) {
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [copied, setCopied] = useState(false);

  const partners: Partner[] = [
    {
      id: "smallest-ai",
      name: "Smallest.ai",
      logo: "/sponsors/momentum/smallest_ai.png",
      description: "$50 in API credits to power your voice and audio features. Build the future of voice. Expires May 31st.",
      code: "DEVABSXSMALLEST-9JJLRL9K",
      link: "https://app.smallest.ai/dashboard/api-keys",
    },
    {
      id: "tiny-fish",
      name: "Tiny fish",
      logo: "/sponsors/momentum/tinyfish.png",
      description: "1,650 free credits and 5 concurrencies to scale your AI agents. Ship faster.",
      code: null,
      link: "https://agent.tinyfish.ai/makeasplash?source=devlab2026",
    },
    {
      id: "stripe",
      name: "Stripe",
      logo: "/sponsors/momentum/stripe.png",
      description: "50% off Atlas incorporation ($250) + $2,500 in Stripe Credits for payments, billing, and more. Valid till Aug 31, 2026.",
      code: null,
      link: "https://dashboard.stripe.com/atlas/invite/sp-dvlmtm",
    },
    {
      id: "ins-forge",
      name: "Ins forge",
      logo: "/sponsors/momentum/insforge.svg",
      description: "Essential credits to forge your infrastructure. Need more to scale? Just ask.",
      code: null,
      link: "https://insforge.dev/promo/MOMENTUM",
    },
    {
      id: "autosend",
      name: "Autosend",
      logo: "/sponsors/momentum/autosend.png",
      description: "Free Hobby and Starter 10k plans to automate your user communications. Reach out if you need to upgrade.",
      code: "MOMENTUM2026",
      link: "https://autosend.com/welcome",
    },
    {
      id: "composio",
      name: "Composio",
      logo: "/sponsors/momentum/composio.png",
      description: "100% off for 7 months on the Growth Plan. Connect your AI agents to 100+ tools instantly.",
      code: "MOMENTUM_BUILDS_FAST",
      link: "https://dashboard.composio.dev/dhanush.kalaiselvan_workspace/~/settings/billing",
    },
    {
      id: "supermemory",
      name: "Supermemory",
      logo: "/sponsors/supermemory.png",
      description:
        "Universal memory for your AI products — apply your Momentum discount in the Supermemory console.",
      code: "GETMOMENTUM",
      link: "https://console.supermemory.ai?discountCode=GETMOMENTUM",
    },
    {
      id: "superhuman-mail",
      name: "Superhuman Mail",
      logo: "/sponsors/momentum/superhuman.png",
      description:
        "Eligible startups get one year free of Superhuman Mail's Business Plan for up to 5 teammates.",
      code: null,
      link: "https://superhuman.com/products/mail/startups/apply-now",
    },
    {
      id: "google-cloud",
      name: "Google Cloud",
      logo: "/sponsors/momentum/gcp.png",
      description: "$25 in Google Cloud credits. Redeem via the link below.",
      code: null,
      link: "https://trygcp.dev/edit/momentum",
    },
    {
      id: "mintlify",
      name: "Mintlify",
      logo: "/sponsors/momentum/mintlify.png",
      description:
        "Mintlify Pro Plan for 6 months plus 5,000 Mint Credits per month for AI-powered docs functionality.",
      code: null,
      link: "https://mintlify.typeform.com/startup-program?typeform-source=www.mintlify.com",
    },
    {
      id: "dodo-payments",
      name: "Dodo Payments",
      logo: "/sponsors/momentum/dodo_payments.svg",
      description: "$3000 in credits to power your payments infrastructure",
      code: application.dodoCode || null,
      link: "https://app.dodopayments.com/settings?tab=promotions",
    }
  ];

  // Kickoff time: April 24, 2026, 10:30 AM Phoenix time (MST / UTC-7)
  const isRevealed = isMomentumKickoffRevealed();

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-0">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
          <Gift className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-seasons text-2xl text-white">Partner Credits</h2>
          <p className="text-sm text-white/60">
            Fuel your build with exclusive perks from our partners.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {partners.map((partner) => (
          <motion.button
            key={partner.id}
            type="button"
            onClick={() => setSelectedPartner(partner)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="group relative flex min-h-0 min-w-0 w-full cursor-pointer flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm transition-all hover:border-orange-500/30 hover:bg-white/[0.05] sm:p-6"
          >
            <div className="flex w-full min-w-0 items-start justify-between gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5 p-2 sm:h-16 sm:w-16">
                {partner.logo ? (
                  <img
                    src={partner.logo}
                    alt={`${partner.name} logo`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="font-seasons text-xl font-bold text-white/50">
                    {partner.name[0]}
                  </span>
                )}
              </div>
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-all group-hover:border-orange-500 group-hover:bg-orange-500 group-hover:text-white sm:h-10 sm:w-10"
                aria-hidden
              >
                <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-seasons text-lg leading-tight text-white sm:text-xl">
                {partner.name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/60 line-clamp-4 sm:line-clamp-5">
                {partner.description}
              </p>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {selectedPartner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPartner(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl sm:p-8"
            >
              <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/10 blur-[64px] pointer-events-none" />
              
              <button
                onClick={() => setSelectedPartner(null)}
                className="absolute right-4 top-4 rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/5 p-3">
                {selectedPartner.logo ? (
                  <img
                    src={selectedPartner.logo}
                    alt={`${selectedPartner.name} logo`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="font-seasons text-3xl font-bold text-white/50">
                    {selectedPartner.name[0]}
                  </span>
                )}
              </div>

              <h3 className="mb-2 font-seasons text-2xl text-white">
                {selectedPartner.name}
              </h3>
              <p className="mb-6 text-white/70">
                {selectedPartner.description}
              </p>

              <div className="mb-8 rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 text-sm text-orange-200">
                <p>
                  Make sure you integrate <strong>{selectedPartner.name}</strong> and tag them on Twitter, Instagram, or LinkedIn to show off what you're building!
                </p>
              </div>

              {!isRevealed ? (
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-sm">
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />
                  <div className="relative z-10 flex flex-col items-center gap-3">
                    <Gift className="h-8 w-8 text-orange-400" />
                    <div>
                      <h4 className="font-seasons text-xl text-white">Reveals at the kickoff</h4>
                      <p className="mt-1 text-sm text-white/60">Check back on April 24th at 10:30 AM (PHX time) to unlock your credits.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {selectedPartner.code && (
                    <div className="mb-6">
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/50">
                        Promo Code
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white">
                          {selectedPartner.code}
                        </code>
                        <button
                          onClick={() => handleCopy(selectedPartner.code!)}
                          className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          {copied ? (
                            <Check className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <Copy className="h-5 w-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <a
                    href={selectedPartner.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-orange-600"
                  >
                    Redeem Now <ArrowUpRight className="h-4 w-4" />
                  </a>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
