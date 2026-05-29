import React, { useState } from 'react';

export default function HireConfirmModal({
  opportunityId,
  builderId,
  builderName,
  skipTrial,
  onClose,
  onHired,
}: {
  opportunityId: string;
  builderId: string;
  builderName: string;
  skipTrial?: boolean;
  onClose: () => void;
  onHired: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hire = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'hire_builder',
          payload: {
            opportunityId,
            builderId,
            note: note.trim() || undefined,
            skipTrial: skipTrial === true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Hire failed');
      onHired();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hire failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#111] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">Hire {builderName}?</h2>
        <p className="text-sm text-white/60 mb-4">
          This marks the role as filled and notifies the builder.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the builder…"
          rows={3}
          className="w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none mb-3"
        />
        {error ? <p className="text-sm text-amber-300 mb-3">{error}</p> : null}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-white/20 text-white/80 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={hire}
            className="px-4 py-2 rounded-xl bg-emerald-500 text-black text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Hiring…' : 'Confirm hire'}
          </button>
        </div>
      </div>
    </div>
  );
}
