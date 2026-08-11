import React, { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import {
  MISSING_PROOF_LABELS,
  type MissingProofField,
} from '@/lib/talent/builderProofGaps';

type Props = {
  missing: MissingProofField[];
  onDismiss: () => void;
  onSaved: () => Promise<void> | void;
};

const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export default function BuilderProofGapsPrompt({ missing, onDismiss, onSaved }: Props) {
  const [linkedin, setLinkedin] = useState('');
  const [github, setGithub] = useState('');
  const [resume, setResume] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!missing.length) return null;

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

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      if (missing.includes('linkedin') && linkedin.trim()) form.set('linkedin', linkedin.trim());
      if (missing.includes('github') && github.trim()) form.set('github', github.trim());
      if (missing.includes('resume') && resume) form.set('resume', resume);

      if (![...form.keys()].length) {
        setError('Add at least one field, or skip for now.');
        setSaving(false);
        return;
      }

      const res = await fetch('/api/builder/profile', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save.');
      await onSaved();
      onDismiss();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="font-manrope border border-[#ff7417]/30 bg-[#fffaf7] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#bf4f08]">
            Almost there
          </p>
          <h3 className="mt-2 text-lg font-extrabold tracking-[-0.02em] text-[#050505]">
            A few things are still empty on your profile
          </h3>
          <p className="mt-2 text-sm leading-6 text-black/55">
            Add LinkedIn if you have it. Resume helps founders trust the profile. GitHub is optional.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {missing.map((field) => (
              <span
                key={field}
                className="inline-flex items-center border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/60"
              >
                {MISSING_PROOF_LABELS[field]}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-black/10 text-black/40 hover:text-black"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {expanded ? (
        <div className="mt-5 space-y-3 border-t border-[#ff7417]/20 pt-5">
          {missing.includes('linkedin') ? (
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                LinkedIn
              </span>
              <input
                value={linkedin}
                onChange={(event) => setLinkedin(event.target.value)}
                placeholder="https://linkedin.com/in/you"
                className="mt-1 h-11 w-full border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#ff7417]/60"
              />
            </label>
          ) : null}
          {missing.includes('github') ? (
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">
                GitHub
              </span>
              <input
                value={github}
                onChange={(event) => setGithub(event.target.value)}
                placeholder="https://github.com/you"
                className="mt-1 h-11 w-full border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#ff7417]/60"
              />
            </label>
          ) : null}
          {missing.includes('resume') ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center border border-dashed border-black/18 bg-white px-4 py-5 text-center hover:border-[#ff7417]/50"
            >
              {resume ? (
                <FileText className="h-5 w-5 text-[#ff7417]" />
              ) : (
                <Upload className="h-5 w-5 text-[#ff7417]" />
              )}
              <span className="mt-2 text-sm font-extrabold text-[#050505]">
                {resume ? resume.name : 'Upload resume PDF'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => acceptResume(event.target.files?.[0] || null)}
              />
            </button>
          ) : null}
          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="builder-primary-button inline-flex h-11 flex-1 items-center justify-center text-sm font-semibold disabled:opacity-45"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="builder-outline-button inline-flex h-11 flex-1 items-center justify-center text-sm font-semibold"
            >
              Skip for now
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="builder-primary-button inline-flex h-11 flex-1 items-center justify-center text-sm font-semibold"
          >
            Add now
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="builder-outline-button inline-flex h-11 flex-1 items-center justify-center text-sm font-semibold"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
