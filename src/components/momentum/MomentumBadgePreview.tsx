import React from "react";
import { MomentumBadge } from "./MomentumBadge";
import type { MomentumApplicationRecord, MomentumGroup } from "./types";

const MOCKS: { group: MomentumGroup; firstName: string; lastName: string; startup: string }[] = [
  { group: "Inertia", firstName: "Ada", lastName: "Lovelace", startup: "Difference Engine Co." },
  { group: "Velocity", firstName: "Grace", lastName: "Hopper", startup: "Nanosecond Labs" },
  { group: "Flux", firstName: "Nikola", lastName: "Tesla", startup: "Wardenclyffe" },
  { group: "Gravity", firstName: "Katherine", lastName: "Johnson", startup: "Hidden Figures AI" },
];

function mock(
  group: MomentumGroup,
  firstName: string,
  lastName: string,
  startupName: string,
): MomentumApplicationRecord {
  return {
    _id: `preview-${group}-${firstName}-${lastName}`,
    userId: `u-${group}`,
    status: "approved",
    group,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@momentum.build`,
    phone: "",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    startupName,
    startupAge: "Pre-seed",
    founderType: "full_time_founder",
    startupDomain: "AI / Tools",
    hasCoFounder: false,
    numCoFounders: 0,
    coFounderDetails: "",
    description: "",
    accomplishments: "",
    adjectives: "",
    websiteOrGithub: "",
    demoVideo: "",
    linkedin: "",
    twitter: "",
    pitchDeck: "",
    keyMetrics: "",
    hasRevenue: false,
    isIncorporated: false,
    hasRaisedMoney: false,
    lookingToFundraise: false,
    heardAboutUs: "",
    createdAt: "2026-04-24T10:30:00-07:00",
  } as unknown as MomentumApplicationRecord;
}

export default function MomentumBadgePreview() {
  return (
    <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
      {MOCKS.map((m) => (
        <div key={m.group} className="flex flex-col items-center gap-3">
          <div className="relative h-[640px] w-full max-w-[360px]">
            <MomentumBadge application={mock(m.group, m.firstName, m.lastName, m.startup)} />
          </div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/45">Team {m.group}</p>
        </div>
      ))}
    </div>
  );
}
