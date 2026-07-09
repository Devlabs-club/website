import { escapeHtml } from '@/lib/talent/emailThreadText';

const COLORS = {
  pageBg: '#f4f4f3',
  card: '#ffffff',
  cardAlt: '#fffcfa',
  cardWarm: '#fff7ef',
  border: '#ece7e1',
  text: '#111111',
  textMuted: 'rgba(17,17,17,0.55)',
  textSoft: 'rgba(17,17,17,0.4)',
  accent: '#ec9149',
  accentDark: '#a85a0f',
  accentBg: '#fff7ef',
};

export type ThreadIntroEmailContext = {
  kind: 'intro';
  founderName: string;
  roleTitle: string;
  company: string;
  introMessage: string;
  founderBio?: string | null;
  companySummary?: string | null;
  website?: string | null;
  schedulingLink?: string | null;
};

export type ThreadReplyEmailContext = {
  kind: 'reply';
  senderName: string;
  senderRole: 'founder' | 'builder';
  roleTitle?: string | null;
  company?: string | null;
  message: string;
};

export type ThreadTrialEmailContext = {
  kind: 'trial';
  founderName: string;
  roleTitle: string;
  company: string;
  title: string;
  goal?: string | null;
  deliverables?: string[];
  successCriteria?: string[];
  timeline?: string | null;
  deadlineLabel: string;
};

export type ThreadFounderSeedEmailContext = {
  kind: 'founder_seed';
  founderName: string;
  builderName: string;
  roleTitle: string;
  company: string;
};

export type ThreadEmailContext =
  | ThreadIntroEmailContext
  | ThreadReplyEmailContext
  | ThreadTrialEmailContext
  | ThreadFounderSeedEmailContext;

function founderInitial(name: string) {
  return (name.trim().charAt(0) || 'F').toUpperCase();
}

function formatMessageHtml(message: string) {
  return escapeHtml(message).replace(/\n/g, '<br />');
}

function emailShell(inner: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>DevLabs</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pageBg};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 0 20px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.accent};">
                    DevLabs
                  </td>
                  <td align="right" style="font-size:12px;color:${COLORS.textSoft};">
                    Builder OS
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${inner}
          <tr>
            <td style="padding:24px 4px 0;font-size:12px;line-height:1.6;color:${COLORS.textSoft};text-align:center;">
              Reply directly to this email to continue the conversation.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function card(inner: string, options?: { warm?: boolean }) {
  const bg = options?.warm ? COLORS.cardWarm : COLORS.card;
  return `<tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${COLORS.border};border-radius:20px;overflow:hidden;">
        <tr><td style="padding:24px;">${inner}</td></tr>
      </table>
    </td>
  </tr>`;
}

