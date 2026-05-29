import React, { useEffect, useState } from 'react';

export type RoleBriefForm = {
  roleTitle: string;
  company: string;
  startupSummary: string;
  builderWillDo: string;
  skillsNeeded: string;
  niceToHaveSkills: string;
  workType: string;
  timeline: string;
  budget: string;
  locationPreference: string;
  seniority: string;
  hoursPerWeek: string;
  deliverables: string;
  successIn30Days: string;
};

function metaToForm(m: Record<string, unknown>): RoleBriefForm {
  return {
    roleTitle: String(m.roleTitle || ''),
    company: String(m.company || ''),
    startupSummary: String(m.startupDescription || m.startupSummary || ''),
    builderWillDo: String(m.builderWillDo || ''),
    skillsNeeded: Array.isArray(m.requiredSkills) ? (m.requiredSkills as string[]).join(', ') : '',
    niceToHaveSkills: Array.isArray(m.niceToHaveSkills) ? (m.niceToHaveSkills as string[]).join(', ') : '',
    workType: String(m.workType || ''),
    timeline: String(m.timeline || ''),
    budget: String(m.budget || ''),
    locationPreference: String(m.locationPreference || ''),
    seniority: String(m.seniority || ''),
    hoursPerWeek: String(m.hoursPerWeek || ''),
    deliverables: Array.isArray(m.deliverables) ? (m.deliverables as string[]).join(', ') : '',
    successIn30Days: String(m.successCriteria || m.successIn30Days || ''),
  };
}

function splitList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function EditableRoleBriefCard({
  block,
  opportunityId,
  onSaved,
  onRunSearch,
  onImproveWithAgent,
  searchBusy,
  canRunSearch,
}: {
  block: { title?: string; body?: string; meta?: Record<string, unknown> };
  opportunityId: string | null;
  onSaved: (data?: { uiBlocks?: unknown[]; opportunity?: unknown }) => void;
  onRunSearch?: () => void;
  onImproveWithAgent?: () => void;
  searchBusy?: boolean;
  canRunSearch?: boolean;
}) {
  const m = (block.meta || {}) as Record<string, unknown>;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RoleBriefForm>(() => metaToForm(m));

  useEffect(() => {
    if (!editing) setForm(metaToForm(m));
  }, [m, editing]);

  const rows: Array<{ label: string; value?: string | string[] | null }> = [
    { label: 'Role title', value: m.roleTitle },
    { label: 'Startup', value: m.company },
    { label: 'Short company context', value: m.startupDescription || block.body },
    { label: 'What the builder will do', value: m.builderWillDo },
    {
      label: 'Required skills',
      value: Array.isArray(m.requiredSkills) && m.requiredSkills.length ? (m.requiredSkills as string[]).join(', ') : null,
    },
    {
      label: 'Nice-to-have skills',
      value:
        Array.isArray(m.niceToHaveSkills) && (m.niceToHaveSkills as string[]).length
          ? (m.niceToHaveSkills as string[]).join(', ')
          : null,
    },
    { label: 'Work type', value: m.workType },
    { label: 'Budget', value: m.budget },
    { label: 'Timeline', value: m.timeline },
    { label: 'Location', value: m.locationPreference },
    { label: 'Hours/week', value: m.hoursPerWeek },
    { label: 'Seniority', value: m.seniority },
    {
      label: 'Deliverables',
      value:
        Array.isArray(m.deliverables) && (m.deliverables as string[]).length
          ? (m.deliverables as string[]).join(', ')
          : null,
    },
    { label: 'Success criteria', value: m.successCriteria },
  ];

  const save = async () => {
    if (!opportunityId) return;
    setSaving(true);
    try {
      const response = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_role_brief',
          payload: {
            opportunityId,
            fields: {
              roleTitle: form.roleTitle,
              company: form.company,
              startupSummary: form.startupSummary,
              builderWillDo: form.builderWillDo,
              skillsNeeded: splitList(form.skillsNeeded),
              niceToHaveSkills: splitList(form.niceToHaveSkills),
              workType: form.workType,
              timeline: form.timeline,
              budget: form.budget,
              locationPreference: form.locationPreference,
              seniority: form.seniority,
              hoursPerWeek: form.hoursPerWeek,
              deliverables: splitList(form.deliverables),
              successIn30Days: form.successIn30Days,
            },
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Save failed');
      setEditing(false);
      onSaved({ uiBlocks: data.uiBlocks, opportunity: data.opportunity });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof RoleBriefForm, multiline = false) => (
    <label key={key} className="block">
      <span className="text-[10px] uppercase tracking-wider text-white/45 mb-0.5 block">{label}</span>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          rows={3}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white resize-y"
        />
      ) : (
        <input
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
        />
      )}
    </label>
  );

  return (
    <div className="rounded-2xl border border-[#fa7d22]/25 bg-gradient-to-b from-[#fa7d22]/10 to-transparent p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{block.title || 'Role brief'}</h3>
        <span className="shrink-0 px-2 py-1 rounded-full text-[10px] uppercase tracking-wider border border-white/20 bg-white/5 text-white/70">
          {String(m.status || 'draft')}
        </span>
      </div>

      {editing ? (
        <div className="space-y-3">
          {field('Role title', 'roleTitle')}
          {field('Startup / company name', 'company')}
          {field('Short company context', 'startupSummary', true)}
          {field('What the builder will do', 'builderWillDo', true)}
          {field('Required skills (comma-separated)', 'skillsNeeded')}
          {field('Nice-to-have skills', 'niceToHaveSkills')}
          {field('Work type', 'workType')}
          {field('Budget', 'budget')}
          {field('Timeline', 'timeline')}
          {field('Location', 'locationPreference')}
          {field('Hours/week', 'hoursPerWeek')}
          {field('Seniority / experience', 'seniority')}
          {field('Deliverables', 'deliverables')}
          {field('Success criteria', 'successIn30Days', true)}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(metaToForm(m));
                setEditing(false);
              }}
              className="px-4 py-2 rounded-xl border border-white/20 text-white/80 text-sm hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <dl className="space-y-3">
            {rows.map((row) =>
              row.value ? (
                <div key={row.label}>
                  <dt className="text-[10px] uppercase tracking-wider text-white/45 mb-0.5">{row.label}</dt>
                  <dd className="text-sm text-white/85 leading-relaxed">{row.value}</dd>
                </div>
              ) : null
            )}
          </dl>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="px-4 py-2 rounded-xl border border-white/20 text-white/90 text-sm hover:bg-white/5"
            >
              Edit manually
            </button>
            {onImproveWithAgent ? (
              <button
                type="button"
                onClick={onImproveWithAgent}
                className="px-4 py-2 rounded-xl border border-[#fa7d22]/40 text-[#ffb580] text-sm hover:bg-[#fa7d22]/10"
              >
                Improve with Agent
              </button>
            ) : null}
            {canRunSearch && onRunSearch ? (
              <button
                type="button"
                onClick={onRunSearch}
                disabled={searchBusy}
                className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-60"
              >
                {searchBusy ? 'Searching…' : 'Run builder search'}
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
