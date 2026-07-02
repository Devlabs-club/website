import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clipboard,
  Download,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { AgentWrappedReport } from '@/lib/agentWrapped/types';

type WrappedResponse = {
  ok: boolean;
  error?: string;
  report?: AgentWrappedReport;
  source?: AgentWrappedReport['source'];
};

const ORANGE = '#fa7d22';
const BLUE = '#168df7';

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const total = 32;
    const timer = window.setInterval(() => {
      frame += 1;
      setDisplay(Math.round((value * frame) / total));
      if (frame >= total) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [value]);
  return <>{display}</>;
}

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

const FrameworkChips: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <div className="flex flex-wrap gap-2">
    {report.frameworks.slice(0, 10).map((framework, index) => (
      <motion.span
        key={`${framework.name}-${index}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 * index }}
        className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/80"
      >
        {framework.name}
      </motion.span>
    ))}
  </div>
);

const LanguageBreakdown: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <div className="space-y-3">
    {report.languages.slice(0, 5).map((language, index) => (
      <Meter key={`${language.name}-${index}`} label={language.name} value={language.percent} color={index === 0 ? ORANGE : BLUE} />
    ))}
  </div>
);

const BuildSurface: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <div className="grid grid-cols-2 gap-3">
    {Object.entries(report.buildSurface).map(([label, value]) => (
      <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[11px] uppercase tracking-wide text-white/40">{label}</p>
        <p className="mt-1 text-xl font-bold text-white">{value}</p>
      </div>
    ))}
  </div>
);

const ShareActions: React.FC<{ report: AgentWrappedReport }> = ({ report }) => {
  const [copied, setCopied] = useState(false);
  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return report.share.publicUrl;
    return report.share.publicUrl.startsWith('http') ? report.share.publicUrl : `${window.location.origin}${report.share.publicUrl}`;
  }, [report.share.publicUrl]);

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#fa7d22] px-4 text-sm font-bold text-black transition hover:bg-[#ff9b4e]"
      >
        <Clipboard className="h-4 w-4" />
        {copied ? 'Copied' : 'Copy share link'}
      </button>
      <button
        type="button"
        disabled
        title="Image export is coming next."
        className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-white/35"
      >
        <Download className="h-4 w-4" />
        Download card
      </button>
    </div>
  );
};

const AgentWrappedCard: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <motion.article
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-[32px] border-[3px] border-[#168df7] bg-[#080809] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.45)] sm:p-6"
  >
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(250,125,34,0.28),transparent_34%),radial-gradient(circle_at_90%_0%,rgba(22,141,247,0.22),transparent_30%)]" />
    <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.12]" />

    <div className="relative">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#fa7d22]">DevLabs Agent Wrapped</p>
          <p className="mt-1 text-xs text-white/52">
            {report.source === 'uploaded_agent_usage'
              ? 'Verified proof-of-work from approved agent usage'
              : 'Profile fallback until agent usage is uploaded'}
          </p>
        </div>
        <img src="/logo.png" alt="DevLabs" className="h-9 w-9 rounded-xl object-contain" />
      </div>

      <div className="mt-8">
        <p className="text-sm font-semibold text-white/60">{report.builderName || 'DevLabs Builder'}</p>
        <h1 className="mt-2 text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl">{report.archetype}</h1>
      </div>

      <div className="mt-7 flex items-end justify-between gap-4 border-y border-white/10 py-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Agent maturity score</p>
          <p className="mt-1 text-6xl font-black leading-none text-white">
            <CountUp value={report.score} />
            <span className="text-2xl text-white/38">/100</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-[#fa7d22]">top {report.percentile || 20}%</p>
          <p className="text-xs text-white/45">{report.confidence} confidence</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <Section title="Top languages">
          <LanguageBreakdown report={report} />
        </Section>
        <Section title="Frameworks and tools">
          <FrameworkChips report={report} />
        </Section>
        <Section title="Founder read">
          <p className="text-sm leading-6 text-white/78">{report.founderRead.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.founderRead.bestFitRoles.slice(0, 3).map((role) => (
              <span key={role} className="rounded-full bg-[#fa7d22]/15 px-3 py-1 text-xs font-semibold text-[#ffb580]">
                {role}
              </span>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-white/58">
        <ShieldCheck className="h-4 w-4 text-emerald-400" />
        Aggregated signals only. No raw prompts, code, secrets, or local paths uploaded.
      </div>
    </div>
  </motion.article>
);

const WrappedDetail: React.FC<{ report: AgentWrappedReport }> = ({ report }) => (
  <div className="mx-auto mt-8 grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_1fr]">
    <Section title="Build surface">
      <BuildSurface report={report} />
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
      <main className="flex min-h-screen items-center justify-center bg-[#080809] text-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#fa7d22]" />
      </main>
    );
  }

  if (error || !report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#080809] px-4 text-white">
        <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-[#fa7d22]" />
          <h1 className="mt-4 text-xl font-bold">Wrapped unavailable</h1>
          <p className="mt-2 text-sm text-white/55">{error || 'Builder report not found.'}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#080809] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(250,125,34,0.16),transparent_30%),radial-gradient(circle_at_86%_0%,rgba(22,141,247,0.16),transparent_28%)]" />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center">
        <div className="mb-6 flex w-full max-w-5xl items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-white/85">
            <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg" />
            DevLabs
          </a>
          <a href={report.share.publicUrl} className="inline-flex items-center gap-1 text-sm font-semibold text-white/50 hover:text-white">
            Public card <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <AgentWrappedCard report={report} />

        <div className="mt-6 flex flex-col items-center gap-4 text-center">
          {report.source === 'profile_fallback' ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[#fa7d22]/25 bg-[#fa7d22]/10 px-4 py-2 text-xs font-semibold text-[#ffb580]">
              <Sparkles className="h-3.5 w-3.5" />
              Waiting on builder-level agent usage upload
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-xs font-semibold text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified by approved local agent analysis
            </div>
          )}
          <ShareActions report={report} />
        </div>

        <WrappedDetail report={report} />
      </div>
    </main>
  );
};

export default AgentWrappedPage;