function renderIntroHtml(ctx: ThreadIntroEmailContext) {
  const initial = founderInitial(ctx.founderName);
  const roleLine = `${escapeHtml(ctx.roleTitle)} at ${escapeHtml(ctx.company)}`;

  const founderBlock = ctx.founderBio
    ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.65;color:${COLORS.textMuted};">${formatMessageHtml(ctx.founderBio)}</p>`
    : '';

  const companyBlock = ctx.companySummary
    ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:${COLORS.textMuted};">${formatMessageHtml(ctx.companySummary)}</p>`
    : '';

  const websiteBlock = ctx.website
    ? `<p style="margin:0;font-size:13px;"><a href="${escapeHtml(ctx.website)}" style="color:${COLORS.accent};text-decoration:none;font-weight:600;">${escapeHtml(ctx.website.replace(/^https?:\/\//, ''))}</a></p>`
    : '';

  const scheduleBlock = ctx.schedulingLink
    ? `<tr>
        <td style="padding:4px 0 0;">
          <a href="${escapeHtml(ctx.schedulingLink)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;padding:12px 22px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:700;">
            Schedule a call
          </a>
        </td>
      </tr>`
    : '';

  const inner = `
    ${card(`
      <p style="margin:0 0 10px;display:inline-block;padding:4px 10px;border-radius:999px;background:${COLORS.accentBg};border:1px solid ${COLORS.border};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.accentDark};">
        Intro request
      </p>
      <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;font-weight:700;color:${COLORS.text};letter-spacing:-0.02em;">
        ${escapeHtml(ctx.founderName)} wants to connect
      </h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:${COLORS.textMuted};">
        They're hiring for <strong style="color:${COLORS.text};">${roleLine}</strong>
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="vertical-align:top;padding-right:14px;">
            <div style="width:44px;height:44px;border-radius:14px;background:${COLORS.accent};color:#fff;font-size:18px;font-weight:700;line-height:44px;text-align:center;">
              ${initial}
            </div>
          </td>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:15px;font-weight:700;color:${COLORS.text};">${escapeHtml(ctx.founderName)}</p>
            <p style="margin:4px 0 0;font-size:13px;color:${COLORS.textSoft};">Founder · ${escapeHtml(ctx.company)}</p>
            ${founderBlock}
          </td>
        </tr>
      </table>
    `, { warm: true })}
    ${card(`
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.textSoft};">
        Their message
      </p>
      <p style="margin:0;font-size:15px;line-height:1.7;color:${COLORS.text};">${formatMessageHtml(ctx.introMessage)}</p>
    `)}
    ${ctx.companySummary || ctx.website
      ? card(`
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.textSoft};">
            About ${escapeHtml(ctx.company)}
          </p>
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:${COLORS.text};">${escapeHtml(ctx.company)}</p>
          ${companyBlock}
          ${websiteBlock}
        `)
      : ''}
    ${scheduleBlock ? card(`<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:8px;font-size:14px;font-weight:600;color:${COLORS.text};">Ready to talk?</td></tr>${scheduleBlock}</table>`, { warm: true }) : ''}
  `;

  return emailShell(inner);
}

function listBlock(label: string, items: string[]) {
  if (!items.length) return '';
  return `
    <p style="margin:16px 0 8px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.textSoft};">${escapeHtml(label)}</p>
    <ul style="margin:0;padding-left:18px;color:${COLORS.textMuted};font-size:14px;line-height:1.65;">
      ${items.map((item) => `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`).join('')}
    </ul>
  `;
}

function renderTrialHtml(ctx: ThreadTrialEmailContext) {
  const roleLine = `${escapeHtml(ctx.roleTitle)} at ${escapeHtml(ctx.company)}`;

  const inner = `
    ${card(`
      <p style="margin:0 0 10px;display:inline-block;padding:4px 10px;border-radius:999px;background:${COLORS.accentBg};border:1px solid ${COLORS.border};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.accentDark};">
        Work trial
      </p>
      <h1 style="margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:700;color:${COLORS.text};letter-spacing:-0.02em;">
        ${escapeHtml(ctx.title)}
      </h1>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:${COLORS.textMuted};">
        <strong style="color:${COLORS.text};">${escapeHtml(ctx.founderName)}</strong> generated a work trial for you · ${roleLine}
      </p>
      ${ctx.goal ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.textSoft};">Goal</p><p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLORS.text};">${formatMessageHtml(ctx.goal)}</p>` : ''}
      ${listBlock('Deliverables', ctx.deliverables || [])}
      ${listBlock('Success criteria', ctx.successCriteria || [])}
      ${ctx.timeline ? `<p style="margin:16px 0 0;font-size:14px;color:${COLORS.textMuted};"><strong style="color:${COLORS.text};">Timeline:</strong> ${escapeHtml(ctx.timeline)}</p>` : ''}
      <p style="margin:16px 0 0;font-size:14px;color:${COLORS.textMuted};"><strong style="color:${COLORS.text};">Deadline:</strong> ${escapeHtml(ctx.deadlineLabel)}</p>
    `, { warm: true })}
    ${card(`
      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.textSoft};">
        How to submit
      </p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:${COLORS.text};">
        When you're ready, <strong>reply to this email thread</strong> with:
      </p>
      <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;line-height:1.65;color:${COLORS.textMuted};">
        <li style="margin-bottom:6px;">GitHub repo link</li>
        <li style="margin-bottom:6px;">Walkthrough video link (Google Drive, Loom, etc.)</li>
      </ul>
      <p style="margin:0;font-size:14px;line-height:1.6;color:${COLORS.textSoft};">
        Questions? Reply here anytime — same thread, same conversation.
      </p>
    `)}
  `;

  return emailShell(inner);
}

function renderFounderSeedHtml(ctx: ThreadFounderSeedEmailContext) {
  const inner = card(`
    <p style="margin:0 0 10px;display:inline-block;padding:4px 10px;border-radius:999px;background:${COLORS.accentBg};border:1px solid ${COLORS.border};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${COLORS.accentDark};">
      Intro requested
    </p>
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;color:${COLORS.text};">
      You requested an intro to ${escapeHtml(ctx.builderName)}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${COLORS.textMuted};">
      We'll keep this Gmail thread updated when ${escapeHtml(ctx.builderName)} replies.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;color:${COLORS.textMuted};">
      <tr><td style="padding:4px 0;"><strong style="color:${COLORS.text};">Builder:</strong> ${escapeHtml(ctx.builderName)}</td></tr>
      <tr><td style="padding:4px 0;"><strong style="color:${COLORS.text};">Role:</strong> ${escapeHtml(ctx.roleTitle)} at ${escapeHtml(ctx.company)}</td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:${COLORS.textSoft};">
      Reply from this thread anytime. Builder replies will show up here.
    </p>
  `, { warm: true });

  return emailShell(inner);
}

