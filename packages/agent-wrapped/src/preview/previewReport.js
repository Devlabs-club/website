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

function section(title, theme) {
  console.log(theme.orange(theme.bold(title)));
}

export function previewReport(report, sources, options = {}) {
  const theme = makeTheme(options.color);
  const bp = report.buildprint;
  const languages = report.languages?.length
    ? report.languages.slice(0, 5)
    : [{ name: 'Unknown', percent: 100 }];
  const frameworks = report.frameworks?.length
    ? report.frameworks.map((framework) => framework.name).slice(0, 8)
    : ['No framework signal yet'];
  const buildSurface = report.buildSurface || {};
  const primary =
    bp?.earnedIdentities?.find((item) => item.id === bp.primaryIdentityId) ||
    bp?.earnedIdentities?.[0];

  console.log('');
  console.log(theme.blue('┌──────────────────────────────────────────────────────────────┐'));
  console.log(theme.blue('│') + theme.cream(theme.bold('                 DEVLABS BUILDPRINT                           ')) + theme.blue('│'));
  console.log(theme.blue('│') + theme.orange('          your building habits, backed by proof                 ') + theme.blue('│'));
  console.log(theme.blue('└──────────────────────────────────────────────────────────────┘'));
  console.log('');

  if (primary) {
    console.log(`          ${theme.cream(theme.bold(`YOUR BUILDPRINT IS ${primary.label.toUpperCase()}`))}`);
    console.log('');
    for (const line of wrappedLines(primary.proofStatement, 64)) {
      console.log(`  ${theme.cream(line)}`);
    }
  } else {
    console.log(`          ${theme.cream(theme.bold('YOUR BUILDPRINT IS STILL FORMING'))}`);
    console.log('');
    for (const line of wrappedLines(bp?.forming?.message || report.founderRead?.summary, 64)) {
      console.log(`  ${theme.cream(line)}`);
    }
  }
  console.log('');

  section('Evidence Strength', theme);
  console.log(
    `  ${theme.orange(titleCase(bp?.evidenceStrength || 'emerging'))}  ${theme.muted('·')}  ${theme.cream(
      `Confidence: ${confidenceLabel(bp?.confidence || report.confidence)}`
    )}`
  );
  console.log('');

  if (bp?.earnedIdentities?.length) {
    section('Earned Identities', theme);
    for (const identity of bp.earnedIdentities.slice(0, 3)) {
      console.log(`  ${theme.cream(identity.label)} ${theme.muted(`(${identity.score})`)}`);
    }
    console.log('');
  }

  if (primary?.proofMetrics?.length) {
    section('Proof', theme);
    for (const metric of primary.proofMetrics.slice(0, 5)) {
      console.log(`  ${theme.cream(padRight(metric.label, 36))} ${theme.orange(metric.value)}`);
    }
    console.log('');
  }

  if (bp?.nextUnlock) {
    section('Next Unlock', theme);
    console.log(`  ${theme.cream(bp.nextUnlock.label)}`);
    for (const req of (bp.nextUnlock.missingRequirements || []).slice(0, 3)) {
      console.log(`  ${theme.muted('·')} ${theme.cream(req)}`);
    }
    console.log('');
  }

  section('Languages', theme);
  printMetricRows(
    languages.map((language) => ({ label: language.name, value: language.percent })),
    theme
  );
  console.log('');

  section('Frameworks', theme);
  console.log(`  ${frameworks.map((item) => theme.cream(item)).join(theme.muted(' · '))}`);
  console.log('');

  section('Build Surface', theme);
  printMetricRows(
    [
      { label: 'Frontend', value: buildSurface.frontend || 0 },
      { label: 'Backend', value: buildSurface.backend || 0 },
      { label: 'Database', value: buildSurface.database || 0 },
      { label: 'Infra', value: buildSurface.infra || 0 },
      { label: 'Tests', value: buildSurface.tests || 0 },
    ],
    theme
  );
  console.log('');

  if (report.timeInvested) {
    section('Time Invested', theme);
    console.log(`  ${theme.cream(padRight('Total hours', 24))} ${theme.orange(report.timeInvested.totalHours)}`);
    console.log(
      `  ${theme.cream(padRight('Longest session (min)', 24))} ${theme.orange(report.timeInvested.longestSessionMinutes)}`
    );
    console.log('');
  }

  if (report.agentSplit?.length) {
    section('Agent Split', theme);
    for (const item of report.agentSplit) {
      console.log(`  ${theme.cream(padRight(item.agent, 24))} ${theme.orange(`${item.percent}%`)}`);
    }
    console.log('');
  }

  section('Source Coverage', theme);
  console.log(`  ${theme.muted('Agents:')} ${theme.cream(report.sourceCoverage?.agents?.join(', ') || 'Limited')}`);
  console.log(
    `  ${theme.muted('Sources:')} ${theme.cream(`${sources.length} source group${sources.length === 1 ? '' : 's'}`)}`
  );
  console.log('');

  section('Will Upload', theme);
  console.log(`  ${theme.cream('Aggregated Buildprint identities, evidence strength, stack,')}`);
  console.log(`  ${theme.cream('proof metrics, and build-surface signals.')}`);
  console.log('');

  section('Will NOT Upload', theme);
  console.log(`  ${theme.cream('Raw prompts, raw conversations, source code, secrets,')}`);
  console.log(`  ${theme.cream('environment variables, full local paths, or private filenames.')}`);
  console.log('');
}
