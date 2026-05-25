import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  LayoutGrid,
  Loader2,
  Search,
  Shield,
  XCircle,
  LogOut,
} from "lucide-react";
import { useAuth } from "../auth_manager";
import type { MomentumApplicationRecord, MomentumApplicationStatus } from "./types";

import { MomentumAdminTasks } from "./MomentumAdminTasks";

function statusPill(status: MomentumApplicationStatus) {
  const map = {
    pending: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    approved: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    rejected: "bg-rose-500/15 text-rose-200 border-rose-500/30",
  };
  return map[status];
}

export default function MomentumAdminDashboard() {
  const { logout } = useAuth();
  const [applications, setApplications] = useState<MomentumApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MomentumApplicationStatus | "all">("all");
  const [selected, setSelected] = useState<MomentumApplicationRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/momentum/admin/applications", {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load");
      setApplications(data.applications || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (
    applicationId: string,
    status: MomentumApplicationStatus,
  ) => {
    setBusyId(applicationId);
    try {
      const res = await fetch("/api/momentum/admin/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ applicationId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      const updated = data.application as MomentumApplicationRecord;
      setApplications((apps) =>
        apps.map((a) => (a._id === applicationId ? { ...a, ...updated } : a)),
      );
      setSelected((s) => (s && s._id === applicationId ? { ...s, ...updated } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const filtered = applications.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    
    const q = query.toLowerCase();
    if (!q) return true;
    return (
      a.firstName.toLowerCase().includes(q) ||
      a.lastName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.startupName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 relative">
      <div className="absolute top-0 right-0">
        <button
          onClick={() => void logout()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-violet-200">
            <Shield className="h-3.5 w-3.5" />
            Admin
          </p>
          <h1 className="font-seasons text-3xl text-white sm:text-4xl md:text-5xl">
            Momentum Admin
          </h1>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <MomentumAdminTasks />

      <div className="mt-16 border-t border-white/10 pt-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <h2 className="font-seasons text-2xl text-white sm:text-3xl">
              Applications
            </h2>
            <p className="mt-2 max-w-lg text-sm text-white/50">
              {applications.length} total {applications.length === 1 ? 'application' : 'applications'} received.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <input
                className="w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-orange-500/40 sm:w-64"
                placeholder="Search name, email, startup…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-full border border-white/10 bg-white/5 py-2.5 pl-4 pr-8 text-sm text-white outline-none focus:border-orange-500/40 appearance-none cursor-pointer"
            >
              <option value="all" className="bg-[#1a1b1c]">All Statuses</option>
              <option value="pending" className="bg-[#1a1b1c]">Pending</option>
              <option value="approved" className="bg-[#1a1b1c]">Approved</option>
              <option value="rejected" className="bg-[#1a1b1c]">Rejected</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
          </div>
        ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-white/45">
                  <th className="px-5 py-4 font-semibold">Founder</th>
                  <th className="px-5 py-4 font-semibold">Startup</th>
                  <th className="px-5 py-4 font-semibold">Status</th>
                  <th className="px-5 py-4 font-semibold">Submitted</th>
                  <th className="px-5 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app, i) => (
                  <motion.tr
                    key={app._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/[0.04]"
                  >
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">
                        {app.firstName} {app.lastName}
                      </div>
                      <div className="text-xs text-white/45">{app.email}</div>
                    </td>
                    <td className="px-5 py-4 text-white/80">{app.startupName}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusPill(app.status)}`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-white/50">
                      {app.createdAt
                        ? new Date(app.createdAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelected(app)}
                          className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/10"
                        >
                          View
                          <ChevronRight className="ml-1 inline h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === app._id}
                          onClick={() => setStatus(app._id, "approved")}
                          className="rounded-full bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === app._id}
                          onClick={() => setStatus(app._id, "rejected")}
                          className="rounded-full border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <p className="py-16 text-center text-sm text-white/45">
              No applications match your search.
            </p>
          )}
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 28 }}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-[#161718] p-6 shadow-2xl sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-seasons text-2xl text-white">
                    {selected.startupName}
                  </h2>
                  <p className="text-sm text-white/50">
                    {selected.firstName} {selected.lastName} · {selected.email}
                  </p>
                  {selected.group && (
                    <p className="mt-2 inline-flex rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white">
                      Team {selected.group}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusPill(selected.status)}`}
                >
                  {selected.status}
                </span>
              </div>

              <dl className="grid gap-4 text-sm">
                {[
                  ["Phone", selected.phone],
                  ["Location", `${selected.city}, ${selected.state}, ${selected.country}`],
                  ["Startup age", selected.startupAge],
                  ["Founder type", selected.founderType.replace(/_/g, " ")],
                  ["Domain", selected.startupDomain],
                  ["Co-founder", selected.hasCoFounder ? `Yes (${selected.numCoFounders})` : "No"],
                  ["Co-founder details", selected.coFounderDetails || "—"],
                  ["Building", selected.description],
                  ["Accomplishments", selected.accomplishments],
                  ["Adjectives", selected.adjectives],
                  ["Website / GitHub", selected.websiteOrGithub || "—"],
                  ["Demo", selected.demoVideo],
                  ["LinkedIn", selected.linkedin || "—"],
                  ["X", selected.twitter || "—"],
                  ["Deck", selected.pitchDeck || "—"],
                  ["Metrics", selected.keyMetrics || "—"],
                  ["Revenue", selected.hasRevenue ? "Yes" : "No"],
                  ["Incorporated", selected.isIncorporated ? "Yes" : "No"],
                  ["Raised", selected.hasRaisedMoney ? "Yes" : "No"],
                  ["Fundraise / accelerator interest", selected.lookingToFundraise ? "Yes" : "No"],
                  ["Heard about", selected.heardAboutUs],
                ].map(([k, v]) => (
                  <div key={k as string} className="border-b border-white/5 pb-3 last:border-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-white/40">
                      {k}
                    </dt>
                    <dd className="mt-1 text-white/85 whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void setStatus(selected._id, "approved");
                  }}
                  disabled={busyId === selected._id}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-black min-w-[120px] hover:bg-emerald-400 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void setStatus(selected._id, "rejected");
                  }}
                  disabled={busyId === selected._id}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/15 py-3 text-sm font-semibold text-rose-100 min-w-[120px] hover:bg-rose-500/25 disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="w-full rounded-full border border-white/15 py-3 text-sm text-white/70 hover:bg-white/5"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
