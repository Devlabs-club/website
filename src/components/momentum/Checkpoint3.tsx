import React from "react";
import { motion } from "framer-motion";

export default function Checkpoint3() {
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
          <span className="text-white/70">checkpoint 3</span>
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
              welcome to week 3.
            </h1>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                ship another iteration:{" "}
                <strong className="font-semibold text-white">
                  post a tweet that explains what changed
                </strong>{" "}
                in plain language — and attach or embed{" "}
                <strong className="font-semibold text-white">
                  video proof
                </strong>{" "}
                that shows or walks through that change live in your product.
              </p>
              <p>
                the tweet is the headline; the video is the receipt. viewers
                should understand the delta from your copy and verify it from
                the clip within one scroll-stop.
              </p>
            </div>
          </section>

          <div className="py-4">
            <img
              src="https://dhanush.wtf/media/1clq87xp0z6.png?file="
              alt="Momentum Checkpoint 3 — customer-led iteration"
              className="w-full rounded-xl border border-white/10 shadow-2xl"
            />
          </div>

          <section className="space-y-6">
            <h2 className="text-2xl font-bold lowercase tracking-tight sm:text-3xl">
              the challenge.
            </h2>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                publish a{" "}
                <strong className="font-semibold text-white">
                  public Twitter/X post
                </strong>{" "}
                where you clearly state{" "}
                <strong className="font-semibold text-white">
                  what you changed and why it matters
                </strong>
                , and include{" "}
                <strong className="font-semibold text-white">
                  video that demonstrates or explains that change
                </strong>{" "}
                (native upload, clipped media, or link in-thread per what X
                allows — graders need one URL that resolves to both your copy
                and the video proof).
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  caption: concise explanation of the change — not generic
                  hustle labels.
                </li>
                <li>
                  video: screen recording or camera is fine — show behavior,
                  flows, before/after, or a crisp demo slice.
                </li>
                <li>goal: credible ship in progress, evidenced in seconds.</li>
              </ul>
              <p className="mt-4 text-base italic text-white/60">
                paste the tweet URL into the Checkpoint 3 field on your
                Momentum dashboard when you publish.
              </p>
            </div>
          </section>

          <section className="space-y-8">
            <h2 className="text-2xl font-bold lowercase tracking-tight sm:text-3xl">
              suggested flow.
            </h2>

            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold lowercase tracking-tight text-white/90">
                  01 — pick one change.
                </h3>
                <p className="text-lg font-light leading-relaxed text-white/70">
                  one concrete tweak, fix, feature slice, or clarity win you can
                  describe and show quickly.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold lowercase tracking-tight text-white/90">
                  02 — record the proof.
                </h3>
                <p className="text-lg font-light leading-relaxed text-white/70">
                  capture a tight clip aligned with exactly what your tweet says
                  — no bait-and-switch vs the caption.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold lowercase tracking-tight text-white/90">
                  03 — post & submit.
                </h3>
                <p className="text-lg font-light leading-relaxed text-white/70">
                  compose the tweet, attach/embed the video, publish, copy the
                  post URL → Momentum dashboard → Checkpoint 3 submission.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-8">
            <h2 className="text-xl font-bold lowercase tracking-tight text-orange-500">
              deadline for week 3 update.
            </h2>
            <p className="text-lg font-medium text-white/90">
              friday, may 15th @ 11:59pm mst
            </p>
            <p className="font-light text-white/60">
              submit your tweet URL via the Momentum dashboard.
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
