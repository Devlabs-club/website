import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Loader2, Plus, RefreshCcw, Search, Send, ShieldCheck, UserCheck } from 'lucide-react';
import { AuthProvider, useAuth } from '@/components/auth_manager';
import AdminShell from '@/components/admin/AdminShell';
import type { AdminSection } from '@/components/admin/AdminSidebar';
import {
  AdminEmptyState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminMutedClass,
  adminPanelClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  adminSelectClass,
} from '@/components/admin/adminUi';

type ManagedRole = {
  id: string;
  founderEmail: string;
  founderName: string;
  company: string;
  roleTitle: string;
  startupSummary: string;
  fundingStage: string;
  location: string;
  skillsNeeded: string[];
  salary: string;
  visa: string;
  status: string;
  managedRole?: {
    sourceUrl?: string | null;
    sourceLabel?: string | null;
    ownerUserId?: string | null;
    pipelineStage?: string | null;
    nextAction?: string | null;
    followUpAt?: string | null;
    searchSprintStatus?: string | null;
    lastContactAt?: string | null;
  };
  claim?: { id: string; targetEmail: string; status: string; expiresAt: string | null } | null;
  shortlist?: { totalMatches: number; strongMatchCount: number; previewGeneratedAt: string | null; unlocked: boolean } | null;
  latestDraft?: Draft | null;
  matches?: Match[];
  drafts?: Draft[];
};

type Match = {
  builderId: string;
  name: string;
  headline: string;
  location: string;
  matchScore: number;
  matchLabel: string;
  whyTheyMatch: string;
  reviewStatus: string;
  consentStatus: string | null;
};

type Draft = {
  id: string;
  targetEmail: string;
  channel: string;
  subject: string;
  body: string;
  publicPreviewUrl: string | null;
  status: string;
  createdAt: string | null;
};

const stageOptions = [
  'sourced',
  'matched',
  'draft_ready',
  'approved_to_contact',
  'contacted',
  'replied',
  'qualified_call',
  'sprint_proposed',
  'deposit_paid',
  'shortlist_delivered',
  'intro_requested',
  'interviewing',
  'hired',
  'lost',
];

const initialForm = {
  targetEmail: '',
  founderName: '',
  company: '',
  roleTitle: '',
  skillsNeeded: '',
  must: '',
  startupSummary: '',
  fundingStage: '',
  location: '',
  salary: '',
  sourceUrl: '',
  sourceLabel: 'manual',
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.message || data.error || `Request failed (${res.status})`);
  return data as T;
}

