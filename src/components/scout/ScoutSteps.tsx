export default function ScoutSteps() {
  return (
    <section
      id="how-it-works"
      className="relative bg-[#0e0e0e] py-24 px-6 overflow-hidden"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Subtle bg texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <p className="text-xs text-[#fa7d22] uppercase tracking-widest font-medium mb-3">
            5 MIN ONBOARDING
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-3 leading-tight">
            Find your builder{" "}
            <span className="text-[#fa7d22]" style={{ fontFamily: '"the-seasons", serif', fontStyle: "italic", fontWeight: 400 }}>
              in 5 minutes
            </span>
          </h2>
          <p className="text-white/50 text-base max-w-lg mx-auto">
            From first message to a matched builder ready to ship — zero friction, zero wasted interviews.
          </p>
        </div>

        {/* 3 Step Cards */}
        <div className="grid md:grid-cols-3 gap-5 mb-12">
          {/* Step 1 */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#1a1410] to-[#111111]">
            <div className="p-6 min-h-[200px] flex flex-col justify-between relative">
              {/* Mock UI: scout conversation */}
              <div className="space-y-2.5 mb-4">
                <div className="bg-white/[0.06] border border-white/10 rounded-xl px-3.5 py-2.5 w-fit max-w-[70%]">
                  <p className="text-white/70 text-xs">What are you building?</p>
                </div>
                <div className="bg-[#fa7d22]/15 border border-[#fa7d22]/25 rounded-xl px-3.5 py-2.5 w-fit max-w-[80%] ml-auto">
                  <p className="text-white/70 text-xs">AI dev tool, need a builder obsessed with DX</p>
                </div>
                <div className="bg-white/[0.06] border border-white/10 rounded-xl px-3.5 py-2.5 w-fit max-w-[75%]">
                  <p className="text-white/70 text-xs">Got it. Searching 500+ builders...</p>
                </div>
              </div>
              {/* Cursor decoration */}
              <div className="absolute bottom-6 right-6 opacity-60">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fa7d22">
                  <path d="M4 2l16 10-7 2-3 7z" />
                </svg>
              </div>
            </div>
            <div className="px-6 pb-6">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
                <span className="text-[#fa7d22] font-bold mr-2">1</span>
                Tell Scout what you need
              </p>
              <p className="text-white/55 text-sm leading-relaxed">
                Describe your startup and the kind of person you're looking for. Natural language — Scout understands builder intent, not job titles.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#1a1410] to-[#111111]">
            <div className="p-6 min-h-[200px] flex flex-col justify-center items-center relative">
              {/* Mock: match result */}
              <div className="bg-white/[0.06] border border-[#fa7d22]/30 rounded-xl p-4 w-full mb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#fa7d22]/40 to-[#fa7d22]/10 border border-[#fa7d22]/30 flex items-center justify-center text-xs font-bold text-[#fa7d22]">
                    AK
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold">Arjun K.</p>
                    <p className="text-white/40 text-[10px]">Full-stack · DevHacks winner</p>
                  </div>
                  <span className="ml-auto text-[#fa7d22] font-bold text-sm">94</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {["ships fast", "post-hackathon builder", "led teams"].map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-[#fa7d22]/15 text-[#fa7d22] text-[10px] font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              {/* Two CTA mockup */}
              <div className="flex gap-2 w-full">
                <div className="flex-1 py-2 rounded-full bg-[#fa7d22]/20 border border-[#fa7d22]/30 text-center text-[#fa7d22] text-xs font-semibold">
                  Connect now
                </div>
                <div className="flex-1 py-2 rounded-full bg-white/[0.06] border border-white/15 text-center text-white/50 text-xs">
                  See more
                </div>
              </div>
            </div>
            <div className="px-6 pb-6">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
                <span className="text-[#fa7d22] font-bold mr-2">2</span>
                Scout reads the signal
              </p>
              <p className="text-white/55 text-sm leading-relaxed">
                Scout scores every builder on real DevLabs activity — projects shipped, hackathon behavior, and post-event momentum.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-[#1a1410] to-[#111111]">
            <div className="p-6 min-h-[200px] flex flex-col justify-center relative">
              {/* Mock: settings/preferences panel */}
              <div className="bg-white/[0.05] border border-white/10 rounded-xl p-4">
                <p className="text-white/60 text-[10px] uppercase tracking-wider mb-3">Match preferences</p>
                <div className="mb-3">
                  <p className="text-white/40 text-[10px] mb-1.5">Role type</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["Full-stack", "Frontend", "Backend"].map((t, i) => (
                      <span
                        key={t}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          i === 0
                            ? "bg-[#fa7d22] text-black border-transparent"
                            : "bg-white/[0.06] text-white/50 border-white/10"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] mb-1.5">Builder goals</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {["Ships fast", "Equity-motivated", "Stays post-launch"].map((t, i) => (
                      <span
                        key={t}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          i === 0
                            ? "bg-[#fa7d22] text-black border-transparent"
                            : "bg-white/[0.06] text-white/50 border-white/10"
                        }`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6">
              <p className="text-white/40 text-xs uppercase tracking-wider mb-1">
                <span className="text-[#fa7d22] font-bold mr-2">3</span>
                Reach out in one click
              </p>
              <p className="text-white/55 text-sm leading-relaxed">
                Scout drafts a personalized intro, you review and send. Talk to 3 pre-vetted builders — not 250 strangers.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center">
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#fa7d22] text-black font-bold text-sm
                       hover:bg-[#fb8f3a] transition-all hover:scale-[1.02] shadow-[0_0_30px_rgba(250,125,34,0.3)]"
          >
            Start free — find your builder
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
