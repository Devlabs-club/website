import React, { useEffect, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';

type HandoffData = {
  success: boolean;
  error?: string;
  builderName?: string;
  builderEmail?: string;
  phoneVerified?: boolean;
  imessageUrl?: string | null;
  smsUrl?: string | null;
  messageBody?: string;
  agentPhone?: string | null;
};

const cardClass = 'rounded-2xl border border-border bg-card p-6 shadow-sm';

/**
 * Shared handoff UI: open iMessage with a pre-filled "hi devlabs:TOKEN" message.
 * Sending that message verifies phone + identity (no OTP).
 */
export const BuilderImessageHandoff: React.FC<{
  fetchHandoff: () => Promise<HandoffData>;
  title?: string;
  subtitle?: string;
  onVerified?: () => void;
  pollVerified?: boolean;
  pollUrl?: string;
}> = ({
  fetchHandoff,
  title = 'Continue in Messages',
  subtitle = 'Tap below to open iMessage. Send the pre-filled message — that verifies you and starts your profile with the DevLabs agent.',
  onVerified,
  pollVerified = false,
  pollUrl = '/api/builder/profile',
}) => {
  const [data, setData] = useState<HandoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchHandoff();
        setData(res);
        if (!res.success) setError(res.error || 'Could not load handoff.');
        else if (res.phoneVerified) onVerified?.();
      } catch {
        setError('Could not load handoff.');
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchHandoff, onVerified]);

  useEffect(() => {
    if (!pollVerified || data?.phoneVerified) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(pollUrl, { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        if (json.phoneVerified) {
          onVerified?.();
          setData((prev) => (prev ? { ...prev, phoneVerified: true } : prev));
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(id);
  }, [pollVerified, pollUrl, data?.phoneVerified, onVerified]);

  if (loading) {
    return (
      <div className={`flex h-44 items-center justify-center ${cardClass}`}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className={cardClass}>
        <p className="text-sm text-destructive">{error || data?.error || 'Something went wrong.'}</p>
      </div>
    );
  }

  if (data.phoneVerified) {
    return (
      <div className={cardClass}>
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <h2 className="text-lg font-semibold">You&apos;re verified</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check Messages — the DevLabs agent is building your profile. Reply there anytime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const openUrl = data.imessageUrl || data.smsUrl;

  return (
    <div className={cardClass}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fa7d22]/10 text-[#fa7d22]">
        <MessageCircle className="h-5 w-5" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      {data.builderName && (
        <p className="mt-3 text-sm text-muted-foreground">
          Signed in as <strong className="text-foreground">{data.builderName}</strong>
          {data.builderEmail ? ` (${data.builderEmail})` : ''}
        </p>
      )}

      {openUrl ? (
        <a
          href={openUrl}
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#fa7d22] text-base font-semibold text-black no-underline"
        >
          Open Messages
        </a>
      ) : (
        <p className="mt-4 text-sm text-destructive">
          iMessage handoff is not configured (set DEVLABS_IMESSAGE_PHONE). Text{' '}
          {data.agentPhone || 'the DevLabs number'} manually:
        </p>
      )}

      {data.messageBody && (
        <p className="mt-4 rounded-xl bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
          {data.messageBody}
        </p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        By tapping Open Messages and sending the pre-filled text, you agree to receive SMS/iMessage
        from DevLabs about your builder profile and founder intro requests. Message frequency varies.
        Reply STOP to unsubscribe. Msg &amp; data rates may apply.
      </p>

      <p className="mt-3 text-xs text-muted-foreground">
        Save{' '}
        <a href="/contact/devlabs.vcf" download className="font-semibold text-[#fa7d22]">
          the DevLabs contact
        </a>{' '}
        first so you know it&apos;s us. We only ping you when a founder wants to talk.
      </p>

      {pollVerified && (
        <p className="mt-3 text-xs text-muted-foreground">Waiting for your message… this page updates automatically.</p>
      )}
    </div>
  );
};

export default BuilderImessageHandoff;
