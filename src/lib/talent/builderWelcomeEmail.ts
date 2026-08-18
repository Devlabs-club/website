/**
 * Builder welcome / invite email.
 *
 * Layout and assets match the DevLabs Figma email
 * (file 0KYuJXRbfgpngN6rdqbbBP, node 181:9306): sky hero, overlapping
 * intro card, three illustrated feature rows, closing CTA, branded footer.
 *
 * Web-onboarding invite: claim the reserved profile on the website.
 * Closing copy uses claim language (not phone verify).
 */

const CREAM = '#fbf6f3';
const INK = '#3c3c3c';
const INK_BODY = '#5a5a5a';
const INK_CTA = '#1a1a1a';
const ORANGE = '#fb8b34';
const SKY = '#8eb8d4';
const CARD_BORDER = '#f0f0f0';

const FONT =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

type Feature = { title: string; body: string; image: string; alt: string };

function asset(root: string, name: string) {
  return `${root}/email/builder-welcome/${name}`;
}

function whiteCta(href: string, label: string) {
  return `
  <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="#ffffff" style="border-radius:9999px;box-shadow:0 4px 8px rgba(40,12,2,0.15);">
        <a href="${href}" target="_blank"
          style="display:inline-block;padding:10px 16px 10px 20px;font-family:${FONT};font-size:16px;font-weight:800;line-height:24px;letter-spacing:-0.01em;color:${INK_CTA};text-decoration:none;border-radius:9999px;background:#ffffff;">
          ${label}&nbsp;&rarr;
        </a>
      </td>
    </tr>
  </table>`;
}

