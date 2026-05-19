import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { MomentumApplicationRecord } from "./types";

const TASK_OPTIONS = [
  { id: "social_media", label: "Weekly Social Media Engagement", points: 20 },
  {
    id: "weekly_meetup",
    label: "Weekly Meetup (IRL/Online) with Crew",
    points: 20,
  },
];

/** Labels for history rows (includes types no longer offered for new submission). */
const TASK_LABELS_BY_ID: Record<string, string> = {
  ...Object.fromEntries(TASK_OPTIONS.map((o) => [o.id, o.label])),
  checkpoint_submission: "Submission of Checkpoint 1",
  checkpoint_2_submission: "Submission of Checkpoint 2",
  checkpoint_3_submission: "Submission of Checkpoint 3",
  checkpoint_4_submission: "Submission of Checkpoint 4",
  checkpoint_attendance: "Attending Mon-Fri Checkpoints",
};

const groupColors: Record<string, string> = {
  Velocity: "from-blue-500 to-cyan-400",
  Inertia: "from-purple-500 to-pink-400",
  Flux: "from-orange-500 to-amber-400",
  Gravity: "from-emerald-500 to-teal-400",
};

type MomentumPointsTasksContextValue = {
  application: MomentumApplicationRecord;
  pointsTable: { group: string; points: number }[];
  submissions: {
    _id: string;
    status: string;
    taskType: string;
    proofLink: string;
  }[];
  loading: boolean;
  submitting: boolean;
  taskType: string;
  setTaskType: (v: string) => void;
  proofLink: string;
  setProofLink: (v: string) => void;
  error: string | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
};

const MomentumPointsTasksContext =
  createContext<MomentumPointsTasksContextValue | null>(null);

function useMomentumPointsTasks() {
  const ctx = useContext(MomentumPointsTasksContext);
  if (!ctx) {
    throw new Error(
      "Momentum points UI must be used within MomentumPointsTasksProvider",
    );
  }
  return ctx;
}

export function MomentumPointsTasksProvider({
  application,
  children,
  enablePointsTasksFetch = true,
}: {
  application: MomentumApplicationRecord;
  children: React.ReactNode;
  /** When false, skips fetching points/submissions until true (kickoff, same as partner credits). */
  enablePointsTasksFetch?: boolean;
}) {
  const [pointsTable, setPointsTable] = useState<
    { group: string; points: number }[]
  >([]);
  const [submissions, setSubmissions] = useState<
    { _id: string; status: string; taskType: string; proofLink: string }[]
  >([]);
  const [loading, setLoading] = useState(enablePointsTasksFetch);
  const [submitting, setSubmitting] = useState(false);
  const [taskType, setTaskType] = useState(TASK_OPTIONS[0].id);
  const [proofLink, setProofLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pointsRes, tasksRes] = await Promise.all([
        fetch("/api/momentum/points", { credentials: "include" }),
        fetch("/api/momentum/tasks", { credentials: "include" }),
      ]);

      if (pointsRes.ok) {
        const data = await pointsRes.json();
        setPointsTable(data.pointsTable || []);
      }

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setSubmissions(data.submissions || []);
      }
    } catch (err) {
      console.error("Failed to load points/tasks", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enablePointsTasksFetch) {
      setLoading(false);
      return;
    }
    void loadData();
  }, [enablePointsTasksFetch, loadData]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!proofLink) return;

      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch("/api/momentum/tasks", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskType, proofLink }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to submit task");

        setProofLink("");
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error submitting task");
      } finally {
        setSubmitting(false);
      }
    },
    [proofLink, taskType, loadData],
  );

  const value = useMemo(
    () => ({
      application,
      pointsTable,
      submissions,
      loading,
      submitting,
      taskType,
      setTaskType,
      proofLink,
      setProofLink,
      error,
      handleSubmit,
    }),
    [
      application,
      pointsTable,
      submissions,
      loading,
      submitting,
      taskType,
      proofLink,
      error,
      handleSubmit,
    ],
  );

  return (
    <MomentumPointsTasksContext.Provider value={value}>
      {children}
    </MomentumPointsTasksContext.Provider>
  );
}

export function MomentumLeaderboardCard({
  className = "",
}: {
  className?: string;
}) {
  const { application, pointsTable, loading } = useMomentumPointsTasks();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={` rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm flex flex-col sm:p-5 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-white/90">
          <Trophy className="h-5 w-5 shrink-0 text-orange-400" />
          <h3 className="font-seasons text-lg sm:text-xl">Leaderboard</h3>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-white/30" />
        </div>
      ) : (
        <div className="space-y-2">
          {pointsTable.map((row, i) => (
            <div
              key={row.group}
              className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 sm:p-3 ${application.group === row.group ? "border-orange-500/50 bg-orange-500/10" : "border-white/5 bg-white/5"}`}
            >
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span className="w-4 shrink-0 font-mono text-xs text-white/40 sm:text-sm">
                  {i + 1}
                </span>
                <span className="truncate font-medium text-white/90 text-sm sm:text-base">
                  {row.group}
                </span>
              </div>
              <span className="shrink-0 text-sm font-bold text-orange-400 sm:text-base">
                {row.points} pts
              </span>
            </div>
          ))}
          {pointsTable.length === 0 && (
            <div className="py-3 text-center text-sm text-white/40">
              No points recorded yet.
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function getStatusIcon(status: string) {
  if (status === "approved")
    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "rejected")
    return <XCircle className="h-4 w-4 text-rose-400" />;
  return <Clock className="h-4 w-4 text-amber-400" />;
}

export function MomentumTaskSubmissionsCard({
  className = "",
}: {
  className?: string;
}) {
  const {
    submissions,
    loading,
    submitting,
    taskType,
    setTaskType,
    proofLink,
    setProofLink,
    error,
    handleSubmit,
  } = useMomentumPointsTasks();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm flex flex-col ${className}`}
    >
      <div className="mb-6 flex items-center gap-2 text-white/90">
        <Plus className="h-5 w-5 text-orange-400" />
        <h3 className="font-seasons text-xl">Submit Task</h3>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mb-8 space-y-4">
        {error && (
          <div className="rounded-lg bg-rose-500/10 p-2 text-xs text-rose-400">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Task Type
          </label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500/50"
          >
            {TASK_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-[#1a1b1c]">
                {opt.label} ({opt.points} pts)
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Proof Link (Tweet, Post, etc)
          </label>
          <input
            type="url"
            required
            value={proofLink}
            onChange={(e) => setProofLink(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-orange-500/50"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !proofLink}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-6 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Submit for Points"
          )}
        </button>
      </form>

      <div className="flex-1">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/50">
          Recent Submissions
        </h4>
        <div className="custom-scrollbar max-h-[200px] space-y-2 overflow-y-auto pr-2">
          {submissions.map((sub) => (
            <div
              key={sub._id}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                {getStatusIcon(sub.status)}
                <span className="truncate text-white/70">
                  {TASK_LABELS_BY_ID[sub.taskType] ?? sub.taskType}
                </span>
              </div>
              <a
                href={sub.proofLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 shrink-0 text-white/40 hover:text-white/80"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          ))}
          {submissions.length === 0 && !loading && (
            <div className="py-2 text-center text-xs text-white/30">
              No tasks submitted yet.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** Original two-column layout (leaderboard + submissions). */
export function MomentumPointsAndTasks({
  application,
}: {
  application: MomentumApplicationRecord;
}) {
  return (
    <MomentumPointsTasksProvider application={application}>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <MomentumLeaderboardCard />
        <MomentumTaskSubmissionsCard />
      </div>
    </MomentumPointsTasksProvider>
  );
}