function InnerManagedRolesAdminPage() {
  const { user, loading, logout } = useAuth();
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ManagedRole | null>(null);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== 'admin') window.location.replace('/404');
  }, [loading, user]);

  const loadRoles = async () => {
    const data = await jsonFetch<{ roles: ManagedRole[] }>('/api/admin/managed-roles');
    setRoles(data.roles || []);
  };

  const loadRole = async (id: string) => {
    const data = await jsonFetch<{ role: ManagedRole }>(`/api/admin/managed-roles/${id}`);
    setSelected(data.role);
    setSelectedId(id);
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    void loadRoles().catch((err) => setError(err instanceof Error ? err.message : 'Could not load managed roles.'));
  }, [user]);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    setError('');
    try {
      await task();
      await loadRoles();
      if (selectedId) await loadRole(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const text = query.toLowerCase().trim();
    if (!text) return roles;
    return roles.filter((role) =>
      [role.company, role.roleTitle, role.founderEmail, role.managedRole?.pipelineStage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(text)
    );
  }, [roles, query]);

  const createRole = async (event: React.FormEvent) => {
    event.preventDefault();
    await run('Creating role', async () => {
      const data = await jsonFetch<{ role: ManagedRole }>('/api/admin/managed-roles', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm(initialForm);
      if (data.role?.id) await loadRole(data.role.id);
    });
  };

  const updateSelected = (body: Record<string, unknown>) =>
    run('Saving', async () => {
      if (!selected) return;
      await jsonFetch(`/api/admin/managed-roles/${selected.id}`, { method: 'PUT', body: JSON.stringify(body) });
    });

  const handleNav = (section: AdminSection) => {
    if (section === 'managedRoles') return;
    window.location.href = '/admin';
  };

  if (loading || !user || user.role !== 'admin') {
    return <div className="grid min-h-screen place-items-center bg-[#fbf6f3] text-sm font-semibold text-black/55">Verifying admin access…</div>;
  }

  return (
    <AdminShell activeSection="managedRoles" onSectionChange={handleNav} applicationCount={0} onLogout={logout}>
      <div className="space-y-6">
        <AdminPageHeader
          eyebrow="Admin"
          title="Managed Roles"
          subtitle="Create founder roles, run the existing matching pipeline, approve builders, record consent, and draft outreach."
        />

        {error ? <div className="rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

        <form onSubmit={createRole} className={`${adminPanelClass} grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4`}>
          <label className="space-y-2">
            <span className={adminLabelClass}>Founder email</span>
            <input className={adminInputClass} type="email" required value={form.targetEmail} onChange={(e) => setForm({ ...form, targetEmail: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Company</span>
            <input className={adminInputClass} required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Role</span>
            <input className={adminInputClass} required value={form.roleTitle} onChange={(e) => setForm({ ...form, roleTitle: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Founder name</span>
            <input className={adminInputClass} value={form.founderName} onChange={(e) => setForm({ ...form, founderName: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Skills</span>
            <input className={adminInputClass} value={form.skillsNeeded} onChange={(e) => setForm({ ...form, skillsNeeded: e.target.value })} placeholder="React, TypeScript" />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Must haves</span>
            <input className={adminInputClass} value={form.must} onChange={(e) => setForm({ ...form, must: e.target.value })} placeholder="Shipped AI workflow; founding eng" />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Source URL</span>
            <input className={adminInputClass} value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Lead source</span>
            <input className={adminInputClass} value={form.sourceLabel} onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })} />
          </label>
          <label className="space-y-2 xl:col-span-2">
            <span className={adminLabelClass}>Startup summary</span>
            <input className={adminInputClass} value={form.startupSummary} onChange={(e) => setForm({ ...form, startupSummary: e.target.value })} />
          </label>
          <label className="space-y-2">
            <span className={adminLabelClass}>Funding</span>
            <input className={adminInputClass} value={form.fundingStage} onChange={(e) => setForm({ ...form, fundingStage: e.target.value })} />
          </label>
          <button className={adminPrimaryButtonClass(Boolean(busy))} disabled={Boolean(busy)} type="submit">
            {busy === 'Creating role' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create managed role
          </button>
        </form>

        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <section className={`${adminPanelClass} p-4`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
              <input className={`${adminInputClass} pl-10`} placeholder="Search roles…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="mt-4 space-y-2">
              {filtered.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => void loadRole(role.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${selectedId === role.id ? 'border-[#ff7417]/40 bg-[#fff5ef]' : 'border-black/10 bg-white hover:bg-[#f8f5f1]'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black text-[#050505]">{role.company}</p>
                    <span className="rounded-full border border-black/10 px-2 py-0.5 text-[10px] font-bold text-black/45">{role.managedRole?.pipelineStage || 'sourced'}</span>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-black/55">{role.roleTitle}</p>
                  <p className="mt-1 truncate text-xs text-black/40">{role.founderEmail}</p>
                </button>
              ))}
              {filtered.length === 0 ? <p className={`${adminMutedClass} p-4`}>No managed roles yet.</p> : null}
            </div>
          </section>

          <section className={`${adminPanelClass} p-5`}>
            {!selected ? (
              <AdminEmptyState title="Select a managed role" description="Review matches, consent, claim links, and outreach drafts from here." />
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className={adminLabelClass}>{selected.managedRole?.pipelineStage || 'sourced'}</p>
                    <h2 className="mt-1 text-3xl font-black tracking-[-0.04em]">{selected.roleTitle} at {selected.company}</h2>
                    <p className={adminMutedClass}>{selected.founderEmail} · {selected.shortlist ? `${selected.shortlist.totalMatches} matches` : 'No shortlist yet'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={adminSecondaryButtonClass()} disabled={Boolean(busy)} onClick={() => void run('Searching', async () => { await jsonFetch(`/api/admin/managed-roles/${selected.id}/search`, { method: 'POST', body: '{}' }); })}>
                      {busy === 'Searching' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      Run matching
                    </button>
                    <button className={adminSecondaryButtonClass()} disabled={Boolean(busy)} onClick={() => void run('Claim', async () => { const data = await jsonFetch<{ claimUrl: string; previewUrl: string }>(`/api/admin/managed-roles/${selected.id}/claim`, { method: 'POST', body: '{}' }); await navigator.clipboard?.writeText(data.previewUrl); })}>
                      Rotate preview link
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className={adminLabelClass}>Stage</span>
                    <select className={adminSelectClass} value={selected.managedRole?.pipelineStage || 'sourced'} onChange={(e) => void updateSelected({ pipelineStage: e.target.value })}>
                      {stageOptions.map((stage) => <option key={stage} value={stage}>{stage.replace(/_/g, ' ')}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className={adminLabelClass}>Next action</span>
                    <input className={adminInputClass} defaultValue={selected.managedRole?.nextAction || ''} onBlur={(e) => void updateSelected({ nextAction: e.target.value })} />
                  </label>
                  <label className="space-y-2">
                    <span className={adminLabelClass}>Follow-up</span>
                    <input className={adminInputClass} type="date" defaultValue={selected.managedRole?.followUpAt?.slice(0, 10) || ''} onBlur={(e) => void updateSelected({ followUpAt: e.target.value })} />
                  </label>
                </div>

                <div>
                  <p className={adminLabelClass}>Matches</p>
                  <div className="mt-3 grid gap-3">
                    {(selected.matches || []).length === 0 ? <p className={adminMutedClass}>No matches yet. Run matching first.</p> : selected.matches!.map((match) => (
                      <div key={match.builderId} className="rounded-xl border border-black/10 bg-[#fffaf7] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black">{match.name}</p>
                            <p className="text-sm text-black/55">{match.headline || match.location}</p>
                            <p className="mt-1 text-xs font-bold text-[#bf4f08]">{match.matchLabel} · {match.matchScore}% · {match.reviewStatus}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button className={adminSecondaryButtonClass()} onClick={() => void run('Approve', async () => { await jsonFetch(`/api/admin/managed-roles/${selected.id}/matches`, { method: 'POST', body: JSON.stringify({ builderId: match.builderId, reviewStatus: 'approved_for_outreach', founderFacingFitReason: match.whyTheyMatch }) }); })}><Check className="h-4 w-4" /> Approve</button>
                            <button className={adminSecondaryButtonClass()} onClick={() => void run('Consent', async () => { await jsonFetch(`/api/admin/managed-roles/${selected.id}/consents`, { method: 'POST', body: JSON.stringify({ builderId: match.builderId, status: 'pending' }) }); })}><UserCheck className="h-4 w-4" /> Request consent</button>
                            <button className={adminSecondaryButtonClass()} onClick={() => void run('Consent', async () => { await jsonFetch(`/api/admin/managed-roles/${selected.id}/consents`, { method: 'POST', body: JSON.stringify({ builderId: match.builderId, status: 'granted' }) }); })}><ShieldCheck className="h-4 w-4" /> Mark granted</button>
                            <button className={adminPrimaryButtonClass(Boolean(busy))} onClick={() => void run('Draft', async () => { await jsonFetch(`/api/admin/managed-roles/${selected.id}/drafts`, { method: 'POST', body: JSON.stringify({ builderId: match.builderId, fitReason: match.whyTheyMatch }) }); })}><Send className="h-4 w-4" /> Draft</button>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-black/65">{match.whyTheyMatch || 'No match reason stored yet.'}</p>
                        <p className="mt-2 text-xs font-bold text-black/40">Consent: {match.consentStatus || 'not requested'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className={adminLabelClass}>Outreach drafts</p>
                  <div className="mt-3 grid gap-3">
                    {(selected.drafts || []).length === 0 ? <p className={adminMutedClass}>No drafts yet. Drafts are never sent automatically.</p> : selected.drafts!.map((draft) => (
                      <div key={draft.id} className="rounded-xl border border-black/10 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="font-black">{draft.subject}</p>
                          <span className="rounded-full border border-black/10 px-2 py-1 text-xs font-bold text-black/50">{draft.status}</span>
                        </div>
                        {draft.publicPreviewUrl ? <a className="mt-2 block text-xs font-bold text-[#bf4f08]" href={draft.publicPreviewUrl} target="_blank" rel="noreferrer">{draft.publicPreviewUrl}</a> : null}
                        <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f4f1ed] p-3 text-sm text-black/70">{draft.body}</pre>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button className={adminSecondaryButtonClass()} onClick={() => navigator.clipboard?.writeText(`${draft.subject}\n\n${draft.body}`)}><Copy className="h-4 w-4" /> Copy</button>
                          <button className={adminSecondaryButtonClass()} onClick={() => void run('Approve draft', async () => { await jsonFetch(`/api/admin/managed-roles/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify({ status: 'approved' }) }); })}>Approve</button>
                          <button className={adminSecondaryButtonClass()} onClick={() => void run('Sent draft', async () => { await jsonFetch(`/api/admin/managed-roles/drafts/${draft.id}`, { method: 'PUT', body: JSON.stringify({ status: 'sent_manually' }) }); })}>Mark manually sent</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}

export default function ManagedRolesAdminPage() {
  return (
    <AuthProvider>
      <InnerManagedRolesAdminPage />
    </AuthProvider>
  );
}
