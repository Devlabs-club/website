import React, { useMemo, useRef, useState } from 'react';
import { FileText, Upload, WandSparkles } from 'lucide-react';
import {
  hasOpenToWorkAnswer,
  hasResume,
  hasWorkAuthAnswer,
  listMissingProofFields,
  type MissingProofField,
} from '@/lib/talent/builderProofGaps';
import type { BuilderProfileView } from './BuilderProfilePreview';

type Props = {
  profile: BuilderProfileView | null;
  onSaved: () => Promise<void> | void;
  onEnrichmentStateChange?: (enriching: boolean) => void;
  /** When true, only ask for fields that are actually missing. */
  slim?: boolean;
};

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

function profileValue(profile: BuilderProfileView | null, key: string) {
  return profile?.links?.[key] || '';
}

function RequiredYesNo({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: boolean | null;
  onChange: (next: boolean) => void;
  required?: boolean;
}) {
  return (
    <div className="border border-black/10 bg-[#fffcfa] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-[#050505]">{label}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#bf4f08]">
            {required ? 'Required' : 'Optional'}
          </p>
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

function initialOpenToWork(profile: BuilderProfileView | null): boolean | null {
  if (typeof profile?.availability?.availableNow === 'boolean') {
    return profile.availability.availableNow;
  }
  return null;
}

function initialUsCitizen(profile: BuilderProfileView | null): boolean | null {
  const value = String(profile?.workAuthorization || '').toLowerCase();
  if (!value) return null;
  if (value.includes('not a us citizen')) return false;
  if (value.includes('us citizen')) return true;
  return null;
}

export default function BuilderProfileIntakeForm({
  profile,
  onSaved,
  onEnrichmentStateChange,
  slim = false,
}: Props) {
  const missingProof = useMemo(() => listMissingProofFields(profile), [profile]);
  const askLinkedIn = !slim || missingProof.includes('linkedin');
  const askGitHub = !slim || missingProof.includes('github');
  const askResume = !slim || missingProof.includes('resume');
  const askDevpost = !slim;
  const askPortfolio = !slim;
  const askOpenToWork = !slim || !hasOpenToWorkAnswer(profile);
  const askUsCitizen = !slim || !hasWorkAuthAnswer(profile);
  const existingResume = hasResume(profile);

  const [linkedin, setLinkedin] = useState(profileValue(profile, 'linkedin'));
  const [github, setGithub] = useState(profileValue(profile, 'github'));
  const [devpost, setDevpost] = useState(profileValue(profile, 'devpost'));
  const [portfolio, setPortfolio] = useState(
    profileValue(profile, 'portfolio') || profileValue(profile, 'personalWebsite')
  );
  const [openToWork, setOpenToWork] = useState<boolean | null>(initialOpenToWork(profile));
  const [isUsCitizen, setIsUsCitizen] = useState<boolean | null>(initialUsCitizen(profile));
  const [resume, setResume] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasRequiredFields = useMemo(() => {
    if (slim) {
      // Slim mode never blocks save. Builders can skip anything they do not have.
      return true;
    }
    const linkedinOk = !askLinkedIn || Boolean(String(linkedin || '').trim());
    const resumeOk = !askResume || Boolean(resume?.name) || existingResume;
    const openOk = !askOpenToWork || openToWork !== null;
    const citizenOk = !askUsCitizen || isUsCitizen !== null;
    return linkedinOk && resumeOk && openOk && citizenOk;
  }, [
    askLinkedIn,
    askOpenToWork,
    askResume,
    askUsCitizen,
    existingResume,
    isUsCitizen,
    linkedin,
    openToWork,
    resume,
    slim,
  ]);

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
    if (!slim) {
      if (askOpenToWork && openToWork === null) {
        setError('Please answer Open to work.');
        return;
      }
      if (askUsCitizen && isUsCitizen === null) {
        setError('Please answer US citizen.');
        return;
      }
      if (askLinkedIn && !String(linkedin || '').trim()) {
        setError('LinkedIn is required.');
        return;
      }
      if (askResume && !resume && !existingResume) {
        setError('Resume PDF is required.');
        return;
      }
    }

    setSaving(true);
    onEnrichmentStateChange?.(true);
    setError('');
    try {
      const form = new FormData();
      if (askLinkedIn && linkedin) form.set('linkedin', linkedin);
      if (askGitHub && github) form.set('github', github);
      if (askDevpost && devpost) form.set('devpost', devpost);
      if (askPortfolio && portfolio) form.set('portfolio', portfolio);
      if (askOpenToWork && openToWork !== null) form.set('openToWork', String(openToWork));
      if (askUsCitizen && isUsCitizen !== null) form.set('isUsCitizen', String(isUsCitizen));
      if (resume) form.set('resume', resume);

      const res = await fetch('/api/builder/profile', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save profile.');
      await onSaved();
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

  const missingLabels = missingProof
    .map((field: MissingProofField) =>
      field === 'linkedin' ? 'LinkedIn' : field === 'resume' ? 'resume' : 'GitHub'
    )
    .join(', ');

  return (
    <div className="font-manrope mx-auto w-full max-w-2xl px-5 py-8 sm:px-7 sm:py-10">
      <section className="border border-black/10 bg-white p-5 sm:p-6">
        <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">
          01 · Builder profile
        </p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.03em] text-[#050505]">
          {slim ? 'Fill in what is missing' : 'Add your proof links'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-black/55">
          {slim
            ? missingLabels
              ? `We only need ${missingLabels}. Skip anything you do not have.`
              : 'Looks like the basics are already here. Save if you want to add more, or head to your profile.'
            : 'LinkedIn and resume help a lot. Open to work and US citizen help founders know if they can reach out. GitHub, Devpost, and portfolio are optional.'}
        </p>

        <div className="mt-6 space-y-4">
          {askLinkedIn ? (
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                LinkedIn{' '}
                {slim ? (
                  <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
                ) : null}
              </span>
              <input
                required={!slim}
                value={linkedin}
                onChange={(event) => setLinkedin(event.target.value)}
                placeholder="https://linkedin.com/in/you"
                className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60"
              />
            </label>
          ) : null}

          {askGitHub ? (
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                GitHub <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
              </span>
              <input
                value={github}
                onChange={(event) => setGithub(event.target.value)}
                placeholder="https://github.com/you"
                className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60"
              />
            </label>
          ) : null}

          {askDevpost ? (
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                Devpost <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
              </span>
              <input
                value={devpost}
                onChange={(event) => setDevpost(event.target.value)}
                placeholder="https://devpost.com/you"
                className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60"
              />
            </label>
          ) : null}

          {askPortfolio ? (
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                Portfolio website{' '}
                <span className="font-semibold normal-case tracking-normal text-black/35">(optional)</span>
              </span>
              <input
                value={portfolio}
                onChange={(event) => setPortfolio(event.target.value)}
                placeholder="https://your-site.com"
                className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60"
              />
            </label>
          ) : null}

          {askOpenToWork ? (
            <RequiredYesNo
              label="Open to work"
              value={openToWork}
              onChange={setOpenToWork}
              required={!slim}
            />
          ) : null}
          {askUsCitizen ? (
            <RequiredYesNo
              label="US citizen"
              value={isUsCitizen}
              onChange={setIsUsCitizen}
              required={!slim}
            />
          ) : null}

          {askResume ? (
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
              {resume || existingResume ? (
                <FileText className="h-5 w-5 text-[#ff7417]" />
              ) : (
                <Upload className="h-5 w-5 text-[#ff7417]" />
              )}
              <span className="mt-2 text-sm font-extrabold text-[#050505]">
                {resume
                  ? resume.name
                  : existingResume
                    ? 'Resume already on file'
                    : dragActive
                      ? 'Drop resume PDF here'
                      : 'Drag & drop resume PDF'}
              </span>
              <span className="mt-1 text-xs text-black/40">
                {resume
                  ? 'Click or drop to replace'
                  : existingResume
                    ? 'Click or drop to replace · optional'
                    : slim
                      ? 'or click to browse · optional'
                      : 'or click to browse · used for auto-fill'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => acceptResume(event.target.files?.[0] || null)}
              />
            </div>
          ) : null}
        </div>

        {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !hasRequiredFields}
          className="builder-primary-button mt-6 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold disabled:opacity-45"
        >
          <WandSparkles className="h-4 w-4" />
          {slim ? 'Save and continue' : 'Save and enrich profile'}
        </button>
      </section>
    </div>
  );
}
