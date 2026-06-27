import sgMail from '@sendgrid/mail';

const DEV_MODE = import.meta.env.DEV || process.env.NODE_ENV === 'development';
const EMAIL_ENABLED = process.env.TALENT_EMAIL_NOTIFICATIONS === 'true' || !DEV_MODE;
const FROM_EMAIL = process.env.CLAIM_FROM || process.env.MAIL_FROM || 'people@devlabs.club';

export async function sendTalentEmail(params: {
  to: string;
  subject: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  if (!EMAIL_ENABLED) {
    console.log('[talentEmail] skipped (dev mode or disabled)', params.subject, '→', params.to);
    return { sent: false, reason: 'disabled' };
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.warn('[talentEmail] missing SENDGRID_API_KEY');
    return { sent: false, reason: 'no_credentials' };
  }
  sgMail.setApiKey(apiKey);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #111;">
      <p style="color: #666; font-size: 13px;">DevLabs Builder OS</p>
      <h2 style="font-size: 20px; margin: 0 0 16px;">${params.subject}</h2>
      <p style="line-height: 1.6; color: #333;">${params.body}</p>
      ${
        params.ctaUrl
          ? `<p style="margin-top: 24px;"><a href="${params.ctaUrl}" style="display:inline-block;background:#fa7d22;color:#000;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">${params.ctaLabel || 'Open dashboard'}</a></p>`
          : ''
      }
      <p style="margin-top: 24px; font-size: 12px; color: #888;">You can also view this on your builder dashboard.</p>
    </div>
  `;

  await sgMail.send({
    from: { email: FROM_EMAIL, name: 'DevLabs' },
    to: params.to,
    subject: params.subject,
    html,
    text: `${params.body}\n\n${params.ctaUrl ? `${params.ctaLabel || 'Open dashboard'}: ${params.ctaUrl}` : ''}`,
  });

  return { sent: true };
}

export function dashboardDeepLink(tab: string, origin = process.env.WEBSITE_ROOT || 'http://localhost:4321') {
  const base = origin.replace(/\/$/, '');
  return `${base}/dashboard?tab=${encodeURIComponent(tab)}`;
}
