import React, { useEffect, useState } from 'react';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { WrappedStoryPlayer } from './wrapped/WrappedStoryPlayer';

type WrappedResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  report?: AgentWrappedReport;
  source?: AgentWrappedReport['source'];
};

export const AgentWrappedPage: React.FC<{ builderId: string }> = ({ builderId }) => {
  const [report, setReport] = useState<AgentWrappedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/builder/wrapped/${encodeURIComponent(builderId)}`);
        const data: WrappedResponse = await res.json();
        if (!res.ok || !data.ok || !data.report) {
          throw new Error(
            data.message ||
              data.error ||
              'Agent Wrapped is only available after you run the local command and approve the upload.'
          );
        }
        setReport(data.report);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load wrapped report.');
      } finally {
        setLoading(false);
      }
    })();
  }, [builderId]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] text-[#14110f]">
        <Loader2 className="h-6 w-6 animate-spin text-[#fa7d22]" />
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-4 text-[#14110f]">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white p-6 text-center shadow-[0_18px_50px_rgba(33,24,16,0.08)]">
          <AlertCircle className="mx-auto h-8 w-8 text-[#fa7d22]" />
          <h1 className="mt-4 text-xl font-bold">No Agent Wrapped yet</h1>
          <p className="mt-2 text-sm text-black/55">
            {error ||
              'This builder has not uploaded local agent traces. Wrapped cards only appear after the terminal command is run and approved.'}
          </p>
          <a
            href="/builder/home"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-[#fa7d22] px-4 text-xs font-extrabold uppercase tracking-[0.08em] text-white"
          >
            Go to builder home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#fbfaf7] px-3 py-4 text-[#14110f] sm:px-6 sm:py-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-noise opacity-[0.06]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col items-center">
        <div className="mb-3 flex w-full max-w-5xl items-center justify-between gap-4 sm:mb-5">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-black text-[#14110f]">
            <img src="/logo.png" alt="" className="h-7 w-7 object-contain" />
            DevLabs
          </a>
          <div className="text-xs font-black uppercase tracking-[0.2em] text-black/40">Builder Wrapped</div>
        </div>

        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-[0_10px_24px_rgba(33,24,16,0.06)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified by approved local agent analysis
        </div>

        <WrappedStoryPlayer report={report} />
      </div>
    </main>
  );
};

export default AgentWrappedPage;
