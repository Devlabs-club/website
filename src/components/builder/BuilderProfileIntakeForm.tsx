import React, { useMemo, useState } from 'react';
import { Loader2, Upload, WandSparkles } from 'lucide-react';
import type { BuilderProfileView } from './BuilderProfilePreview';

type Props = {
  profile: BuilderProfileView | null;
  onSaved: () => Promise<void> | void;
};

function profileValue(profile: BuilderProfileView | null, key: string) {
  return profile?.links?.[key] || '';
}

export default function BuilderProfileIntakeForm({ profile, onSaved }: Props) {
  const [linkedin, setLinkedin] = useState(profileValue(profile, 'linkedin'));
  const [github, setGithub] = useState(profileValue(profile, 'github'));
  const [devpost, setDevpost] = useState(profileValue(profile, 'devpost'));
  const [portfolio, setPortfolio] = useState(profileValue(profile, 'portfolio') || profileValue(profile, 'personalWebsite'));
  const [resume, setResume] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const hasRequiredFields = useMemo(
    () => [linkedin, github, devpost, portfolio, resume?.name].every((value) => String(value || '').trim()),
    [devpost, github, linkedin, portfolio, resume]
  );

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const form = new FormData();
      form.set('linkedin', linkedin);
      form.set('github', github);
      form.set('devpost', devpost);
      form.set('portfolio', portfolio);
      if (resume) form.set('resume', resume);

      const res = await fetch('/api/builder/profile', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save profile.');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
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
            These links and your resume are the only setup inputs. Experience, projects, and profile copy are generated after enrichment and stay editable in Profile.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">LinkedIn</span>
              <input required value={linkedin} onChange={(event) => setLinkedin(event.target.value)} placeholder="https://linkedin.com/in/you" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">GitHub</span>
              <input required value={github} onChange={(event) => setGithub(event.target.value)} placeholder="https://github.com/you" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">Devpost</span>
              <input required value={devpost} onChange={(event) => setDevpost(event.target.value)} placeholder="https://devpost.com/you" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>
            <label className="block">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">Portfolio website</span>
              <input required value={portfolio} onChange={(event) => setPortfolio(event.target.value)} placeholder="https://your-site.com" className="mt-1 h-11 w-full border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60" />
            </label>

            <label className="flex cursor-pointer flex-col items-center justify-center border border-dashed border-black/18 bg-[#fffcfa] px-4 py-5 text-center">
              <Upload className="h-5 w-5 text-[#ff7417]" />
              <span className="mt-2 text-sm font-extrabold text-[#050505]">{resume ? resume.name : 'Upload resume PDF'}</span>
              <span className="mt-1 text-xs text-black/40">Required, used for auto-fill</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(event) => setResume(event.target.files?.[0] || null)} />
            </label>
          </div>

          {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !hasRequiredFields}
            className="builder-primary-button mt-6 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            Save and enrich profile
          </button>
        </section>
    </div>
  );
}
