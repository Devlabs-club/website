import React from "react";
import { motion } from "framer-motion";

export default function Checkpoint2() {
  return (
    <div className="relative min-h-screen text-white overflow-hidden selection:bg-orange-500/30 font-sans">
      {/* Fixed Background Image */}
      <div 
        className="fixed inset-0 z-[-2] bg-[url('/screen.png')] bg-cover bg-center bg-no-repeat"
      />
      {/* Dark overlay for text readability */}
      <div className="fixed inset-0 z-[-1] bg-black/85" />

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
          {/* Header */}
          <section className="space-y-6">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight lowercase">
              welcome to week 2.
            </h1>
            <div className="space-y-4 text-lg text-white/80 leading-relaxed font-light">
              <p>
                the goal of this week is to get out of the building and talk to real people.
              </p>
              <p>
                building a great product is only half the battle. the other half is getting it into the hands of people who actually care. this week, you're going to practice the art of the cold outreach.
              </p>
            </div>
          </section>

          {/* Poster */}
          <div className="py-4">
            <img 
              src="https://dhanush.wtf/media/la79v1t0n9i.png?file=" 
              alt="Momentum Checkpoint 2 Poster" 
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
                cold reach out to target users or high-leverage people <strong className="text-white font-semibold">until you get 25 replies</strong>.
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>find where your users hang out (twitter, linkedin, email, discord, etc).</li>
                <li>send personalized, high-quality cold messages until you hit the goal.</li>
                <li>compile screenshots of all 25 replies into a single google drive folder.</li>
                <li>submit the public google drive link.</li>
              </ul>
              <p className="text-white/60 text-base italic mt-4">
                why cold outreach? because if you can't convince someone to reply to a message, you definitely can't convince them to use your product. learn to write copy that converts.
              </p>
            </div>
          </section>

          {/* Required Steps */}
          <section className="space-y-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight lowercase">
              required steps for week 2.
            </h2>

            <div className="space-y-10">
              {/* Step 1 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  01 — identify your targets.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  don't just spam random people. build a list of individuals who perfectly match your ideal customer profile, or who have the leverage to change the trajectory of your startup.
                </p>
              </div>

              {/* Step 2 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  02 — write the perfect cold message.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  keep it short. make it about them, not you. highlight a specific problem they have, and offer a low-friction way to see your solution. no one wants to read a novel in their dms.
                </p>
              </div>

              {/* Step 3 */}
              <div className="space-y-3">
                <h3 className="text-xl font-semibold tracking-tight text-white/90 lowercase">
                  03 — follow up until you hit 25 replies.
                </h3>
                <p className="text-white/70 font-light leading-relaxed text-lg">
                  send the messages. follow up if they don't reply. keep reaching out to new people until you have exactly 25 responses. screenshot every single reply, put them in a google drive folder, and make sure the link is set to "anyone with the link can view".
                </p>
              </div>
            </div>
          </section>

          {/* Deadline */}
          <section className="pt-8 border-t border-white/10 space-y-4">
            <h2 className="text-xl font-bold tracking-tight lowercase text-orange-500">
              deadline for week 2 update.
            </h2>
            <p className="text-lg text-white/90 font-medium">
              friday, may 8th @ 11:59pm mst
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
