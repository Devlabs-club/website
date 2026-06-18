import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Opportunity } from './founderTypes';

type HireType = 'full_time' | 'internship' | 'either' | '';

type RoleBriefForm = {
  roleTitle: string;
  company: string;
  startupSummary: string;
  builderWillDo: string;
  skillsNeeded: string;
  niceToHaveSkills: string;
  hireType: HireType;
  timeline: string;
  budget: string;
  locationPreference: string;
  seniority: string;
  hoursPerWeek: string;
  deliverables: string;
};

function opportunityToForm(opportunity: Opportunity): RoleBriefForm {
  const workType = String(opportunity.workType || '');
  return {
    roleTitle: String(opportunity.roleTitle || ''),
    company: String(opportunity.company || ''),
    startupSummary: String(opportunity.startupSummary || ''),
    builderWillDo: String(opportunity.builderWillDo || ''),
    skillsNeeded: Array.isArray(opportunity.skillsNeeded) ? opportunity.skillsNeeded.join(', ') : '',
    niceToHaveSkills: Array.isArray(opportunity.niceToHaveSkills)
      ? opportunity.niceToHaveSkills.join(', ')
      : '',
    hireType: (['full_time', 'internship', 'either'].includes(workType) ? workType : '') as HireType,
    timeline: String(opportunity.timeline || ''),
    budget: String(opportunity.budget || ''),
    locationPreference: String(opportunity.locationPreference || ''),
    seniority: String(opportunity.seniority || ''),
    hoursPerWeek: String(opportunity.hoursPerWeek || ''),
    deliverables: Array.isArray(opportunity.deliverables) ? opportunity.deliverables.join(', ') : '',
  };
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

interface FounderRoleBriefEditorProps {
  opportunity: Opportunity;
  onClose: () => void;
  onSaved: () => void;
}

export default function FounderRoleBriefEditor({
  opportunity,
  onClose,
  onSaved,
}: FounderRoleBriefEditorProps) {
  const [form, setForm] = useState<RoleBriefForm>(() => opportunityToForm(opportunity));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(opportunityToForm(opportunity));
  }, [opportunity]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/founder-agent/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'edit_job',
          payload: {
            jobId: opportunity._id,
            fields: {
              roleTitle: form.roleTitle,
              company: form.company,
              startupSummary: form.startupSummary,
              builderWillDo: form.builderWillDo,
              skillsNeeded: splitList(form.skillsNeeded),
              niceToHaveSkills: splitList(form.niceToHaveSkills),
              workType: form.hireType || undefined,
              timeline: form.timeline,
              budget: form.budget,
              locationPreference: form.locationPreference,
              seniority: form.seniority,
              hoursPerWeek: form.hoursPerWeek,
              deliverables: splitList(form.deliverables),
            },
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Save failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    label: string,
    key: keyof RoleBriefForm,
    options?: { multiline?: boolean; placeholder?: string }
  ) => {
    return (
      <label key={key} className="block space-y-2">
        <span className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">{label}</span>
        {options?.multiline ? (
          <textarea
            value={form[key]}
            onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            rows={4}
            placeholder={options.placeholder}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 resize-y focus:outline-none focus:border-[#fa7d22]/40"
          />
        ) : (
          <input
            value={form[key]}
            onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            placeholder={options.placeholder}
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#fa7d22]/40"
          />
        )}
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0c0c0e] text-white">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="text-center">
          <p className="text-[11px] uppercase tracking-widest text-white/35 font-semibold">Role brief</p>
          <p className="text-sm font-semibold text-white mt-0.5">
            {form.roleTitle || 'Untitled role'}
            {form.company ? ` @ ${form.company}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold hover:bg-[#ff9b4e] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save brief'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Edit role brief</h1>
            <p className="text-sm text-white/50 mt-2">
              Update fields manually. Use Ask AI on any field to sharpen the wording — no chat required.
            </p>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6 space-y-5">
            {renderField('Role title', 'roleTitle', { placeholder: 'e.g. Full-stack React Engineer' })}
            {renderField('Startup / company name', 'company', { placeholder: 'Your company name' })}
            {renderField('Short company context', 'startupSummary', {
              multiline: true,
              placeholder: 'What you build, who it is for, and current stage.',
            })}
            {renderField('What the builder will do', 'builderWillDo', {
              multiline: true,
              placeholder: 'Scope, ownership, and first-month outcomes.',
            })}
            {renderField('Required skills', 'skillsNeeded', {
              placeholder: 'React, TypeScript, Node.js',
            })}
            {renderField('Nice-to-have skills', 'niceToHaveSkills', {
              placeholder: 'PostgreSQL, Figma',
            })}

            <div className="block space-y-2">
              <span className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">Hire type</span>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['full_time', 'Full-time'],
                    ['internship', 'Internship'],
                    ['either', 'Either works'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, hireType: value }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                      form.hireType === value
                        ? 'bg-[#fa7d22]/20 border-[#fa7d22]/40 text-[#fa7d22]'
                        : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/[0.08]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {renderField('Budget', 'budget', { placeholder: '$4k–$6k/month or equity + stipend' })}
            {renderField('Timeline', 'timeline', { placeholder: 'Start in 2 weeks' })}
            {renderField('Location', 'locationPreference', { placeholder: 'Remote (US timezones)' })}
            {renderField('Hours per week', 'hoursPerWeek', { placeholder: '20–40 hrs/week' })}
            {renderField('Seniority / experience', 'seniority', { placeholder: 'Mid-level, 2+ years shipping' })}
            {renderField('Deliverables', 'deliverables', {
              placeholder: 'Ship auth flow, set up CI, launch beta',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
