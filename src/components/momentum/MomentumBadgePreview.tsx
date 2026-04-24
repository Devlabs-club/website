import React from "react";
import { CanvasRevealBadgeCard } from "@/components/CanvasRevealBadgeCard";
import type { MomentumGroup } from "./types";

const MOCKS: { group: MomentumGroup; firstName: string; lastName: string; startup: string }[] = [
  { group: "Inertia", firstName: "Ada", lastName: "Lovelace", startup: "Difference Engine Co." },
  { group: "Velocity", firstName: "Grace", lastName: "Hopper", startup: "Nanosecond Labs" },
  { group: "Flux", firstName: "Nikola", lastName: "Tesla", startup: "Wardenclyffe" },
  { group: "Gravity", firstName: "Katherine", lastName: "Johnson", startup: "Hidden Figures AI" },
];

export default function MomentumBadgePreview() {
  return (
    <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
      {MOCKS.map((m) => (
        <div key={m.group} className="flex flex-col items-center gap-3">
          <div className="relative w-full max-w-[300px]">
            <CanvasRevealBadgeCard
              group={m.group}
              imagePath={`/badges/${m.group.toLowerCase()}.png`}
              firstName={m.firstName}
              lastName={m.lastName}
              startupName={m.startup}
            />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Team {m.group}</p>
        </div>
      ))}
    </div>
  );
}
