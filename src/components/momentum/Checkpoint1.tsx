import React from "react";
import { motion } from "framer-motion";

export default function Checkpoint1() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden selection:bg-orange-500/30 font-sans">
      {/* Fixed Background Image */}
      <div 
        className="fixed inset-0 z-[-2] bg-[url('/screen.png')] bg-cover bg-center bg-no-repeat"
      />
      {/* Dark overlay for text readability - darkened to match buildspace vibe */}
      <div className="fixed inset-0 z-[-1] bg-black/50" />

      {/* Top navigation breadcrumb */}
      <nav className="relative z-10 px-6 pt-8 pb-4">
        <div className="mx-auto max-w-2xl flex items-center gap-2 text-sm text-white/40 font-medium">
          <a href="/momentum" className="hover:text-white/70 transition-colors">momentum</a>
          <span>/</span>
          <span className="text-white/70">checkpoint 1</span>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-2xl px-6 pb-32 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-16"
        >
          {/* Header */}
          <section className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight lowercase">
              welcome to week 1.
            </h1>
            <div className="space-y-4 text-lg text-white/80 leading-relaxed font-light">
              <p>
                the goal of this week is simple — share what you're building with the world and prove you can grab attention.
              </p>
              <p>
                building in a silo is the fastest way to build something nobody wants. by putting your raw, unpolished demo out there, you're forcing yourself to articulate the value prop clearly.
              </p>
            </div>
          </section>

          {/* Poster */}
          <div className="py-4">
            <img 
              src="https://dhanush.wtf/media/8waikwmns4a.png?file=" 
              alt="Momentum Checkpoint 1 Poster" 
              className="w-full rounded-xl border border-white/10 shadow-2xl"
            />
          </div>

          {/* The Challenge */}
          <section className="space-y-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight lowercase">
              the challenge.
            </h2>
            <div className="space-y-4 text-lg text-white/80 leading-relaxed font-light">
              <p>
                post a <strong className="text-white font-semibold">1-minute demo video</strong> on twitter.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>get 3 reposts on your demo tweet.</li>
                <li>get a comment from someone with 10k+ followers.</li>
                <li>keep it under 60 seconds.</li>
              </ul>
              <p className="text-white/60 text-base italic mt-4">
                the 10k+ follower constraint? it's a hustle check. it proves you can grab the attention of someone busy. cold dm, reply to their threads, figure it out.
              </p>
            </div>
          </section>

          {/* Required Steps */}
          <section className="space-y-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight lowercase">
              required steps for week 1.
            </h2>

            <div className="space-y-10">
              {/* Step 1 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  01 — record the demo.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  no fancy edits needed. loom or screen studio works perfectly. show the problem, show the solution. don't overthink the production quality, just get the point across.
                </p>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  02 — craft the hook.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  your first 2 lines determine if people watch. make it punchy. what's the contrarian take? why should we care? if your hook is boring, the rest of the video doesn't matter.
                </p>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  03 — hustle for the engagement.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  don't just post and pray. dm friends for the reposts. find creators in your niche with 10k+ followers and give them a compelling reason to reply. offer value, ask a specific question, or just build a genuine connection.
                </p>
              </div>
            </div>
          </section>

          {/* Deadline */}
          <section className="pt-8 border-t border-white/10 space-y-4">
            <h2 className="text-xl font-bold tracking-tight lowercase text-orange-500">
              deadline for week 1 update.
            </h2>
            <p className="text-lg text-white/90 font-medium">
              friday, may 1st @ 11:59pm pt
            </p>
            <p className="text-white/60 font-light">
              submit your proof via the momentum dashboard.
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
