import React, { useEffect, useMemo, useState } from 'react';
import { Camera, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { resolveCompanyLogoUrl } from '@/lib/talent/companyLogo';
import type { BuilderProfileView } from './BuilderProfilePreview';
import BuilderEnrichmentInsights from './BuilderEnrichmentInsights';

type Props = {
  profile: BuilderProfileView;
  basics?: { name?: string; email?: string | null };
  onSaved: () => Promise<void> | void;
};

type ExperienceDraft = {
  title: string;
  company: string;
  companyLogoUrl?: string | null;
  companyLinkedInUrl?: string | null;
  dateRange: string;
  description: string;
  sourceId?: string | null;
};

function mapExperiencesFromProfile(experiences: BuilderProfileView['experiences'] = []) {
  return experiences.slice(0, 8).map((experience: any, index) => ({
    title: experience.title || '',
    company: experience.company || '',
    companyLogoUrl: experience.companyLogoUrl || null,
    companyLinkedInUrl: experience.companyLinkedInUrl || null,
    dateRange: experience.dateRange || '',
    description: experience.description || '',
    sourceId: experience.sourceId || `profile-editor:${index}`,
  }));
}

function link(profile: BuilderProfileView, key: string) {
  return profile.links?.[key] || '';
}

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export default function BuilderProfileEditor({ profile, basics, onSaved }: Props) {
  const [name, setName] = useState(profile.name || basics?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [headline, setHeadline] = useState(profile.headline || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [location, setLocation] = useState(profile.location || '');
  const [skills, setSkills] = useState((profile.skills || []).join(', '));
  const [workAuthorization, setWorkAuthorization] = useState(profile.workAuthorization || '');
  const [active, setActive] = useState(profile.visibilityStatus !== 'hidden');
  const [linkedin, setLinkedin] = useState(link(profile, 'linkedin'));
  const [github, setGithub] = useState(link(profile, 'github'));
  const [devpost, setDevpost] = useState(link(profile, 'devpost'));
  const [portfolio, setPortfolio] = useState(link(profile, 'portfolio') || link(profile, 'personalWebsite'));
  const [experiences, setExperiences] = useState<ExperienceDraft[]>(mapExperiencesFromProfile(profile.experiences));
  const experiencesFingerprint = JSON.stringify(
    (profile.experiences || []).map((experience) => [
      experience.sourceId,
      experience.title,
      experience.company,
      experience.companyLogoUrl,
      experience.dateRange,
      experience.description,
    ])
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const avatarPreviewUrl = useMemo(() => (avatarFile ? URL.createObjectURL(avatarFile) : avatarUrl), [avatarFile, avatarUrl]);

  useEffect(() => {
    if (saving) return;
    setExperiences(mapExperiencesFromProfile(profile.experiences));
  }, [experiencesFingerprint, profile.experiences, saving]);

  const updateExperience = (index: number, patch: Partial<ExperienceDraft>) => {
    setExperiences((prev) => prev.map((experience, i) => (i === index ? { ...experience, ...patch } : experience)));
  };

  const addExperience = () => {
    setExperiences((prev) => [...prev, { title: '', company: '', dateRange: '', description: '' }].slice(0, 10));
  };

  const removeExperience = (index: number) => {
    setExperiences((prev) => prev.filter((_, i) => i !== index));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.set('name', name);
      form.set('avatarUrl', avatarUrl);
      form.set('headline', headline);
      form.set('bio', bio);
      form.set('location', location);
      form.set('skills', JSON.stringify(splitList(skills)));
      form.set('visaStatus', workAuthorization);
      form.set('active', String(active));
      form.set('linkedin', linkedin);
      form.set('github', github);
      form.set('devpost', devpost);
      form.set('portfolio', portfolio);
      form.set(
        'experiences',
        JSON.stringify(experiences.filter((experience) => experience.title.trim() || experience.company.trim()))
      );
      if (avatarFile) form.set('avatar', avatarFile);
      const res = await fetch('/api/builder/profile', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save profile.');
      setMessage('Profile saved.');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="font-manrope mx-auto w-full max-w-4xl">
      <BuilderEnrichmentInsights profile={profile} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-black/10 bg-white p-4">
        <div>
          <p className="text-sm font-extrabold text-[#050505]">Founder discovery</p>
          <p className="mt-1 text-xs leading-5 text-black/45">
            {active ? 'Your profile can appear in founder recommendations.' : 'Your profile is hidden from founder recommendations.'}
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/45">{active ? 'Active' : 'Hidden'}</span>
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="h-5 w-5 accent-[#ff7417]" />
        </label>
      </div>

      <div className="mb-6 border border-black/10 bg-white p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-[#fff5ef] text-2xl font-extrabold text-[#ff7417]">
            {avatarPreviewUrl ? (
              <img src={avatarPreviewUrl} alt="Profile picture preview" className="h-full w-full object-cover" />
            ) : (
              (name || 'B').slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[#050505]">Profile picture</p>
            <p className="mt-1 text-xs leading-5 text-black/45">Use the current LinkedIn photo, paste a hosted image URL, or upload a new image.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={avatarUrl}
                onChange={(event) => {
                  setAvatarUrl(event.target.value);
                  setAvatarFile(null);
                }}
                placeholder="https://..."
                className={`${inputClass} w-full`}
              />
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 border border-black/10 px-3 text-xs font-extrabold text-black/55 hover:bg-[#fff5ef] hover:text-[#bf4f08]">
                <Upload className="h-4 w-4" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    setAvatarFile(file);
                    if (file) setAvatarUrl('');
                  }}
                />
              </label>
            </div>
          </div>
          <Camera className="hidden h-5 w-5 text-[#ff7417] sm:block" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Location" value={location} onChange={setLocation} />
        <Field label="Headline" value={headline} onChange={setHeadline} className="sm:col-span-2" />
        <Area label="Bio" value={bio} onChange={setBio} className="sm:col-span-2" />
        <Field label="Visa status" value={workAuthorization} onChange={setWorkAuthorization} placeholder="US citizen, F-1 OPT, H-1B, needs sponsorship" />
        <Field label="Skills" value={skills} onChange={setSkills} placeholder="React, TypeScript, Python" />
        <Field label="LinkedIn" value={linkedin} onChange={setLinkedin} />
        <Field label="GitHub" value={github} onChange={setGithub} />
        <Field label="Devpost" value={devpost} onChange={setDevpost} />
        <Field label="Portfolio website" value={portfolio} onChange={setPortfolio} />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-black/35">Experience</p>
            <p className="mt-1 text-sm text-black/50">Edit generated job descriptions in place.</p>
          </div>
          <button type="button" onClick={addExperience} className="builder-outline-button inline-flex h-9 items-center gap-1.5 px-3 text-xs font-extrabold">
            <Plus className="h-3.5 w-3.5" />
            Add role
          </button>
        </div>

        <div className="space-y-3">
          {experiences.length ? (
            experiences.map((experience, index) => {
              const logoUrl = resolveCompanyLogoUrl(
                experience.company,
                experience.companyLogoUrl,
                experience.companyLinkedInUrl
              );
              return (
                <div key={experience.sourceId || index} className="border border-black/10 bg-white p-4">
                  <div className="flex items-start gap-3">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt={`${experience.company || 'Company'} logo`}
                        className="mt-0.5 h-10 w-10 shrink-0 rounded-xl border border-black/10 bg-white object-cover"
                      />
                    ) : (
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-[#fff5ef] text-xs font-extrabold text-[#bf4f08]">
                        {(experience.company || '?').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <input value={experience.title} onChange={(event) => updateExperience(index, { title: event.target.value })} placeholder="Title" className={inputClass} />
                        <input value={experience.company} onChange={(event) => updateExperience(index, { company: event.target.value })} placeholder="Company" className={inputClass} />
                        <button
                          type="button"
                          onClick={() => removeExperience(index)}
                          className="inline-flex h-10 items-center justify-center border border-black/10 px-3 text-black/45 hover:bg-[#fff5ef] hover:text-[#bf4f08]"
                          aria-label="Remove role"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <input value={experience.dateRange} onChange={(event) => updateExperience(index, { dateRange: event.target.value })} placeholder="Date range" className={`${inputClass} mt-3 w-full`} />
                      <textarea value={experience.description} onChange={(event) => updateExperience(index, { description: event.target.value })} placeholder="What did you do in this role?" className={`${inputClass} mt-3 min-h-28 w-full py-2`} />
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="border border-dashed border-black/12 bg-white p-5 text-sm leading-6 text-black/45">
              No experience yet. Add a role or upload a resume from profile setup.
            </div>
          )}
        </div>
      </section>

      {error ? <p className="mt-4 text-sm font-semibold text-red-600">{error}</p> : null}
      {message ? <p className="mt-4 text-sm font-semibold text-[#bf4f08]">{message}</p> : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="builder-primary-button mt-6 inline-flex h-11 items-center justify-center gap-2 px-5 text-sm font-semibold disabled:opacity-45"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save profile
      </button>
    </div>
  );
}

const inputClass = 'h-10 border border-black/10 px-3 text-sm outline-none focus:border-[#ff7417]/60';

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} mt-1 w-full`} />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-black/40">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`${inputClass} mt-1 min-h-28 w-full py-2`} />
    </label>
  );
}
