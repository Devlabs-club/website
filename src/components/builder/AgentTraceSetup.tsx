import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Loader2, RefreshCw, Terminal } from 'lucide-react';

export type MessageDelivery =
  | { status: 'sent'; providerMessageId?: string | null }
  | { status: 'not_configured' }
  | { status: 'delivery_failed'; error: string };

type AgentTraceSetupProps = {
  builderId: string;
  uploadToken: string;
  command: string;
  publicUrl: string;
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
      else if (!silent) setError('No uploaded Agent Wrapped report yet. Run the command, approve the preview, then check again.');
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
    <div className="mx-auto w-full max-w-2xl rounded-[22px] border border-[#1a140f]/10 bg-[#fbfaf7] p-6 shadow-[0_16px_42px_rgba(33,24,16,0.07)] sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#fa7d22]/25 bg-[#fff7ef] text-[#fa7d22]">
        {uploaded ? <CheckCircle2 className="h-5 w-5" /> : <Terminal className="h-5 w-5" />}
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[#fa7d22]">DevLabs Agent Wrapped</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[#14110f]">Run agent traces</h2>
      <p className="mt-2 text-sm leading-6 text-[#746b62]">
        Turn your real AI-building workflow into verified proof-of-work. This runs locally across
        Claude Code, Codex, Cursor, and exported session summaries, then uploads only safe aggregated
        metrics after you approve the preview.
      </p>

      <div className="mt-5 rounded-2xl border border-[#1a140f]/10 bg-white p-4 shadow-[0_10px_26px_rgba(33,24,16,0.05)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#14110f]">iMessage agent</p>
            <p className="mt-1 text-sm leading-6 text-[#746b62]">
              {delivery?.status === 'sent'
                ? 'The DevLabs agent texted you. Continue the profile conversation in Messages while traces run here.'
                : delivery?.status === 'delivery_failed'
                  ? `The agent did not send automatically: ${delivery.error}`
                  : 'The agent has not been confirmed as sent yet.'}
            </p>
          </div>
          {delivery?.status !== 'sent' && (
            <button
              type="button"
              onClick={() => void retryMessage()}
              disabled={startingMessage}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#1a140f]/10 bg-[#fbfaf7] px-4 text-sm font-bold text-[#14110f] hover:bg-[#fff7ef] disabled:opacity-50"
            >
              {startingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Start iMessage agent
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#1a140f]/10 bg-white p-3 shadow-[0_10px_26px_rgba(33,24,16,0.05)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#9b9188]">Copy and run locally</span>
          <button
            type="button"
            onClick={copyCommand}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-[#1a140f]/10 bg-[#fbfaf7] px-3 text-xs font-bold text-[#14110f] hover:bg-[#fff7ef]"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="custom-scrollbar overflow-x-auto whitespace-pre rounded-xl bg-black p-4 text-xs leading-6 text-white">
          <code>{command}</code>
        </pre>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-[#746b62] sm:grid-cols-2">
        <div className="rounded-2xl border border-[#1a140f]/10 bg-white p-4">
          <p className="font-bold text-[#14110f]">Will upload</p>
          <p className="mt-1 leading-6">Language patterns, frameworks, build surfaces, validation habits, agent maturity, and safe evidence summaries.</p>
        </div>
        <div className="rounded-2xl border border-[#1a140f]/10 bg-white p-4">
          <p className="font-bold text-[#14110f]">Will not upload</p>
          <p className="mt-1 leading-6">Raw prompts, conversations, source code, secrets, environment variables, full paths, or private filenames.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void checkStatus(false)}
          disabled={checking}
          className="dashboard-orange-button inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check status
        </button>
        <a
          href={publicUrl}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[#1a140f]/10 bg-white px-4 text-sm font-bold text-[#14110f] hover:bg-[#fff7ef]"
        >
          Preview public card
        </a>
      </div>

      {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}
      {uploaded ? (
        <p className="mt-4 text-sm font-semibold text-emerald-600">Agent Wrapped report uploaded. Continuing...</p>
      ) : (
        <p className="mt-4 text-xs leading-5 text-[#746b62]">
          This step is required before your profile is unlocked because Agent Wrapped should be based on builder-level AI agent usage, not one selected project.
        </p>
      )}
    </div>
  );
};

export default AgentTraceSetup;
