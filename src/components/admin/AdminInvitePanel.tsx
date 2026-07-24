import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MailCheck, Send } from 'lucide-react';
import {
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminMutedClass,
  adminPanelClass,
  adminPrimaryButtonClass,
} from './adminUi';

type InviteRow = {
  email: string;
  status: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  email_sent: 'Invite sent',
  phone_pending: 'Phone pending',
  phone_verified: 'Phone verified',
  conversation_started: 'In progress',
  completed: 'Completed',
  expired: 'Expired',
};

function StatusPill({ status }: { status: string }) {
  const label = STATUS_LABELS[status] || status;
  const done = status === 'completed';
  const expired = status === 'expired';
  return (
    <span
      className={
        done
          ? 'inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700'
          : expired
            ? 'inline-flex items-center rounded-full border border-black/15 bg-black/5 px-2.5 py-1 text-[11px] font-bold text-black/45'
            : 'inline-flex items-center rounded-full border border-[#ff7417]/40 bg-[#fff5ef] px-2.5 py-1 text-[11px] font-bold text-[#bf4f08]'
      }
    >
      {label}
    </span>
  );
}

export default function AdminInvitePanel() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  const loadInvites = useCallback(async () => {
    setLoadingInvites(true);
    try {
      const res = await fetch('/api/admin/invite-builder', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setInvites(data.invites || []);
    } catch {
      // Non-fatal — the form still works without the history list.
    } finally {
      setLoadingInvites(false);
    }
  }, []);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setMessage(null);
    setSending(true);
    try {
      const res = await fetch('/api/admin/invite-builder', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Could not send invite.');
      }
      setMessage({ kind: 'ok', text: `Invite sent to ${data.email}.` });
      setEmail('');
      setName('');
      await loadInvites();
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Could not send invite.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Admin"
        title="Invite Builders"
        subtitle="Send a builder a themed welcome email to claim their DevLabs profile and complete onboarding."
      />

      <div className={`${adminPanelClass} p-5`}>
        <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-2">
            <span className={adminLabelClass}>Builder email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="builder@example.com"
              className={adminInputClass}
              disabled={sending}
            />
          </label>
          <label className="flex-1 space-y-2">
            <span className={adminLabelClass}>Name (optional)</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Rivera"
              className={adminInputClass}
              disabled={sending}
            />
          </label>
          <button type="submit" disabled={sending || !email.trim()} className={adminPrimaryButtonClass(sending || !email.trim())}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </form>

        {message ? (
          <p
            className={
              message.kind === 'ok'
                ? 'mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700'
                : 'mt-4 flex items-center gap-2 text-sm font-semibold text-red-600'
            }
          >
            {message.kind === 'ok' ? <MailCheck className="h-4 w-4" /> : null}
            {message.text}
          </p>
        ) : null}
      </div>

      <div className={`${adminPanelClass} p-5`}>
        <div className="flex items-center justify-between">
          <p className={adminLabelClass}>Recent invites</p>
          <button type="button" onClick={() => void loadInvites()} className="text-xs font-semibold text-black/50 hover:text-[#050505]">
            Refresh
          </button>
        </div>

        {loadingInvites ? (
          <div className="flex items-center gap-2 py-8 text-black/45">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : invites.length === 0 ? (
          <p className={`${adminMutedClass} py-8`}>No invites sent yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-black/8">
            {invites.map((invite, i) => (
              <li key={`${invite.email}-${i}`} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#050505]">{invite.name || invite.email}</p>
                  {invite.name ? <p className="truncate text-xs text-black/45">{invite.email}</p> : null}
                </div>
                <StatusPill status={invite.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
