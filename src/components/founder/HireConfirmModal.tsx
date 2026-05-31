import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { OsButton } from '@/components/os';

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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-panel-strong border-white/15 bg-[#111]/95 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hire {builderName}?</DialogTitle>
          <DialogDescription className="text-white/60">
            This marks the role as filled and notifies the builder.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note for the builder…"
          rows={3}
          className="w-full rounded-xl bg-black/30 border border-white/15 px-3 py-2 text-sm text-white resize-none"
        />
        {error ? <p className="text-sm text-amber-300">{error}</p> : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <OsButton variant="glass" onClick={onClose}>
            Cancel
          </OsButton>
          <OsButton variant="shimmer" onClick={hire} disabled={busy} className="bg-emerald-500">
            {busy ? 'Hiring…' : 'Confirm hire'}
          </OsButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
