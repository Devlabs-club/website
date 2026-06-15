import React, { useState } from 'react';
import { ArrowLeft, Loader2, Building2, Globe, Linkedin } from 'lucide-react';
import { OsButton } from '@/components/os';

type FounderOnboardingConfirmProps = {
  defaultName: string;
  defaultEmail: string;
  onClose: () => void;
  onCompleted: () => void;
};

export default function FounderOnboardingConfirm({
  defaultName,
  defaultEmail,
  onClose,
  onCompleted,
}: FounderOnboardingConfirmProps) {
  const [founderName, setFounderName] = useState(defaultName);
  const [company, setCompany] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) {
      setError('Company name is required.');
      return;
    }

    setBusy(true);
    setError(null);
    setStatus('Researching your company and founder profile...');

    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'confirm_founder_onboarding',
          payload: {
            founderName: founderName.trim(),
            company: company.trim(),
            companyWebsite: companyWebsite.trim() || null,
            linkedin: linkedin.trim() || null,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Could not save profile');
      }

      setStatus(data.message || 'Profile saved.');
      setTimeout(onCompleted, 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus(null);
    } finally {
      setBusy(false);
    }
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
        <span className="text-xs uppercase tracking-widest text-white/40 font-semibold">
          Confirm your details
        </span>
        <div className="w-16" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-white mb-2">Before we search builders</h1>
            <p className="text-sm text-white/55 leading-relaxed">
              Confirm your startup details. We&apos;ll research your company and founder profile so the agent
              doesn&apos;t ask you the same questions twice.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Your name" htmlFor="founderName">
              <input
                id="founderName"
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                disabled={busy}
                className={inputClass}
                placeholder="Jane Doe"
              />
            </Field>

            <Field label="Email" htmlFor="founderEmail">
              <input
                id="founderEmail"
                value={defaultEmail}
                disabled
                className={`${inputClass} opacity-60 cursor-not-allowed`}
              />
            </Field>

            <Field label="Company name" htmlFor="company" icon={<Building2 className="w-4 h-4" />}>
              <input
                id="company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={busy}
                required
                className={inputClass}
                placeholder="Acme Labs"
              />
            </Field>

            <Field label="Company website" htmlFor="companyWebsite" icon={<Globe className="w-4 h-4" />} hint="Recommended — helps us research your product">
              <input
                id="companyWebsite"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                disabled={busy}
                className={inputClass}
                placeholder="https://acmelabs.com"
              />
            </Field>

            <Field label="Your LinkedIn" htmlFor="linkedin" icon={<Linkedin className="w-4 h-4" />} hint="Optional">
              <input
                id="linkedin"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                disabled={busy}
                className={inputClass}
                placeholder="https://linkedin.com/in/you"
              />
            </Field>

            {error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : null}

            {status ? (
              <div className="flex items-center gap-2 text-sm text-[#ffb580]">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{status}</span>
              </div>
            ) : null}

            <OsButton
              type="submit"
              variant="shimmer"
              disabled={busy || !company.trim()}
              className="w-full justify-center mt-4"
            >
              {busy ? 'Researching...' : 'Confirm & continue'}
            </OsButton>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full bg-white/[0.04] border border-white/[0.1] rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/25 transition-colors disabled:opacity-40';

function Field({
  label,
  htmlFor,
  icon,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="flex items-center gap-2 text-sm font-medium text-white/80 mb-2">
        {icon ? <span className="text-white/35">{icon}</span> : null}
        {label}
      </span>
      {children}
      {hint ? <span className="block mt-1.5 text-xs text-white/30">{hint}</span> : null}
    </label>
  );
}
