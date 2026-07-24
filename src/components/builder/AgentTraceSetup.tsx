import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Clipboard, Loader2, RefreshCw } from 'lucide-react';

export type MessageDelivery =
  | { status: 'sent'; providerMessageId?: string | null }
  | { status: 'not_configured' }
  | { status: 'delivery_failed'; error: string };

type AgentTraceSetupProps = {
  builderId: string;
  uploadToken: string;
  command: string;
  publicUrl?: string | null;
  messageDelivery?: MessageDelivery | null;
  autoCompleteOnUploaded?: boolean;
  onComplete: () => void | Promise<void>;
};

async function readJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export const AgentTraceSetup: React.FC<AgentTraceSetupProps> = ({
  builderId,
  uploadToken,
  command,
  publicUrl,
  messageDelivery,
  autoCompleteOnUploaded = true,
  onComplete,
}) => {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [startingMessage, setStartingMessage] = useState(false);
  const [delivery, setDelivery] = useState<MessageDelivery | null>(messageDelivery || null);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState('');

  const statusUrl = useMemo(() => {
    const params = new URLSearchParams({ builderId, token: uploadToken });
    return `/api/builder/wrapped/status?${params.toString()}`;
  }, [builderId, uploadToken]);

  const checkStatus = async (silent = false) => {
    if (!silent) setError('');
    setChecking(true);
    try {
      const res = await fetch(statusUrl, { credentials: 'include' });
      const data = await readJson(res);
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not check trace status.');
      setUploaded(Boolean(data.uploaded));
      if (data.uploaded && autoCompleteOnUploaded) await onComplete();
      else if (!silent) setError('No uploaded report yet. Run the command, approve the preview, then check again.');
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : 'Could not check trace status.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkStatus(true);
    const timer = window.setInterval(() => void checkStatus(true), 12000);
    return () => window.clearInterval(timer);
  }, [statusUrl, autoCompleteOnUploaded]);

  const copyCommand = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError('Could not copy automatically. Select the command and copy it manually.');
    }
  };

  const retryMessage = async () => {
    setStartingMessage(true);
    setError('');
    try {
      const res = await fetch('/api/builder/message/start', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not start the iMessage agent.');
      setDelivery(data.delivery || null);
      if (data.delivery?.status !== 'sent') {
        setError('The iMessage agent still could not send. Check iMessage/BlueBubbles configuration.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the iMessage agent.');
    } finally {
      setStartingMessage(false);
    }
  };

  return (
    <div className="agent-trace-setup font-manrope mx-auto w-full max-w-3xl">
      {uploaded ? (
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold text-[#20311d]">
          <CheckCircle2 className="h-4 w-4 text-[#ff7417]" />
          Agent Wrapped uploaded — continuing…
        </div>
      ) : null}

      <section className="border-b border-black/10 pb-8">
        <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">01 · Run locally</p>
        <p className="mt-3 max-w-xl text-sm leading-6 text-black/50">
          Paste this in Terminal. It scans Claude Code, Codex, Cursor, and exported sessions — then uploads
          only aggregated metrics after you approve the preview.
        </p>

        <div className="mt-5 overflow-hidden border border-black/10 bg-[#1a1a1a]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-white/40">Terminal</span>
            <button
              type="button"
              onClick={copyCommand}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 transition-colors hover:text-white"
            >
              <Clipboard className="h-3.5 w-3.5" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="custom-scrollbar overflow-x-auto whitespace-pre px-4 py-4 text-[0.78rem] leading-6 text-white/90">
            <code>{command}</code>
          </pre>
        </div>
      </section>

      <section className="border-b border-black/10 py-8">
        <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-[#ff7417]">02 · Messages</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-lg text-sm leading-6 text-black/50">
            {delivery?.status === 'sent'
              ? 'The DevLabs agent texted you. Keep building your profile in Messages while traces run here.'
              : delivery?.status === 'delivery_failed'
                ? `Could not send automatically: ${delivery.error}`
                : 'The agent has not been confirmed as sent yet.'}
          </p>
          {delivery?.status !== 'sent' ? (
            <button
              type="button"
              onClick={() => void retryMessage()}
              disabled={startingMessage}
              className="builder-outline-button inline-flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-bold uppercase tracking-[0.08em] disabled:opacity-50"
            >
              {startingMessage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Start agent
            </button>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 border border-[#ff7417]/30 bg-[#fff5ef] px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.1em] text-[#bf4f08]">
              <CheckCircle2 className="h-3 w-3" />
              Sent
            </span>
          )}
        </div>
      </section>

      <section className="border-b border-black/10 py-8">
        <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.22em] text-black/35">What gets shared</p>
        <div className="mt-5 grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-sm font-extrabold text-[#050505]">Will upload</p>
            <p className="mt-2 text-sm leading-6 text-black/50">
              Language patterns, frameworks, build surfaces, validation habits, agent maturity, and safe evidence summaries.
            </p>
          </div>
          <div>
            <p className="text-sm font-extrabold text-[#050505]">Will not upload</p>
            <p className="mt-2 text-sm leading-6 text-black/50">
              Raw prompts, conversations, source code, secrets, env vars, full paths, or private filenames.
            </p>
          </div>
        </div>
      </section>

      <section className="pt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => void checkStatus(false)}
            disabled={checking}
            className="builder-primary-button inline-flex h-10 flex-1 items-center justify-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] disabled:opacity-50 sm:max-w-[14rem]"
          >
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check status
          </button>
          {uploaded && publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="builder-outline-button inline-flex h-10 flex-1 items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] sm:max-w-[14rem]"
            >
              Preview card
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Run the terminal command and approve the upload first"
              className="builder-outline-button inline-flex h-10 flex-1 cursor-not-allowed items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] opacity-40 sm:max-w-[14rem]"
            >
              Preview card
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

        {!uploaded ? (
          <p className="mt-5 max-w-xl text-xs leading-5 text-black/40">
            Required before your profile goes live — Agent Wrapped reflects how you ship with AI across all your work, not one project.
          </p>
        ) : null}
      </section>
    </div>
  );
};

export default AgentTraceSetup;
