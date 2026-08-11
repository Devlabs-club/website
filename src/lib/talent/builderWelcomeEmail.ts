/**
 * Builder welcome / invite email.
 *
 * Web-onboarding invite: claim the reserved profile on the website.
 * Themed to match the DevLabs landing page (cream paper, near-black text,
 * orange accent, Manrope). Section order matches the welcome wireframe.
 */

const CREAM = '#fbf6f3';
const INK = '#050505';
const INK_SOFT = 'rgba(5,5,5,0.62)';
const INK_FAINT = 'rgba(5,5,5,0.45)';
const BORDER = 'rgba(5,5,5,0.08)';
const ORANGE_DEEP = '#bf4f08';
const ORANGE_TINT = '#fff5ef';
const DARK_PILL = '#2f3432';

const FONT =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', ui-monospace, Menlo, Consolas, monospace";

type Feature = { title: string; body: string };

const DEFAULT_FEATURES: Feature[] = [
  {
    title: 'Get hiring opportunities',
    body: 'Founders hiring through DevLabs reach out when your work is a fit.',
  },
  {
    title: 'Verified builder profile',
    body: 'Stand out as someone from the DevLabs community, not another cold application.',
  },
  {
    title: 'Proof of work',
    body: 'Projects, GitHub, hackathons, and experience in one place founders can actually read.',
  },
];

function ctaButton(href: string, label: string) {
  return `
  <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${DARK_PILL}" style="border-radius:999px;">
        <a href="${href}" target="_blank"
          style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:15px;font-weight:800;line-height:1;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;border-radius:999px;background:${DARK_PILL};">
          ${label}&nbsp;&rarr;
        </a>
      </td>
    </tr>
  </table>`;
}

function featureCard(feature: Feature) {
  return `
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 12px 0;">
    <tr>
      <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:20px;padding:22px 24px;">
        <p style="margin:0 0 6px 0;font-family:${FONT};font-size:16px;font-weight:800;letter-spacing:-0.01em;color:${INK};">${feature.title}</p>
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;font-weight:500;color:${INK_SOFT};">${feature.body}</p>
      </td>
    </tr>
  </table>`;
}

export function buildBuilderWelcomeEmail(params: {
  firstName: string;
  /** Signed identity token (createClaimToken from messaging/claimToken.ts). */
  token: string;
  websiteRoot?: string;
  ref?: string;
  features?: Feature[];
}) {
  const firstName = (params.firstName || 'there').trim();
  const root = (params.websiteRoot || process.env.WEBSITE_ROOT || process.env.PUBLIC_URL || 'https://www.devlabs.club').replace(/\/$/, '');
  const ref = params.ref || 'email-invite';
  const features = params.features?.length ? params.features : DEFAULT_FEATURES;

  const query = new URLSearchParams({
    t: params.token,
    ref,
    utm_source: 'email',
    utm_medium: 'email',
    utm_campaign: 'builder_invite',
  });
  const claimUrl = `${root}/builder/welcome?${query.toString()}`;
  const logoUrl = `${root}/logo.png`;
  const heroImageUrl = `${root}/landing/community/devhacks-crowd.png`;

  const subject = `${firstName}, your DevLabs builder profile is ready to claim`;

  const featureCards = features.map(featureCard).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${subject}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
</head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your builder profile is ready to claim. We already put one together from your public work.</div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${CREAM};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">

          <!-- Hero -->
          <tr>
            <td style="background:${DARK_PILL};border:1px solid ${BORDER};border-radius:26px;overflow:hidden;">
              <img src="${heroImageUrl}" width="560" alt="DevLabs builders" style="display:block;width:100%;max-width:560px;height:auto;border:0;" />
              <div style="padding:32px 28px 36px 28px;text-align:center;">
                <img src="${logoUrl}" width="36" height="36" alt="DevLabs" style="display:block;margin:0 auto 14px auto;border:0;" />
                <h1 style="margin:0 0 10px 0;font-family:${FONT};font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">Welcome to DevLabs</h1>
                <p style="margin:0 0 22px 0;font-family:${FONT};font-size:15px;line-height:1.55;font-weight:500;color:rgba(255,255,255,0.78);">
                  The DevLabs builder community is now online.<br />Your builder profile is ready to claim.
                </p>
                ${ctaButton(claimUrl, 'Claim now')}
              </div>
            </td>
          </tr>

          <tr><td style="height:16px;line-height:16px;font-size:0;">&nbsp;</td></tr>

          <!-- Intro -->
          <tr>
            <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:24px;padding:34px 32px;text-align:center;">
              <h2 style="margin:0 0 12px 0;font-family:${FONT};font-size:21px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${INK};">We are building something new for builders</h2>
              <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;font-weight:500;color:${INK_SOFT};">
                Hey ${firstName}. DevLabs is moving from offline events into an online builder network where founders find people from what they have actually shipped, not just resumes. We already put a profile together for you from your public work.
              </p>
            </td>
          </tr>

          <tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>

          <!-- Features -->
          <tr>
            <td style="padding:0 4px 4px 4px;">
              <p style="margin:0 0 14px 0;text-align:center;font-family:${MONO};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.24em;color:${INK_FAINT};">Built for builders</p>
              ${featureCards}
            </td>
          </tr>

          <tr><td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>

          <!-- Closing CTA -->
          <tr>
            <td style="background:${ORANGE_TINT};border:1px solid rgba(255,116,23,0.28);border-radius:24px;padding:34px 32px;text-align:center;">
              <h2 style="margin:0 0 10px 0;font-family:${FONT};font-size:20px;line-height:1.25;font-weight:800;letter-spacing:-0.02em;color:${INK};">Finish setting up your profile</h2>
              <p style="margin:0 0 22px 0;font-family:${FONT};font-size:14px;line-height:1.6;font-weight:500;color:${ORANGE_DEEP};">
                We reserved a builder profile for you. Claim it, add anything that is still empty, and you are ready to be discovered.
              </p>
              ${ctaButton(claimUrl, 'Claim now')}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 24px 8px 24px;text-align:center;">
              <p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${INK};">DevLabs</p>
              <p style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${INK_FAINT};">
                We only reach out about your profile and founder intros. This link is tied to your email.
              </p>
              <p style="margin:0;font-family:${FONT};font-size:11px;color:${INK_FAINT};">
                &copy; ${new Date().getFullYear()} DevLabs
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome to DevLabs, ${firstName}.

Your builder profile is ready to claim. We already put one together from your public work.

DevLabs is moving from offline events into an online builder network where founders find people from what they have actually shipped, not just resumes.

What you get:
- Hiring opportunities from founders on DevLabs
- A verified builder profile
- Proof of work: projects, GitHub, and hackathons in one place

Claim your profile:
${claimUrl}

This link is tied to your email.
DevLabs`;

  return { subject, html, text, claimUrl };
}
