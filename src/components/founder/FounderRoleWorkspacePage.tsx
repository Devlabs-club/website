import React, { useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/components/auth_manager";
import { FounderRail } from "@/components/founder/FounderRail";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  FileText,
  Github,
  Globe,
  Linkedin,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { BuilderProfileView, fetchBuilderProfile, type BuilderProfile } from "@/components/founder/BuilderFullProfilePage";
import { FounderUpgradeModal } from "@/components/founder/FounderUpgradeModal";
import type { PlanId } from "@/components/founder/FounderBillingCard";

type Job = {
  id: string;
  title: string;
  roleTitle?: string;
  description?: string;
  company?: string | null;
  jobType?: string | null;
  workMode?: string | null;
  location?: string | null;
  salary?: string | null;
  equity?: string | null;
  equityConfirmed?: boolean;
  visa?: string | null;
  visaConfirmed?: boolean;
  openings?: number;
  skillsNeeded?: string[];
  niceToHaveSkills?: string[];
  responsibilities?: string[];
  createdAt?: string | null;
};

type Experience = {
  title: string;
  company: string;
  employmentType?: string | null;
  dateRange?: string | null;
  isCurrent?: boolean;
};

type BuilderLinks = {
  github?: string | null;
  linkedin?: string | null;
  portfolio?: string | null;
  resume?: string | null;
  devpost?: string | null;
};

type TrialProject = {
  title?: string | null;
  goal?: string | null;
  deliverables?: string[];
  timeline?: string | null;
  successCriteria?: string[];
  status?: string | null;
  deadlineAt?: string | null;
  submission?: { videoUrl?: string | null; githubUrl?: string | null; notes?: string | null; submittedAt?: string | null } | null;
};

type AgentTraceTeaser = {
  locked: boolean;
  label: string;
  sourceBadges: string[];
  visibleInsight: string;
  quantifiedSignals?: string[];
  redacted: string[];
  hasAgentWrapped?: boolean;
  archetype?: string | null;
  wrappedScore?: number | null;
  bestFitRoles?: string[];
  projectHighlight?: string | null;
};

type Recommendation = {
  builderId: string;
  name: string;
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  matchScore?: number;
  matchLabel?: string;
  topSkills?: string[];
  proofStrengthLabel?: string;
  builderVerificationLabel?: string;
  whyTheyMatch?: string | null;
  visibilityMode?: 'teaser' | 'full';
  traceAccess?: 'teaser' | 'full';
  experiences?: Experience[];
  projects?: Array<{
    _id: string;
    projectName: string;
    description?: string | null;
    techStack?: string[];
    links?: { github?: string | null; devpost?: string | null; demo?: string | null };
  }>;
  links?: BuilderLinks;
  matchStatus?: string;
  introRequested?: boolean;
  callCompletedAt?: string | null;
  trialProject?: TrialProject | null;
  teasers?: {
    agentTrace?: AgentTraceTeaser;
    introDraft?: {
      locked: boolean;
      label: string;
      visibleHook: string;
      redactedBody: string;
    };
  };
};

type BillingSummary = {
  success?: boolean;
  error?: string;
  entitlements?: {
    lifecycleAccess?: 'locked' | 'enabled';
  };
};

type DialogState = {
  kind: "sendTrial" | "reviewTrial" | "hire" | "scheduleCall";
  rec: Recommendation;
  loading?: boolean;
  submitting?: boolean;
  error?: string;
  // sendTrial
  title?: string;
  goal?: string;
  deliverables?: string;
  timeline?: string;
  successCriteria?: string;
  deadlineDate?: string;
  // reviewTrial
  rejectNote?: string;
  // hire
  hireNote?: string;
  // scheduleCall
  scheduledAt?: string;
} | null;

const inputClass =
  "h-10 w-full rounded-xl border border-[#ece7e1] bg-[#fffcfa] px-3 text-sm text-black shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors placeholder:text-black/35 focus:border-[#ec9149]/50";
const textareaClass =
  "min-h-24 w-full rounded-xl border border-[#ece7e1] bg-[#fffcfa] px-3 py-2 text-sm text-black shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors placeholder:text-black/35 focus:border-[#ec9149]/50";

function toCsv(values?: string[]) {
  return (values || []).join(", ");
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function formatDateTime(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  return `${time} • ${day}`;
}

const OUTREACH_STATUSES = new Set(["intro_requested", "builder_interested", "interviewing", "rejected", "closed"]);
const HIRED_STATUSES = new Set(["hired"]);

type Bucket = "recommended" | "outreach" | "trial" | "hired";

function bucketFor(rec: Recommendation): Bucket {
  const status = rec.matchStatus || "generated";
  if (status === "trial" || status === "offer") return "trial";
  if (HIRED_STATUSES.has(status)) return "hired";
  if (OUTREACH_STATUSES.has(status)) return "outreach";
  return "recommended";
}

function responseBadge(status?: string) {
  if (status === "rejected" || status === "closed") return { label: "Rejected", dot: "bg-red-500" };
  if (status === "builder_interested" || status === "interviewing") return { label: "Accepted", dot: "bg-emerald-500" };
  return { label: "Pending", dot: "bg-amber-500" };
}

function interviewLabel(rec: Recommendation) {
  if (rec.callCompletedAt) return "Completed";
  if (rec.matchStatus === "interviewing" || rec.matchStatus === "builder_interested") return "Not Scheduled";
  return "—";
}

function outreachStatusLabel(rec: Recommendation) {
  switch (rec.matchStatus) {
    case "intro_requested":
      return "Waiting";
    case "builder_interested":
      return rec.callCompletedAt ? "Awaiting Decision" : "Ready";
    case "interviewing":
      return rec.callCompletedAt ? "Awaiting Decision" : "Scheduled";
    default:
      return "—";
  }
}

const TRIAL_STATUS_LABELS: Record<string, string> = {
  draft: "To be Assigned",
  sent: "Awaiting Submission",
  in_progress: "In Progress",
  submitted: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};

const INTRO_MESSAGES: Array<{ role: "founder" | "assistant"; content: string }> = [
  { role: "assistant", content: "Hey! Let's get this role tight so I can find you the right builder." },
  { role: "assistant", content: "First up, what will they actually build? The product, the feature, the thing they'll own." },
];

const FounderRoleWorkspaceInner: React.FC<{ roleId: string }> = ({ roleId }) => {
  const { user, logout } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [chat, setChat] = useState<Array<{ role: "founder" | "assistant"; content: string }>>(INTRO_MESSAGES);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [rightPane, setRightPane] = useState<"editor" | Bucket | "chat">("editor");
  const [previousPane, setPreviousPane] = useState<"editor" | Bucket>("editor");
  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  const [profileRec, setProfileRec] = useState<Recommendation | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingAgentFollowup, setPendingAgentFollowup] = useState("");
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; upgradeTarget: PlanId; reason?: string }>({
    open: false,
    upgradeTarget: "growth",
  });
  const [schedulingLinkModalOpen, setSchedulingLinkModalOpen] = useState(false);
  const [openSections, setOpenSections] = useState({ basics: true, description: true, skills: true });
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const goToChat = () => {
    setPreviousPane((prev) => (rightPane === "chat" ? prev : rightPane));
    setRightPane("chat");
  };

  const openChatWithDraft = (draft: string) => {
    setMessage(draft);
    goToChat();
  };

  useEffect(() => {
    (async () => {
      try {
        // Load the role and its saved chat history together so reopening a role resumes
        // the same conversation the agent already has context for.
        const [roleRes, chatRes] = await Promise.all([
          fetch(`/api/founder/roles/${roleId}`, { credentials: "include" }),
          fetch(`/api/founder/roles/${roleId}/chat`, { credentials: "include" }),
        ]);
        const data = await roleRes.json();
        if (data.success) {
          setJob(data.job);
          const recs = data.recommendations || [];
          setRecommendations(recs);
          if (recs.length > 0) {
            setRightPane("recommended");
          }
        } else {
          setError(data.error || "Could not load role.");
        }

        const chatData = await chatRes.json().catch(() => null);
        if (chatData?.success) {
          if (chatData.session?.id) setSessionId(chatData.session.id);
          const history = (Array.isArray(chatData.history) ? chatData.history : [])
            .filter((m: any) => (m.role === "founder" || m.role === "assistant") && m.content)
            .map((m: any) => ({ role: m.role as "founder" | "assistant", content: String(m.content) }));
          if (history.length) setChat(history);
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [roleId]);

  const form = useMemo(() => {
    if (!job) return null;
    return {
      title: job.title || job.roleTitle || "",
      description: job.description || "",
      skillsNeeded: toCsv(job.skillsNeeded),
      niceToHaveSkills: toCsv(job.niceToHaveSkills),
      responsibilities: toCsv(job.responsibilities),
      salary: job.salary || "",
      equity: job.equity || "No",
      visa: job.visa || "Yes",
      workMode: job.workMode || "",
      location: job.location || "",
      jobType: job.jobType || "",
      openings: String(job.openings || 1),
    };
  }, [job]);

  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (form) setDraft(form);
  }, [form]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, rightPane]);

  const buckets = useMemo(() => {
    const groups: Record<Bucket, Recommendation[]> = { recommended: [], outreach: [], trial: [], hired: [] };
    recommendations.forEach((rec) => groups[bucketFor(rec)].push(rec));
    return groups;
  }, [recommendations]);

  const updateDraft = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  /** Split the agent reply on blank lines and drop each chunk in as its own text, with a human pause. */
  const appendAssistantMessages = (raw: string) => {
    const chunks = raw
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);
    const messages = chunks.length ? chunks : [raw.trim() || "Updated."];
    messages.forEach((content, index) => {
      window.setTimeout(() => {
        setChat((prev) => [...prev, { role: "assistant", content }]);
      }, index * 650);
    });
  };

  /** Reload the role's freshly-persisted shortlist into the recommendations pane. */
  const loadRecommendations = async () => {
    setSearching(true);
    try {
      const res = await fetch(`/api/founder/roles/${roleId}`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        if (data.job) setJob(data.job);
        setRecommendations(data.recommendations || []);
      }
    } catch {
      // keep whatever recommendations we already have
    } finally {
      setSearching(false);
    }
  };

  const saveJob = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...draft,
        openings: Number(draft.openings) || 1,
        skillsNeeded: csv(draft.skillsNeeded || ""),
        niceToHaveSkills: csv(draft.niceToHaveSkills || ""),
        responsibilities: csv(draft.responsibilities || ""),
      };
      const res = await fetch(`/api/founder/roles/${roleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) setJob(data.job);
      else setError(data.error || "Could not save role.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const sendChat = async () => {
    if (!message.trim()) return;
    const nextMessage = message.trim();
    const outboundMessage = pendingAgentFollowup
      ? `The assistant just asked: "${pendingAgentFollowup}" The founder replied: "${nextMessage}"`
      : nextMessage;
    setMessage("");
    setChat((prev) => [...prev, { role: "founder", content: nextMessage }]);
    try {
      const res = await fetch(`/api/founder/roles/${roleId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: outboundMessage, sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.job) setJob(data.job);
        if (data.session?.id) setSessionId(data.session.id);
        setPendingAgentFollowup("");
        appendAssistantMessages(data.message || "Updated.");
        // When the agent actually runs the search, jump to the builders tab and load results.
        if (data.searchRan) {
          setRightPane("recommended");
          void loadRecommendations();
        }
      } else {
        setChat((prev) => [...prev, { role: "assistant", content: data.error || "I could not update that." }]);
      }
    } catch {
      setChat((prev) => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
    }
  };

  const runSearch = async () => {
    await saveJob();
    setSearching(true);
    setError("");
    try {
      const res = await fetch(`/api/founder/roles/${roleId}/search`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        if (data.job) setJob(data.job);
        if (data.needsFollowup) {
          const followup = data.message || "I need one more detail before I search.";
          setPendingAgentFollowup(followup);
          setChat((prev) => [...prev, { role: "assistant", content: followup }]);
          goToChat();
          return;
        }
        setRecommendations(data.recommendations || []);
        setRightPane("recommended");
      }
      else setError(data.error || "Could not search builders.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  /** Open a builder's full profile in a dialog over the current tab. */
  const openProfile = async (rec: Recommendation) => {
    setProfileOpen(true);
    setProfileRec(rec);
    setProfile(null);
    setProfileLoading(true);
    try {
      setProfile(await fetchBuilderProfile(rec.builderId));
    } finally {
      setProfileLoading(false);
    }
  };

  const hasLifecycleAccess = async () => {
    const res = await fetch("/api/billing/summary", { credentials: "include" });
    const data = (await res.json().catch(() => ({}))) as BillingSummary;
    if (!res.ok || !data.success) {
      setError(data.error || "Could not check billing status.");
      return false;
    }
    return data.entitlements?.lifecycleAccess === "enabled";
  };

  /** Shared caller for every pipeline action (trial, hire, schedule, reject) — all live behind this one action endpoint. */
  const callAgentAction = async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch("/api/agent/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action, payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const rejectCandidate = async (builderId: string) => {
    setActionBusy(builderId);
    const { data } = await callAgentAction("reject_builder", { opportunityId: roleId, builderId });
    if (data.success) {
      setRecommendations((prev) => prev.filter((rec) => rec.builderId !== builderId));
    } else {
      setError(data.error || "Could not reject this builder.");
    }
    setActionBusy(null);
  };

  const invite = async (builderId: string) => {
    if (inviteBusy) return;
    setInviteBusy(builderId);
    setError("");
    if (!(await hasLifecycleAccess())) {
      setUpgradeModal({
        open: true,
        upgradeTarget: "growth",
        reason: "Unlock Growth to invite builders and continue the hiring process.",
      });
      setInviteBusy(null);
      return;
    }

    const res = await fetch("/api/founder/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ jobId: roleId, builderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.success) {
      setRecommendations((prev) =>
        prev.map((rec) => (rec.builderId === builderId ? { ...rec, introRequested: true, matchStatus: "intro_requested" } : rec))
      );
    } else if (res.status === 402 && data.upgradeTarget) {
      setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
    } else if (data.code === "SCHEDULING_LINK_REQUIRED") {
      setSchedulingLinkModalOpen(true);
    } else {
      setError(data.error || "Could not invite this builder.");
    }
    setInviteBusy(null);
  };

  const openSendTrialDialog = async (rec: Recommendation) => {
    if (!(await hasLifecycleAccess())) {
      setUpgradeModal({ open: true, upgradeTarget: "growth", reason: "Unlock Growth to send trial projects." });
      return;
    }
    setDialog({ kind: "sendTrial", rec, loading: true, title: "", goal: "", deliverables: "", timeline: "", successCriteria: "", deadlineDate: "" });
    const { data } = await callAgentAction("generate_trial_project", { opportunityId: roleId, builderId: rec.builderId });
    setDialog((prev) => {
      if (!prev || prev.kind !== "sendTrial") return prev;
      if (data.success && data.trialProject) {
        const t = data.trialProject;
        return {
          ...prev,
          loading: false,
          title: t.title || "",
          goal: t.goal || "",
          deliverables: toCsv(t.deliverables),
          timeline: t.timeline || "",
          successCriteria: toCsv(t.successCriteria),
        };
      }
      return { ...prev, loading: false, error: data.error || "Could not generate a trial draft." };
    });
  };

  const saveAndSendTrial = async () => {
    if (!dialog || dialog.kind !== "sendTrial") return;
    if (!dialog.deadlineDate) {
      setDialog({ ...dialog, error: "Pick a deadline date." });
      return;
    }
    setDialog({ ...dialog, submitting: true, error: "" });
    const saveRes = await callAgentAction("save_trial_project", {
      opportunityId: roleId,
      builderId: dialog.rec.builderId,
      trialProject: {
        title: dialog.title,
        goal: dialog.goal,
        deliverables: csv(dialog.deliverables || ""),
        timeline: dialog.timeline,
        successCriteria: csv(dialog.successCriteria || ""),
      },
    });
    if (!saveRes.data.success) {
      setDialog((prev) => (prev && prev.kind === "sendTrial" ? { ...prev, submitting: false, error: saveRes.data.error || "Could not save trial draft." } : prev));
      return;
    }
    const sendRes = await callAgentAction("send_trial_project", {
      opportunityId: roleId,
      builderId: dialog.rec.builderId,
      deadlineDate: dialog.deadlineDate,
    });
    if (sendRes.data.success) {
      setRecommendations((prev) =>
        prev.map((r) => (r.builderId === dialog.rec.builderId ? { ...r, matchStatus: "trial", trialProject: sendRes.data.trialProject } : r))
      );
      setDialog(null);
    } else if (sendRes.res.status === 402 && sendRes.data.upgradeTarget) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: sendRes.data.upgradeTarget, reason: sendRes.data.error });
    } else {
      setDialog((prev) => (prev && prev.kind === "sendTrial" ? { ...prev, submitting: false, error: sendRes.data.error || "Could not send the trial." } : prev));
    }
  };

  const openReviewDialog = (rec: Recommendation) => {
    setDialog({ kind: "reviewTrial", rec, rejectNote: "" });
  };

  const approveTrial = async () => {
    if (!dialog || dialog.kind !== "reviewTrial") return;
    if (!(await hasLifecycleAccess())) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: "growth", reason: "Unlock Growth to review trial submissions." });
      return;
    }
    setDialog({ ...dialog, submitting: true, error: "" });
    const { res, data } = await callAgentAction("review_trial_submission", {
      opportunityId: roleId,
      builderId: dialog.rec.builderId,
      decision: "approve",
    });
    if (data.success) {
      setRecommendations((prev) =>
        prev.map((r) => (r.builderId === dialog.rec.builderId ? { ...r, matchStatus: "offer", trialProject: data.trialProject } : r))
      );
      setDialog(null);
    } else if (res.status === 402 && data.upgradeTarget) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
    } else {
      setDialog((prev) => (prev && prev.kind === "reviewTrial" ? { ...prev, submitting: false, error: data.error || "Could not approve the trial." } : prev));
    }
  };

  const rejectTrial = async () => {
    if (!dialog || dialog.kind !== "reviewTrial") return;
    if ((dialog.rejectNote || "").trim().length < 20) {
      setDialog({ ...dialog, error: "Add a note of at least 20 characters explaining what needs to change." });
      return;
    }
    if (!(await hasLifecycleAccess())) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: "growth", reason: "Unlock Growth to review trial submissions." });
      return;
    }
    setDialog({ ...dialog, submitting: true, error: "" });
    const { res, data } = await callAgentAction("review_trial_submission", {
      opportunityId: roleId,
      builderId: dialog.rec.builderId,
      decision: "reject",
      note: dialog.rejectNote,
    });
    if (data.success) {
      setRecommendations((prev) => prev.map((r) => (r.builderId === dialog.rec.builderId ? { ...r, trialProject: data.trialProject } : r)));
      setDialog(null);
    } else if (res.status === 402 && data.upgradeTarget) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
    } else {
      setDialog((prev) => (prev && prev.kind === "reviewTrial" ? { ...prev, submitting: false, error: data.error || "Could not reject the trial." } : prev));
    }
  };

  const openHireDialog = (rec: Recommendation) => {
    setDialog({ kind: "hire", rec, hireNote: "" });
  };

  const confirmHire = async () => {
    if (!dialog || dialog.kind !== "hire") return;
    if (!(await hasLifecycleAccess())) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: "growth", reason: "Unlock Growth to hire builders." });
      return;
    }
    setDialog({ ...dialog, submitting: true, error: "" });
    const { res, data } = await callAgentAction("hire_builder", {
      opportunityId: roleId,
      builderId: dialog.rec.builderId,
      note: dialog.hireNote || undefined,
    });
    if (data.success) {
      setRecommendations((prev) => prev.map((r) => (r.builderId === dialog.rec.builderId ? { ...r, matchStatus: "hired" } : r)));
      setDialog(null);
    } else if (res.status === 402 && data.upgradeTarget) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
    } else {
      setDialog((prev) => (prev && prev.kind === "hire" ? { ...prev, submitting: false, error: data.error || "Could not hire this builder." } : prev));
    }
  };

  const openScheduleDialog = (rec: Recommendation) => {
    setDialog({ kind: "scheduleCall", rec, scheduledAt: "" });
  };

  const submitSchedule = async () => {
    if (!dialog || dialog.kind !== "scheduleCall") return;
    if (!dialog.scheduledAt) {
      setDialog({ ...dialog, error: "Pick a date and time." });
      return;
    }
    if (!(await hasLifecycleAccess())) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: "growth", reason: "Unlock Growth to schedule interviews." });
      return;
    }
    setDialog({ ...dialog, submitting: true, error: "" });
    const startAt = new Date(dialog.scheduledAt);
    const endAt = new Date(startAt.getTime() + 30 * 60000);
    const { res, data } = await callAgentAction("schedule_call", {
      opportunityId: roleId,
      builderId: dialog.rec.builderId,
      slot: {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    if (data.success) {
      setRecommendations((prev) => prev.map((r) => (r.builderId === dialog.rec.builderId ? { ...r, matchStatus: "interviewing" } : r)));
      setDialog(null);
    } else if (res.status === 402 && data.upgradeTarget) {
      setDialog(null);
      setUpgradeModal({ open: true, upgradeTarget: data.upgradeTarget, reason: data.error });
    } else {
      setDialog((prev) => (prev && prev.kind === "scheduleCall" ? { ...prev, submitting: false, error: data.error || "Could not schedule the call." } : prev));
    }
  };

  const markCallComplete = async (rec: Recommendation) => {
    if (actionBusy) return;
    if (!(await hasLifecycleAccess())) {
      setUpgradeModal({ open: true, upgradeTarget: "growth", reason: "Unlock Growth to manage interviews." });
      return;
    }
    setActionBusy(rec.builderId);
    const { data } = await callAgentAction("complete_call", { opportunityId: roleId, builderId: rec.builderId });
    if (data.success) {
      setRecommendations((prev) => prev.map((r) => (r.builderId === rec.builderId ? { ...r, callCompletedAt: new Date().toISOString() } : r)));
    } else {
      setError(data.error || "Could not mark the call complete.");
    }
    setActionBusy(null);
  };

  const roleLabel = job?.title || job?.roleTitle || "Role details";
  const tabs: Array<{ key: Bucket; label: string }> = [
    { key: "recommended", label: "Recommended" },
    { key: "outreach", label: "Outreach" },
    { key: "trial", label: "Trial" },
    { key: "hired", label: "Hired" },
  ];
  const showTabs = recommendations.length > 0 || rightPane !== "editor";

  const profileDialog = profileOpen ? (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4 sm:p-8" onClick={() => { setProfileOpen(false); setProfileRec(null); }}>
      <div
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-[#ece7e1] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05),0_24px_70px_rgba(16,24,40,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#ece7e1] p-4">
          <p className="text-sm font-semibold text-black">Builder profile</p>
          <button
            type="button"
            onClick={() => { setProfileOpen(false); setProfileRec(null); }}
            className="grid h-8 w-8 place-items-center rounded-full text-black/40 hover:bg-[#fdfaf7] hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6">
          {profileLoading || !profile ? (
            <div className="flex h-60 items-center justify-center text-black/45">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              {profileRec?.teasers?.agentTrace ? (
                <AgentTraceTeaserSection teaser={profileRec.teasers.agentTrace} />
              ) : null}
              <BuilderProfileView profile={profile} />
              <div className="mt-8 flex justify-end">
                <button
                  type="button"
                  onClick={() => void invite(profile.id)}
                  disabled={inviteBusy === profile.id}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#ec9149] px-4 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
                >
                  {inviteBusy === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Invite {profile.name?.split(" ")[0] || "builder"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  ) : null;

  const upgradeModalEl = (
    <FounderUpgradeModal
      open={upgradeModal.open}
      onClose={() => setUpgradeModal((prev) => ({ ...prev, open: false }))}
      upgradeTarget={upgradeModal.upgradeTarget}
      reason={upgradeModal.reason}
    />
  );

  const schedulingLinkModal = schedulingLinkModalOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSchedulingLinkModalOpen(false)}>
      <div
        className="w-full max-w-sm rounded-[28px] border border-[#ece7e1] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05),0_24px_70px_rgba(16,24,40,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold text-black">Add your scheduling link</p>
        <p className="mt-2 text-sm text-black/55">
          Add a Cal.com or Calendly link before inviting builders — it's what gets sent to them over iMessage so they can book an interview.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSchedulingLinkModalOpen(false)}
            className="inline-flex h-9 items-center rounded-xl border border-[#ece7e1] px-3 text-sm font-medium text-black hover:bg-[#fdfaf7]"
          >
            Cancel
          </button>
          <a
            href="/founder/settings"
            className="inline-flex h-9 items-center rounded-xl bg-[#ec9149] px-3 text-sm font-semibold text-white hover:bg-[#dd7f36]"
          >
            Add link in Settings
          </a>
        </div>
      </div>
    </div>
  ) : null;

  const pipelineDialog = dialog ? (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" onClick={() => setDialog(null)}>
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-[28px] border border-[#ece7e1] bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05),0_24px_70px_rgba(16,24,40,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-black">
            {dialog.kind === "sendTrial" && `Send a trial to ${dialog.rec.name}`}
            {dialog.kind === "reviewTrial" && `Review ${dialog.rec.name}'s trial`}
            {dialog.kind === "hire" && `Hire ${dialog.rec.name}`}
            {dialog.kind === "scheduleCall" && `Schedule interview with ${dialog.rec.name}`}
          </p>
          <button
            type="button"
            onClick={() => setDialog(null)}
            className="grid h-8 w-8 place-items-center rounded-full text-black/40 hover:bg-[#fdfaf7] hover:text-black"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {dialog.kind === "sendTrial" &&
          (dialog.loading ? (
            <div className="flex h-40 items-center justify-center text-black/45">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Title" value={dialog.title || ""} onChange={(v) => setDialog({ ...dialog, title: v })} />
              <Area label="Goal" value={dialog.goal || ""} onChange={(v) => setDialog({ ...dialog, goal: v })} />
              <Area
                label="Deliverables"
                value={dialog.deliverables || ""}
                placeholder="Comma-separated deliverables"
                onChange={(v) => setDialog({ ...dialog, deliverables: v })}
              />
              <Field label="Timeline" value={dialog.timeline || ""} onChange={(v) => setDialog({ ...dialog, timeline: v })} />
              <Area
                label="Success criteria"
                value={dialog.successCriteria || ""}
                placeholder="Comma-separated success criteria"
                onChange={(v) => setDialog({ ...dialog, successCriteria: v })}
              />
              <label className="space-y-2">
                <span className="text-sm text-black/45">Deadline</span>
                <input
                  type="date"
                  value={dialog.deadlineDate || ""}
                  onChange={(e) => setDialog({ ...dialog, deadlineDate: e.target.value })}
                  className={inputClass}
                />
              </label>
              {dialog.error && <p className="text-sm text-destructive">{dialog.error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="inline-flex h-9 items-center rounded-xl border border-[#ece7e1] px-3 text-sm font-medium text-black hover:bg-[#fdfaf7]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveAndSendTrial()}
                  disabled={dialog.submitting}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ec9149] px-3 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
                >
                  {dialog.submitting && <Loader2 className="h-4 w-4 animate-spin" />} Save & Send
                </button>
              </div>
            </div>
          ))}

        {dialog.kind === "reviewTrial" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-[#ece7e1] bg-[#fdfaf7] p-4 text-sm">
              <p className="font-medium text-black">{dialog.rec.trialProject?.title}</p>
              {dialog.rec.trialProject?.goal && <p className="mt-1 text-black/60">{dialog.rec.trialProject.goal}</p>}
            </div>
            {dialog.rec.trialProject?.submission?.videoUrl && (
              <a
                href={dialog.rec.trialProject.submission.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-[#ec9149] hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Watch walkthrough video
              </a>
            )}
            {dialog.rec.trialProject?.submission?.githubUrl && (
              <a
                href={dialog.rec.trialProject.submission.githubUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-[#ec9149] hover:underline"
              >
                <Github className="h-3.5 w-3.5" /> View GitHub repo
              </a>
            )}
            {dialog.rec.trialProject?.submission?.notes && (
              <p className="text-sm text-black/60">{dialog.rec.trialProject.submission.notes}</p>
            )}
            <Area
              label="Rejection note (required if rejecting)"
              value={dialog.rejectNote || ""}
              placeholder="What needs to change before this can be approved?"
              onChange={(v) => setDialog({ ...dialog, rejectNote: v })}
            />
            {dialog.error && <p className="text-sm text-destructive">{dialog.error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => void rejectTrial()}
                disabled={dialog.submitting}
                className="inline-flex h-9 items-center rounded-xl border border-[#ece7e1] px-3 text-sm font-semibold text-black hover:bg-[#fdfaf7] disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => void approveTrial()}
                disabled={dialog.submitting}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ec9149] px-3 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
              >
                {dialog.submitting && <Loader2 className="h-4 w-4 animate-spin" />} Approve
              </button>
            </div>
          </div>
        )}

        {dialog.kind === "hire" && (
          <div className="space-y-3">
            <p className="text-sm text-black/55">
              Confirm you want to hire {dialog.rec.name} for {roleLabel}. They'll be notified right away.
            </p>
            <Area label="Note (optional)" value={dialog.hireNote || ""} onChange={(v) => setDialog({ ...dialog, hireNote: v })} />
            {dialog.error && <p className="text-sm text-destructive">{dialog.error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="inline-flex h-9 items-center rounded-xl border border-[#ece7e1] px-3 text-sm font-medium text-black hover:bg-[#fdfaf7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmHire()}
                disabled={dialog.submitting}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ec9149] px-3 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
              >
                {dialog.submitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Hire
              </button>
            </div>
          </div>
        )}

        {dialog.kind === "scheduleCall" && (
          <div className="space-y-3">
            <label className="space-y-2">
              <span className="text-sm text-black/45">Date & time</span>
              <input
                type="datetime-local"
                value={dialog.scheduledAt || ""}
                onChange={(e) => setDialog({ ...dialog, scheduledAt: e.target.value })}
                className={inputClass}
              />
            </label>
            {dialog.error && <p className="text-sm text-destructive">{dialog.error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="inline-flex h-9 items-center rounded-xl border border-[#ece7e1] px-3 text-sm font-medium text-black hover:bg-[#fdfaf7]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitSchedule()}
                disabled={dialog.submitting}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ec9149] px-3 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
              >
                {dialog.submitting && <Loader2 className="h-4 w-4 animate-spin" />} Propose time
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (job && rightPane === "chat") {
    return (
      <div className="min-h-screen bg-white text-foreground">
        <div className="flex h-16 items-center justify-between border-b border-[#ece7e1] px-6 sm:px-8">
          <button
            type="button"
            onClick={() => setRightPane(previousPane)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-black/70 transition hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <p className="text-sm font-semibold text-black">{roleLabel} · Role Conversation</p>
          <a href="/founder/home" className="text-sm font-semibold text-black/55 hover:text-black">
            Home
          </a>
        </div>

        <main className="relative z-10 mx-auto w-full max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid min-h-0 gap-5 lg:h-[calc(100vh-6rem)] lg:grid-cols-2">
            <div className="flex min-h-[520px] flex-col rounded-[28px] border border-[#ece7e1] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05),0_10px_30px_rgba(16,24,40,0.05)] lg:min-h-0">
              <div className="border-b border-[#ece7e1] p-5">
                <p className="text-sm font-semibold text-black">Role Conversation</p>
                <p className="mt-1 text-xs text-black/45">Use natural language to revise this role or manage the pipeline.</p>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {chat.map((item, index) =>
                  item.role === "founder" ? (
                    <div key={index} className="flex justify-start">
                      <div className="max-w-[85%] rounded-2xl border border-[#ece7e1] bg-[#fffcfa] px-4 py-2.5 text-sm text-black/80">
                        {item.content}
                      </div>
                    </div>
                  ) : (
                    <p key={index} className="max-w-[92%] text-sm leading-relaxed text-black/70">
                      {item.content}
                    </p>
                  )
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4">
                <div className="flex gap-2 rounded-2xl border border-[#ece7e1] bg-[#fffcfa] p-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void sendChat();
                    }}
                    placeholder="Suggest changes..."
                    className="h-10 w-full rounded-xl border-none bg-transparent px-3 text-sm text-black outline-none placeholder:text-black/40"
                  />
                  <button
                    type="button"
                    onClick={sendChat}
                    className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#ec9149] px-4 text-sm font-medium text-white transition-colors hover:bg-[#dd7f36]"
                  >
                    Send <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex min-h-[520px] flex-col rounded-[28px] border border-[#ece7e1] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.05),0_10px_30px_rgba(16,24,40,0.05)] lg:min-h-0">
              <div className="border-b border-[#ece7e1] p-5">
                <p className="text-sm font-semibold text-black">Recommendations</p>
                <p className="mt-1 text-xs text-black/45">Builders matched to this role while you chat.</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {searching && buckets.recommended.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#e3ddd4] p-10 text-center text-sm text-black/45">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Searching builders with real proof-of-work for this role…
                  </div>
                ) : buckets.recommended.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e3ddd4] p-8 text-center text-sm text-black/45">
                    No new recommendations right now.
                  </div>
                ) : (
                  buckets.recommended.map((rec) => (
                    <RecommendationCard
                      key={rec.builderId}
                      rec={rec}
                      inviteBusy={inviteBusy}
                      onOpenProfile={() => void openProfile(rec)}
                      onInvite={() => void invite(rec.builderId)}
                      onReject={() => void rejectCandidate(rec.builderId)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </main>

        {profileDialog}
        {upgradeModalEl}
        {schedulingLinkModal}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-white">
      <FounderRail onLogout={() => void logout()} initial={(user?.name || "F").slice(0, 1).toUpperCase()} />

      <main className="relative min-w-0 flex-1 overflow-hidden">
        <header className="relative z-10 flex h-16 items-center border-b border-[#ece7e1] px-6 sm:px-8">
          <h1 className="text-lg font-bold tracking-tight text-black">Sourcing</h1>
        </header>

        {loading ? (
          <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-black/45">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !job ? (
          <div className="mx-auto max-w-3xl px-6 py-10 sm:px-8">
            <p className="rounded-2xl border border-[#ece7e1] bg-white p-6 text-sm text-destructive">{error || "Role not found."}</p>
          </div>
        ) : (
          <div className="relative z-10 mx-auto w-full max-w-[1220px] px-6 py-6 sm:px-8">
            <div className="mb-4 flex items-center">
              <a href="/founder/home" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#ece7e1] text-black/55 hover:bg-[#fdfaf7]">
                <ArrowLeft className="h-4 w-4" />
              </a>
            </div>

            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-black">{roleLabel}</h2>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-black/45">
                  {job.jobType && <span>{job.jobType}</span>}
                  {job.salary && <span>• {job.salary}</span>}
                  {job.workMode && <span>• {job.workMode}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {formatDateTime(job.createdAt) && <p className="text-xs text-black/40">{formatDateTime(job.createdAt)}</p>}
                <button
                  type="button"
                  onClick={goToChat}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black hover:bg-[#fdfaf7]"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> View Role Conversation
                </button>
              </div>
            </div>

            {showTabs && (
              <div className="mb-6 flex items-center gap-6 border-b border-[#ece7e1]">
                {tabs.map((tab) => {
                  const active = rightPane === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setRightPane(tab.key)}
                      className={`relative flex items-center gap-2 pb-3 text-sm font-medium transition-colors ${
                        active ? "text-black" : "text-black/40 hover:text-black/70"
                      }`}
                    >
                      {tab.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${active ? "bg-[#fdfaf7] text-black/60" : "bg-[#f3ede4] text-black/45"}`}>
                        {buckets[tab.key].length}
                      </span>
                      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#ec9149]" />}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setRightPane("editor")}
                  className="ml-auto pb-3 text-sm font-medium text-black/40 hover:text-[#ec9149]"
                >
                  Edit role details
                </button>
              </div>
            )}

            {rightPane === "editor" ? (
              <div className="mx-auto max-w-4xl">
                {recommendations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRightPane("recommended")}
                    className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-black/55 hover:text-black"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to results
                  </button>
                )}
                <div className="space-y-5">
                  <SectionCard number={1} title="Basics" open={openSections.basics} onToggle={() => toggleSection("basics")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Title" value={draft.title || ""} onChange={(v) => updateDraft("title", v)} />
                      <Field label="Job type" value={draft.jobType || ""} onChange={(v) => updateDraft("jobType", v)} placeholder="Full-time, contract" />
                      <Field label="Work mode" value={draft.workMode || ""} onChange={(v) => updateDraft("workMode", v)} />
                      <Field label="Location" value={draft.location || ""} onChange={(v) => updateDraft("location", v)} />
                      <Field label="Salary" value={draft.salary || ""} onChange={(v) => updateDraft("salary", v)} />
                      <Field label="Equity" value={draft.equity || ""} onChange={(v) => updateDraft("equity", v)} />
                      <Field label="Visa sponsorship" value={draft.visa || "Yes"} onChange={(v) => updateDraft("visa", v)} />
                      <Field label="Openings" value={draft.openings || "1"} onChange={(v) => updateDraft("openings", v)} />
                    </div>
                  </SectionCard>

                  <SectionCard number={2} title="Description" open={openSections.description} onToggle={() => toggleSection("description")}>
                    <Area label="Job description" value={draft.description || ""} onChange={(v) => updateDraft("description", v)} />
                    <div className="mt-4">
                      <Area label="Responsibilities" value={draft.responsibilities || ""} onChange={(v) => updateDraft("responsibilities", v)} placeholder="Comma-separated responsibilities" />
                    </div>
                  </SectionCard>

                  <SectionCard number={3} title="Skills" open={openSections.skills} onToggle={() => toggleSection("skills")}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Required skills" value={draft.skillsNeeded || ""} onChange={(v) => updateDraft("skillsNeeded", v)} />
                      <Field label="Nice to have" value={draft.niceToHaveSkills || ""} onChange={(v) => updateDraft("niceToHaveSkills", v)} />
                    </div>
                  </SectionCard>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#ece7e1] bg-[#fdfaf7] px-6 py-3">
                    <button
                      type="button"
                      onClick={saveJob}
                      disabled={saving}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#ece7e1] bg-white px-3 text-sm font-medium text-black hover:bg-[#fffcfa] disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                    </button>
                    <button
                      type="button"
                      onClick={runSearch}
                      disabled={searching}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#ec9149] px-4 text-sm font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
                    >
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Submit & suggest builders
                    </button>
                  </div>
                </div>
              </div>
            ) : rightPane === "recommended" ? (
              <div className="mx-auto max-w-4xl space-y-3">
                {searching && buckets.recommended.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#e3ddd4] p-10 text-center text-sm text-black/45">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Searching builders with real proof-of-work for this role…
                  </div>
                ) : buckets.recommended.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e3ddd4] p-8 text-center text-sm text-black/45">
                    No new recommendations right now.
                  </div>
                ) : (
                  buckets.recommended.map((rec) => (
                    <RecommendationCard
                      key={rec.builderId}
                      rec={rec}
                      inviteBusy={inviteBusy}
                      onOpenProfile={() => void openProfile(rec)}
                      onInvite={() => void invite(rec.builderId)}
                      onReject={() => void rejectCandidate(rec.builderId)}
                    />
                  ))
                )}
              </div>
            ) : rightPane === "outreach" ? (
              <PipelineTable
                columns={["Builder", "Response", "Interview", "Status", "Action"]}
                rows={buckets.outreach}
                emptyLabel="No builders in outreach yet. Invite someone from Recommended to start."
                renderRow={(rec) => {
                  const badge = responseBadge(rec.matchStatus);
                  return (
                    <>
                      <BuilderCell rec={rec} onOpenProfile={() => void openProfile(rec)} />
                      <td className="py-4 text-sm text-black/70">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} /> {badge.label}
                        </span>
                      </td>
                      <td className="py-4 text-sm text-black/55">{interviewLabel(rec)}</td>
                      <td className="py-4 text-sm text-black/55">{outreachStatusLabel(rec)}</td>
                      <td className="py-4">
                        {rec.matchStatus === "builder_interested" || rec.matchStatus === "interviewing" ? (
                          <div className="flex flex-wrap gap-2">
                            {rec.matchStatus === "builder_interested" && (
                              <button
                                type="button"
                                onClick={() => openScheduleDialog(rec)}
                                className="inline-flex h-8 items-center rounded-lg border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black hover:bg-[#fdfaf7]"
                              >
                                Schedule Interview
                              </button>
                            )}
                            {rec.matchStatus === "interviewing" && !rec.callCompletedAt && (
                              <button
                                type="button"
                                onClick={() => void markCallComplete(rec)}
                                disabled={actionBusy === rec.builderId}
                                className="inline-flex h-8 items-center rounded-lg border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black hover:bg-[#fdfaf7] disabled:opacity-50"
                              >
                                {actionBusy === rec.builderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Mark call complete"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void openSendTrialDialog(rec)}
                              className="inline-flex h-8 items-center rounded-lg bg-[#ec9149] px-3 text-xs font-semibold text-white hover:bg-[#dd7f36]"
                            >
                              Send Trial
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              openChatWithDraft(`Help me follow up with ${rec.name} about the ${roleLabel} role — they're currently at "${outreachStatusLabel(rec)}".`)
                            }
                            className="inline-flex h-8 items-center rounded-lg border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black hover:bg-[#fdfaf7]"
                          >
                            Continue in chat
                          </button>
                        )}
                      </td>
                    </>
                  );
                }}
              />
            ) : rightPane === "trial" ? (
              <PipelineTable
                columns={["Builder", "Trial", "Submitted", "Due Date", "Status", "Action"]}
                rows={buckets.trial}
                emptyLabel="No builders in trial yet."
                renderRow={(rec) => {
                  const trial = rec.trialProject;
                  const statusKey = trial?.status || "draft";
                  return (
                    <>
                      <BuilderCell rec={rec} onOpenProfile={() => void openProfile(rec)} />
                      <td className="py-4 text-sm text-black/55">{trial?.title || "—"}</td>
                      <td className="py-4 text-sm text-black/55">{trial?.submission?.submittedAt ? "Yes" : "No"}</td>
                      <td className="py-4 text-sm text-black/55">
                        {trial?.deadlineAt ? new Date(trial.deadlineAt).toLocaleDateString() : trial?.timeline || "—"}
                      </td>
                      <td className="py-4 text-sm text-black/55">
                        {rec.matchStatus === "offer" ? "Approved — ready to hire" : TRIAL_STATUS_LABELS[statusKey] || statusKey}
                      </td>
                      <td className="py-4">
                        {rec.matchStatus === "offer" ? (
                          <button
                            type="button"
                            onClick={() => openHireDialog(rec)}
                            className="inline-flex h-8 items-center rounded-lg bg-[#ec9149] px-3 text-xs font-semibold text-white hover:bg-[#dd7f36]"
                          >
                            Hire
                          </button>
                        ) : statusKey === "submitted" ? (
                          <button
                            type="button"
                            onClick={() => openReviewDialog(rec)}
                            className="inline-flex h-8 items-center rounded-lg bg-[#ec9149] px-3 text-xs font-semibold text-white hover:bg-[#dd7f36]"
                          >
                            Review Submission
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              openChatWithDraft(`Help me with ${rec.name}'s trial for the ${roleLabel} role — the trial "${trial?.title || ""}" is currently "${TRIAL_STATUS_LABELS[statusKey] || statusKey}".`)
                            }
                            className="inline-flex h-8 items-center rounded-lg border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black hover:bg-[#fdfaf7]"
                          >
                            Continue in chat
                          </button>
                        )}
                      </td>
                    </>
                  );
                }}
              />
            ) : rightPane === "hired" ? (
              <PipelineTable
                columns={["Builder", "Headline", "Status", "Action"]}
                rows={buckets.hired}
                emptyLabel="No builders hired yet."
                renderRow={(rec) => (
                  <>
                    <BuilderCell rec={rec} onOpenProfile={() => void openProfile(rec)} />
                    <td className="py-4 text-sm text-black/55">{rec.headline || "—"}</td>
                    <td className="py-4 text-sm text-black/55">Hired</td>
                    <td className="py-4">
                      <button
                        type="button"
                        onClick={() => openChatWithDraft(`Help me set up onboarding for ${rec.name} for the ${roleLabel} role.`)}
                        className="inline-flex h-8 items-center rounded-lg border border-[#ece7e1] bg-white px-3 text-xs font-semibold text-black hover:bg-[#fdfaf7]"
                      >
                        Continue in chat
                      </button>
                    </td>
                  </>
                )}
              />
            ) : null}
          </div>
        )}
      </main>

      {profileDialog}
      {upgradeModalEl}
      {schedulingLinkModal}
      {pipelineDialog}
    </div>
  );
};

const Avatar: React.FC<{ name: string; avatarUrl?: string | null; className?: string }> = ({ name, avatarUrl, className = "h-12 w-12" }) =>
  avatarUrl ? (
    <img src={avatarUrl} alt={name} className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-full bg-[#f3ede4] text-sm font-semibold text-black/60`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );

const BuilderCell: React.FC<{ rec: Recommendation; onOpenProfile: () => void }> = ({ rec, onOpenProfile }) => (
  <td className="py-4 pr-4">
    <button type="button" onClick={onOpenProfile} className="flex items-center gap-3 text-left">
      <Avatar name={rec.name} avatarUrl={rec.avatarUrl} className="h-9 w-9" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-black hover:underline">{rec.name}</p>
        {rec.location && <p className="truncate text-xs text-black/40">{rec.location}</p>}
      </div>
    </button>
  </td>
);

const AgentTraceTeaserSection: React.FC<{ teaser: AgentTraceTeaser; compact?: boolean }> = ({ teaser, compact }) => (
  <section className={`rounded-2xl border border-[#ec9149]/25 bg-[#fff7ef] ${compact ? "p-3" : "p-4 mb-6"}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#c56a12]">
        {teaser.hasAgentWrapped ? "Agent Wrapped" : "Agent trace preview"}
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {teaser.hasAgentWrapped ? (
          <span className="rounded-full bg-[#ec9149]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c56a12]">Uploaded</span>
        ) : null}
        {typeof teaser.wrappedScore === "number" ? (
          <span className="text-[10px] font-semibold text-[#c56a12]">Founder fit {teaser.wrappedScore}/100</span>
        ) : null}
        <span className="text-[10px] text-black/40">{teaser.label}</span>
      </div>
    </div>
    {teaser.archetype ? (
      <p className={`mb-2 font-semibold text-black ${compact ? "text-xs" : "text-sm"}`}>{teaser.archetype}</p>
    ) : null}
    {teaser.bestFitRoles?.length ? (
      <p className={`mb-2 text-black/55 ${compact ? "text-[11px]" : "text-xs"}`}>
        Best fit: {teaser.bestFitRoles.join(" · ")}
      </p>
    ) : null}
    {teaser.projectHighlight ? (
      <p className={`mb-2 font-medium italic text-[#c56a12]/90 ${compact ? "text-[11px] line-clamp-2" : "text-xs"}`}>
        {teaser.projectHighlight}
      </p>
    ) : null}
    {teaser.sourceBadges.length > 0 ? (
      <div className="mb-2 flex flex-wrap gap-1.5">
        {teaser.sourceBadges.map((badge) => (
          <span key={badge} className="rounded-md border border-[#ece7e1] bg-white px-2 py-0.5 text-[10px] text-black/55">
            {badge}
          </span>
        ))}
      </div>
    ) : null}
    <p className={`leading-relaxed text-black/75 ${compact ? "text-xs line-clamp-3" : "text-sm"}`}>{teaser.visibleInsight}</p>
    {teaser.quantifiedSignals?.length ? (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {teaser.quantifiedSignals.map((signal) => (
          <span key={signal} className="rounded-md border border-[#ec9149]/20 bg-[#ec9149]/10 px-2 py-0.5 text-[10px] font-medium text-[#c56a12]">
            {signal}
          </span>
        ))}
      </div>
    ) : null}
    {teaser.locked && teaser.redacted.length > 0 ? (
      <div className="mt-2 space-y-1">
        {teaser.redacted.slice(0, compact ? 2 : 3).map((item) => (
          <div key={item} className="flex items-center gap-2 text-[11px] text-black/35">
            <span className="h-1.5 w-1.5 rounded-full bg-black/15" />
            <span className="blur-[2px] select-none">{item}</span>
          </div>
        ))}
        <p className="pt-1 text-[11px] text-black/45">Upgrade to Growth to unlock the full Agent Wrapped trace.</p>
      </div>
    ) : null}
  </section>
);

const PipelineTable: React.FC<{
  columns: string[];
  rows: Recommendation[];
  emptyLabel: string;
  renderRow: (rec: Recommendation) => React.ReactNode;
}> = ({ columns, rows, emptyLabel, renderRow }) => {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#e3ddd4] p-8 text-center text-sm text-black/45">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-[#ece7e1] text-left text-xs font-semibold uppercase tracking-wide text-black/40">
            {columns.map((col) => (
              <th key={col} className="pb-3 pr-4 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#ece7e1]">
          {rows.map((rec) => (
            <tr key={rec.builderId}>{renderRow(rec)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const RecommendationCard: React.FC<{
  rec: Recommendation;
  inviteBusy: string | null;
  onOpenProfile: () => void;
  onInvite: () => void;
  onReject: () => void;
}> = ({ rec, inviteBusy, onOpenProfile, onInvite, onReject }) => {
  const links = rec.links || {};
  const verified = Boolean(rec.builderVerificationLabel && rec.builderVerificationLabel !== "Unverified");
  const experiences = rec.experiences || [];
  const projects = rec.projects || [];
  const visibleExperiences = experiences.slice(0, 2);
  const visibleProjects = projects.slice(0, 2);
  return (
    <article className="rounded-2xl border border-[#ece7e1] bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.05),0_10px_30px_rgba(16,24,40,0.05)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <Avatar name={rec.name} avatarUrl={rec.avatarUrl} className="h-10 w-10" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={onOpenProfile} className="text-sm font-semibold text-black hover:underline">
                {rec.name}
              </button>
              {verified && <BadgeCheck className="h-3.5 w-3.5 text-[#ec9149]" />}
            </div>
            <p className="truncate text-xs text-black/55">{rec.headline || rec.bio}</p>
            {rec.location && <p className="text-[11px] text-black/40">{rec.location}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="rounded-full bg-[#f3ede4] px-2 py-0.5 text-[11px] font-semibold text-black/55">
            {Math.round(rec.matchScore || 0)}% match
          </span>
          <div className="flex items-center gap-1.5">
            {links.linkedin && (
              <a href={links.linkedin} target="_blank" rel="noreferrer" className="text-black/40 hover:text-black">
                <Linkedin className="h-3.5 w-3.5" />
              </a>
            )}
            {links.github && (
              <a href={links.github} target="_blank" rel="noreferrer" className="text-black/40 hover:text-black">
                <Github className="h-3.5 w-3.5" />
              </a>
            )}
            {links.portfolio && (
              <a href={links.portfolio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-black/55 hover:text-black">
                <Globe className="h-3 w-3" /> Portfolio
              </a>
            )}
            {links.resume && (
              <a href={links.resume} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-black/55 hover:text-black">
                <FileText className="h-3 w-3" /> Resume
              </a>
            )}
          </div>
        </div>
      </div>

      {rec.whyTheyMatch && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-black/65">{rec.whyTheyMatch}</p>
      )}

      {rec.teasers?.agentTrace ? (
        <div className="mt-3">
          <AgentTraceTeaserSection teaser={rec.teasers.agentTrace} compact />
        </div>
      ) : null}

      {(visibleExperiences.length > 0 || visibleProjects.length > 0 || (rec.topSkills || []).length > 0) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {visibleExperiences.map((exp, index) => (
            <span key={`exp-${index}`} className="rounded-full border border-[#ece7e1] bg-[#fdfaf7] px-2.5 py-1 text-[11px] text-black/60">
              {exp.company}
              {exp.isCurrent ? " · Present" : ""}
            </span>
          ))}
          {experiences.length > visibleExperiences.length && (
            <span className="rounded-full border border-[#ece7e1] px-2.5 py-1 text-[11px] text-black/40">
              +{experiences.length - visibleExperiences.length} more
            </span>
          )}
          {visibleProjects.map((project) => {
            const href = project.links?.demo || project.links?.github || project.links?.devpost;
            return href ? (
              <a
                key={project._id}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[#ece7e1] bg-[#fdfaf7] px-2.5 py-1 text-[11px] text-black/60 hover:bg-[#f3ede4]"
              >
                {project.projectName} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : (
              <span key={project._id} className="rounded-full border border-[#ece7e1] bg-[#fdfaf7] px-2.5 py-1 text-[11px] text-black/60">
                {project.projectName}
              </span>
            );
          })}
          {projects.length > visibleProjects.length && (
            <span className="rounded-full border border-[#ece7e1] px-2.5 py-1 text-[11px] text-black/40">
              +{projects.length - visibleProjects.length} more
            </span>
          )}
          {(rec.topSkills || []).slice(0, 5).map((skill) => (
            <span key={skill} className="rounded-full border border-[#ece7e1] px-2.5 py-1 text-[11px] text-black/55">
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-[#ece7e1] pt-3">
        <button type="button" onClick={onOpenProfile} className="inline-flex h-8 items-center rounded-lg bg-[#f3ede4] px-2.5 text-xs font-medium text-black hover:bg-[#ece3d5]">
          View full profile
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReject}
            className="inline-flex h-8 items-center rounded-lg border border-[#ece7e1] px-2.5 text-xs font-semibold text-black hover:bg-[#fdfaf7]"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onInvite}
            disabled={rec.introRequested || inviteBusy === rec.builderId}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#ec9149] px-2.5 text-xs font-semibold text-white hover:bg-[#dd7f36] disabled:opacity-50"
          >
            {inviteBusy === rec.builderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            {rec.introRequested ? "Invited" : inviteBusy === rec.builderId ? "Checking" : "Invite"}
          </button>
        </div>
      </div>
    </article>
  );
};

const Field: React.FC<{ label: string; value: string; placeholder?: string; onChange: (value: string) => void }> = ({
  label,
  value,
  placeholder,
  onChange,
}) => (
  <label className="space-y-2">
    <span className="text-sm text-black/45">{label}</span>
    <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);

const Area: React.FC<{ label: string; value: string; placeholder?: string; onChange: (value: string) => void }> = ({
  label,
  value,
  placeholder,
  onChange,
}) => (
  <label className="space-y-2">
    <span className="text-sm text-black/45">{label}</span>
    <textarea className={textareaClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);

const SectionCard: React.FC<{ number: number; title: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({
  number,
  title,
  open,
  onToggle,
  children,
}) => (
  <div className="rounded-2xl border border-[#ece7e1] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-4 text-left"
      aria-expanded={open}
    >
      <h2 className="text-base font-semibold text-black">
        {number}. {title}
      </h2>
      <ChevronDown className={`h-4 w-4 shrink-0 text-[#ec9149] transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <div className="px-5 pb-5">{children}</div>}
  </div>
);

export const FounderRoleWorkspacePage: React.FC<{ roleId: string }> = ({ roleId }) => (
  <AuthProvider>
    <FounderRoleWorkspaceInner roleId={roleId} />
  </AuthProvider>
);

export default FounderRoleWorkspacePage;
