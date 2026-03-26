import React from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  Mail,
  MapPin,
  Rocket,
  Sparkles,
  XCircle,
} from "lucide-react";
import type {
  MomentumApplicationRecord,
  MomentumApplicationStatus,
} from "./types";

function StatusBanner({ status }: { status: MomentumApplicationStatus }) {
  const config = {
    pending: {
      icon: Clock,
      title: "Under review",
      subtitle:
        "We’re reading your application. You’ll see your status update here.",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    },
    approved: {
      icon: CheckCircle2,
      title: "Approved",
      subtitle: "Welcome to Momentum — we’re thrilled to have you.",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    },
    rejected: {
      icon: XCircle,
      title: "Not accepted this cycle",
      subtitle:
        "Thank you for applying. We’re rooting for you — keep building.",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-100",
    },
  }[status];

  const Icon = config.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl border px-6 py-8 ${config.className}`}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/30">
          <Icon className="h-7 w-7" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
            Application status
          </p>
          <h2 className="font-seasons text-2xl sm:text-3xl">{config.title}</h2>
          <p className="mt-1 max-w-xl text-sm opacity-90">{config.subtitle}</p>
        </div>
      </div>
    </motion.div>
  );
}

function DetailCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
    >
      <div className="mb-4 flex items-center gap-2 text-white/90">
        <Icon className="h-4 w-4 text-orange-400" />
        <h3 className="font-seasons text-lg">{title}</h3>
      </div>
      <div className="space-y-3 text-sm text-white/70">{children}</div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
        {label}
      </span>
      <span className="text-white/85">{value || "—"}</span>
    </div>
  );
}

function yesNo(v: boolean) {
  return v ? "Yes" : "No";
}

function linkOrDash(url: string) {
  if (!url?.trim()) return "—";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-orange-400 underline decoration-orange-500/40 underline-offset-2 hover:text-orange-300"
    >
      {url.replace(/^https?:\/\//, "")}
    </a>
  );
}

export default function MomentumUserDashboard({
  application,
}: {
  application: MomentumApplicationRecord;
}) {
  const submitted = application.createdAt
    ? new Date(application.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-orange-300">
          <Sparkles className="h-3.5 w-3.5" />
          Your application
        </p>
        <h1 className="font-seasons text-3xl text-white sm:text-4xl md:text-5xl">
          Momentum
        </h1>
        <p className="mt-2 text-sm text-white/50 text-bold">
          don't wait for the future, build it now.
        </p>
      </div>

      <StatusBanner status={application.status} />

      <div className="grid gap-6 md:grid-cols-2">
        <DetailCard title="Contact" icon={Mail}>
          <Row
            label="Name"
            value={`${application.firstName} ${application.lastName}`}
          />
          <Row label="Email" value={application.email} />
          <Row label="Phone" value={application.phone} />
          <Row
            label="Location"
            value={`${application.city}, ${application.state} · ${application.country}`}
          />
        </DetailCard>

        <DetailCard title="Startup" icon={Building2}>
          <Row label="Name" value={application.startupName} />
          <Row label="Age" value={application.startupAge} />
          <Row
            label="You are"
            value={application.founderType.replace(/_/g, " ")}
          />
          <Row label="Domain" value={application.startupDomain} />
          <Row label="Co-founder" value={yesNo(application.hasCoFounder)} />
          {application.hasCoFounder && (
            <>
              <Row
                label="# Co-founders"
                value={String(application.numCoFounders)}
              />
              <Row
                label="Co-founder details"
                value={application.coFounderDetails}
              />
            </>
          )}
        </DetailCard>

        <DetailCard title="Story" icon={Rocket}>
          <Row label="What you’re building" value={application.description} />
          <Row label="Accomplishments" value={application.accomplishments} />
          <Row label="Three adjectives" value={application.adjectives} />
        </DetailCard>

        <DetailCard title="Links & deck" icon={Globe2}>
          <Row
            label="Website / GitHub"
            value={linkOrDash(application.websiteOrGithub)}
          />
          <Row label="Demo video" value={linkOrDash(application.demoVideo)} />
          <Row label="LinkedIn" value={linkOrDash(application.linkedin)} />
          <Row label="X" value={linkOrDash(application.twitter)} />
          <Row label="Pitch deck" value={linkOrDash(application.pitchDeck)} />
          <Row label="Traction metrics" value={application.keyMetrics || "—"} />
        </DetailCard>

        <DetailCard title="Traction" icon={MapPin}>
          <Row label="Revenue" value={yesNo(application.hasRevenue)} />
          <Row label="Incorporated" value={yesNo(application.isIncorporated)} />
          <Row
            label="Raised capital"
            value={yesNo(application.hasRaisedMoney)}
          />
          <Row
            label="Fundraise / accelerator"
            value={yesNo(application.lookingToFundraise)}
          />
          <Row label="Heard about us" value={application.heardAboutUs} />
        </DetailCard>

        <DetailCard title="Meta" icon={Calendar}>
          <Row label="Submitted" value={submitted} />
          <Row label="Application ID" value={String(application._id)} />
        </DetailCard>
      </div>
    </div>
  );
}
