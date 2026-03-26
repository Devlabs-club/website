import sgMail from '@sendgrid/mail';

// Ensure you have SENDGRID_API_KEY in your .env file
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

/** Must be a verified sender in SendGrid. Override with SENDGRID_FROM_EMAIL. */
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL?.trim() || 'people@devlabs.club';
const DOMAIN = process.env.PUBLIC_URL || 'https://devlabs.club';
const HEADER_IMAGE_URL = `https://dhanush.wtf/media/m9cyjxcersl.png?file=`;

/** Site UI sans (matches Layout.astro) +Cormorant Garamond for tagline only */
const FONT_MANROPE =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_TAGLINE = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

const getBaseTemplate = (title: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link
    rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@400;600&display=swap"
  />
</head>
<body style="margin: 0; padding: 0; background-color: #131415; font-family: ${FONT_MANROPE}; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #131415; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: rgba(255,255,255,0.03); border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
          <tr>
            <td>
              <img src="${HEADER_IMAGE_URL}" alt="Momentum by Devlabs" style="width: 100%; height: auto; display: block;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 48px 40px; color: #e5e7eb;">
              <h1 style="margin: 0 0 20px 0; color: #ffffff; font-family: ${FONT_MANROPE}; font-size: 22px; font-weight: 600; font-style: normal; text-align: center; letter-spacing: -0.02em;">
                ${title}
              </h1>
              <div style="font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.85); font-family: ${FONT_MANROPE}; font-weight: 400;">
                ${content}
              </div>
              <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center;">
                <p style="margin: 0; font-family: ${FONT_TAGLINE}; font-style: normal; font-weight: 500; color: rgba(255,255,255,0.55); font-size: 26px; line-height: 1.35;">
                  don't wait for the future, build it.
                </p>
                <p style="margin: 16px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.5); font-family: ${FONT_MANROPE}; font-weight: 400;">
                  The Devlabs Team
                </p>
              </div>
            </td>
          </tr>
        </table>
        <p style="text-align: center; color: rgba(255,255,255,0.45); font-size: 12px; margin-top: 24px; font-family: ${FONT_MANROPE};">
          © ${new Date().getFullYear()} Devlabs. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const sendApplicationReceivedEmail = async (to: string, firstName: string) => {
  const content = `
    <p style="margin: 0 0 16px 0;">Hi ${firstName},</p>
    <p style="margin: 0 0 16px 0;">Thank you for applying to Momentum by Devlabs. We have successfully received your application.</p>
    <p style="margin: 0 0 16px 0;">Our team is currently reviewing your profile and startup details. We receive a high volume of applications, but we are working diligently to review each one with care.</p>
    <p style="margin: 0;">You can expect to hear back from us soon regarding the next steps.</p>
  `;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: 'Your Momentum Application is Under Review 🚀',
    html: getBaseTemplate('Application Under Review', content),
  };

  await sgMail.send(msg);
};

export const sendApplicationApprovedEmail = async (to: string, firstName: string) => {
  const content = `
    <p style="margin: 0 0 16px 0;">Hi ${firstName},</p>
    <p style="margin: 0 0 16px 0;">Congratulations! We are thrilled to inform you that your application to Momentum has been <span style="color: #f97316;">approved</span>.</p>
    <p style="margin: 0 0 16px 0;">We were incredibly impressed by your vision and what you are building. You are now part of an exclusive cohort of founders and builders.</p>
    <p style="margin: 0 0 16px 0;">Please log in to your Momentum portal to view the next steps, schedule, and onboarding details.</p>
    <p style="margin: 0;">Get ready to accelerate your journey. We can't wait to see what you build.</p>
    
    <div style="text-align: center; margin-top: 32px; margin-bottom: 16px;">
      <a href="${DOMAIN}/momentum/" style="background-color: #f97316; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 9999px; font-weight: 600; font-size: 14px; font-family: ${FONT_MANROPE}; display: inline-block;">Go to Portal</a>
    </div>
  `;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: 'Welcome to Momentum — your application is approved',
    html: getBaseTemplate('Application Approved', content),
  };

  await sgMail.send(msg);
};

export const sendApplicationRejectedEmail = async (to: string, firstName: string) => {
  const content = `
    <p style="margin: 0 0 16px 0;">Hi ${firstName},</p>
    <p style="margin: 0 0 16px 0;">Thank you for taking the time to apply to Momentum. We appreciate the effort you put into sharing your vision with us.</p>
    <p style="margin: 0 0 16px 0;">After careful consideration, we regret to inform you that we are unable to offer you a spot in this upcoming cohort. We had to make some very difficult decisions due to the highly limited number of spots available.</p>
    <p style="margin: 0 0 16px 0;">Please know that this is not a reflection of your potential as a founder. We strongly encourage you to keep building and to apply again for our future programs.</p>
    <p style="margin: 0;">We wish you the absolute best in your journey.</p>
  `;

  const msg = {
    to,
    from: FROM_EMAIL,
    subject: 'Update on your Momentum Application',
    html: getBaseTemplate('Application Update', content),
  };

  await sgMail.send(msg);
};
