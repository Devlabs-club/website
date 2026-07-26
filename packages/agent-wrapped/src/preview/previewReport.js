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
  const usage = report.usage;
  const languages = report.languages?.length
    ? report.languages.slice(0, 5)
    : [{ name: 'Unknown', percent: 100 }];
  const frameworks = report.frameworks?.length
    ? report.frameworks.map((framework) => framework.name).slice(0, 8)
    : ['No framework signal yet'];
  const buildSurface = report.buildSurface || {};

  console.log('');
  console.log(theme.blue('┌──────────────────────────────────────────────────────────────┐'));
  console.log(theme.blue('│') + theme.cream(theme.bold('                 DEVLABS AI WRAPPED                            ')) + theme.blue('│'));
  console.log(theme.blue('│') + theme.orange('     hours · tokens · models · rhythm from local logs          ') + theme.blue('│'));
  console.log(theme.blue('└──────────────────────────────────────────────────────────────┘'));
  console.log('');

  if (usage?.tokens?.total) {
    const billions = usage.tokens.total >= 1e9
      ? `${(usage.tokens.total / 1e9).toFixed(1).replace(/\.0$/, '')}B`
      : usage.tokens.total >= 1e6
        ? `${(usage.tokens.total / 1e6).toFixed(1).replace(/\.0$/, '')}M`
        : String(usage.tokens.total);
    console.log(`          ${theme.cream(theme.bold(`YOU BURNED ${billions} TOKENS`))}`);
    console.log('');
  } else if (report.timeInvested?.totalHours) {
    console.log(
      `          ${theme.cream(theme.bold(`YOU BUILT FOR ${report.timeInvested.totalHours} HOURS WITH AGENTS`))}`
    );
    console.log('');
  } else {
    console.log(`          ${theme.cream(theme.bold('YOUR AI WRAPPED FACTS'))}`);
    console.log('');
  }

  if (report.timeInvested) {
    section('Time Invested', theme);
    console.log(`  ${theme.cream(padRight('Total hours', 24))} ${theme.orange(report.timeInvested.totalHours)}`);
    if (report.timeInvested.last30Hours != null) {
      console.log(
        `  ${theme.cream(padRight('Last 30 days (h)', 24))} ${theme.orange(report.timeInvested.last30Hours)}`
      );
    }
    console.log(
      `  ${theme.cream(padRight('Longest session (min)', 24))} ${theme.orange(report.timeInvested.longestSessionMinutes)}`
    );
    if (report.timeInvested.method) {
      console.log(`  ${theme.muted('Method:')} ${theme.cream(report.timeInvested.method)}`);
    }
    console.log('');
  }

  if (usage?.tokens) {
    section('Tokens', theme);
    console.log(`  ${theme.cream(padRight('Total', 24))} ${theme.orange(usage.tokens.total.toLocaleString('en-US'))}`);
    console.log(`  ${theme.cream(padRight('Fresh / cache', 24))} ${theme.orange(`${usage.tokens.work.toLocaleString('en-US')} / ${usage.tokens.cache.toLocaleString('en-US')}`)}`);
    if (usage.tokens.retailCostUsd) {
      console.log(`  ${theme.cream(padRight('Retail $ (est.)', 24))} ${theme.orange(`$${usage.tokens.retailCostUsd}`)}`);
    }
    if (usage.tokens.cursorEstimated) {
      console.log(`  ${theme.muted('Note:')} ${theme.cream('Cursor tokens estimated from active time')}`);
    }
    for (const row of (usage.tokens.byAgent || []).slice(0, 4)) {
      console.log(`  ${theme.cream(padRight(row.agent, 24))} ${theme.orange(row.total.toLocaleString('en-US'))}`);
    }
    console.log('');
  }

  if (usage?.models?.length) {
    section('Top Models', theme);
    for (const model of usage.models.slice(0, 5)) {
      console.log(
        `  ${theme.cream(padRight(model.id, 24))} ${theme.orange(`${model.percent}%`)} ${theme.muted(`(${model.sessions} sessions)`)}`
      );
    }
    console.log('');
  }

  if (usage?.rhythm) {
    section('Coding Rhythm', theme);
    const peak = usage.rhythm.peakHour;
    const suffix = peak >= 12 ? 'pm' : 'am';
    const twelve = peak % 12 === 0 ? 12 : peak % 12;
    console.log(`  ${theme.cream(padRight('Peak hour', 24))} ${theme.orange(`${twelve}:00 ${suffix}`)}`);
    console.log(
      `  ${theme.cream(padRight('Weekday / weekend', 24))} ${theme.orange(`${usage.rhythm.weekdayPct}% / ${usage.rhythm.weekendPct}%`)}`
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

  if (bp?.earnedIdentities?.length) {
    section('Founder labels (not shown on public Wrapped)', theme);
    for (const identity of bp.earnedIdentities.slice(0, 3)) {
      console.log(`  ${theme.muted(identity.label)} ${theme.dim(`(${identity.score})`)}`);
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
  console.log(`  ${theme.cream('Active hours, tokens, models, rhythm, agent split,')}`);
  console.log(`  ${theme.cream('and stack aggregates. Public cards show facts only.')}`);
  console.log('');

  section('Will NOT Upload', theme);
  console.log(`  ${theme.cream('Raw prompts, raw conversations, source code, secrets,')}`);
  console.log(`  ${theme.cream('environment variables, full local paths, or private filenames.')}`);
  console.log('');
}
