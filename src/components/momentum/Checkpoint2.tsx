import React from "react";
import { motion } from "framer-motion";

export default function Checkpoint2() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden selection:bg-orange-500/30 font-sans">
      {/* Fixed Background Image */}
      <div
        className="fixed inset-0 z-[-2] bg-[url('/screen.png')] bg-cover bg-center bg-no-repeat"
      />
      <div className="fixed inset-0 z-[-1] bg-black/50" />

      {/* Top navigation breadcrumb */}
      <nav className="relative z-10 px-6 pt-8 pb-4">
        <div className="mx-auto max-w-2xl flex items-center gap-2 text-sm text-white/40 font-medium">
          <a href="/momentum" className="hover:text-white/70 transition-colors">momentum</a>
          <span>/</span>
          <span className="text-white/70">checkpoint 2</span>
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
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight lowercase">
              welcome to week 2.
            </h1>
            <div className="space-y-4 text-lg text-white/80 leading-relaxed font-light">
              <p>
                the goal of this week is simple — take what you learned from shipping in public last week and <strong className="text-white font-semibold">make one meaningful change</strong> to your product, then prove it with a tweet and a demo video.
              </p>
              <p>
                iteration is where great products separate from stagnant ideas. viewers should read your tweet and immediately understand what you changed <em className="text-white/90 not-italic font-medium">and</em> watch a clip that proves it ships.
              </p>
            </div>
          </section>

          <div className="py-4">
            <img
              src="https://dhanush.wtf/media/la79v1t0n9i.png?file="
              alt="Momentum Checkpoint 2 Poster"
              className="w-full rounded-xl border border-white/10 shadow-2xl"
            />
          </div>

          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight lowercase">
              the challenge.
            </h2>
            <div className="space-y-4 text-lg text-white/80 leading-relaxed font-light">
              <p>
                post a public tweet where you <strong className="text-white font-semibold">explain what changed</strong> in clear text (why you made it, what problem it solves) <strong className="text-white font-semibold">and</strong> your tweet includes <strong className="text-white font-semibold">video</strong> that demonstrates the change live in your product.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>the caption should summarize the iteration for someone scrolling — not vague “we improved things.”</li>
                <li>the video shows the behavior before/after or a focused walk-through of what you shipped.</li>
                <li>keep it short and credible; loom, screen recording, or phone camera is fine.</li>
              </ul>
              <p className="text-white/60 text-base italic mt-4">
                if you can't explain it in words and prove it on video in under a minute, you probably haven't shaped the iteration tightly enough yet.
              </p>
            </div>
          </section>

          <section className="space-y-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight lowercase">
              required steps for week 2.
            </h2>

            <div className="space-y-10">
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  01 — pick one change.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  choose one concrete improvement anchored in feedback, usage, or a lesson from checkpoint 1. scope small: a flow fix, onboarding tweak, clearer value moment, perf win — something shippable and demonstrable.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  02 — ship & record proof.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  get it live (or runnable on your demo path). record a crisp clip that highlights what changed — show the user's eye what is different without extra narration fluff.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  03 — compose the tweet & submit.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  write tight copy explaining the iteration, attach or embed your video per twitter's format, publish, then paste the post url into the checkpoint 2 submission field on your momentum dashboard.
                </p>
              </div>
            </div>
          </section>

          <section className="pt-8 border-t border-white/10 space-y-4">
            <h2 className="text-xl font-bold tracking-tight lowercase text-orange-500">
              deadline for week 2 update.
            </h2>
            <p className="text-lg text-white/90 font-medium">
              friday, may 8th @ 11:59pm mst
            </p>
            <p className="text-white/60 font-light">
              submit your post url via the momentum dashboard.
            </p>

            <div className="pt-4">
              <a
                href="/momentum"
                className="inline-flex items-center justify-center rounded-md bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-gray-200 transition-colors"
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
