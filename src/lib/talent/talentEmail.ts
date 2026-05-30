import nodemailer from 'nodemailer';

const DEV_MODE = import.meta.env.DEV || process.env.NODE_ENV === 'development';
const EMAIL_ENABLED = process.env.TALENT_EMAIL_NOTIFICATIONS === 'true' || !DEV_MODE;

function transporter() {
  const user = process.env.ZOHO_EMAIL;
  const pass = process.env.ZOHO_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

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

  const transport = transporter();
  if (!transport) {
    console.warn('[talentEmail] missing ZOHO credentials');
    return { sent: false, reason: 'no_credentials' };
  }

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

  await transport.sendMail({
    from: `"DevLabs" <${process.env.ZOHO_EMAIL}>`,
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
