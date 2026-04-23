import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Plus, CheckCircle2, Clock, XCircle, ExternalLink, Loader2 } from "lucide-react";
import type { MomentumApplicationRecord } from "./types";

const TASK_OPTIONS = [
  { id: "checkpoint_attendance", label: "Attending Mon-Fri Checkpoints", points: 30 },
  { id: "checkpoint_submission", label: "Submission of Checkpoint", points: 30 },
  { id: "social_media", label: "Weekly Social Media Engagement", points: 20 },
  { id: "weekly_meetup", label: "Weekly Meetup (IRL/Online) with Crew", points: 20 },
];

export function MomentumPointsAndTasks({ application }: { application: MomentumApplicationRecord }) {
  const [pointsTable, setPointsTable] = useState<{ group: string; points: number }[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [taskType, setTaskType] = useState(TASK_OPTIONS[0].id);
  const [proofLink, setProofLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [pointsRes, tasksRes] = await Promise.all([
        fetch("/api/momentum/points"),
        fetch("/api/momentum/tasks")
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
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofLink) return;
    
    setSubmitting(true);
    setError(null);
    
    try {
      const res = await fetch("/api/momentum/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType, proofLink })
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
  };

  const getStatusIcon = (status: string) => {
    if (status === 'approved') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    if (status === 'rejected') return <XCircle className="h-4 w-4 text-rose-400" />;
    return <Clock className="h-4 w-4 text-amber-400" />;
  };

  const groupColors: Record<string, string> = {
    Velocity: "from-blue-500 to-cyan-400",
    Inertia: "from-purple-500 to-pink-400",
    Flux: "from-orange-500 to-amber-400",
    Gravity: "from-emerald-500 to-teal-400"
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 mt-8">
      {/* Points Table & Badge */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm flex flex-col"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white/90">
            <Trophy className="h-5 w-5 text-orange-400" />
            <h3 className="font-seasons text-xl">Leaderboard</h3>
          </div>
          
          {application.group && (
            <div className={`px-4 py-1.5 rounded-full bg-gradient-to-r ${groupColors[application.group] || 'from-gray-500 to-gray-400'} text-white text-xs font-bold uppercase tracking-wider shadow-lg`}>
              Team {application.group}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-white/30" />
          </div>
        ) : (
          <div className="space-y-3 flex-1">
            {pointsTable.map((row, i) => (
              <div 
                key={row.group} 
                className={`flex items-center justify-between p-3 rounded-xl border ${application.group === row.group ? 'border-orange-500/50 bg-orange-500/10' : 'border-white/5 bg-white/5'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-white/40 font-mono text-sm w-4">{i + 1}</span>
                  <span className="font-medium text-white/90">{row.group}</span>
                </div>
                <span className="font-bold text-orange-400">{row.points} pts</span>
              </div>
            ))}
            {pointsTable.length === 0 && (
              <div className="text-center text-sm text-white/40 py-4">No points recorded yet.</div>
            )}
          </div>
        )}
      </motion.div>

      {/* Task Submission */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm flex flex-col"
      >
        <div className="mb-6 flex items-center gap-2 text-white/90">
          <Plus className="h-5 w-5 text-orange-400" />
          <h3 className="font-seasons text-xl">Submit Task</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mb-8">
          {error && <div className="text-xs text-rose-400 bg-rose-500/10 p-2 rounded-lg">{error}</div>}
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Task Type</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus:border-orange-500/50 appearance-none"
            >
              {TASK_OPTIONS.map(opt => (
                <option key={opt.id} value={opt.id} className="bg-[#1a1b1c]">
                  {opt.label} ({opt.points} pts)
                </option>
              ))}
            </select>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-white/50">Proof Link (Tweet, Post, etc)</label>
            <input
              type="url"
              required
              value={proofLink}
              onChange={(e) => setProofLink(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-orange-500/50 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !proofLink}
            className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white/10 px-6 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for Points"}
          </button>
        </form>

        <div className="flex-1">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Recent Submissions</h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
            {submissions.map(sub => (
              <div key={sub._id} className="flex items-center justify-between p-2.5 rounded-lg border border-white/5 bg-white/5 text-sm">
                <div className="flex items-center gap-2 overflow-hidden">
                  {getStatusIcon(sub.status)}
                  <span className="text-white/70 truncate">
                    {TASK_OPTIONS.find(o => o.id === sub.taskType)?.label || sub.taskType}
                  </span>
                </div>
                <a href={sub.proofLink} target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/80 shrink-0 ml-2">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            ))}
            {submissions.length === 0 && !loading && (
              <div className="text-xs text-white/30 text-center py-2">No tasks submitted yet.</div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}