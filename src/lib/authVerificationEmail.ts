import sgMail from '@sendgrid/mail';
import { readEnv, type RuntimeEnv } from '@/lib/workosEnv';

const CREAM = '#fbf6f3';
const PANEL = '#fffaf7';
const INK = '#050505';
const INK_SOFT = 'rgba(5,5,5,0.62)';
const INK_FAINT = 'rgba(5,5,5,0.45)';
const BORDER = 'rgba(5,5,5,0.08)';
const DARK_PILL = '#2f3432';
const FONT =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildEmailVerificationEmail(params: {
  firstName: string;
  verifyUrl: string;
  websiteRoot?: string;
}) {
  const firstName = (params.firstName || 'there').trim();
  const root = (params.websiteRoot || 'https://www.devlabs.club').replace(/\/$/, '');
  const logoUrl = `${root}/logo.png`;
  const subject = 'Verify your DevLabs email';
  const safeUrl = escapeHtml(params.verifyUrl);
  const safeName = escapeHtml(firstName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background:${PANEL};border:1px solid ${BORDER};border-radius:26px;padding:44px 36px;text-align:center;">
              <img src="${logoUrl}" width="40" height="40" alt="DevLabs" style="display:block;margin:0 auto 18px auto;border:0;" />
              <h1 style="margin:0 0 10px 0;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:${INK};">Confirm your email</h1>
              <p style="margin:0 0 22px 0;font-family:${FONT};font-size:15px;line-height:1.55;font-weight:500;color:${INK_SOFT};">
                Hey ${safeName} — tap below to verify this address and finish creating your DevLabs account.
              </p>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="${DARK_PILL}" style="border-radius:999px;">
                    <a href="${safeUrl}" target="_blank"
                      style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:15px;font-weight:800;line-height:1;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;border-radius:999px;background:${DARK_PILL};">
                      Verify email&nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${INK_FAINT};">
                This link expires in 24 hours. If you didn't create a DevLabs account, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Hey ${firstName} — verify your DevLabs email to finish creating your account.

Verify email → ${params.verifyUrl}

This link expires in 24 hours. If you didn't create a DevLabs account, ignore this email.`;

  return { subject, html, text };
}

export async function sendEmailVerificationEmail(params: {
  to: string;
  firstName: string;
  verifyUrl: string;
  runtime?: RuntimeEnv;
}): Promise<{ sent: boolean; reason?: string }> {
  const runtime = params.runtime;
  const apiKey = readEnv('SENDGRID_API_KEY', runtime);
  const from =
    readEnv('SENDGRID_FROM_EMAIL', runtime) ||
    readEnv('CLAIM_FROM', runtime) ||
    readEnv('MAIL_FROM', runtime) ||
    'people@devlabs.club';
  const websiteRoot =
    readEnv('WEBSITE_ROOT', runtime) || readEnv('PUBLIC_URL', runtime) || 'https://www.devlabs.club';

  const { subject, html, text } = buildEmailVerificationEmail({
    firstName: params.firstName,
    verifyUrl: params.verifyUrl,
    websiteRoot,
  });

  if (!apiKey) {
    console.warn('[emailVerification] missing SENDGRID_API_KEY; email not sent', {
      to: params.to,
      verifyUrl: params.verifyUrl,
    });
    return { sent: false, reason: 'no_credentials' };
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to: params.to,
    from,
    subject,
    html,
    text,
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
    },
  });
  return { sent: true };
}
