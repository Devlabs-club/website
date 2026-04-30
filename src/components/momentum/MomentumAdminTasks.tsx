import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Clock, Loader2, ExternalLink, Trophy } from "lucide-react";
import { TASK_LABELS } from "../../models/momentumTaskSubmission";

export function MomentumAdminTasks() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [pointsTable, setPointsTable] = useState<{ group: string; points: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [tasksRes, pointsRes] = await Promise.all([
        fetch("/api/momentum/admin/tasks"),
        fetch("/api/momentum/points")
      ]);
      
      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.submissions || []);
      }
      
      if (pointsRes.ok) {
        const data = await pointsRes.json();
        setPointsTable(data.pointsTable || []);
      }
    } catch (err) {
      setError("Failed to load tasks data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const setStatus = async (submissionId: string, status: string) => {
    setBusyId(submissionId);
    try {
      const res = await fetch("/api/momentum/admin/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId, status })
      });
      
      if (!res.ok) throw new Error("Failed to update status");
      
      await loadData();
    } catch (err) {
      alert("Error updating task status");
    } finally {
      setBusyId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'approved') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    if (status === 'rejected') return <XCircle className="h-4 w-4 text-rose-400" />;
    return <Clock className="h-4 w-4 text-amber-400" />;
  };

  function taskTypeLabel(taskType: string) {
    const key = taskType as keyof typeof TASK_LABELS;
    return TASK_LABELS[key] ?? taskType.replace(/_/g, " ");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 mt-12 border-t border-white/10 pt-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-seasons text-2xl text-white sm:text-3xl">
            Tasks & Leaderboard
          </h2>
          <p className="mt-2 max-w-lg text-sm text-white/50">
            Review task submissions and track team points.
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Tasks Table */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/45">
                  <th className="px-5 py-4 font-semibold">Team / Founder</th>
                  <th className="px-5 py-4 font-semibold">Task</th>
                  <th className="px-5 py-4 font-semibold">Points</th>
                  <th className="px-5 py-4 font-semibold">Proof</th>
                  <th className="px-5 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, i) => (
                  <motion.tr
                    key={task._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.04]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white">
                          {task.group}
                        </span>
                        <span className="font-medium text-white">
                          {task.application?.firstName} {task.application?.lastName}
                        </span>
                      </div>
                      <div className="text-xs text-white/45 mt-1">
                        {task.application?.startupName}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(task.status)}
                        <span className="text-white/80">{taskTypeLabel(task.taskType)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-xs text-orange-400 mt-1">+{task.points} pts</div>
                    </td>
                    <td className="px-5 py-4">
                      {task.proofLink ? (
                        <a 
                          href={task.proofLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {task.status === 'pending' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setStatus(task._id, 'approved')}
                            disabled={busyId === task._id}
                            className="rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setStatus(task._id, 'rejected')}
                            disabled={busyId === task._id}
                            className="rounded-full border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <div className="text-right text-xs text-white/40 capitalize">
                          {task.status}
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
            {tasks.length === 0 && (
              <p className="py-8 text-center text-sm text-white/45">
                No tasks submitted yet.
              </p>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm h-fit">
          <div className="mb-6 flex items-center gap-2 text-white/90">
            <Trophy className="h-5 w-5 text-orange-400" />
            <h3 className="font-seasons text-xl">Leaderboard</h3>
          </div>
          
          <div className="space-y-3">
            {pointsTable.map((row, i) => (
              <div 
                key={row.group} 
                className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5"
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
        </div>
      </div>
    </div>
  );
}