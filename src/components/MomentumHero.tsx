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
    name: "Residency",
    logo: "/sponsors/momentum/residency.png",
    alt: "Residency",
    url: "https://residency.com",
    className: "h-24 sm:h-32",
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

// March 19th, 2025 9:30 AM MST (MST = UTC-7)
const TARGET_DATE = "2026-03-19T09:30:00-07:00";

interface CountdownTimerProps {
  deadline: string;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(deadline).getTime();
      const difference = target - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor(
            (difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
          ),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  return (
    <div className="text-2xl md:text-3xl lg:text-4xl ">
      <div className="flex gap-2 md:gap-3">
        <div className="text-center">
          <div className="text-orange-500 font-sans font-bold">
            {timeLeft.days}
          </div>
          <div className="text-xs md:text-sm font-bold  text-black font-seasons">
            Days
          </div>
        </div>
        <div className="text-orange-500 font-sans ">:</div>
        <div className="text-center">
          <div className="text-orange-500 font-sans font-bold">
            {timeLeft.hours.toString().padStart(2, "0")}
          </div>
          <div className="text-xs md:text-sm font-bold  text-black font-seasons">
            Hours
          </div>
        </div>
        <div className="text-orange-500 font-sans">:</div>
        <div className="text-center">
          <div className="text-orange-500 font-sans font-bold">
            {timeLeft.minutes.toString().padStart(2, "0")}
          </div>
          <div className="text-xs md:text-sm font-bold  text-black font-seasons">
            Mins
          </div>
        </div>
        <div className="text-orange-500 font-sans">:</div>
        <div className="text-center">
          <div className="text-orange-500 font-sans font-bold">
            {timeLeft.seconds.toString().padStart(2, "0")}
          </div>
          <div className="text-xs md:text-sm font-bold  text-black font-seasons">
            Secs
          </div>
        </div>
      </div>
    </div>
  );
};

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
        alert(data.message || "Reminder set! We'll email you on the 19th.");
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
          src="/momentum_rocket.png"
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
          src="/clouds.png"
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

          {/* Title - Z-10 (Below Rocket) */}
          <div className="relative inline-block mb-12 z-10">
            <h1 className="font-seasons text-6xl sm:text-7xl md:text-9xl lg:text-[10rem] leading-none text-white ">
              Momentum
            </h1>
            <p className="absolute   right-0 sm:right-4 font-seasons text-sm sm:text-xl md:text-2xl text-black/80 opacity-90">
              by Devlabs
            </p>
          </div>

          {/* Quote - Z-30 (Above Rocket) */}
          <p className="relative z-30 font-seasons text-base sm:text-lg md:text-xl lg:text-2xl text-white/80 mb-8 tracking-wide ">
            "dont wait for the future, build it"
          </p>

          {/* Button - Z-30 (Above Rocket) */}
          <div className="relative z-30 mb-12 h-14 flex items-center justify-center">
            {!showInput ? (
              <button
                onClick={() => setShowInput(true)}
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
                  remind me
                </span>
              </button>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 animate-in fade-in zoom-in duration-300"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="enter your email"
                  required
                  className="px-6 py-3 sm:px-8 sm:py-4 w-64 sm:w-80
                            bg-white/5 backdrop-blur-lg border border-white/20 
                            text-white placeholder:text-white/50 font-medium text-sm sm:text-lg rounded-full
                            focus:outline-none focus:border-white/40 focus:bg-white/10
                            transition-all duration-300"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full
                            bg-gradient-to-br from-white/10 via-white/5 to-transparent
                            backdrop-blur-lg border border-white/20 
                            text-white/90 transition-all duration-500
                            shadow-[0_8px_32px_rgba(255,255,255,0.1)] 
                            hover:shadow-[0_16px_48px_rgba(255,255,255,0.2)]
                            hover:border-white/30 hover:bg-gradient-to-br hover:from-white/20 hover:via-white/10 hover:to-white/5
                            disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-5 h-5 sm:w-6 sm:h-6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                      />
                    </svg>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Bottom Info Row - Z-30 (Above Rocket) */}
          <div className="hidden md:flex relative z-30 w-full  flex-col md:flex-row justify-between items-center md:items-end   gap-8 mt-4 md:mt-8">
            <div className="text-center md:text-left">
              <p className="font-seasons text-xl sm:text-2xl md:text-3xl text-black/80 tracking-wide uppercase">
                APRIL 17 - MAY 16 | SAN FRANCISCO
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end font-seasons">
              <p className="text-black/80 text-sm sm:text-base mb-3 font-seasons tracking-wide">
                Applications open in
              </p>
              <CountdownTimer deadline={TARGET_DATE} />
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
          {/* Mobile countdown below watermark */}
          <div className="md:hidden relative z-30 mt-10 flex flex-col items-center justify-center pointer-events-auto">
            <p className=" text-black md:text-white/80 text-sm mb-2 font-seasons tracking-wide font-bold">
              Applications open in
            </p>
            <CountdownTimer deadline={TARGET_DATE} />
          </div>
        </div>

        {/* Large Background Text Overlay - Z-30 (Above Rocket) */}
      </main>
    </div>
  );
}
