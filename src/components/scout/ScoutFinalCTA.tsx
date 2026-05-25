// Image 3 reference: large gradient CTA section above footer
// Dark version with orange glow instead of the light purple

export default function ScoutFinalCTA() {
  return (
    <section
      className="relative mx-4 mb-4 rounded-3xl overflow-hidden"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Background: dark with orange radial glow */}
      <div className="absolute inset-0 bg-[#0d0d0d]" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 80% at 50% 60%, rgba(250,125,34,0.18) 0%, rgba(250,125,34,0.06) 40%, transparent 70%)",
        }}
      />
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center py-20 px-6">
        {/* Star decorations */}
        <svg className="absolute left-[8%] top-[20%] opacity-20" width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z" />
        </svg>
        <svg className="absolute right-[10%] top-[35%] opacity-15" width="10" height="10" viewBox="0 0 24 24" fill="white">
          <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z" />
        </svg>
        <svg className="absolute left-[20%] bottom-[25%] opacity-10" width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z" />
        </svg>

        <h2
          className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight max-w-3xl"
        >
          Supercharge your team —{" "}
          <span
            className="relative inline-block"
            style={{ fontFamily: '"the-seasons", serif', fontStyle: "italic", fontWeight: 400 }}
          >
            hire a builder
            <span
              className="absolute left-0 right-0 z-[-1] rounded"
              style={{
                bottom: "0.04em",
                height: "0.2em",
                background: "#fa7d22",
                opacity: 0.75,
                transform: "rotate(-1deg)",
              }}
            />
          </span>{" "}
          now
        </h2>

        <p className="text-white/50 text-base md:text-lg max-w-xl mb-10 leading-relaxed">
          The next person who ships your most important feature is already in the DevLabs network. Scout finds them in minutes.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <a
            href="#pricing"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-white text-[#080808] font-bold text-base
                       hover:scale-[1.03] transition-all shadow-[0_0_40px_rgba(255,255,255,0.15),0_0_60px_rgba(250,125,34,0.2)]
                       active:scale-[0.98]"
          >
            Find a builder now
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-white/20 text-white/75 text-base
                       hover:border-white/35 hover:text-white transition-all"
          >
            Get a quick demo
          </a>
        </div>
      </div>
    </section>
  );
}
