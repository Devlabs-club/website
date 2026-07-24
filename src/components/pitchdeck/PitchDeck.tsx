import type { ReactNode } from "react";

const companyLogoUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

const lookFor = [
  "Code quality",
  "Past projects",
  "Hackathon performance",
  "Social presence",
  "AI agent traces",
  "Products they shipped",
];

const ignore = [
  "Ivy League",
  "Big tech experience",
  "GPA",
  "Resume polish",
];

const painStats = [
  {
    value: "6–10 wks",
    label: "Avg. time to fill a founding engineer role",
  },
  {
    value: "$50–150K",
    label: "Founder opportunity cost per long search",
  },
  {
    value: "1 bad hire",
    label: "Can burn a seed round’s runway",
  },
];

const demoBuilders = [
  {
    name: "Isha R.",
    initials: "IR",
    role: "Full-stack",
    match: "96%",
    ship: "9.2",
    shipped: "7",
    sources: 4,
    avatarClass: "bg-[#ff7417] text-white",
    ex: { label: "ex-Google", domain: "google.com" },
    repos: ["stripe-connect", "saas-billing"],
    activity: [2, 5, 3, 7, 4, 8, 6, 9, 5, 8, 7, 9],
    signals: ["Stripe Connect", "Live billing", "Hackathon finalist"],
  },
  {
    name: "Dev P.",
    initials: "DP",
    role: "Payments",
    match: "93%",
    ship: "8.8",
    shipped: "5",
    sources: 3,
    avatarClass: "bg-black text-white",
    ex: { label: "ex-Amazon", domain: "amazon.com" },
    repos: ["checkout-kit", "next-pay"],
    activity: [3, 4, 6, 5, 8, 4, 7, 6, 9, 5, 8, 7],
    signals: ["Checkout flows", "Webhook reliability", "Shipped products"],
  },
  {
    name: "Maya T.",
    initials: "MT",
    role: "Full-stack",
    match: "94%",
    ship: "9.0",
    shipped: "8",
    sources: 4,
    avatarClass: "bg-[#1a1a1a] text-white",
    ex: { label: "ex-Stripe", domain: "stripe.com" },
    repos: ["stripe-hooks", "supabase-app"],
    activity: [5, 7, 4, 8, 6, 9, 5, 7, 8, 6, 9, 8],
    signals: ["Agent traces", "Prod apps", "Event winner"],
  },
];

const sponsors = [
  { label: "Antler", src: "/sponsors/momentum/antler.png" },
  { label: "Google DeepMind", src: "/sponsors/deepmind.png" },
  { label: "AWS", src: "/sponsors/companies/amazon.svg" },
  { label: "Browser Use", src: "/sponsors/browser-use.png" },
  { label: "Supermemory", src: "/sponsors/supermemory.png" },
  { label: "Stripe", src: "/sponsors/momentum/stripe.png" },
  { label: "TinyFish", src: "/sponsors/momentum/tinyfish.png" },
  { label: "Dodo Payments", src: "/sponsors/momentum/dodo_payments.svg" },
];

const equationSteps = [
  {
    value: "10K",
    label: "Startups hiring engineers",
    detail: "US Seed & Series A companies filling technical roles each year.",
  },
  {
    value: "$8K",
    label: "Revenue per company / year",
    detail: "Blended ACV from subscriptions + success fees on hires.",
  },
];

const marketLayers = [
  {
    tier: "SOM",
    value: "$6M",
    subtitle: "What we can win by Y5",
    detail: "750 Seed / Series A hiring companies × $8K ACV (~7.5% of SAM).",
    tone: "orange" as const,
    width: "w-[58%] sm:w-[52%]",
  },
  {
    tier: "SAM",
    value: "$80M",
    subtitle: "What we can serve today",
    detail: "10K early-stage startups × $8K — reachable with current product + GTM.",
    tone: "dark" as const,
    width: "w-[78%] sm:w-[74%]",
  },
  {
    tier: "TAM",
    value: "$750M",
    subtitle: "Where the category goes",
    detail: "50K tech companies globally × $15K as we move upmarket + talent intel.",
    tone: "green" as const,
    width: "w-full",
  },
];

const growthPath = [
  { year: "Y1", companies: "40", arr: "$0.3M" },
  { year: "Y2", companies: "120", arr: "$1.0M" },
  { year: "Y3", companies: "300", arr: "$2.4M" },
  { year: "Y5", companies: "750", arr: "$6.0M" },
];

