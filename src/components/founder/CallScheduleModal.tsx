import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';

const TIME_SLOTS = [
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
];

function combineDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('10:30');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewStart = useMemo(() => {
    if (!selectedDate) return null;
    return combineDateAndTime(selectedDate, startTime);
  }, [selectedDate, startTime]);

  const previewEnd = useMemo(() => {
    if (!selectedDate) return null;
    return combineDateAndTime(selectedDate, endTime);
  }, [selectedDate, endTime]);

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
        if (!selectedDate || !previewStart || !previewEnd) {
          throw new Error('Pick a date and time');
        }
        if (previewEnd <= previewStart) {
          throw new Error('End time must be after start time');
        }
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
                startAt: previewStart.toISOString(),
                endAt: previewEnd.toISOString(),
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
      <div className="relative w-full max-w-lg rounded-2xl border border-white/15 bg-[#111] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-1">
          {pendingFounderConfirm ? 'Confirm call time' : 'Schedule meet'}
        </h2>
        <p className="text-sm text-white/60 mb-4">With {builderName}</p>

        {pendingFounderConfirm ? (
          <p className="text-sm text-white/75 mb-4">
            The builder proposed a new time. Confirm it to finalize the call.
          </p>
        ) : (
          <div className="space-y-4 mb-4">
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 px-1">Pick a date</p>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                className="mx-auto"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-white/50 text-xs uppercase">Start</span>
                <select
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={`start-${slot}`} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-white/50 text-xs uppercase">End</span>
                <select
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full rounded-lg bg-black/30 border border-white/15 px-3 py-2 text-white"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={`end-${slot}`} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {previewStart && previewEnd ? (
              <p className="text-xs text-[#ffb580] px-1">
                {format(previewStart, 'EEEE, MMM d · h:mm a')} – {format(previewEnd, 'h:mm a')}
              </p>
            ) : null}

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
                placeholder="Agenda, timezone notes, etc."
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
            {busy ? 'Saving…' : pendingFounderConfirm ? 'Confirm time' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  );
}
