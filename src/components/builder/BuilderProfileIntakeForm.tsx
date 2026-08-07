import React, { useMemo, useRef, useState } from 'react';
import { FileText, Upload, WandSparkles } from 'lucide-react';
import type { BuilderProfileView } from './BuilderProfilePreview';

type Props = {
  profile: BuilderProfileView | null;
  onSaved: () => Promise<void> | void;
  onEnrichmentStateChange?: (enriching: boolean) => void;
};

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

function profileValue(profile: BuilderProfileView | null, key: string) {
  return profile?.links?.[key] || '';
}

function RequiredYesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="border border-black/10 bg-[#fffcfa] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-[#050505]">{label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#bf4f08]">Required</p>
        </div>
        <div className="flex gap-2">
          {[
            { label: 'Yes', next: true },
            { label: 'No', next: false },
          ].map((option) => {
            const selected = value === option.next;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(option.next)}
                className={`inline-flex h-10 min-w-[4.5rem] items-center justify-center px-4 text-sm font-semibold transition-colors ${
                  selected
                    ? 'bg-[#ff7417] text-white'
                    : 'border border-black/12 bg-white text-black/55 hover:border-[#ff7417]/45 hover:text-black'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function BuilderProfileIntakeForm({ profile, onSaved, onEnrichmentStateChange }: Props) {
  const [linkedin, setLinkedin] = useState(profileValue(profile, 'linkedin'));
  const [github, setGithub] = useState(profileValue(profile, 'github'));
  const [devpost, setDevpost] = useState(profileValue(profile, 'devpost'));
  const [portfolio, setPortfolio] = useState(profileValue(profile, 'portfolio') || profileValue(profile, 'personalWebsite'));
  const [openToWork, setOpenToWork] = useState<boolean | null>(null);
  const [isUsCitizen, setIsUsCitizen] = useState<boolean | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasRequiredFields = useMemo(
    () =>
      [linkedin, resume?.name].every((value) => String(value || '').trim()) &&
      openToWork !== null &&
      isUsCitizen !== null,
    [linkedin, resume, openToWork, isUsCitizen]
  );

  const acceptResume = (file: File | null | undefined) => {
    if (!file) {
      setResume(null);
      return;
    }
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setError('Resume must be a PDF.');
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      setError('Resume must be 10MB or smaller.');
      return;
    }
    setError('');
    setResume(file);
  };

  const submit = async () => {
    if (openToWork === null || isUsCitizen === null) {
      setError('Please answer Open to work and US citizen.');
      return;
    }
    setSaving(true);
    onEnrichmentStateChange?.(true);
    setError('');
    try {
      const form = new FormData();
      form.set('linkedin', linkedin);
      form.set('github', github);
      form.set('devpost', devpost);
      form.set('portfolio', portfolio);
      form.set('openToWork', String(openToWork));
      form.set('isUsCitizen', String(isUsCitizen));
      if (resume) form.set('resume', resume);

      const res = await fetch('/api/builder/profile', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save profile.');
      await onSaved();
      // Enrichment continues in the background — keep the overlay until progress polling clears it.
      if (!data.enrichment?.started) {
        onEnrichmentStateChange?.(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
      onEnrichmentStateChange?.(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="font-manrope mx-auto w-full max-w-2xl px-5 py-8 sm:px-7 sm:py-10">
        <section className="border border-black/10 bg-white p-5 sm:p-6">
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">01 · Builder profile</p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-[#050505]">Add your proof links</h2>
          <p className="mt-2 text-sm leading-6 text-black/55">
            LinkedIn, resume, and the two status questions are required. GitHub, Devpost, and portfolio are optional.
            Experience, projects, and profile copy are generated after enrichment and stay editable in Profile.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">LinkedIn</span>
              <input required value={linkedin} onChange={(event) => setLinkedin(event.target.value)} placeholder="https://linkedin.com/in/you" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                GitHub <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
              </span>
              <input value={github} onChange={(event) => setGithub(event.target.value)} placeholder="https://github.com/you" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                Devpost <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
              </span>
              <input value={devpost} onChange={(event) => setDevpost(event.target.value)} placeholder="https://devpost.com/you" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                Portfolio website{' '}
                <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
              </span>
              <input value={portfolio} onChange={(event) => setPortfolio(event.target.value)} placeholder="https://your-site.com" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>

            <RequiredYesNo label="Open to work" value={openToWork} onChange={setOpenToWork} />
            <RequiredYesNo label="US citizen" value={isUsCitizen} onChange={setIsUsCitizen} />

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0] || null;
                acceptResume(file);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-6 text-center transition-colors ${
                dragActive
                  ? 'border-[#ff7417] bg-[#fff5ef]'
                  : 'border-black/18 bg-[#fffcfa] hover:border-[#ff7417]/50'
              }`}
            >
              {resume ? (
                <FileText className="h-5 w-5 text-[#ff7417]" />
              ) : (
                <Upload className="h-5 w-5 text-[#ff7417]" />
              )}
              <span className="mt-2 text-sm font-extrabold text-[#050505]">
                {resume ? resume.name : dragActive ? 'Drop resume PDF here' : 'Drag & drop resume PDF'}
              </span>
              <span className="mt-1 text-xs text-black/40">
                {resume ? 'Click or drop to replace · Required for auto-fill' : 'or click to browse · Required, used for auto-fill'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => acceptResume(event.target.files?.[0] || null)}
              />
            </div>
          </div>

          {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !hasRequiredFields}
            className="builder-primary-button mt-6 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold disabled:opacity-45"
          >
            <WandSparkles className="h-4 w-4" />
            Save and enrich profile
          </button>
        </section>
    </div>
  );
}
