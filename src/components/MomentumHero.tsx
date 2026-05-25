import React, { useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

// Company data with logos, names, and website URLs
const companies = [
  {
    name: "South Park Commons",
    logo: "/sponsors/momentum/spc.png",
    alt: "South Park Commons",
    url: "https://southparkcommons.com",
    className: "h-20 sm:h-28",
  },
  {
    name: "a16z",
    logo: "/sponsors/momentum/a16z.png",
    alt: "a16z",
    url: "https://a16z.com",
    className: "h-16 sm:h-20",
  },
  {
    name: "Antler",
    logo: "/sponsors/momentum/antler.png",
    alt: "Antler",
    url: "https://antler.com",
    className: "h-20 sm:h-28",
  },

  {
    name: "Kickstart",
    logo: "/sponsors/momentum/kickstart.png",
    alt: "Kickstart",
    url: "https://kickstart.com",
    className: "h-24 sm:h-32",
  },
  //stripe
  {
    name: "stripe",
    logo: "/sponsors/momentum/stripe.png",
    alt: "Stripe",
    url: "https://stripe.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "smallest.ai",
    logo: "/sponsors/momentum/smallest_ai.png",
    alt: "Smallest.ai",
    url: "https://smallest.ai",
    className: "h-8 sm:h-10 py-1.5",
  },
  {
    name: "Superhuman Mail",
    logo: "/sponsors/momentum/superhuman.png",
    alt: "Superhuman Mail",
    url: "https://superhuman.com",
    className:
      "h-5 w-auto max-w-[min(11rem,42vw)] object-contain sm:h-6 md:max-w-[12rem]",
  },
  {
    name: "DeepMind",
    logo: "/sponsors/deepmind.png",
    alt: "DeepMind",
    url: "https://deepmind.com",
    className: "h-5 w-auto object-contain sm:h-6",
  },

  //composio, tinyfish, insforge
  {
    name: "Composio",
    logo: "/sponsors/momentum/composio.png",
    alt: "Composio",
    url: "https://composio.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "Tinyfish",
    logo: "/sponsors/momentum/tinyfish.png",
    alt: "Tinyfish",
    url: "https://tinyfish.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "Insforge",
    logo: "/sponsors/momentum/insforge.svg",
    alt: "Insforge",
    url: "https://insforge.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "Mintlify",
    logo: "/sponsors/momentum/mintlify.png",
    alt: "Mintlify",
    url: "https://mintlify.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "Radix",
    logo: "/sponsors/momentum/radix.png",
    alt: "Radix",
    url: "https://startup.tech/",
    className:
      "h-6 w-auto max-w-[min(7rem,36vw)] object-contain sm:h-7 md:max-w-[8rem]",
  },
  {
    name: "Autosend",
    logo: "/sponsors/momentum/autosend.png",
    alt: "Autosend",
    url: "https://autosend.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "Dodo Payments",
    logo: "/sponsors/momentum/dodo_payments.svg",
    alt: "Dodo Payments",
    url: "https://dodopayments.com",
    className: "h-8 sm:h-10",
  },
  {
    name: "supermemory",
    logo: "/sponsors/supermemory.png",
    alt: "supermemory",
    url: "https://supermemory.com",
    className: "h-8 sm:h-10",
  },
  {
    logo: "/sponsors/momentum/brief.png",
    alt: "brief",
    url: "https://briefhq.ai/",
    className: "h-12 sm:h-16",
  },
];

// Inline styles for the marquee animation and custom classes
const marqueeStyles = `
@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
.animate-marquee {
  animation: marquee var(--duration, 35s) linear infinite;
  display: flex;
  width: max-content;
}
.animate-marquee:hover {
  animation-play-state: paused;
}
.animate-marquee,
.animate-marquee-reverse {
  animation-timing-function: linear;
}
@media (prefers-reduced-motion: reduce) {
  .animate-marquee,
  .animate-marquee-reverse {
    animation: none;
  }
}
.group:hover {
  filter: drop-shadow(0 8px 32px rgba(249, 115, 22, 0.15));
}
.group img {
  transition: all 0.5s ease;
}
.group:hover img {
  transform: scale(1.1);
}
.glow-text-sm {
  text-shadow: 0 0 10px rgba(255, 153, 0, 0.3);
}
`;

function CompanyMarquee() {
  return (
    <div className="w-full  relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-orange-500/3 to-transparent pointer-events-none" />
      <p className="w-screen text-center text-black text-xs font-semibold tracking-[0.2em] uppercase mb-2 glow-text-sm ">
        program supported by
      </p>

      <div className="relative w-full overflow-hidden mt-4 md:mt-14">
        {/* Black strip behind the marquee logos, full width, no horizontal padding */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 sm:h-20 bg-black z-0" />

        <div
          className="flex animate-marquee relative z-10"
          style={{ ["--duration" as string]: "35s" }}
        >
          {companies.map((company, idx) => (
            <a
              key={`${company.name}_1_${idx}`}
              href={company.url}
              target="_blank"
              rel="noopener noreferrer"
              className=" flex items-center justify-center mx-10 min-w-[120px] group flex-shrink-0 cursor-pointer relative"
              title={`Visit ${company.name}`}
            >
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] -z-10 opacity-30 pointer-events-none"></div>
              <img
                src={company.logo}
                alt={company.alt}
                className={`${company.className || "h-20"} w-auto transition-all duration-500 hover:scale-110  relative z-10`}
                loading="lazy"
              />
            </a>
          ))}
          {companies.map((company, idx) => (
            <a
              key={`${company.name}_2_${idx}`}
              href={company.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center mx-10 min-w-[120px] group flex-shrink-0 cursor-pointer relative"
              title={`Visit ${company.name}`}
            >
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[180%] h-[180%] -z-10 opacity-30 pointer-events-none">
                <div className="w-full h-full rounded-full bg-[radial-gradient(closest-side,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_100%)] blur-xl"></div>
              </div>
              <img
                src={company.logo}
                alt={company.alt}
                className={`${company.className || "h-20"} w-auto transition-all duration-500 hover:scale-110 relative z-10`}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      </div>
      <style>{marqueeStyles}</style>
    </div>
  );
}

export default function MomentumHero() {
  const { scrollY } = useScroll();
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/remind-me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message || "Reminder set! We'll email you on the 25th.");
        setEmail("");
        setShowInput(false);
      } else {
        alert(data.message || "Something went wrong. Please try again.");
      }
    } catch (error) {
      console.error(error);
      alert("Error sending reminder.");
    } finally {
      setLoading(false);
    }
  };

  // Parallax effects
  // Background moves up (negative y) as we scroll down
  const yBg = useTransform(scrollY, [0, 1000], [0, -200]); // Slower background scroll
  const yRocket = useTransform(scrollY, [0, 1000], [100, -850]); // Rocket starts lower and moves UP
  const yClouds = useTransform(scrollY, [0, 1000], [0, -400]); // Clouds move up faster for depth
  const scaleBg = useTransform(scrollY, [0, 1000], [1.1, 1.1]); // Initial scale 1.1, stays scaled

  return (
    <div className="relative min-h-screen bg-[#131415] text-white flex flex-col font-sans overflow-x-hidden">
      {/* Background Image Layer - Z-0 */}
      <motion.div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ y: yBg, scale: scaleBg }}
      >
        <div
          className="w-full h-[200vh] opacity-70"
          style={{
            backgroundImage: "url('/momentum_bg.png')",
            backgroundRepeat: "repeat-y",
            backgroundSize: "cover",
            backgroundPosition: "center top",
          }}
        />
      </motion.div>

      {/* Rocket Layer - Z-20 (Above Title, Below Content) */}
      <motion.div
        className="fixed inset-0  -top-[10vh] md:top-[15vh] z-20 pointer-events-none flex items-center justify-center"
        style={{ y: yRocket }}
      >
        <img
          src="/momentum_rocket.webp"
          alt=""
          className="object-contain w-full h-full scale-[1.3] "
          style={{
            maskImage: "linear-gradient(to bottom, black 60%, transparent 70%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 60%, transparent 70%)",
          }}
        />
      </motion.div>

      {/* Clouds Layer - Z-25 (Above Rocket, Below Content) */}
      <motion.div
        className="fixed -left-1/4  top-[50vh] z-[25] pointer-events-none h-auto w-[140vw]"
        style={{ y: yClouds }}
      >
        <img
          src="/clouds.webp"
          alt=""
          className="object-cover w-full h-full sepia saturate-[3] hue-rotate-[-15deg] scale-[2] md:scale-100 "
          // For Tailwind, use responsive utilities: scale-200 on mobile, default/above sm is scale-100
        />
      </motion.div>

      {/* Main Content - No z-index on container to allow interleaving */}
      <main className="relative flex flex-col min-h-screen w-full">
        {/* Mobile Date & Location - top center below navbar */}
        <div className="md:hidden relative z-30 w-full flex justify-center pt-[15vh]">
          <p className="font-seasons text-sm tracking-wide text-white text-center">
            SAN FRANCISCO • APRIL 16 &amp; 17
          </p>
        </div>

        {/* Centered Content */}
        <div className="flex-grow flex flex-col items-center justify-center text-center px-4 pt-[10vh] md:pt-[25vh] pb-12 w-full max-w-[1400px] mx-auto">
          {/* Logo - Z-30 (Above Rocket) */}
          <div className="relative z-30">
            <img
              src="/logo.svg"
              alt="Devlabs Logo"
              className="w-12 h-12 sm:w-16 sm:h-16 mb-6 opacity-90 grayscale brightness-0 invert "
            />
          </div>

          {/* Title Container - No z-index to allow interleaving */}
          <div className="relative inline-block mb-12">
            {/* Filled Text - Z-10 (Below Rocket) */}
            <h1 className="relative z-10 font-seasons text-6xl sm:text-7xl md:text-9xl lg:text-[10rem] leading-none text-white">
              Momentum
            </h1>

            {/* Outline Text - Z-30 (Above Rocket) */}
            <h1
              className="absolute inset-0 z-30 font-seasons text-6xl sm:text-7xl md:text-9xl lg:text-[10rem] leading-none text-transparent pointer-events-none"
              style={{ WebkitTextStroke: "2px rgba(255, 255, 255, 0.8)" }}
            >
              Momentum
            </h1>

            <p className="absolute z-30 right-0 sm:right-4 font-seasons text-sm sm:text-xl md:text-2xl text-black/80 opacity-90">
              by Devlabs
            </p>
          </div>

          {/* Quote - Z-30 (Above Rocket) */}
          <p className="relative z-30 font-seasons text-base sm:text-lg md:text-xl lg:text-2xl text-white/80 mb-8 tracking-wide ">
            "dont wait for the future, build it"
          </p>

          {/* CTA - Z-30 (Above Rocket) */}
          <div className="relative z-30 mb-12 flex min-h-14 flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="/momentum/apply"
              className="group relative inline-flex items-center justify-center px-8 py-3 sm:px-10 sm:py-4
                          bg-gradient-to-br from-white/10 via-white/5 to-transparent
                          backdrop-blur-lg border border-white/20 
                          text-white/90 font-medium text-sm sm:text-lg rounded-full
                          transition-all duration-500  
                          shadow-[0_8px_32px_rgba(255,255,255,0.1)] 
                          hover:shadow-[0_16px_48px_rgba(255,255,255,0.2)]
                          hover:border-white/30 hover:bg-gradient-to-br hover:from-white/20 hover:via-white/10 hover:to-white/5"
            >
              <span className="relative z-10 drop-shadow-sm lowercase">
                apply now
              </span>
            </a>
          </div>

          {/* Bottom Info Row - Z-30 (Above Rocket) */}
          <div className="hidden md:flex relative z-30 w-full  flex-col md:flex-row justify-between items-top md:items-top   gap-8 mt-4 md:mt-8">
            <div className="text-center md:text-left">
              <p className="font-seasons text-xl sm:text-2xl md:text-3xl text-black/80 tracking-wide uppercase">
                APRIL 24 - MAY 23 | SAN FRANCISCO
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end font-seasons max-w-md text-right ">
              <p className="font-seasons text-xl sm:text-2xl md:text-3xl text-black/80 tracking-wide ">
                upto $10k in credits
              </p>
              <p className="text-black/80 text-xs sm:text-base font-seasons tracking-wide leading-relaxed ">
                every startup gets a credit bundle from stripe, composio,
                tinyfish, smallest.ai and more
              </p>
            </div>
          </div>
        </div>
        <div className="relative z-30 w-full pb-8 sm:pb-12 overflow-visible flex flex-col">
          {/* Company marquee on top */}
          <div className="absolute top-5 md:top-20 z-20 flex-shrink-0">
            <CompanyMarquee />
          </div>
          {/* Momentum watermark – full text visible, not scrollable */}
          <div className="top-0 relative z-10 flex flex-col items-center justify-center overflow-visible pointer-events-none w-full">
            <h2 className="leading-none font-seasons italic text-[12rem] sm:text-[18rem] md:text-[25rem] text-black-500 opacity-[0.55] whitespace-nowrap text-center text-orange-500/80 select-none">
              momentum
            </h2>
          </div>
          {/* Mobile credit bundle below watermark */}
          <div className="md:hidden relative z-30 mt-10 flex flex-col items-center justify-center pointer-events-auto px-4 text-center">
            <p className="font-seasons text-2xl sm:text-2xl md:text-3xl text-black/80 tracking-wide ">
              up to $10k in credits
            </p>
            <p className="text-black/80 text-xs sm:text-base font-seasons tracking-wide leading-relaxed ">
              every startup gets a credit bundle from stripe, composio,
              tinyfish, smallest.ai and more
            </p>
          </div>
        </div>

        {/* White Tint Background starting from here to bottom */}
        <div className="absolute left-0 right-0 bottom-0 top-[80vh] bg-gradient-to-b from-transparent via-[#fdfdfd] to-[#fdfdfd] z-[26] pointer-events-none"></div>

        {/* Program Description Section */}
        <div className="relative z-30 w-full flex flex-col items-center justify-center px-4 py-24 md:py-32 mt-10 md:mt-20">
          {/* Star left */}
          <div
            className="hidden md:block absolute z-0 w-[min(90vw,520px)] aspect-square -translate-x-[45%] left-0 pointer-events-none opacity-[0.15]"
            style={{ top: "15%" }}
            aria-hidden="true"
          >
            <div
              className="w-full h-full bg-orange-500"
              style={{
                maskImage: "url(/star.svg)",
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
                WebkitMaskImage: "url(/star.svg)",
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
              }}
            />
          </div>

          {/* Star right */}
          <div
            className="hidden md:block absolute z-0 w-16 h-16 md:w-20 md:h-20 right-[6%] pointer-events-none opacity-[0.35]"
            style={{ top: "10%" }}
            aria-hidden="true"
          >
            <div
              className="w-full h-full bg-orange-500"
              style={{
                maskImage: "url(/star.svg)",
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
                WebkitMaskImage: "url(/star.svg)",
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
              }}
            />
          </div>

          {/* Toggle */}
          <div className="relative z-10 flex items-center bg-black/5 rounded-full p-1 mb-10 border border-black/10 backdrop-blur-md">
            <div className="px-6 py-2 rounded-full bg-white text-black text-sm font-medium shadow-sm border border-black/5">
              Program Details
            </div>
          </div>

          {/* Main Description */}
          <div className="relative z-10 max-w-4xl text-center px-4 flex flex-col gap-6 md:gap-10">
            <p className="font-seasons text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-relaxed text-black/90">
              Momentum is a 4-week{" "}
              <span className="  text-orange-500">virtual program</span> for
              early founders. Whether you're building software, hardware, or
              robots — there's a place for all.
            </p>
            <p className="font-seasons text-xl sm:text-2xl md:text-3xl lg:text-4xl leading-relaxed text-black/80">
              Every week we work on 1 checkpoint together, meet tech founders,
              and meet partners from VCs. And on Fridays, we share progress.
            </p>
            <p className="font-seasons text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-relaxed text-black/90">
              The top 25 startups at week 4 fly to SF for an{" "}
              <span className="  text-orange-500">in-person demo day</span>{" "}
              attended by a16z, Kickstart, SPC, Antler, etc.
            </p>
          </div>

          {/* Credits Info */}
          <p className="relative z-10 mt-12 text-black/60 text-sm md:text-base font-sans tracking-wide text-center max-w-2xl px-4">
            Giving away $10k credit bundle to each team from{" "}
            <span className="font-semibold text-black/80">
              smallest.ai, Composio, Stripe, Insforge, Autosend
            </span>{" "}
            and more...
          </p>

          {/* CTA Button */}
          <a
            href="/momentum/apply"
            className="relative z-10 mt-10 px-8 py-3 rounded-full bg-black border border-black/20 text-white text-sm hover:bg-black/80 transition-colors shadow-lg"
          >
            Apply for the program
          </a>
        </div>

        {/* Large Background Text Overlay - Z-30 (Above Rocket) */}
      </main>
    </div>
  );
}
