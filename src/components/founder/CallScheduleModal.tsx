import React, { useState } from 'react';

export default function CallScheduleModal({
  opportunityId,
  builderId,
  builderName,
  callScheduleId,
  pendingFounderConfirm,
  onClose,
  onScheduled,
}: {
  opportunityId: string;
  builderId: string;
  builderName: string;
  callScheduleId?: string | null;
  pendingFounderConfirm?: boolean;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (pendingFounderConfirm && callScheduleId) {
        const res = await fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'confirm_call_schedule',
            payload: { callScheduleId },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Confirm failed');
      } else {
        if (!startAt || !endAt) throw new Error('Start and end times are required');
        const res = await fetch('/api/agent/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'schedule_call',
            payload: {
              opportunityId,
              builderId,
              slot: {
                startAt: new Date(startAt).toISOString(),
                endAt: new Date(endAt).toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
              meetingUrl,
              notes,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Schedule failed');
      }
      onScheduled();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-[#111] p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-1">
          {pendingFounderConfirm ? 'Confirm call time' : 'Schedule intro call'}
        </h2>
        <p className="text-sm text-white/60 mb-4">With {builderName}</p>

        {pendingFounderConfirm ? (
          <p className="text-sm text-white/75 mb-4">
            The builder proposed a new time. Confirm it to finalize the call.
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            <label className="block text-sm">
              <span className="text-white/50 text-xs uppercase">Start</span>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/50 text-xs uppercase">End</span>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/50 text-xs uppercase">Meeting URL</span>
              <input
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/..."
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/50 text-xs uppercase">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white resize-none"
              />
            </label>
          </div>
        )}

        {error ? <p className="text-sm text-amber-300 mb-3">{error}</p> : null}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/20 text-white/80 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSubmit}
            className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold disabled:opacity-50"
          >
            {busy ? 'Saving…' : pendingFounderConfirm ? 'Confirm time' : 'Propose call'}
          </button>
        </div>
      </div>
    </div>
  );
}
