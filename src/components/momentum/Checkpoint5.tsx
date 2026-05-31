import React from "react";
import { motion } from "framer-motion";

export default function Checkpoint5() {
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
          <span className="text-white/70">checkpoint 5</span>
        </div>
      </nav>

      <div className="relative z-10 mx-auto max-w-2xl px-6 pb-32 pt-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-16"
        >
          <section className="space-y-6 border-b border-white/10 pb-16">
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                whether you get selected for demo day or not, you&apos;ve
                stepped out of your comfort zone and seen the real startup world
                for yourself. we are super glad to have been a part of your
                startup journey.
              </p>
              <p>
                this doesn&apos;t end here — once you become a part of{" "}
                <a
                  href="/"
                  className="border-b-2 border-orange-500 transition-colors hover:border-orange-400 hover:text-orange-400 text-orange-400 font-medium inline"
                  style={{ textDecoration: "none" }}
                >
                  Devlabs
                </a>
                , you will always be close to us. reach out with any help along
                your way and we will do our best to connect you with the right
                people and give you all the resources and mentorship we can.
              </p>
              <p className="pt-2 text-white/90">
                you have a long way to go and remember —
              </p>
              <p className="font-medium text-white">
                the sky isn&apos;t the limit, it&apos;s just the beginning.
              </p>
            </div>
            <p className="text-lg font-light text-white/90">
              keep building{" "}
              <span className="not-italic" aria-hidden="true">
                🧡
              </span>
            </p>
            <p className="text-sm text-white/50">— Dhanush and Bhoomi</p>
            <div className="mt-6 flex flex-col items-center justify-start gap-4 sm:flex-row sm:gap-8">
              <div className="flex flex-col">
                <img
                  src="/dhanush_sign.png"
                  alt="Dhanush signature"
                  loading="lazy"
                  className="mt-4 h-10 w-auto opacity-90 sm:h-12"
                />
              </div>
              <div className="flex flex-col gap-4">
                <img
                  src="/bhoomi_sign.png"
                  alt="Bhoomi signature"
                  loading="lazy"
                  className="mt-4 h-10 w-auto invert opacity-90 sm:h-12"
                />
                <p className="text-sm text-white/90"></p>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h1 className="text-4xl font-bold lowercase tracking-tight sm:text-5xl">
              welcome to week 5.
            </h1>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <p>
                time to sharpen the story — record a{" "}
                <strong className="font-semibold text-white">
                  ~3-minute pitch
                </strong>{" "}
                as a{" "}
                <strong className="font-semibold text-white">
                  live demo walkthrough
                </strong>{" "}
                of what you shipped. reviewers should leave understanding the
                product and why it wins.
              </p>
              <p>
                in the recording, explicitly{" "}
                <strong className="font-semibold text-white">
                  mention DevLabs and Momentum
                </strong>{" "}
                (how you participated, cohort, shout-out — brief is fine). then{" "}
                <strong className="font-semibold text-white">
                  post the pitch publicly
                </strong>
                , ideally with native video where your platform supports it.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl font-bold lowercase tracking-tight sm:text-3xl">
              the challenge.
            </h2>
            <div className="space-y-4 text-lg font-light leading-relaxed text-white/80">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  ~3 minutes: problem, demo, traction or learning, close — no
                  reading slides as a crutch unless you weave them into the
                  demo.
                </li>
                <li>
                  <strong className="text-white">
                    Say DevLabs/Momentum aloud
                  </strong>{" "}
                  on camera so graders can scrub and hear it quickly.
                </li>
                <li>
                  <strong className="text-white">Post publicly</strong> — paste
                  the public post/video URL into the Checkpoint 5 field on your
                  dashboard.
                </li>
                <li>
                  Submit your{" "}
                  <strong className="text-white">pitch deck link</strong> too
                  (Slides, Gamma, Dropbox, Docs — readable by link).
                </li>
              </ul>
            </div>
          </section>

          <section className="space-y-4 border-t border-white/10 pt-8">
            <p className="font-light text-white/60">
              submit your video post URL and deck link via the momentum
              dashboard when you&apos;re ready.
            </p>

            <div className="pt-4">
              <a
                href="/momentum/apply"
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