function renderReplyHtml(ctx: ThreadReplyEmailContext) {
  const roleLine =
    ctx.roleTitle && ctx.company
      ? `${ctx.roleTitle} at ${ctx.company}`
      : ctx.roleTitle || ctx.company || 'your conversation';
  const senderLabel = ctx.senderRole === 'founder' ? 'Founder' : 'Builder';

  const inner = card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td>
          <p style="margin:0;font-size:15px;font-weight:700;color:${COLORS.text};">${escapeHtml(ctx.senderName)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:${COLORS.textSoft};">${senderLabel} · ${escapeHtml(roleLine)}</p>
        </td>
      </tr>
    </table>
    <div style="padding:16px 18px;border-radius:16px;background:${COLORS.cardAlt};border:1px solid ${COLORS.border};">
      <p style="margin:0;font-size:15px;line-height:1.7;color:${COLORS.text};">${formatMessageHtml(ctx.message)}</p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${COLORS.textSoft};">
      This conversation is powered by DevLabs. Reply directly to this email to respond.
    </p>
  `);

  return emailShell(inner);
}

export function renderThreadEmailHtml(context: ThreadEmailContext): string {
  if (context.kind === 'intro') return renderIntroHtml(context);
  if (context.kind === 'trial') return renderTrialHtml(context);
  if (context.kind === 'founder_seed') return renderFounderSeedHtml(context);
  return renderReplyHtml(context);
}

export function renderThreadEmailText(context: ThreadEmailContext): string {
  if (context.kind === 'founder_seed') {
    return [
      `You requested an intro to ${context.builderName}.`,
      '',
      `We'll keep this Gmail thread updated when ${context.builderName} replies.`,
      '',
      `Builder: ${context.builderName}`,
      `Role: ${context.roleTitle} at ${context.company}`,
      '',
      'Reply from this thread anytime. Builder replies will show up here.',
    ].join('\n');
  }

  if (context.kind === 'trial') {
    const lines = [
      `${context.founderName} generated a work trial for you (${context.roleTitle} at ${context.company}).`,
      '',
      `Work trial: ${context.title}`,
    ];
    if (context.goal) lines.push('', 'Goal:', context.goal);
    if (context.deliverables?.length) {
      lines.push('', 'Deliverables:', ...context.deliverables.map((item) => `- ${item}`));
    }
    if (context.successCriteria?.length) {
      lines.push('', 'Success criteria:', ...context.successCriteria.map((item) => `- ${item}`));
    }
    if (context.timeline) lines.push('', `Timeline: ${context.timeline}`);
    lines.push('', `Deadline: ${context.deadlineLabel}`);
    lines.push(
      '',
      'Reply directly to this email with:',
      '1. GitHub repo link',
      '2. Demo/video link',
      '3. Any notes you want the founder to see'
    );
    return lines.join('\n');
  }

  if (context.kind === 'intro') {
    const lines = [
      `${context.founderName} invited you to discuss ${context.roleTitle} at ${context.company}.`,
      '',
      context.introMessage,
    ];
    if (context.founderBio) lines.push('', `About ${context.founderName}:`, context.founderBio);
    if (context.companySummary) lines.push('', `About ${context.company}:`, context.companySummary);
    if (context.website) lines.push('', `Website: ${context.website}`);
    if (context.schedulingLink) lines.push('', `Schedule a call: ${context.schedulingLink}`);
    lines.push('', '—', 'Reply to this email to continue the conversation.');
    return lines.join('\n');
  }

  const roleLine =
    context.roleTitle && context.company
      ? `${context.roleTitle} at ${context.company}`
      : context.roleTitle || context.company || '';
  const header = roleLine ? `${context.senderName} (${roleLine})` : context.senderName;
  return `${header}\n\n${context.message}\n\n---\nThis conversation is powered by DevLabs.\nReply directly to this email to respond.`;
}

export function renderTalentNotificationHtml(params: {
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const ctaBlock = params.ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:20px;">
        <tr>
          <td>
            <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:${COLORS.accent};color:#ffffff;padding:12px 22px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:700;">
              ${escapeHtml(params.ctaLabel || 'Open dashboard')}
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const inner = card(`
    <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;color:${COLORS.text};letter-spacing:-0.02em;">
      ${escapeHtml(params.subject)}
    </h1>
    <p style="margin:0;font-size:15px;line-height:1.65;color:${COLORS.textMuted};white-space:pre-wrap;">${formatMessageHtml(params.body)}</p>
    ${ctaBlock}
  `);

  return emailShell(inner);
}
