import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';
import { WrappedStoryPlayer } from './wrapped/WrappedStoryPlayer';

type WrappedResponse = {
  ok: boolean;
  error?: string;
  report?: AgentWrappedReport;
  source?: AgentWrappedReport['source'];
};

const ORANGE = '#fa7d22';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 backdrop-blur">
    <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-white/45">{title}</h3>
    {children}
  </section>
);

const Meter: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = ORANGE }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
      <span className="font-medium text-white/78">{label}</span>
      <span className="text-white/45">{value}</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-white/10">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  </div>
);

const BuildSurfaceGrid: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <div className="grid grid-cols-2 gap-3">
    {Object.entries(report.buildSurface).map(([label, value]) => (
      <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
        <p className="mt-1 text-xl font-bold text-white">{value}</p>
      </div>
    ))}
  </div>
);

const FullReportDetail: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <div className="mx-auto mt-6 grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_1fr]">
    <Section title="Build surface">
      <BuildSurfaceGrid report={report} />
    </Section>
    <Section title="Validation behavior">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-2xl font-black text-white">{report.validation.buildTestLoops}</p>
          <p className="text-xs text-white/45">build/test loops</p>
        </div>
        <div>
          <p className="text-2xl font-black text-white">{report.validation.errorRecoveryLoops}</p>
          <p className="text-xs text-white/45">recovery loops</p>
        </div>
        <div>
          <p className="text-2xl font-black text-white">{report.validation.successfulReruns}</p>
          <p className="text-xs text-white/45">successful reruns</p>
        </div>
      </div>
      <div className="mt-4">
        <Meter label="Test discipline" value={report.validation.testDisciplineScore} />
      </div>
    </Section>
    <Section title="Agent maturity">
      <div className="space-y-3">
        <Meter label="Planning" value={report.agentMaturity.planningScore} />
        <Meter label="Context" value={report.agentMaturity.contextScore} />
        <Meter label="Iteration" value={report.agentMaturity.iterationScore} />
        <Meter label="Verification" value={report.agentMaturity.verificationScore} />
      </div>
    </Section>
    <Section title="Evidence highlights">
      <div className="space-y-2">
        {report.evidenceHighlights.slice(0, 5).map((item) => (
          <div key={item} className="flex gap-2 text-sm leading-6 text-white/75">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </Section>
  </div>
);

export const AgentWrappedPage: React.FC<{ builderId: string }> = ({ builderId }) => {
  const [report, setReport] = useState<AgentWrappedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/builder/wrapped/${encodeURIComponent(builderId)}`);
        const data: WrappedResponse = await res.json();
        if (!res.ok || !data.ok || !data.report) throw new Error(data.error || 'Could not load wrapped report.');
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
          <h1 className="mt-4 text-xl font-bold">Wrapped unavailable</h1>
          <p className="mt-2 text-sm text-black/55">{error || 'Builder report not found.'}</p>
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

        {report.source === 'profile_fallback' ? (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#fa7d22]/25 bg-white px-4 py-2 text-xs font-bold text-[#a95515] shadow-[0_10px_24px_rgba(33,24,16,0.06)]">
            <Sparkles className="h-3.5 w-3.5" />
            Estimated from profile — connect an agent trace for the verified version
          </div>
        ) : (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-white px-4 py-2 text-xs font-bold text-emerald-700 shadow-[0_10px_24px_rgba(33,24,16,0.06)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified by approved local agent analysis
          </div>
        )}

        <WrappedStoryPlayer report={report} />
      </div>
    </main>
  );
};

export default AgentWrappedPage;
