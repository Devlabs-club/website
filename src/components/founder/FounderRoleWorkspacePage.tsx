import React, { useEffect, useMemo, useRef, useState } from "react";
import { AuthProvider } from "@/components/auth_manager";
import { AppTopBar } from "@/components/app/AppTopBar";
import { ArrowLeft, Loader2, Send, Sparkles, UserPlus } from "lucide-react";
import { BuilderProfileView, fetchBuilderProfile, type BuilderProfile } from "@/components/founder/BuilderFullProfilePage";

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
};

type Recommendation = {
  builderId: string;
  name: string;
  headline?: string | null;
  bio?: string | null;
  matchScore?: number;
  matchLabel?: string;
  topSkills?: string[];
  proofStrengthLabel?: string;
  builderVerificationLabel?: string;
  whyTheyMatch?: string | null;
  projects?: Array<{ _id: string; projectName: string; description?: string | null; techStack?: string[] }>;
  introRequested?: boolean;
};

type BillingSummary = {
  success?: boolean;
  error?: string;
  entitlements?: {
    lifecycleAccess?: 'locked' | 'enabled';
  };
};

const inputClass =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";
const textareaClass =
  "min-h-24 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/40";

function toCsv(values?: string[]) {
  return (values || []).join(", ");
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const INTRO_MESSAGES: Array<{ role: "founder" | "assistant"; content: string }> = [
  { role: "assistant", content: "Hey! Let's get this role tight so I can find you the right builder." },
  { role: "assistant", content: "First up, what will they actually build? The product, the feature, the thing they'll own." },
];

const FounderRoleWorkspaceInner: React.FC<{ roleId: string }> = ({ roleId }) => {
  const [job, setJob] = useState<Job | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [chat, setChat] = useState<Array<{ role: "founder" | "assistant"; content: string }>>(INTRO_MESSAGES);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [rightPane, setRightPane] = useState<"editor" | "recommendations" | "profile">("editor");
  const [profile, setProfile] = useState<BuilderProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [pendingAgentFollowup, setPendingAgentFollowup] = useState("");
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
          setRecommendations(data.recommendations || []);
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
  }, [chat]);

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
        // When the agent actually runs the search, jump to the builders pane and load results.
        if (data.searchRan) {
          setRightPane("recommendations");
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
          setRightPane("editor");
          return;
        }
        setRecommendations(data.recommendations || []);
        setRightPane("recommendations");
      }
      else setError(data.error || "Could not search builders.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  /** Open a builder's full profile in the right pane, over the suggestions list. */
  const openProfile = async (builderId: string) => {
    setRightPane("profile");
    setProfile(null);
    setProfileLoading(true);
    try {
      setProfile(await fetchBuilderProfile(builderId));
    } finally {
      setProfileLoading(false);
    }
  };

  const startGrowthCheckout = async () => {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        plan: "growth",
        interval: "monthly",
        returnPath: `${window.location.pathname}${window.location.search}`,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.url) {
      window.location.href = data.url;
      return true;
    }
    setError(data.error || "Could not start checkout. Check Stripe price IDs in your local .env.");
    return false;
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

  const invite = async (builderId: string) => {
    if (inviteBusy) return;
    setInviteBusy(builderId);
    setError("");
    if (!(await hasLifecycleAccess())) {
      await startGrowthCheckout();
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
        prev.map((rec) => (rec.builderId === builderId ? { ...rec, introRequested: true } : rec))
      );
    } else if (res.status === 402 && data.upgradeTarget === "growth") {
      await startGrowthCheckout();
    } else {
      setError(data.error || "Could not invite this builder.");
    }
    setInviteBusy(null);
  };

  return (
    <div className="founder-dark-canvas founder-role-dark min-h-screen text-foreground">
      <AppTopBar
        variant="dark"
        right={<a href="/founder/home" className="text-sm font-semibold text-white/55 hover:text-white">Home</a>}
      />
      <main className="relative z-10 mx-auto w-full max-w-[1500px] px-4 py-4 sm:px-6 lg:px-8">
        <a href="/founder/home" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </a>

        {loading ? (
          <div className="flex h-80 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !job ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">{error || "Role not found."}</p>
        ) : (
          <div className="grid min-h-0 gap-4 lg:h-[calc(100vh-8.75rem)] lg:grid-cols-2">
            <aside className="flex min-h-[520px] flex-col rounded-2xl border border-border bg-card lg:min-h-0">
              <div className="border-b border-border p-4">
                <p className="text-sm font-semibold">Suggest changes</p>
                <p className="mt-1 text-xs text-muted-foreground">Use natural language to revise this role.</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {chat.map((item, index) => (
                  <div
                    key={index}
                    className={`chat-message-row ${item.role === "founder" ? "chat-message-row-user" : "chat-message-row-agent"}`}
                  >
                    <div className={`chat-bubble ${item.role === "founder" ? "chat-bubble-user" : "chat-bubble-agent"}`}>
                      {item.content}
                    </div>
                  </div>
                ))}

                <div ref={chatEndRef} />
              </div>
              <div className="pb-8 p-3">
                {(job.description || job.title) && (
                  <button
                    type="button"
                    onClick={() => setRightPane("editor")}
                    className="group relative mb-3 flex h-36 w-full overflow-hidden rounded-[24px] border border-border bg-background text-left transition-colors hover:bg-muted/30"
                    aria-label="Open job description"
                  >
                    <span className="relative z-10 flex min-w-0 flex-1 flex-col justify-center px-7 pr-36 sm:px-10 sm:pr-52">
                      <span className="block text-[24px] font-semibold leading-tight text-foreground sm:text-[28px]">Job Description</span>
                      <span className="mt-4 block truncate text-[15px] leading-tight text-muted-foreground sm:text-[17px]">
                        Please find your last saved job description here
                      </span>
                    </span>
                    <span className="pointer-events-none absolute -bottom-8 right-8 h-36 w-28 rotate-[4deg] rounded-lg border border-border bg-card shadow-[0_18px_42px_hsl(var(--foreground)/0.12)] transition-transform group-hover:rotate-[2deg] group-hover:scale-[1.02]">
                      <span className="absolute left-4 top-3 text-[14px] font-medium leading-4 text-muted-foreground">Job<br />Description</span>
                      <span className="absolute left-4 top-[3.25rem] h-1.5 w-16 rounded-full bg-muted" />
                      <span className="absolute left-4 top-[4.05rem] h-1.5 w-12 rounded-full bg-muted" />
                      <span className="absolute left-4 top-[5.35rem] h-1.5 w-20 rounded-full bg-muted" />
                      <span className="absolute left-4 top-[6.15rem] h-1.5 w-20 rounded-full bg-muted" />
                      <span className="absolute left-4 top-[7.95rem] h-1.5 w-16 rounded-full bg-muted" />
                    </span>
                  </button>
                )}
                <div className="flex gap-2">
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void sendChat();
                    }}
                    placeholder="Suggest changes..."
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={sendChat}
                    aria-label="Send"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </aside>

            <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {rightPane === "editor"
                      ? "Fill in the details"
                      : rightPane === "profile"
                      ? "Builder profile"
                      : "Recommended profiles"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rightPane === "editor"
                      ? "Review and edit the role while the agent helps on the left."
                      : rightPane === "profile"
                      ? "Full proof-of-work for this builder."
                      : "Ranked builders for this role. You can invite or open full profiles."}
                  </p>
                </div>
                {rightPane === "recommendations" && (
                  <button
                    type="button"
                    onClick={() => setRightPane("editor")}
                    className="inline-flex h-10 items-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    Edit job details
                  </button>
                )}
                {rightPane === "profile" && (
                  <button
                    type="button"
                    onClick={() => setRightPane("recommendations")}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to suggestions
                  </button>
                )}
              </div>

              {rightPane === "editor" ? (
                <>
                  <div className="min-h-0 flex-1 overflow-y-auto p-6">
                    <div className="mx-auto max-w-4xl space-y-6">
                      <div>
                        <h1 className="text-3xl font-semibold tracking-tight">{draft.title || "Role details"}</h1>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          {draft.skillsNeeded && <span>{draft.skillsNeeded.split(",").slice(0, 2).join(", ")}</span>}
                          {draft.salary && <span>{draft.salary}</span>}
                          {draft.location && <span>{draft.location}</span>}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border p-5">
                        <h2 className="mb-4 text-lg font-semibold">Basics</h2>
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
                      </div>

                      <div className="rounded-2xl border border-border p-5">
                        <h2 className="mb-4 text-lg font-semibold">Description</h2>
                        <Area label="Job description" value={draft.description || ""} onChange={(v) => updateDraft("description", v)} />
                        <div className="mt-4">
                          <Area label="Responsibilities" value={draft.responsibilities || ""} onChange={(v) => updateDraft("responsibilities", v)} placeholder="Comma-separated responsibilities" />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border p-5">
                        <h2 className="mb-4 text-lg font-semibold">Skills</h2>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Required skills" value={draft.skillsNeeded || ""} onChange={(v) => updateDraft("skillsNeeded", v)} />
                          <Field label="Nice to have" value={draft.niceToHaveSkills || ""} onChange={(v) => updateDraft("niceToHaveSkills", v)} />
                        </div>
                      </div>

                      {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-3">
                    <button
                      type="button"
                      onClick={saveJob}
                      disabled={saving}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
                    </button>
                    <button
                      type="button"
                      onClick={runSearch}
                      disabled={searching}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Submit & suggest builders
                    </button>
                  </div>
                </>
              ) : rightPane === "profile" ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {profileLoading || !profile ? (
                    <div className="flex h-60 items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <div className="mx-auto max-w-3xl">
                      <BuilderProfileView profile={profile} />
                      <div className="mt-8 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void invite(profile.id)}
                          disabled={inviteBusy === profile.id}
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {inviteBusy === profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                          Invite {profile.name?.split(" ")[0] || "builder"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto p-6">
                  {searching && recommendations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Searching builders with real proof-of-work for this role…
                    </div>
                  ) : recommendations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      Submit the role to generate builder recommendations.
                    </div>
                  ) : (
                    <div className="mx-auto max-w-3xl space-y-4">
                    {recommendations.map((rec) => (
                      <article key={rec.builderId} className="rounded-2xl border border-border p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-4">
                            <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => void openProfile(rec.builderId)} className="font-semibold hover:underline">{rec.name}</button>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {Math.round(rec.matchScore || 0)}% match
                                </span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{rec.headline || rec.bio || "Builder profile"}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => void openProfile(rec.builderId)}
                              className="inline-flex h-9 items-center rounded-xl bg-muted px-3 text-xs font-medium hover:bg-muted/80"
                            >
                              See full profile
                            </button>
                            <button
                              type="button"
                              onClick={() => void invite(rec.builderId)}
                              disabled={rec.introRequested || inviteBusy === rec.builderId}
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {inviteBusy === rec.builderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                              {rec.introRequested ? "Invited" : inviteBusy === rec.builderId ? "Checking" : "Invite"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-4 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">{rec.whyTheyMatch || rec.matchLabel || "Matched from proof-of-work signals."}</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {(rec.topSkills || []).slice(0, 4).map((skill) => (
                            <span key={skill} className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">{skill}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; placeholder?: string; onChange: (value: string) => void }> = ({
  label,
  value,
  placeholder,
  onChange,
}) => (
  <label className="space-y-2">
    <span className="text-sm text-muted-foreground">{label}</span>
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
    <span className="text-sm text-muted-foreground">{label}</span>
    <textarea className={textareaClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);

export const FounderRoleWorkspacePage: React.FC<{ roleId: string }> = ({ roleId }) => (
  <AuthProvider>
    <FounderRoleWorkspaceInner roleId={roleId} />
  </AuthProvider>
);

export default FounderRoleWorkspacePage;
