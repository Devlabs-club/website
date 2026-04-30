import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  Mail,
  MapPin,
  Rocket,
  Gift,
  XCircle,
  Twitter,
  Send,
  Share2,
  LogOut,
  Lock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth } from "../auth_manager";
import type { MomentumApplicationRecord } from "./types";

import { PartnerCredits } from "./PartnerCredits";
import { CommunityLinks } from "./CommunityLinks";
import {
  MomentumLeaderboardCard,
  MomentumPointsTasksProvider,
  MomentumTaskSubmissionsCard,
} from "./MomentumPointsAndTasks";
import { CanvasRevealBadgeCard } from "../CanvasRevealBadgeCard";
import { isMomentumKickoffRevealed } from "../../lib/momentumKickoff";

function DetailCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
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

function slugForFilename(s: string, maxLen: number) {
  const cleaned = s
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .slice(0, maxLen)
    .toLowerCase();
  return cleaned || "momentum";
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
  const { logout } = useAuth();
  const [tweetUrl, setTweetUrl] = useState("");
  const [driveUrl, setDriveUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submittedLink, setSubmittedLink] = useState<string | null>(null);
  const [submittedLink2, setSubmittedLink2] = useState<string | null>(null);
  const [showRevealHint, setShowRevealHint] = useState(false);
  const [showRevealHint2, setShowRevealHint2] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const badgeCaptureRef = useRef<HTMLDivElement>(null);
  const [isBadgeExporting, setIsBadgeExporting] = useState(false);

  const submitted = application.createdAt
    ? new Date(application.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

  const isRevealed = isMomentumKickoffRevealed();

  useEffect(() => {
    if (application.status !== "approved" || !isRevealed) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/momentum/tasks", {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          submissions?: {
            taskType: string;
            proofLink?: string;
            createdAt?: string;
          }[];
        };
        const list = data.submissions ?? [];
        const latest = list.find((s) => s.taskType === "checkpoint_submission");
        if (latest?.proofLink?.trim() && !cancelled) {
          setSubmittedLink(latest.proofLink.trim());
        }
        const latest2 = list.find((s) => s.taskType === "checkpoint_2_submission");
        if (latest2?.proofLink?.trim() && !cancelled) {
          setSubmittedLink2(latest2.proofLink.trim());
        }
      } catch {
        /* ignore hydrate errors */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [application.status, application._id, isRevealed]);

  const handleShareBadge = useCallback(async () => {
    const el = badgeCaptureRef.current;
    if (!el || !application.group) return;
    setIsBadgeExporting(true);
    try {
      const dataUrl = await toPng(el, {
        quality: 1,
        pixelRatio: 3,
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.closest("[data-export-exclude]");
        },
      });
      const namePart = slugForFilename(
        `${application.firstName}-${application.lastName}`,
        48,
      );
      const startupPart = slugForFilename(application.startupName, 36);
      const link = document.createElement("a");
      link.download = `momentum-badge-${namePart}-${startupPart}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export badge image", err);
    } finally {
      setIsBadgeExporting(false);
    }
  }, [application]);

  const handleSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tweetUrl.trim()) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const res = await fetch("/api/momentum/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "checkpoint_submission",
          proofLink: tweetUrl.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        submission?: { proofLink?: string };
      };
      if (!res.ok) {
        setSubmissionError(data.message || "Submission failed");
        return;
      }
      const link =
        (data.submission?.proofLink && data.submission.proofLink.trim()) ||
        tweetUrl.trim();
      setSubmittedLink(link);
      setTweetUrl("");
    } catch {
      setSubmissionError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmission2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const res = await fetch("/api/momentum/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskType: "checkpoint_2_submission",
          proofLink: driveUrl.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        submission?: { proofLink?: string };
      };
      if (!res.ok) {
        setSubmissionError(data.message || "Submission failed");
        return;
      }
      const link =
        (data.submission?.proofLink && data.submission.proofLink.trim()) ||
        driveUrl.trim();
      setSubmittedLink2(link);
      setDriveUrl("");
    } catch {
      setSubmissionError("Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusConfig = {
    pending: {
      label: "Under review",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      icon: Clock,
    },
    approved: {
      label: "Approved",
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      icon: CheckCircle2,
    },
    rejected: {
      label: "Not accepted",
      className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
      icon: XCircle,
    },
  }[application.status];

  const StatusIcon = statusConfig.icon;

  // Checkpoint 1 deadline: May 1, 2026 11:59 PM MST
  const checkpoint1Deadline = new Date("2026-05-02T06:59:00Z"); // May 1 11:59 PM MST = May 2 06:59 AM UTC
  const isCheckpoint1Locked = new Date() > checkpoint1Deadline;

  // Checkpoint 2 deadline: May 8, 2026 11:59 PM MST
  const checkpoint2Deadline = new Date("2026-05-09T06:59:00Z"); // May 8 11:59 PM MST = May 9 06:59 AM UTC
  const isCheckpoint2Locked = new Date() > checkpoint2Deadline;

  const dashboardGridClass =
    "mt-6 flex flex-col-reverse items-stretch gap-24 lg:mt-24 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr),min(300px,100%)] lg:items-start lg:gap-10 xl:grid-cols-[minmax(0,1fr),320px]";

  const badgeAside = (
    <aside className="mx-auto w-full max-w-[300px] shrink-0 lg:sticky lg:top-24 lg:mx-0 lg:justify-self-end xl:top-28">
      <div className="lg:pl-1">
        <div className="mx-auto w-full max-w-[300px] space-y-3">
          {isRevealed ? (
            <>
            
              <div ref={badgeCaptureRef} className="w-full">
                <CanvasRevealBadgeCard
                  group={application.group || undefined}
                  imagePath={
                    application.group
                      ? `/badges/${application.group.toLowerCase()}.png`
                      : undefined
                  }
                  firstName={application.firstName}
                  lastName={application.lastName}
                  startupName={application.startupName}
                />
              </div>
              {application.status === "approved" && application.group && (
                <button
                  type="button"
                  onClick={() => void handleShareBadge()}
                  disabled={isBadgeExporting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBadgeExporting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  ) : (
                    <Share2 className="h-4 w-4 text-orange-400" />
                  )}
                  Share Badge
                </button>
              )}
              {application.status === "approved" && (
                <MomentumLeaderboardCard className="mt-24 sm:mt-28" />
              )}
            </>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-sm">
              <div className="pointer-events-none absolute inset-0 bg-black/40 backdrop-blur-md" />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <Gift className="h-8 w-8 text-orange-400" />
                <div>
                  <h4 className="font-seasons text-lg text-white sm:text-xl">
                    Badge & leaderboard
                  </h4>
                  <p className="mt-2 text-sm text-white/60">
                    Unlocks at kickoff — same time as partner credits. April 24,
                    2026 at 10:30 AM (PHX time).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="relative mx-auto max-w-6xl space-y-8 px-4 pb-10 sm:px-6">
      <div className="flex justify-end pt-1 sm:absolute sm:top-0 sm:right-6 sm:pt-0">
        <button
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="text-center sm:pt-1">
        <p
          className={`mb-2 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-widest ${statusConfig.className}`}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {statusConfig.label}
        </p>
        <h1 className="font-seasons text-4xl text-white sm:text-5xl md:text-6xl">
          Momentum
        </h1>
        <p className="mt-2 text-sm font-medium text-white/50">
          don't wait for the future, build it now.
        </p>
      </div>

      {application.status === "approved" ? (
        <MomentumPointsTasksProvider
          application={application}
          enablePointsTasksFetch={isRevealed}
        >
          <div className={dashboardGridClass}>
            <div className="min-w-0 space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-black/40 p-6 backdrop-blur-md sm:p-8"
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />

                {!isRevealed ? (
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-orange-500/20 text-orange-400">
                        <Lock className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-seasons text-xl sm:text-2xl text-white">
                          Checkpoint 1
                        </h2>
                        <p className="text-sm text-white/60">
                          Get your screen recorder ready. You&apos;ll be showing
                          the world what you&apos;re building.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-3">
                      <button
                        onClick={() => setShowRevealHint(!showRevealHint)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10"
                      >
                        More info
                      </button>
                      {showRevealHint && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 text-sm text-orange-200"
                        >
                          Full details reveal on the kickoff! Check back on
                          April 24th at 10:30 AM (PHX time).
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-orange-500/20 text-orange-400">
                        <Twitter className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-seasons text-xl sm:text-2xl text-white">
                          Checkpoint 1 Submission
                        </h2>
                        <p className="text-sm text-white/60">
                          Due Friday, May 1st at 11:59 PM. Post a 1-min demo
                          video on Twitter. Get 3 reposts and a comment from
                          someone with 10K+ followers.
                        </p>
                      </div>
                    </div>

                    {submittedLink ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <div className="text-sm">
                            <span className="font-medium">
                              Submitted successfully.
                            </span>{" "}
                            <a
                              href={submittedLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 hover:text-emerald-100"
                            >
                              View your submission
                            </a>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setTweetUrl(submittedLink);
                            setSubmittedLink(null);
                          }}
                          className="self-start text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
                        >
                          Edit submission
                        </button>
                      </div>
                    ) : isCheckpoint1Locked ? (
                      <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-200">
                        <Lock className="h-5 w-5 shrink-0" />
                        <div className="text-sm">
                          <span className="font-medium">
                            Checkpoint locked.
                          </span>{" "}
                          The deadline for this checkpoint has passed.
                        </div>
                      </div>
                    ) : (
                      <form
                        onSubmit={(ev) => void handleSubmission(ev)}
                        className="flex flex-col gap-4"
                      >
                        {submissionError && (
                          <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                            {submissionError}
                          </div>
                        )}
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                          <div className="flex-1 space-y-2">
                            <label
                              htmlFor="tweetUrl"
                              className="text-xs font-semibold uppercase tracking-wider text-white/50"
                            >
                              Twitter Post URL
                            </label>
                            <input
                              id="tweetUrl"
                              type="url"
                              required
                              value={tweetUrl}
                              onChange={(e) => setTweetUrl(e.target.value)}
                              placeholder="https://twitter.com/yourusername/status/..."
                              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmitting || !tweetUrl}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmitting ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                            ) : (
                              <>
                                Submit <Send className="h-4 w-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="mt-4 text-xs text-white/40">
                      Need help? Check the{" "}
                      <a
                        href="/momentum/checkpoint/1"
                        className="text-orange-400 hover:underline"
                      >
                        checkpoint 1 details
                      </a>
                      .
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Checkpoint 2 */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-2xl border border-orange-500/30 bg-black/40 p-6 backdrop-blur-md sm:p-8"
              >
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />

                {!isCheckpoint1Locked ? (
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-orange-500/20 text-orange-400">
                        <Lock className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-seasons text-xl sm:text-2xl text-white">
                          Checkpoint 2
                        </h2>
                        <p className="text-sm text-white/60">
                          Get ready to talk to your users.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-3">
                      <button
                        onClick={() => setShowRevealHint2(!showRevealHint2)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-6 text-sm font-medium text-white transition-colors hover:bg-white/10"
                      >
                        More info
                      </button>
                      {showRevealHint2 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-4 text-sm text-orange-200"
                        >
                          Unlocks after Checkpoint 1 closes on May 1st at 11:59 PM MST.
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative z-10">
                    <div className="mb-6 flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-orange-500/20 text-orange-400">
                        <Mail className="h-6 w-6" />
                      </div>
                      <div>
                        <h2 className="font-seasons text-xl sm:text-2xl text-white">
                          Checkpoint 2 Submission
                        </h2>
                        <p className="text-sm text-white/60">
                          Due Friday, May 8th at 11:59 PM MST. Reach out to target users until you get 25 replies. Submit a Google Drive link with screenshots of all 25 replies.
                        </p>
                      </div>
                    </div>

                    {submittedLink2 ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200">
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                          <div className="text-sm">
                            <span className="font-medium">
                              Submitted successfully.
                            </span>{" "}
                            <a
                              href={submittedLink2}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2 hover:text-emerald-100"
                            >
                              View your submission
                            </a>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setDriveUrl(submittedLink2);
                            setSubmittedLink2(null);
                          }}
                          className="self-start text-xs font-medium text-white/50 hover:text-white/80 transition-colors"
                        >
                          Edit submission
                        </button>
                      </div>
                    ) : isCheckpoint2Locked ? (
                      <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-200">
                        <Lock className="h-5 w-5 shrink-0" />
                        <div className="text-sm">
                          <span className="font-medium">
                            Checkpoint locked.
                          </span>{" "}
                          The deadline for this checkpoint has passed.
                        </div>
                      </div>
                    ) : (
                      <form
                        onSubmit={(ev) => void handleSubmission2(ev)}
                        className="flex flex-col gap-4"
                      >
                        {submissionError && (
                          <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                            {submissionError}
                          </div>
                        )}
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                          <div className="flex-1 space-y-2">
                            <label
                              htmlFor="driveUrl"
                              className="text-xs font-semibold uppercase tracking-wider text-white/50"
                            >
                              Google Drive Folder URL
                            </label>
                            <input
                              id="driveUrl"
                              type="url"
                              required
                              value={driveUrl}
                              onChange={(e) => setDriveUrl(e.target.value)}
                              placeholder="https://drive.google.com/drive/folders/..."
                              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isSubmitting || !driveUrl}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSubmitting ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                            ) : (
                              <>
                                Submit <Send className="h-4 w-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="mt-4 text-xs text-white/40">
                      Need help? Check the{" "}
                      <a
                        href="/momentum/checkpoint/2"
                        className="text-orange-400 hover:underline"
                      >
                        checkpoint 2 details
                      </a>
                      .
                    </div>
                  </div>
                )}
              </motion.div>

              <CommunityLinks />
              <PartnerCredits application={application} />
              <MomentumTaskSubmissionsCard className="mt-8" />
            </div>

            {badgeAside}
          </div>
        </MomentumPointsTasksProvider>
      ) : (
        <div className="mt-6 lg:mt-24">
          <div className="min-w-0 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm"
            >
              <h2 className="font-seasons text-lg text-white/90">
                Your application
              </h2>
              <p className="mt-2 text-sm text-white/55 leading-relaxed">
                We&apos;ll surface status changes in the tagline above. If you&apos;re
                accepted, you&apos;ll get your team badge, leaderboard, and task
                submissions on this page.
              </p>
            </motion.div>
          </div>
        </div>
      )}

      <div className="mb-6 mt-12 flex justify-center sm:mt-16">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          {showDetails ? (
            <>
              Hide application details <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              Show application details <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {showDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="grid gap-6 md:grid-cols-2"
        >
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
            <Row
              label="Traction metrics"
              value={application.keyMetrics || "—"}
            />
          </DetailCard>

          <DetailCard title="Traction" icon={MapPin}>
            <Row label="Revenue" value={yesNo(application.hasRevenue)} />
            <Row
              label="Incorporated"
              value={yesNo(application.isIncorporated)}
            />
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
        </motion.div>
      )}
    </div>
  );
}
