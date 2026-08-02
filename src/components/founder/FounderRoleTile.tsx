import React from "react";
import {
  ArrowRight,
  Briefcase,
  Clock,
  Loader2,
  MapPin,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

export type FounderRoleTileData = {
  id: string;
  title?: string;
  roleTitle?: string;
  company?: string | null;
  status?: string;
  skillsNeeded?: string[];
  createdAt?: string;
  updatedAt?: string;
  lastSearchAt?: string | null;
  jobType?: string | null;
  workType?: string | null;
  workMode?: string | null;
  location?: string | null;
  locationPreference?: string | null;
  salary?: string | null;
  budget?: string | null;
  recommendationLimit?: number | null;
  strongMatchCount?: number;
  statusPresentation?: {
    label: string;
    tone: "neutral" | "active" | "success";
  };
  pipeline?: {
    recommended: number;
    strongMatches?: number;
    contacted: number;
    accepted: number;
    trial: number;
    hired: number;
  };
};

function formatRelativeTime(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusClasses(tone: "neutral" | "active" | "success" = "neutral") {
  if (tone === "success") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (tone === "active") return "bg-[#fff4ea] text-[#c45f12] ring-[#f6dcc3]";
  return "bg-[#f3ede4] text-black/55 ring-[#ece7e1]";
}

type PipelineStat = {
  key: string;
  label: string;
  value: number;
  highlight?: boolean;
};

function pipelineStats(role: FounderRoleTileData): PipelineStat[] {
  const pipeline = role.pipeline;
  if (!pipeline) return [];
  return [
    { key: "recommended", label: "Recommended", value: pipeline.recommended, highlight: true },
    { key: "contacted", label: "Contacted", value: pipeline.contacted },
    { key: "accepted", label: "Accepted", value: pipeline.accepted },
    { key: "trial", label: "Trial", value: pipeline.trial },
    { key: "hired", label: "Hired", value: pipeline.hired },
  ];
}

export const FounderRoleTile: React.FC<{
  role: FounderRoleTileData;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: (roleId: string) => void;
}> = ({ role, canDelete = false, deleting = false, onDelete }) => {
  const title = role.title || role.roleTitle || "Untitled role";
  const status = role.statusPresentation || { label: "Setting up", tone: "neutral" as const };
  const skills = (role.skillsNeeded || []).slice(0, 4);
  const extraSkills = Math.max((role.skillsNeeded || []).length - skills.length, 0);
  const stats = pipelineStats(role);
  const activeStat = stats.find((stat) => stat.value > 0 && stat.key !== "recommended") || stats[0];
  const updatedLabel = formatRelativeTime(role.lastSearchAt || role.updatedAt || role.createdAt);
  const compensation = role.salary || role.budget;
  const location = role.workMode || role.location || role.locationPreference;
  const limit = role.recommendationLimit;
  const hasSearch = stats.some((stat) => stat.key === "recommended" && stat.value > 0) || Boolean(role.lastSearchAt);

  return (
    <a
      href={`/founder/roles/${role.id}`}
      className="group block rounded-[22px] border border-[#ece7e1] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-[#ec9149]/35 hover:shadow-[0_8px_28px_rgba(236,145,73,0.12)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold tracking-tight text-black">{title}</h3>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusClasses(status.tone)}`}>
              {status.label}
            </span>
          </div>
          {role.company && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-black/50">
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{role.company}</span>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDelete && (
            <button
              type="button"
              disabled={deleting}
              aria-label={`Delete ${title}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete?.(role.id);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </button>
          )}
          <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#ec9149] px-4 text-xs font-bold text-white transition group-hover:bg-[#dd7f36]">
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-black/55">
        {compensation && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#fdfaf7] px-2.5 py-1.5 ring-1 ring-[#ece7e1]">
            {compensation}
          </span>
        )}
        {location && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#fdfaf7] px-2.5 py-1.5 ring-1 ring-[#ece7e1]">
            <MapPin className="h-3 w-3" />
            {location}
          </span>
        )}
        {role.jobType || role.workType ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-[#fdfaf7] px-2.5 py-1.5 ring-1 ring-[#ece7e1]">
            {role.jobType || role.workType}
          </span>
        ) : null}
      </div>

      {skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md bg-[#f3ede4] px-2 py-1 text-[11px] font-semibold text-black/60"
            >
              {skill}
            </span>
          ))}
          {extraSkills > 0 && (
            <span className="rounded-md bg-[#f3ede4] px-2 py-1 text-[11px] font-semibold text-black/45">
              +{extraSkills}
            </span>
          )}
        </div>
      )}

      <div className="mt-5 rounded-2xl bg-[#fdfaf7] p-4 ring-1 ring-[#ece7e1]">
        {hasSearch ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-black">
                <Users className="h-4 w-4 text-[#ec9149]" />
                Builder pipeline
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-black/45">
                {typeof limit === "number" && (
                  <span className="rounded-full bg-white px-2 py-0.5 ring-1 ring-[#ece7e1]">
                    Up to {limit} on your plan
                  </span>
                )}
                {(role.strongMatchCount || 0) > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[#c45f12] ring-1 ring-[#f6dcc3]">
                    <Sparkles className="h-3 w-3" />
                    {role.strongMatchCount} strong {role.strongMatchCount === 1 ? "fit" : "fits"}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {stats.map((stat) => (
                <div
                  key={stat.key}
                  className={`rounded-xl px-3 py-2.5 ${
                    stat.highlight && stat.value > 0
                      ? "bg-white ring-1 ring-[#ec9149]/25"
                      : "bg-white/70 ring-1 ring-[#ece7e1]"
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-black/40">{stat.label}</p>
                  <p className={`mt-1 text-xl font-extrabold tabular-nums ${stat.value > 0 ? "text-black" : "text-black/25"}`}>
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            {activeStat && activeStat.value > 0 && activeStat.key !== "recommended" && (
              <p className="mt-3 text-xs text-black/50">
                Latest activity: <span className="font-semibold text-black/70">{activeStat.value} in {activeStat.label.toLowerCase()}</span>
              </p>
            )}
          </>
        ) : (
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#ec9149] ring-1 ring-[#ece7e1]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-black">Finish your role brief</p>
              <p className="mt-1 text-xs leading-relaxed text-black/50">
                Add a description and preferences, then DevLabs will surface builders matched to this role.
              </p>
            </div>
          </div>
        )}
      </div>

      {updatedLabel && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] font-medium text-black/38">
          <Clock className="h-3 w-3" />
          {role.lastSearchAt ? `Search updated ${updatedLabel}` : `Updated ${updatedLabel}`}
        </p>
      )}
    </a>
  );
};

export default FounderRoleTile;
