import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clipboard, Loader2, MessageCircle } from 'lucide-react';

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
  imessageAddress?: string | null;
  agentContact?: string | null;
};

/**
 * Shared handoff UI: open iMessage with a pre-filled "hi devlabs:TOKEN" message.
 * Sending that message verifies phone + identity (no OTP).
 */
export const BuilderImessageHandoff: React.FC<{
  fetchHandoff: () => Promise<HandoffData>;
  title?: string;
  subtitle?: string;
  stepLabel?: string;
  onVerified?: () => void;
  pollVerified?: boolean;
  pollUrl?: string;
}> = ({
  fetchHandoff,
  title = 'Verify in Messages',
  subtitle = 'Open iMessage and send the pre-filled message. That verifies your number and starts your profile with the DevLabs agent — no codes.',
  stepLabel = '01 · Verify',
  onVerified,
  pollVerified = false,
  pollUrl = '/api/builder/profile',
}) => {
  const [data, setData] = useState<HandoffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const onVerifiedRef = useRef(onVerified);
  const verifiedNotifiedRef = useRef(false);

  onVerifiedRef.current = onVerified;

  const notifyVerifiedOnce = () => {
    if (verifiedNotifiedRef.current) return;
    verifiedNotifiedRef.current = true;
    onVerifiedRef.current?.();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchHandoff();
        if (cancelled) return;
        setData(res);
        if (!res.success) setError(res.error || 'Could not load handoff.');
        else if (res.phoneVerified) notifyVerifiedOnce();
      } catch {
        if (!cancelled) setError('Could not load handoff.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchHandoff]);

  useEffect(() => {
    if (!pollVerified || data?.phoneVerified) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(pollUrl, { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        if (json.phoneVerified) {
          notifyVerifiedOnce();
          setData((prev) => (prev ? { ...prev, phoneVerified: true } : prev));
        }
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(id);
  }, [pollVerified, pollUrl, data?.phoneVerified]);

  const copyMessage = async () => {
    if (!data?.messageBody) return;
    try {
      await navigator.clipboard.writeText(data.messageBody);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="font-manrope flex min-h-[12rem] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#ff7417]" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <div className="font-manrope mx-auto max-w-lg">
        <p className="text-sm font-medium text-red-600">{error || data?.error || 'Something went wrong.'}</p>
      </div>
    );
  }

  if (data.phoneVerified) {
    return (
      <div className="font-manrope mx-auto max-w-lg">
        <div className="flex items-start gap-3 border-b border-black/10 pb-8">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#ff7417]" />
          <div>
            <h2 className="text-lg font-extrabold tracking-[-0.02em] text-[#050505]">You&apos;re verified</h2>
            <p className="mt-2 text-sm leading-6 text-black/50">
              Check Messages — the DevLabs agent is building your profile. Reply there anytime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const openUrl = data.imessageUrl || data.smsUrl;

  return (
    <div className="font-manrope mx-auto w-full max-w-lg">
      <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">{stepLabel}</p>
      <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.35rem)] font-extrabold leading-[1.12] tracking-[-0.03em] text-[#050505]">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/50">{subtitle}</p>

      {data.builderName ? (
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.1em] text-black/40">
          {data.builderName}
          {data.builderEmail ? ` · ${data.builderEmail}` : ''}
        </p>
      ) : null}

      {openUrl ? (
        <a
          href={openUrl}
          className="builder-primary-button mt-8 inline-flex h-12 w-full items-center justify-center gap-2 text-sm font-semibold no-underline"
        >
          <MessageCircle className="h-4 w-4" />
          Open Messages
        </a>
      ) : (
        <p className="mt-6 text-sm leading-6 text-red-600">
          iMessage handoff is not configured. Text{' '}
          {data.agentContact || data.imessageAddress || data.agentPhone || 'the DevLabs agent'} manually:
        </p>
      )}

      {data.messageBody ? (
        <div className="mt-6 overflow-hidden border border-black/10 bg-[#1a1a1a]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-white/40">Your message</span>
            <button
              type="button"
              onClick={() => void copyMessage()}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 transition-colors hover:text-white"
            >
              <Clipboard className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="custom-scrollbar overflow-x-auto px-4 py-3 font-mono text-[0.72rem] leading-6 text-white/85">
            {data.messageBody}
          </p>
        </div>
      ) : null}

      {pollVerified ? (
        <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-black/45">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff7417]/40 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#ff7417]" />
          </span>
          Waiting for your message — this page updates automatically
        </div>
      ) : null}

      <div className="mt-8 space-y-3 border-t border-black/10 pt-6 text-[0.68rem] leading-5 text-black/38">
        <p>
          By sending the pre-filled text, you agree to receive SMS/iMessage from DevLabs about your builder profile
          and founder intro requests. Reply STOP to unsubscribe.
        </p>
        <p>
          Save{' '}
          <a href="/contact/devlabs.vcf" download className="font-bold text-[#bf4f08] hover:text-[#ff7417]">
            the DevLabs contact
          </a>{' '}
          first so you know it&apos;s us.
        </p>
      </div>
    </div>
  );
};

export default BuilderImessageHandoff;