function FlowArrow({
  label,
  dark = false,
}: {
  label?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 px-1 py-2 sm:px-2 ${
        dark ? "text-white/50" : "text-black/35"
      }`}
      aria-hidden="true"
    >
      {label && (
        <span className="hidden text-[0.65rem] font-extrabold uppercase tracking-[0.16em] lg:block">
          {label}
        </span>
      )}
      <svg className="h-8 w-10 sm:h-10 sm:w-12" viewBox="0 0 48 24" fill="none">
        <path
          d="M2 12h38M32 4l12 8-12 8"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </div>
  );
}

function MultiplyGlyph() {
  return (
    <div
      className="flex items-center justify-center px-1 text-3xl font-black text-[#ff7417] sm:text-4xl"
      aria-hidden="true"
    >
      ×
    </div>
  );
}

function EqualsGlyph() {
  return (
    <div
      className="flex items-center justify-center px-1 text-3xl font-black text-black/30 sm:text-4xl"
      aria-hidden="true"
    >
      =
    </div>
  );
}

const slideTitleStyle = {
  fontSize: "clamp(2.5rem, 6.5vw, 4.5rem)",
  lineHeight: 0.95,
  letterSpacing: "-0.04em",
} as const;

function SlideShell({
  children,
  className = "",
  dark = false,
  number,
  label,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  dark?: boolean;
  number: string;
  label: string;
  wide?: boolean;
}) {
  return (
    <section
      className={`relative flex min-h-screen w-full flex-col justify-center overflow-hidden px-6 py-16 sm:px-8 lg:px-10 ${
        dark ? "dark-act text-white" : "ruler-section text-[#050505]"
      } ${className}`}
    >
      {!dark && <div className="ruler-rails" aria-hidden="true" />}
      {dark && (
        <div
          className="dark-glow pointer-events-none absolute left-1/2 top-0 z-[1] -translate-x-1/2"
          aria-hidden="true"
        />
      )}
      <div
        className={`relative z-10 mx-auto flex w-full flex-col ${
          wide ? "max-w-7xl" : "max-w-6xl"
        }`}
      >
        <div
          className={`mb-8 flex items-center justify-between gap-4 text-[0.85rem] font-extrabold uppercase tracking-[0.24em] sm:mb-10 sm:text-[0.95rem] ${
            dark ? "text-white/40" : "text-black/40"
          }`}
        >
          <span>{label}</span>
          <span className={dark ? "text-[#ff7417]" : "text-[#bf4f08]"}>{number}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

function BuilderCard({
  builder,
}: {
  builder: (typeof demoBuilders)[number];
}) {
  return (
    <article className="border border-black/15 bg-[#fffaf7] p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center text-base font-extrabold ${builder.avatarClass}`}
          >
            {builder.initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-black text-black sm:text-lg">{builder.name}</p>
            <p className="mt-0.5 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-black/38">
              {builder.role}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-base font-black text-[#bf4f08] sm:text-lg">{builder.match}</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <img
          src={companyLogoUrl(builder.ex.domain)}
          alt=""
          className="h-4 w-4 rounded-sm"
        />
        <span className="text-sm font-semibold text-black/55">{builder.ex.label}</span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-black/34">
            Ship activity
          </p>
          <p className="text-[0.65rem] font-bold text-black/34">12w</p>
        </div>
        <div className="mt-1 flex h-7 items-end gap-[2px]" aria-hidden="true">
          {builder.activity.map((level, i) => (
            <span
              key={i}
              className="flex-1 rounded-[1px] bg-[#ff7417]"
              style={{
                height: `${18 + level * 7}%`,
                opacity: 0.22 + level * 0.07,
              }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5 border-y border-black/[0.07] py-2.5">
        <div>
          <p className="text-[1.05rem] font-black leading-none tracking-[-0.04em] text-black">
            {builder.ship}
          </p>
          <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-black/38">
            Ship
          </p>
        </div>
        <div>
          <p className="text-[1.05rem] font-black leading-none tracking-[-0.04em] text-black">
            {builder.shipped}
          </p>
          <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-black/38">
            Shipped
          </p>
        </div>
        <div>
          <p className="text-[1.05rem] font-black leading-none tracking-[-0.04em] text-black">
            {builder.sources}
          </p>
          <p className="mt-1 text-[0.58rem] font-bold uppercase tracking-[0.1em] text-black/38">
            Sources
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {builder.signals.map((signal) => (
          <span
            key={signal}
            className="border border-[#ff7417]/35 bg-[#fff5ef] px-2 py-1 text-[0.7rem] font-bold text-[#bf4f08]"
          >
            {signal}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {builder.repos.map((repo) => (
          <span
            key={repo}
            className="border border-black/10 bg-white px-2 py-1 font-mono text-[0.7rem] text-black/60"
          >
            {repo}
          </span>
        ))}
      </div>
    </article>
  );
}

export default function PitchDeck() {
  return (
    <div className="landing-page bg-[#fbf6f3] text-[#050505]">
      {/* 1. Intro */}
      <section className="ruler-section relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden px-6 py-20 text-center sm:px-8 lg:px-10">
        <div className="ruler-rails" aria-hidden="true" />
        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center">
          <img
            src="/logo.png"
            alt="DevLabs"
            className="h-20 w-20 object-contain sm:h-24 sm:w-24"
          />
          <p className="mt-8 text-[0.9rem] font-extrabold uppercase tracking-[0.28em] text-[#bf4f08] sm:text-[1rem]">
            DevLabs
          </p>
          <h1
            className="mt-6 max-w-6xl font-normal text-black"
            style={slideTitleStyle}
          >
            Hire{" "}
            <span className="font-extrabold">builders</span>
            <br />
            who can actually{" "}
            <span className="font-extrabold">ship</span>
          </h1>
          <p className="mt-8 max-w-2xl text-[clamp(1.25rem,2.4vw,1.65rem)] font-medium leading-relaxed text-black/58">
            The talent platform that replaces resumes with proof.
          </p>
        </div>
      </section>

      {/* 2. Problem */}
      <SlideShell number="02" label="Problem">
        <h2 className="max-w-6xl font-black text-black" style={slideTitleStyle}>
          Hiring through resumes is broken.
          <br />
          <span className="text-[#ff7417]">You need people who can ship.</span>
        </h2>

        <div className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-3">
          {painStats.map((stat) => (
            <div
              key={stat.label}
              className="border border-black/12 bg-[#fffaf7] px-5 py-5 sm:px-6 sm:py-6"
            >
              <p className="text-[clamp(1.6rem,3vw,2.1rem)] font-black tracking-[-0.04em] text-[#ff7417]">
                {stat.value}
              </p>
              <p className="mt-2 text-base font-medium leading-snug text-black/55 sm:text-lg">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[clamp(1.3rem,2.4vw,1.7rem)] font-medium text-black/58">
          With DevLabs, we look for the right signals.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="border-2 border-black bg-white p-6 sm:p-9">
            <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.2em] text-[#bf4f08]">
              Look for
            </p>
            <ul className="mt-5 space-y-3.5">
              {lookFor.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 bg-[#ff7417]" />
                  <span className="text-xl font-semibold tracking-[-0.02em] text-black sm:text-2xl">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="border border-black/15 bg-[#fffaf7] p-6 sm:p-9">
            <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.2em] text-black/35">
              Not your
            </p>
            <ul className="mt-5 space-y-3.5">
              {ignore.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-2.5 w-2.5 shrink-0 bg-black/20" />
                  <span className="text-xl font-semibold tracking-[-0.02em] text-black/40 line-through decoration-black/25 sm:text-2xl">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SlideShell>

      {/* 3. Unique */}
      <SlideShell number="03" label="Moat">
        <h2 className="max-w-6xl font-black text-black" style={slideTitleStyle}>
          We don&apos;t scrape the web for talent.
          <br />
          <span className="text-[#ff7417]">We attract them.</span>
        </h2>
        <p className="mt-6 max-w-3xl text-[clamp(1.2rem,2.2vw,1.5rem)] font-medium leading-relaxed text-black/55">
          Proprietary signal compounds with every event — a data moat LinkedIn and job boards cannot buy.
        </p>

        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="border-2 border-black bg-[#1a1a1a] p-8 text-white sm:p-10">
            <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.2em] text-[#ff7417]">
              Community
            </p>
            <p className="mt-5 text-[clamp(1.55rem,3.2vw,2.35rem)] font-black leading-[1.12] tracking-[-0.03em]">
              Our community is the engine that produces the data.
            </p>
            <p className="mt-5 text-lg font-medium leading-relaxed text-white/55 sm:text-xl">
              Builders opt in, ship in public, and leave a trail of proof — not another scraped profile.
            </p>
          </div>

          <div className="border-2 border-black bg-[#c6d99b] p-8 text-[#20311d] sm:p-10">
            <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.2em] text-[#20311d]/70">
              Events
            </p>
            <p className="mt-5 text-[clamp(1.55rem,3.2vw,2.35rem)] font-black leading-[1.12] tracking-[-0.03em]">
              Events are where builders prove themselves and get hired.
            </p>
            <p className="mt-5 text-lg font-medium leading-relaxed text-[#20311d]/70 sm:text-xl">
              Hackathons, houses, and demo days turn raw ambition into observable signal.
            </p>
          </div>
        </div>
      </SlideShell>

      {/* 4. Product demo */}
      <SlideShell number="04" label="Product" wide>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-6xl font-black text-black" style={slideTitleStyle}>
            Tell DevLabs what you need.
            <br />
            Get builders with the right signals.
          </h2>
          <p className="max-w-md text-lg font-medium text-black/55 lg:text-right lg:text-xl">
            Unlike LinkedIn or resume databases, matches are ranked on shipped work — not keywords.
          </p>
        </div>

        <div className="relative mt-10 border-[3px] border-[#168df7] bg-[#cfe6e9] p-4 shadow-[0_18px_55px_rgba(12,62,96,0.12)] sm:p-6 lg:p-8">
          <span className="selection-dot left-4 top-4 hidden sm:block" />
          <span className="selection-dot right-4 top-4 hidden sm:block" />
          <span className="selection-dot bottom-4 left-4 hidden sm:block" />
          <span className="selection-dot bottom-4 right-4 hidden sm:block" />

          <div className="relative z-10 border-2 border-black bg-white p-4 sm:p-6">
            <div className="mb-4 inline-flex items-center gap-2 border border-[#ff7417]/60 bg-[#fff5ef] px-3 py-2 text-base font-semibold text-[#bf4f08]">
              <span className="text-[#ff7417]">✦</span>
              Builder search
            </div>

            <div className="flex items-center gap-3 border border-black bg-white px-4 py-3.5 sm:px-5 sm:py-4">
              <svg
                className="h-6 w-6 shrink-0 text-black"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <p className="min-w-0 flex-1 text-[clamp(1rem,2vw,1.45rem)] font-medium tracking-[-0.02em] text-black">
                Find a developer who has experience in stripe integration
              </p>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {demoBuilders.map((builder) => (
                <BuilderCard key={builder.name} builder={builder} />
              ))}
            </div>
          </div>
        </div>
      </SlideShell>

      {/* 5. Traction */}
      <SlideShell number="05" label="Traction">
        <h2 className="max-w-6xl font-black text-black" style={slideTitleStyle}>
          Builders already get hired
          <br />
          through DevLabs.
        </h2>
        <p className="mt-5 max-w-2xl text-[clamp(1.2rem,2.2vw,1.5rem)] font-medium text-black/55">
          Proof before scale — community flywheel already producing hires.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          <div className="border-2 border-black bg-[#ff7417] p-7 text-white sm:p-9">
            <p className="text-[clamp(3.6rem,9vw,6.2rem)] font-black leading-none tracking-[-0.07em]">
              1500+
            </p>
            <p className="mt-5 text-base font-extrabold uppercase tracking-[0.16em] text-white/80 sm:text-lg">
              Builders in the talent pool
            </p>
          </div>
          <div className="border-2 border-black bg-[#1a1a1a] p-7 text-white sm:p-9">
            <p className="text-[clamp(3.6rem,9vw,6.2rem)] font-black leading-none tracking-[-0.07em]">
              4+
            </p>
            <p className="mt-5 text-base font-extrabold uppercase tracking-[0.16em] text-white/55 sm:text-lg">
              Companies hired
            </p>
          </div>
          <div className="border-2 border-black bg-[#c6d99b] p-7 text-[#20311d] sm:p-9">
            <p className="text-[clamp(3.6rem,9vw,6.2rem)] font-black leading-none tracking-[-0.07em]">
              12+
            </p>
            <p className="mt-5 text-base font-extrabold uppercase tracking-[0.16em] text-[#20311d]/70 sm:text-lg">
              Events hosted
            </p>
          </div>
        </div>

        <div className="mt-12">
          <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.24em] text-black/40 sm:text-[0.95rem]">
            Worked with and sponsored by
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 border border-black/10 bg-[#f4f1ed] p-4 sm:grid-cols-4 sm:gap-4 sm:p-6">
            {sponsors.map((sponsor) => (
              <div
                key={sponsor.label}
                className="flex h-16 items-center justify-center border border-black/8 bg-[#fffaf7] px-4 sm:h-[4.5rem]"
              >
                <img
                  src={sponsor.src}
                  alt={sponsor.label}
                  className="h-7 w-auto max-w-[9rem] object-contain opacity-80 sm:h-8"
                  style={{ filter: "grayscale(1) brightness(0)" }}
                />
              </div>
            ))}
          </div>
        </div>
      </SlideShell>

      {/* 6. TAM */}
      <SlideShell number="06" label="Market" wide>
        <h2 className="max-w-6xl font-black text-black" style={slideTitleStyle}>
          Simple math.
          <br />
          <span className="text-[#ff7417]">Clear path to scale.</span>
        </h2>
        <p className="mt-5 max-w-3xl text-[clamp(1.2rem,2.2vw,1.55rem)] font-medium leading-relaxed text-black/58">
          Start where the pain is sharpest — Seed startups — then expand. Every number is rebuildable from unit economics.
        </p>

        {/* Bottom-up equation with arrows */}
        <div className="mt-10 border-2 border-black bg-white p-5 sm:p-8">
          <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.22em] text-[#bf4f08]">
            How we size the market
          </p>

          <div className="mt-6 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-2">
            {equationSteps.map((step, index) => (
              <div key={step.label} className="contents">
                <div className="min-w-0 flex-1 border border-black/10 bg-[#fffaf7] p-5 sm:p-6">
                  <p className="text-[clamp(2.2rem,4.5vw,3.2rem)] font-black leading-none tracking-[-0.05em] text-[#ff7417]">
                    {step.value}
                  </p>
                  <p className="mt-3 text-lg font-black tracking-[-0.02em] text-black sm:text-xl">
                    {step.label}
                  </p>
                  <p className="mt-2 text-base font-medium leading-relaxed text-black/50">
                    {step.detail}
                  </p>
                </div>
                {index === 0 && (
                  <>
                    <div className="flex justify-center lg:hidden">
                      <MultiplyGlyph />
                    </div>
                    <div className="hidden lg:block">
                      <MultiplyGlyph />
                    </div>
                  </>
                )}
              </div>
            ))}

            <div className="flex justify-center lg:hidden">
              <EqualsGlyph />
            </div>
            <div className="hidden lg:block">
              <EqualsGlyph />
            </div>

            <div className="min-w-0 flex-1 border-2 border-black bg-[#1a1a1a] p-5 text-white sm:p-6">
              <p className="text-[clamp(2.2rem,4.5vw,3.2rem)] font-black leading-none tracking-[-0.05em] text-[#ff7417]">
                $80M
              </p>
              <p className="mt-3 text-lg font-black tracking-[-0.02em] sm:text-xl">
                SAM
              </p>
              <p className="mt-2 text-base font-medium leading-relaxed text-white/50">
                10,000 × $8K = serviceable market with today&apos;s product.
              </p>
            </div>
          </div>
        </div>

        {/* Expansion funnel SOM → SAM → TAM */}
        <div className="mt-8 border-2 border-black bg-[#fffaf7] p-5 sm:p-8">
          <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.22em] text-[#bf4f08]">
            Expansion path
          </p>
          <p className="mt-2 text-xl font-black tracking-[-0.02em] text-black sm:text-2xl">
            Beachhead → reachable market → category
          </p>

          <div className="mt-8 flex flex-col items-center gap-0">
            {marketLayers.map((layer, index) => (
              <div key={layer.tier} className="flex w-full flex-col items-center">
                <div
                  className={`${layer.width} border-2 border-black px-5 py-5 sm:px-8 sm:py-6 ${
                    layer.tone === "orange"
                      ? "bg-[#ff7417] text-white"
                      : layer.tone === "dark"
                        ? "bg-[#1a1a1a] text-white"
                        : "bg-[#c6d99b] text-[#20311d]"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p
                        className={`text-[0.8rem] font-extrabold uppercase tracking-[0.2em] ${
                          layer.tone === "orange"
                            ? "text-white/75"
                            : layer.tone === "dark"
                              ? "text-[#ff7417]"
                              : "text-[#20311d]/65"
                        }`}
                      >
                        {layer.tier}
                      </p>
                      <p className="mt-2 text-[clamp(2.4rem,5vw,3.6rem)] font-black leading-none tracking-[-0.06em]">
                        {layer.value}
                      </p>
                      <p
                        className={`mt-2 text-lg font-extrabold ${
                          layer.tone === "green" ? "text-[#20311d]/80" : "text-white/80"
                        }`}
                      >
                        {layer.subtitle}
                      </p>
                    </div>
                    <p
                      className={`max-w-md text-base font-medium leading-relaxed sm:text-right sm:text-lg ${
                        layer.tone === "orange"
                          ? "text-white/75"
                          : layer.tone === "dark"
                            ? "text-white/55"
                            : "text-[#20311d]/70"
                      }`}
                    >
                      {layer.detail}
                    </p>
                  </div>
                </div>

                {index < marketLayers.length - 1 && (
                  <div className="relative z-10 flex flex-col items-center py-2">
                    <svg className="h-10 w-8 text-[#ff7417]" viewBox="0 0 32 40" fill="none" aria-hidden="true">
                      <path
                        d="M16 2v28M6 22l10 12 10-12"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="square"
                        strokeLinejoin="miter"
                      />
                    </svg>
                    <span className="mt-1 text-[0.7rem] font-extrabold uppercase tracking-[0.18em] text-[#bf4f08]">
                      {marketLayers[index + 1]?.tier === "SAM"
                        ? "Expand sales coverage"
                        : "Move upmarket + talent intel"}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Growth path with arrows */}
        <div className="mt-8 border border-black/12 bg-white p-5 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.22em] text-[#bf4f08]">
                Expected growth
              </p>
              <p className="mt-2 text-xl font-black tracking-[-0.02em] text-black sm:text-2xl">
                Conservative ramp to $6M SOM
              </p>
            </div>
            <p className="max-w-md text-base font-medium text-black/50 sm:text-right">
              Assumes ~$8K ACV and steady expansion from community-led inbound.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-0">
            {growthPath.map((row, index) => (
              <div key={row.year} className="flex min-w-0 flex-1 flex-col lg:flex-row lg:items-center">
                <div className="w-full border border-black/10 bg-[#fffaf7] px-4 py-5 sm:px-5 sm:py-6">
                  <p className="text-[0.8rem] font-extrabold uppercase tracking-[0.18em] text-black/35">
                    {row.year}
                  </p>
                  <p className="mt-3 text-[clamp(1.8rem,3.5vw,2.5rem)] font-black leading-none tracking-[-0.05em] text-black">
                    {row.arr}
                  </p>
                  <p className="mt-3 text-base font-semibold text-black/55">
                    {row.companies} companies
                  </p>
                </div>
                {index < growthPath.length - 1 && (
                  <div className="flex justify-center py-1 lg:py-0">
                    <FlowArrow />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </SlideShell>

      {/* 7. Vision */}
      <SlideShell number="07" label="Vision" dark>
        <div className="mx-auto max-w-5xl text-center">
          <img
            src="/logo.png"
            alt=""
            className="mx-auto h-14 w-14 object-contain brightness-0 invert sm:h-16 sm:w-16"
          />
          <h2 className="mt-10 max-w-6xl font-black text-white" style={slideTitleStyle}>
            Stop hiring
            <br />
            from resumes.
          </h2>
          <p className="mx-auto mt-8 max-w-3xl text-[clamp(1.3rem,2.4vw,1.7rem)] font-medium leading-relaxed text-white/65">
            Today, DevLabs helps startups find builders who can actually ship.
          </p>

          <div className="mx-auto mt-14 grid max-w-4xl gap-4 text-left sm:grid-cols-2">
            <div className="border border-white/12 bg-white/[0.04] p-7 sm:p-8">
              <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.2em] text-white/35">
                LinkedIn
              </p>
              <p className="mt-4 text-2xl font-semibold leading-snug tracking-[-0.02em] text-white/75 sm:text-[1.65rem]">
                Tells companies where someone has been.
              </p>
            </div>
            <div className="border border-[#ff7417]/50 bg-[#ff7417]/10 p-7 sm:p-8">
              <p className="text-[0.85rem] font-extrabold uppercase tracking-[0.2em] text-[#ff7417]">
                DevLabs
              </p>
              <p className="mt-4 text-2xl font-semibold leading-snug tracking-[-0.02em] text-white sm:text-[1.65rem]">
                Will tell them what that person can do.
              </p>
            </div>
          </div>
        </div>
      </SlideShell>
    </div>
  );
}
