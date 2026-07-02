import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, Loader2, RefreshCw, Terminal } from 'lucide-react';

type AgentTraceSetupProps = {
  builderId: string;
  uploadToken: string;
  command: string;
  publicUrl: string;
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
  onComplete,
}) => {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
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
      if (data.uploaded) await onComplete();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusUrl]);

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

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#fa7d22]/25 bg-[#fa7d22]/10 text-[#fa7d22]">
        {uploaded ? <CheckCircle2 className="h-5 w-5" /> : <Terminal className="h-5 w-5" />}
      </div>

      <p className="mt-5 text-sm font-semibold text-[#fa7d22]">DevLabs Agent Wrapped</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Run agent traces</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Turn your real AI-building workflow into verified proof-of-work. This runs locally across
        Claude Code, Codex, Cursor, and exported session summaries, then uploads only safe aggregated
        metrics after you approve the preview.
      </p>

      <div className="mt-5 rounded-2xl border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Copy and run locally</span>
          <button
            type="button"
            onClick={copyCommand}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <Clipboard className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="custom-scrollbar overflow-x-auto whitespace-pre rounded-xl bg-black p-4 text-xs leading-6 text-white">
          <code>{command}</code>
        </pre>
      </div>

      <div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Will upload</p>
          <p className="mt-1">Language patterns, frameworks, build surfaces, validation habits, agent maturity, and safe evidence summaries.</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="font-semibold text-foreground">Will not upload</p>
          <p className="mt-1">Raw prompts, conversations, source code, secrets, environment variables, full paths, or private filenames.</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void checkStatus(false)}
          disabled={checking}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#fa7d22] px-4 text-sm font-semibold text-black disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check status
        </button>
        <a
          href={publicUrl}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Preview public card
        </a>
      </div>

      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {uploaded ? (
        <p className="mt-4 text-sm text-emerald-500">Agent Wrapped report uploaded. Continuing...</p>
      ) : (
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          This step is required before your profile is unlocked because Agent Wrapped should be based on builder-level AI agent usage, not one selected project.
        </p>
      )}
    </div>
  );
};

export default AgentTraceSetup;
