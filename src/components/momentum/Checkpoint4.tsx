import React from "react";
import { motion } from "framer-motion";

export default function Checkpoint4() {
  return (
    <div className="relative min-h-screen overflow-hidden font-sans text-white selection:bg-orange-500/30">
      <div className="fixed inset-0 z-[-2] bg-[url('/screen.png')] bg-cover bg-center bg-no-repeat" />
      <div className="fixed inset-0 z-[-1] bg-black/50" />

      <nav className="relative z-10 px-6 pb-4 pt-8">
        <div className="mx-auto flex max-w-2xl items-center gap-2 text-sm font-medium text-white/40">
          <a href="/momentum" className="transition-colors hover:text-white/70">
            momentum
          </a>
          <span>/</span>
          <span className="text-white/70">checkpoint 4</span>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-2xl px-6 pb-32 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-16"
        >
          <section className="space-y-6">
            <h1 className="text-4xl font-bold lowercase tracking-tight sm:text-5xl">
              welcome to week 4.
            </h1>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                the charge:{" "}
                <strong className="font-semibold text-white">
                  get paid by real customers
                </strong>{" "}
                — not your team, not family, and not anyone at DevLabs. you
                need{" "}
                <strong className="font-semibold text-white">
                  two separate paying customers
                </strong>{" "}
                by the end of week 4.
              </p>
              <p>
                prove it with{" "}
                <strong className="font-semibold text-white">
                  payment screenshots
                </strong>
                , who paid (name or company), and{" "}
                <strong className="font-semibold text-white">
                  one sentence per customer
                </strong>{" "}
                on why they paid.
              </p>
            </div>
          </section>

          <div className="py-4">
            <img
              src="https://dhanush.wtf/media/tk3zigx3ja.png?file="
              alt="Momentum Checkpoint 4 — first revenue"
              className="w-full rounded-xl border border-white/10 shadow-2xl"
            />
          </div>

          <section className="space-y-6">
            <h2 className="text-2xl font-bold lowercase tracking-tight sm:text-3xl">
              the challenge.
            </h2>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                close two payments from <strong className="text-white">outside</strong> your
                immediate crew — excluding teammates, family, and DevLabs
                staff/organizers. each payment should reflect real willingness
                to pay for what you&apos;re building.
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="text-white">two distinct customers</strong>{" "}
                  (not the same person twice).
                </li>
                <li>
                  <strong className="text-white">payment proof</strong>: screenshot
                  or receipt that shows the charge landed (Stripe, invoice paid,
                  PayPal, etc. — redact full card numbers if needed).
                </li>
                <li>
                  <strong className="text-white">who paid</strong>: how we should refer to
                  them (e.g. name + org or handle).
                </li>
                <li>
                  <strong className="text-white">why they paid</strong>: one crisp
                  sentence per customer explaining the reason to pay — not a
                  novel, just the core motivation.
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-8">
            <h2 className="text-2xl font-bold lowercase tracking-tight sm:text-3xl">
              how to submit.
            </h2>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                bundle everything in{" "}
                <strong className="text-white">
                  one Google Drive folder or a single Google Doc
                </strong>
                :
              </p>
              <ul className="list-disc space-y-2 pl-5 text-base">
                <li>
                  folder of two (or more) labeled images/PDFs showing payment
                  confirmation; or one doc with sections for customer A and B.
                </li>
                <li>clear labels for who each payer is.</li>
                <li>
                  two &quot;why they paid&quot; lines — one sentence each,
                  under the right payer.
                </li>
              </ul>
              <p className="text-white/60">
                paste that shared link into the Checkpoint 4 field on your
                Momentum dashboard. grant view access to graders if the link is
                restricted.
              </p>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-8">
            <h2 className="text-xl font-bold lowercase tracking-tight text-orange-500">
              deadline · end of week 4
            </h2>
            <p className="text-lg font-medium text-white/90">
              friday, may 22nd @ 11:59pm mst
            </p>
            <p className="font-light text-white/60">
              submit your proof link via the Momentum dashboard.
            </p>

            <div className="pt-4">
              <a
                href="/momentum"
                className="inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-200"
              >
                submit update
              </a>
            </div>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
