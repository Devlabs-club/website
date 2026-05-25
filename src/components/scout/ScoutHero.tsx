import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

const MARKERS = [
  { location: [20.5937, 78.9629] as [number, number], size: 0.12 },
  { location: [37.0902, -95.7129] as [number, number], size: 0.12 },
  { location: [36.2048, 138.2529] as [number, number], size: 0.08 },
  { location: [55.3781, -3.436] as [number, number], size: 0.08 },
  { location: [51.1657, 10.4515] as [number, number], size: 0.07 },
  { location: [1.3521, 103.8198] as [number, number], size: 0.07 },
  { location: [56.1304, -106.3468] as [number, number], size: 0.07 },
  { location: [-25.2744, 133.7751] as [number, number], size: 0.07 },
  { location: [-14.235, -51.9253] as [number, number], size: 0.06 },
  { location: [23.4241, 53.8478] as [number, number], size: 0.06 },
  { location: [35.9078, 127.7669] as [number, number], size: 0.06 },
  { location: [9.082, 8.6753] as [number, number], size: 0.05 },
];

const SPONSORS = [
  { name: "a16z", logo: "/sponsors/momentum/a16z.png" },
  { name: "Antler", logo: "/sponsors/momentum/antler.png" },
  { name: "Stripe", logo: "/sponsors/momentum/stripe.png" },
  { name: "South Park Commons", logo: "/sponsors/momentum/spc.png" },
  { name: "Composio", logo: "/sponsors/momentum/composio.png" },
  { name: "Kickstart", logo: "/sponsors/momentum/kickstart.png" },
];

function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phiRef = useRef(1.2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let width = canvas.offsetWidth;

    const onResize = () => {
      width = canvas.offsetWidth;
    };
    window.addEventListener("resize", onResize);

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 1.2,
      theta: 0.2,
      dark: 1,
      diffuse: 1.4,
      mapSamples: 20000,
      mapBrightness: 5,
      baseColor: [0.1, 0.1, 0.1],
      markerColor: [0.98, 0.49, 0.13],
      glowColor: [0.15, 0.08, 0.02],
      markers: MARKERS,
      onRender(state) {
        state.phi = phiRef.current;
        phiRef.current += 0.0025;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", aspectRatio: "1/1" }}
    />
  );
}

// Sparkle star component
function Sparkle({ x, y, size = 16, opacity = 0.6 }: { x: string; y: string; size?: number; opacity?: number }) {
  return (
    <svg
      style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none" }}
      width={size} height={size} viewBox="0 0 24 24" fill="white"
    >
      <path d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z" />
    </svg>
  );
}

export default function ScoutHero() {
  return (
    <section
      className="relative w-full min-h-screen bg-[#080808] flex flex-col items-center overflow-hidden"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Stars scattered */}
      <Sparkle x="8%" y="12%" size={12} opacity={0.35} />
      <Sparkle x="18%" y="28%" size={8} opacity={0.2} />
      <Sparkle x="75%" y="8%" size={10} opacity={0.3} />
      <Sparkle x="88%" y="22%" size={14} opacity={0.4} />
      <Sparkle x="92%" y="55%" size={20} opacity={0.5} />
      <Sparkle x="5%" y="60%" size={16} opacity={0.35} />
      <Sparkle x="45%" y="15%" size={6} opacity={0.25} />
      <Sparkle x="60%" y="30%" size={8} opacity={0.2} />

      {/* Top orange radial glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(250,125,34,0.18) 0%, transparent 70%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center pt-28 px-6 max-w-4xl mx-auto w-full">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#fa7d22]/30 bg-[#fa7d22]/10 mb-7">
          <span className="w-1.5 h-1.5 rounded-full bg-[#fa7d22] animate-pulse" />
          <span className="text-xs text-[#fa7d22] tracking-widest uppercase font-medium">
            From the builders behind DevLabs
          </span>
        </div>

        {/* Headline */}
        <h1 className="mb-5" style={{ lineHeight: 1.05 }}>
          <span className="block text-2xl md:text-3xl text-white/60 font-light mb-1">
            one network,
          </span>
          <span
            className="block text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-white font-bold"
          >
            endless{" "}
            <span
              className="relative inline-block"
              style={{
                fontFamily: '"the-seasons", "Times New Roman", serif',
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              builders
              <span
                className="absolute left-0 right-0 z-[-1] rounded"
                style={{
                  bottom: "0.04em",
                  height: "0.22em",
                  background: "#fa7d22",
                  opacity: 0.85,
                  transform: "rotate(-1.5deg)",
                  transformOrigin: "left center",
                }}
              />
            </span>
          </span>
        </h1>

        <p className="text-base md:text-lg text-white/50 max-w-xl mb-10 leading-relaxed">
          Scout matches startup founders with verified DevLabs builders — people who build for the love of it, not just the paycheck.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 items-center mb-16">
          <a
            href="#pricing"
            className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-[#fa7d22] text-black font-bold text-base
                       hover:bg-[#fb8f3a] transition-all hover:scale-[1.03] active:scale-[0.98]
                       shadow-[0_0_30px_rgba(250,125,34,0.4)]"
          >
            Find your first builder
            <span className="w-4 h-4 transition-transform group-hover:translate-x-1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </span>
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-white/20 bg-transparent
                       text-white/80 font-medium text-base hover:border-white/40 hover:bg-white/5 transition-all"
          >
            See how it works
          </a>
        </div>
      </div>

      {/* Globe — bottom half, large, like the Nexus layout */}
      <div className="relative w-full flex justify-center items-end" style={{ marginTop: "-2rem" }}>
        {/* Globe glow behind */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at 50% 100%, rgba(250,125,34,0.14) 0%, rgba(250,125,34,0.05) 40%, transparent 70%)",
            zIndex: 0,
          }}
        />
        {/* Curved horizon glow */}
        <div
          className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 120% 60% at 50% 130%, rgba(250,125,34,0.18) 0%, transparent 65%)",
            zIndex: 1,
          }}
        />
        <div
          className="relative z-10 w-full max-w-[680px] mx-auto"
          style={{ marginBottom: "-30%" }}
        >
          <Globe />
        </div>
      </div>

      {/* Sponsors strip */}
      <div
        className="relative z-20 w-full bg-[#080808] pt-4 pb-10 border-t border-white/[0.06]"
        style={{ marginTop: "auto" }}
      >
        <p className="text-center font-manrope text-xs text-white/30 uppercase tracking-widest mb-6">
          Builders trusted by teams at
        </p>
        <div className="flex items-center justify-center gap-8 md:gap-14 flex-wrap px-6 opacity-50 grayscale">
          {SPONSORS.map((s) => (
            <img
              key={s.name}
              src={s.logo}
              alt={s.name}
              className="h-7 md:h-9 object-contain"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
