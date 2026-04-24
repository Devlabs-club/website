import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { CanvasRevealEffect } from "@/components/ui/canvas-reveal-effect";
import { cn } from "@/lib/utils";

export const Icon = ({ className, ...rest }: any) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={className}
      {...rest}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
    </svg>
  );
};

interface CanvasRevealBadgeCardProps {
  imagePath?: string;
  group?: "Velocity" | "Inertia" | "Flux" | "Gravity";
  firstName?: string;
  lastName?: string;
  startupName?: string;
}

export function CanvasRevealBadgeCard({
  imagePath,
  group,
  firstName,
  lastName,
  startupName,
}: CanvasRevealBadgeCardProps) {
  const colors = useMemo(() => {
    switch (group) {
      case "Velocity":
        return [[249, 115, 22]]; // Orange
      case "Inertia":
        return [[249, 115, 22]]; // Blue
      case "Flux":
        return [[249, 115, 22]]; // Green
      case "Gravity":
        return [[249, 115, 22]]; // Purple
      default:
        return [[249, 115, 22]]; // White fallback
    }
  }, [group]);

  const groupName = group || "Unassigned";

  /** Design artboard: width × height; container always keeps this exact ratio. */
  const ASPECT = "597 / 900" as const;

  const nameOverlay = useMemo(() => {
    // Flux: name and startup in the top header band; startup line indented, tight lead.
    // Other groups: lower left, clear of "Class of 26" (batch) on the artboard.
    const isFlux = group === "Flux";
    return {
      isFlux,
      position: "left-[7%] right-[31%] bottom-[10%] items-start",
      nameClass: "text-[1.72rem] leading-tight tracking-tight m-0",
      startupClass:
        "mt-0.5 pl-0 text-[0.62rem] leading-tight sm:text-[0.65rem] tracking-tight opacity-90",
    };
  }, [group]);

  return (
    <div
      className="relative box-border w-full max-w-[300px] shrink-0 bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/20 group"
      style={{ aspectRatio: ASPECT }}
    >
      <Icon className="absolute h-6 w-6 -top-3 -left-3 text-white/50" />
      <Icon className="absolute h-6 w-6 -bottom-3 -left-3 text-white/50" />
      <Icon className="absolute h-6 w-6 -top-3 -right-3 text-white/50" />
      <Icon className="absolute h-6 w-6 -bottom-3 -right-3 text-white/50" />

      {/* Badge Image (Z-index 0) */}
      <div className="absolute inset-0 z-0 p-4">
        {imagePath ? (
          <div className="relative h-full w-full rounded-2xl overflow-hidden">
            <img
              src={imagePath}
              alt="Badge"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-full w-full rounded-2xl border border-dashed border-white/20 bg-white/5 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50 z-0" />
            <div className="relative z-10 flex flex-col items-center">
              <h3 className="text-lg font-seasons text-white sm:text-xl mb-1">
                Momentum
              </h3>
              <div className="px-2.5 py-0.5 rounded-full border border-white/20 bg-white/10 text-[0.6rem] font-medium uppercase tracking-widest text-white/80 sm:text-[0.65rem] mb-4">
                {groupName}
              </div>
              {!group && (
                <p className="text-sm text-white/60 max-w-[200px]">
                  Your badge will appear here once a group is assigned.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Canvas Reveal Effect (Z-index 10) */}
      <motion.div
        className="absolute inset-0 z-10 pointer-events-none"
        initial={{ "--hole-size": "0%" } as any}
        animate={{ "--hole-size": "150%" } as any}
        transition={{ delay: 1.2, duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
        style={{
          maskImage:
            "radial-gradient(circle at center, transparent var(--hole-size), black calc(var(--hole-size) + 1%))",
          WebkitMaskImage:
            "radial-gradient(circle at center, transparent var(--hole-size), black calc(var(--hole-size) + 1%))",
        }}
      >
        <CanvasRevealEffect
          animationSpeed={3}
          colors={colors}
          dotSize={2}
          containerClassName="h-full w-full bg-black"
        />
      </motion.div>

      {imagePath && (firstName || startupName) && (
        <div
          className="pointer-events-none absolute inset-4 z-20 rounded-2xl"
          aria-hidden
        >
          <div
            className={cn(
              "font-seasons absolute flex flex-col text-[#1a1a1a]",
              nameOverlay.position,
            )}
          >
            {(firstName || lastName) && (
              <h2 className={nameOverlay.nameClass}>
                {firstName}
                {lastName ? ` ${lastName.charAt(0)}` : ""}
              </h2>
            )}
            {startupName && (
              <p className={nameOverlay.startupClass}>{startupName}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
