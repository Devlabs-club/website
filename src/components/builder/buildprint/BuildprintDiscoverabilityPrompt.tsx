import React, { useState } from 'react';
import { trackBuildprintEvent } from '@/lib/analytics/buildprintFunnel';

export const BuildprintDiscoverabilityPrompt: React.FC<{
  open: boolean;
  onDone: () => void;
}> = ({ open, onDone }) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const enable = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/builder/profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || data?.message || 'Could not update discoverability');
      trackBuildprintEvent('buildprint_discoverability_enabled', {});
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update discoverability');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-[#fbf6f3] p-6 text-[#14110f] shadow-[0_24px_60px_rgba(20,17,15,0.25)]">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-black/40">Next step</p>
        <h2 className="mt-3 font-gatwick text-2xl font-black tracking-[-0.04em]">
          Want startups to find you through your work?
        </h2>
        <p className="mt-3 text-sm font-medium leading-relaxed text-black/60">
          Add your AI Wrapped to your DevLabs profile and become discoverable to founders looking for
          builders like you.
        </p>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={enable}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#fa7d22] px-4 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Make my profile discoverable'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="text-sm font-bold text-black/50 underline-offset-4 hover:underline"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default BuildprintDiscoverabilityPrompt;
