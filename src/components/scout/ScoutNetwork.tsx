// Image 2 reference: arc of tool/builder icons with testimonial quote in center
// Adapted to dark DevLabs theme with orange accents

const BUILDERS = [
  { initials: "AK", label: "Full-stack", angle: -150, r: 220 },
  { initials: "SR", label: "iOS", angle: -120, r: 220 },
  { initials: "MT", label: "ML", angle: -90, r: 220 },
  { initials: "PL", label: "Frontend", angle: -60, r: 220 },
  { initials: "KR", label: "DevOps", angle: -30, r: 220 },
  { initials: "DV", label: "Backend", angle: 0, r: 220 },
];

function polarToXY(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: r * Math.cos(rad),
    y: r * Math.sin(rad),
  };
}

export default function ScoutNetwork() {
  const cx = 400;
  const cy = 320;

  return (
    <section
      className="relative bg-[#080808] py-24 px-6 overflow-hidden"
      style={{ fontFamily: "Manrope, sans-serif" }}
    >
      {/* Square grid pattern bg */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 38px, rgba(255,255,255,0.5) 39px), repeating-linear-gradient(90deg, transparent, transparent 38px, rgba(255,255,255,0.5) 39px)",
        }}
      />
      {/* Center orange glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(250,125,34,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <span className="inline-block px-4 py-1.5 rounded-full border border-white/15 bg-white/[0.04] text-white/60 text-xs font-medium mb-4">
            Global Network
          </span>
          <h2
            className="text-4xl md:text-5xl font-bold text-white mb-3"
          >
            Builders from{" "}
            <span
              className="relative inline-block"
              style={{ fontFamily: '"the-seasons", serif', fontStyle: "italic", fontWeight: 400 }}
            >
              everywhere
              <span
                className="absolute left-0 right-0 z-[-1] rounded"
                style={{
                  bottom: "0.04em",
                  height: "0.2em",
                  background: "#fa7d22",
                  opacity: 0.8,
                  transform: "rotate(-1deg)",
                }}
              />
            </span>
          </h2>
          <p className="text-white/45 text-base max-w-lg mx-auto">
            Our network spans 15+ countries. Scout connects you with builders from India, USA, Japan, UK, Singapore, and beyond.
          </p>
        </div>

        {/* Arc diagram */}
        <div className="relative w-full flex justify-center" style={{ height: 380 }}>
          <svg
            viewBox="0 0 800 380"
            className="w-full max-w-3xl"
            style={{ overflow: "visible" }}
          >
            {/* Arc path */}
            <path
              d="M 80 340 Q 400 60 720 340"
              fill="none"
              stroke="url(#arcGrad)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <defs>
              <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#fa7d22" stopOpacity="0.1" />
                <stop offset="50%" stopColor="#fa7d22" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#fa7d22" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Builder nodes along arc */}
            {[
              { cx: 80, cy: 340, label: "India", sub: "🇮🇳" },
              { cx: 190, cy: 195, label: "Japan", sub: "🇯🇵" },
              { cx: 310, cy: 105, label: "UK", sub: "🇬🇧" },
              { cx: 400, cy: 75, label: "USA", sub: "🇺🇸" },
              { cx: 490, cy: 105, label: "Germany", sub: "🇩🇪" },
              { cx: 610, cy: 195, label: "Singapore", sub: "🇸🇬" },
              { cx: 720, cy: 340, label: "Canada", sub: "🇨🇦" },
            ].map((node, i) => (
              <g key={node.label}>
                {/* Glow ring */}
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={i === 3 ? 34 : 26}
                  fill="none"
                  stroke="#fa7d22"
                  strokeOpacity={i === 3 ? 0.35 : 0.15}
                  strokeWidth="1"
                />
                {/* Node circle */}
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={i === 3 ? 28 : 20}
                  fill={i === 3 ? "#fa7d22" : "rgba(255,255,255,0.06)"}
                  stroke={i === 3 ? "#fa7d22" : "rgba(255,255,255,0.15)"}
                  strokeWidth="1"
                />
                {/* Flag emoji */}
                <text
                  x={node.cx}
                  y={node.cy + (i === 3 ? 7 : 5)}
                  textAnchor="middle"
                  fontSize={i === 3 ? "18" : "14"}
                  style={{ userSelect: "none" }}
                >
                  {node.sub}
                </text>
                {/* Label */}
                <text
                  x={node.cx}
                  y={node.cy + (i === 3 ? 48 : 38)}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.4)"
                  fontSize="11"
                  fontFamily="Manrope, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Testimonial quote below arc */}
        <div className="max-w-xl mx-auto text-center -mt-8">
          <blockquote className="text-white/70 text-base md:text-lg leading-relaxed italic mb-6 font-light">
            "Scout found us a builder from Bangalore in 48 hours. He'd already shipped 3 products from DevHacks and wasn't looking for a job — he was looking for a mission."
          </blockquote>
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#fa7d22]/40 to-[#fa7d22]/10 border border-[#fa7d22]/30 flex items-center justify-center text-sm font-bold text-[#fa7d22]">
              RS
            </div>
            <div className="text-left">
              <p className="font-semibold text-white text-sm">Rohan S.</p>
              <p className="text-white/40 text-xs">Co-founder, Stealth AI startup · YC S25</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
