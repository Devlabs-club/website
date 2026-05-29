import React, { useState } from 'react';
import type { CallScheduleData } from '@/components/founder/founderTypes';

type BuilderCallItem = CallScheduleData & {
  roleTitle?: string;
  company?: string;
  founderName?: string;
};

function formatSlot(slot?: { startAt: string; endAt: string; timezone: string } | null) {
  if (!slot?.startAt) return 'TBD';
  return new Date(slot.startAt).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function BuilderCallPanel({
  calls,
  onUpdated,
}: {
  calls: BuilderCallItem[];
  onUpdated: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (call: BuilderCallItem, scheduleAction: 'accept' | 'counter') => {
    setBusyId(call._id);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        callScheduleId: call._id,
        scheduleAction,
      };
      if (scheduleAction === 'counter') {
        if (!startAt || !endAt) throw new Error('Start and end times are required');
        payload.slot = {
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      const res = await fetch('/api/agent/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'respond_call_schedule', payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Action failed');
      setCounterFor(null);
      setStartAt('');
      setEndAt('');
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (calls.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/20 bg-white/[0.02] p-12 text-center">
        <p className="text-white/60 text-sm">No scheduled calls yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-amber-300">{error}</p> : null}
      {calls.map((call) => (
        <div key={call._id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap justify-between gap-2 mb-3">
            <div>
              <h3 className="text-lg font-semibold">{call.roleTitle || 'Intro call'}</h3>
              <p className="text-sm text-white/60">
                {call.company} · with {call.founderName || 'founder'}
              </p>
            </div>
            <span className="text-xs uppercase tracking-wider text-white/50 border border-white/15 px-2 py-1 rounded-full">
              {call.status.replace(/_/g, ' ')}
            </span>
          </div>

          <p className="text-sm text-white/80 mb-1">
            Proposed: {formatSlot(call.confirmedSlot || call.proposedSlot)}
          </p>
          {call.meetingUrl ? (
            <a
              href={call.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-[#ffb580] hover:underline"
            >
              Join meeting
            </a>
          ) : null}

          {call.status === 'pending_builder' ? (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
              <button
                type="button"
                disabled={busyId === call._id}
                onClick={() => act(call, 'accept')}
                className="px-4 py-2 rounded-xl bg-[#fa7d22] text-black text-sm font-semibold disabled:opacity-50"
              >
                Accept time
              </button>
              <button
                type="button"
                onClick={() => setCounterFor(counterFor === call._id ? null : call._id)}
                className="px-4 py-2 rounded-xl border border-white/20 text-white/80 text-sm hover:bg-white/5"
              >
                Propose new time
              </button>
            </div>
          ) : null}

          {counterFor === call._id ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <button
                type="button"
                disabled={busyId === call._id}
                onClick={() => act(call, 'counter')}
                className="md:col-span-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm hover:bg-white/15 disabled:opacity-50"
              >
                Send counter-proposal
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
