function padRight(value, width) {
  return String(value).padEnd(width, ' ');
}

function shouldUseColor(option) {
  if (option === true) return true;
  if (option === false) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

function makeTheme(colorOption) {
  const enabled = shouldUseColor(colorOption);
  const wrap = (open, close = '\x1b[0m') => (value) => (enabled ? `${open}${value}${close}` : value);
  return {
    enabled,
    reset: '\x1b[0m',
    orange: wrap('\x1b[38;2;250;125;34m'),
    blue: wrap('\x1b[38;2;22;141;247m'),
    cream: wrap('\x1b[38;2;251;246;243m'),
    muted: wrap('\x1b[38;2;160;154;148m'),
    green: wrap('\x1b[38;2;80;220;150m'),
    yellow: wrap('\x1b[38;2;255;190;90m'),
    bold: wrap('\x1b[1m', enabled ? '\x1b[22m' : ''),
    dim: wrap('\x1b[2m', enabled ? '\x1b[22m' : ''),
  };
}

function titleCase(value) {
  return String(value || '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function confidenceLabel(value) {
  return titleCase(value || 'moderate');
}

function bar(value, width = 16, theme = makeTheme(false)) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = Math.round((safeValue / 100) * width);
  return `${theme.orange('█'.repeat(filled))}${theme.dim(theme.blue('░'.repeat(width - filled)))}`;
}

function wrappedLines(text, width = 68) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['No summary available yet.'];
}

function printMetricRows(rows, theme) {
  for (const row of rows) {
    console.log(
      `  ${theme.cream(padRight(row.label, 14))} ${bar(row.value, 16, theme)} ${theme.orange(
        `${String(Math.round(row.value)).padStart(3)}%`
      )}`
    );
  }
}

function riskLine(report, theme) {
  const risk = report.agentMaturity?.blindAcceptanceRisk || 'moderate';
  if (risk === 'low') return theme.green('✓ Low blind-acceptance risk');
  if (risk === 'moderate') return theme.yellow('⚠ Blind-acceptance risk is moderate');
  return theme.yellow('⚠ Blind-acceptance risk is high');
}

function section(title, theme) {
  console.log(theme.orange(theme.bold(title)));
}

export function previewReport(report, sources, options = {}) {
  const theme = makeTheme(options.color);
  const roles = report.founderRead?.bestFitRoles?.length
    ? report.founderRead.bestFitRoles
    : ['Early-stage AI builder'];
  const languages = report.languages?.length
    ? report.languages.slice(0, 5)
    : [{ name: 'Unknown', percent: 100 }];
  const frameworks = report.frameworks?.length
    ? report.frameworks.map((framework) => framework.name).slice(0, 8)
    : ['No framework signal yet'];
  const buildSurface = report.buildSurface || {};
  const signals = [
    ...(report.founderRead?.strengths || []).slice(0, 3).map((item) => `${theme.green('✓')} ${item}`),
    riskLine(report, theme),
  ];

  console.log('');
  console.log(theme.blue('┌──────────────────────────────────────────────────────────────┐'));
  console.log(theme.blue('│') + theme.cream(theme.bold('                 DEVLABS AGENT WRAPPED                        ')) + theme.blue('│'));
  console.log(theme.blue('│') + theme.orange('          verified proof-of-work from agent usage              ') + theme.blue('│'));
  console.log(theme.blue('└──────────────────────────────────────────────────────────────┘'));
  console.log('');
  console.log(`          ${theme.cream(theme.bold(String(report.archetype || 'AI-Native Builder').toUpperCase()))}`);
  console.log('');
  console.log(`                 ${theme.muted('Founder Fit:')} ${theme.orange(theme.bold(String(report.score).padStart(3)))} ${theme.cream('/ 100')}`);
  console.log(`                 ${theme.muted('Confidence:')} ${theme.cream(confidenceLabel(report.confidence))}`);
  console.log('');

  section('Best Fit', theme);
  for (const role of roles.slice(0, 4)) console.log(`  ${theme.cream(role)}`);
  console.log('');

  section('Languages', theme);
  printMetricRows(languages.map((language) => ({ label: language.name, value: language.percent })), theme);
  console.log('');

  section('Frameworks', theme);
  console.log(`  ${frameworks.map((item) => theme.cream(item)).join(theme.muted(' · '))}`);
  console.log('');

  section('Build Surface', theme);
  printMetricRows([
    { label: 'Frontend', value: buildSurface.frontend || 0 },
    { label: 'Backend', value: buildSurface.backend || 0 },
    { label: 'Database', value: buildSurface.database || 0 },
    { label: 'Infra', value: buildSurface.infra || 0 },
    { label: 'Tests', value: buildSurface.tests || 0 },
  ], theme);
  console.log('');

  section('Validation', theme);
  console.log(`  ${theme.cream(padRight('Build/test loops', 24))} ${theme.orange(report.validation?.buildTestLoops ?? 0)}`);
  console.log(`  ${theme.cream(padRight('Error recovery loops', 24))} ${theme.orange(report.validation?.errorRecoveryLoops ?? 0)}`);
  console.log(`  ${theme.cream(padRight('Successful reruns', 24))} ${theme.orange(report.validation?.successfulReruns ?? 0)}`);
  console.log(`  ${theme.cream(padRight('Test discipline', 24))} ${theme.orange(((report.validation?.testDisciplineScore || 0) / 10).toFixed(1))} ${theme.cream('/ 10')}`);
  console.log('');

  section('Signal', theme);
  for (const signal of signals) {
    for (const line of wrappedLines(signal, 64)) console.log(`  ${theme.cream(line)}`);
  }
  console.log('');

  section('Founder Read', theme);
  for (const line of wrappedLines(report.founderRead?.summary, 64)) console.log(`  ${theme.cream(line)}`);
  console.log('');

  section('Source Coverage', theme);
  console.log(`  ${theme.muted('Agents:')} ${theme.cream(report.sourceCoverage?.agents?.join(', ') || 'Limited')}`);
  console.log(`  ${theme.muted('Sources:')} ${theme.cream(`${sources.length} source group${sources.length === 1 ? '' : 's'}`)}`);
  console.log('');

  section('Will Upload', theme);
  console.log(`  ${theme.cream('Aggregated language, framework, build-surface, validation,')}`);
  console.log(`  ${theme.cream('agent-maturity, evidence, and founder-read signals.')}`);
  console.log('');

  section('Will NOT Upload', theme);
  console.log(`  ${theme.cream('Raw prompts, raw conversations, source code, secrets,')}`);
  console.log(`  ${theme.cream('environment variables, full local paths, or private filenames.')}`);
  console.log('');
}