function featureRow(feature: Feature) {
  return `
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 24px 0;">
    <tr>
      <td width="260" valign="middle" style="width:260px;padding:0 24px 0 0;">
        <img src="${feature.image}" width="260" height="170" alt="${feature.alt}"
          style="display:block;width:260px;max-width:100%;height:auto;border:0;border-radius:16px;" />
      </td>
      <td valign="middle" style="padding:0;">
        <p style="margin:0 0 10px 0;font-family:${FONT};font-size:18px;line-height:22px;font-weight:500;letter-spacing:-0.02em;color:#000000;">${feature.title}</p>
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:400;letter-spacing:-0.02em;color:#000000;">${feature.body}</p>
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
  features?: Array<{ title: string; body: string }>;
}) {
  const firstName = (params.firstName || 'there').trim();
  const root = (params.websiteRoot || process.env.WEBSITE_ROOT || process.env.PUBLIC_URL || 'https://www.devlabs.club').replace(/\/$/, '');
  const ref = params.ref || 'email-invite';

  const query = new URLSearchParams({
    t: params.token,
    ref,
    utm_source: 'email',
    utm_medium: 'email',
    utm_campaign: 'builder_invite',
  });
  const claimUrl = `${root}/builder/welcome?${query.toString()}`;

  const heroUrl = asset(root, 'hero-sky.jpg');
  const logoWhiteUrl = asset(root, 'logo-white.png');
  const introCirclesUrl = asset(root, 'intro-circles.png');
  const logoOrangeUrl = asset(root, 'logo-orange.png');
  const footerGlowUrl = asset(root, 'footer-glow.jpg');
  const igUrl = asset(root, 'social-instagram.png');
  const xUrl = asset(root, 'social-twitter.png');
  const fbUrl = asset(root, 'social-facebook.png');

  const defaultFeatures: Feature[] = [
    {
      title: 'Get Hiring Opportunities',
      body: 'Receive opportunities from founders hiring through DevLabs.',
      image: asset(root, 'feature-hiring.jpg'),
      alt: 'Hiring opportunity card',
    },
    {
      title: 'Verified Builder Profile',
      body: 'Stand out as a verified member of the DevLabs community.',
      image: asset(root, 'feature-verified.jpg'),
      alt: 'Verified builder profile card',
    },
    {
      title: 'Proof of Work',
      body: 'Showcase your projects, GitHub, hackathons and experience in one place.',
      image: asset(root, 'feature-proof.jpg'),
      alt: 'Proof of work cards',
    },
  ];

  const features: Feature[] = params.features?.length
    ? params.features.map((f, i) => ({
        ...defaultFeatures[Math.min(i, defaultFeatures.length - 1)],
        title: f.title,
        body: f.body,
      }))
    : defaultFeatures;

  const subject = `${firstName}, your DevLabs builder profile is ready to claim`;

  const featureRows = features.map(featureRow).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${subject}</title>
  <!--[if !mso]><!-->
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" />
  <!--<![endif]-->
  <!--[if mso]>
  <style type="text/css">
    body, table, td, a, p, h1, h2 { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your builder profile is ready to claim. We already put one together from your public work.</div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;">

          <!-- Hero -->
          <tr>
            <td align="center" bgcolor="${SKY}" background="${heroUrl}"
              style="background-color:${SKY};background-image:url('${heroUrl}');background-size:cover;background-position:center top;background-repeat:no-repeat;padding:40px 30px 320px 30px;text-align:center;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:750px;">
                <v:fill type="frame" src="${heroUrl}" color="${SKY}" />
                <v:textbox inset="0,0,0,0">
              <![endif]-->
              <img src="${logoWhiteUrl}" width="52" height="52" alt="DevLabs"
                style="display:block;margin:0 auto 12px auto;border:0;width:52px;height:52px;" />
              <h1 style="margin:0 0 4px 0;font-family:${FONT};font-size:40px;line-height:48px;font-weight:700;letter-spacing:-1px;color:#ffffff;">
                Welcome to DevLabs
              </h1>
              <p style="margin:0 0 72px 0;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:500;letter-spacing:-0.4px;color:#e1e1e1;">
                The DevLabs builder community is now online.
              </p>
              <p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:22px;font-weight:600;letter-spacing:-0.32px;color:#ffffff;">
                Your builder profile is ready to claim.
              </p>
              ${whiteCta(claimUrl, 'Claim Now')}
              <!--[if gte mso 9]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- Cream body + overlapping intro -->
          <tr>
            <td bgcolor="${CREAM}" style="background:${CREAM};padding:0 30px 40px 30px;">

              <!-- Intro card (pulls up over hero) -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:-94px auto 40px auto;max-width:540px;">
                <tr>
                  <td align="center" bgcolor="#ffffff"
                    style="background:#ffffff;border:2px solid ${CARD_BORDER};border-radius:20px;padding:48px 40px;text-align:center;background-image:url('${introCirclesUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;">
                    <h2 style="margin:0 0 20px 0;font-family:${FONT};font-size:28px;line-height:32px;font-weight:700;letter-spacing:-1px;color:${INK};">
                      We&rsquo;re building something new for builders.
                    </h2>
                    <p style="margin:0;font-family:${FONT};font-size:16px;line-height:24px;font-weight:500;letter-spacing:-0.32px;color:${INK_BODY};">
                      Hey ${firstName}. DevLabs is expanding from offline events into an online builder network where founders can discover talented developers based on their actual work, not just resumes.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Features -->
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;margin:0 auto;">
                <tr>
                  <td align="center" style="padding:0 0 24px 0;">
                    <h2 style="margin:0;font-family:${FONT};font-size:28px;line-height:36px;font-weight:700;letter-spacing:-1px;color:${INK};">
                      Built for builders
                    </h2>
                  </td>
                </tr>
                <tr>
                  <td>
                    ${featureRows}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Closing CTA -->
          <tr>
            <td align="center" bgcolor="${CREAM}" background="${footerGlowUrl}"
              style="background-color:${CREAM};background-image:url('${footerGlowUrl}');background-size:cover;background-position:center;background-repeat:no-repeat;padding:70px 40px;text-align:center;">
              <h2 style="margin:0 0 24px 0;font-family:${FONT};font-size:28px;line-height:36px;font-weight:700;letter-spacing:-1px;color:${INK};">
                Finish setting up your profile.
              </h2>
              <p style="margin:0 0 10px 0;font-family:${FONT};font-size:18px;line-height:22px;font-weight:500;letter-spacing:-0.36px;color:#000000;">
                We&rsquo;ve already reserved a builder profile for you.
              </p>
              <p style="margin:0 0 24px 0;font-family:${FONT};font-size:14px;line-height:20px;font-weight:400;letter-spacing:-0.28px;color:#000000;max-width:384px;">
                Claim it, finish anything that&rsquo;s still empty, and you&rsquo;re ready to be discovered.
              </p>
              ${whiteCta(claimUrl, 'Claim Now')}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#ffffff" style="background:#ffffff;padding:28px 38px 40px 38px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle" style="padding:0;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td valign="middle" style="padding:0 8px 0 0;">
                          <img src="${logoOrangeUrl}" width="30" height="30" alt=""
                            style="display:block;width:30px;height:30px;border:0;" />
                        </td>
                        <td valign="middle" style="padding:0;">
                          <span style="font-family:${FONT};font-size:22px;line-height:26px;font-weight:600;color:${ORANGE};">DevLabs</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" align="right" style="padding:0;">
                    <a href="https://www.instagram.com/devlabs.asu/" target="_blank" style="display:inline-block;margin:0 0 0 5px;text-decoration:none;">
                      <img src="${igUrl}" width="24" height="24" alt="Instagram" style="display:block;width:24px;height:24px;border:0;" />
                    </a>
                    <a href="https://twitter.com/devlabs_club" target="_blank" style="display:inline-block;margin:0 0 0 5px;text-decoration:none;">
                      <img src="${xUrl}" width="24" height="24" alt="X" style="display:block;width:24px;height:24px;border:0;" />
                    </a>
                    <a href="${root}" target="_blank" style="display:inline-block;margin:0 0 0 5px;text-decoration:none;">
                      <img src="${fbUrl}" width="24" height="24" alt="DevLabs" style="display:block;width:24px;height:24px;border:0;" />
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Welcome to DevLabs, ${firstName}.

The DevLabs builder community is now online. Your builder profile is ready to claim.

We're building something new for builders. DevLabs is expanding from offline events into an online builder network where founders can discover talented developers based on their actual work, not just resumes.

Built for builders:
- Get Hiring Opportunities: Receive opportunities from founders hiring through DevLabs.
- Verified Builder Profile: Stand out as a verified member of the DevLabs community.
- Proof of Work: Showcase your projects, GitHub, hackathons and experience in one place.

We've already reserved a builder profile for you. Claim it, finish anything that's still empty, and you're ready to be discovered.

Claim your profile:
${claimUrl}

DevLabs
https://www.instagram.com/devlabs.asu/
https://twitter.com/devlabs_club`;

  return { subject, html, text, claimUrl };
}
