/**
 * Builder profile-claim email. Proof-first framing — open iMessage to verify (no OTP).
 */
export function buildClaimEmail(params: {
  firstName: string;
  /** Signed verify token (createClaimToken from claimToken.ts). */
  token: string;
  proofFacts?: string[];
  websiteRoot?: string;
}) {
  const { firstName, token } = params;
  const root = (params.websiteRoot || process.env.WEBSITE_ROOT || 'https://www.devlabs.club').replace(/\/$/, '');
  const contactUrl = `${root}/builder/start?t=${encodeURIComponent(token)}`;

  const proof =
    params.proofFacts && params.proofFacts.length
      ? params.proofFacts
      : ['your projects from GitHub', 'your roles & experience', 'your skills'];

  const subject = `${firstName} — we already built your DevLabs profile`;

  const proofList = proof.map((p) => `<li style="margin:4px 0;">${p}</li>`).join('');

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#111;">
    <p style="color:#888;font-size:13px;margin:0 0 8px;">DevLabs</p>
    <h2 style="font-size:22px;line-height:1.3;margin:0 0 16px;">Hey ${firstName} — we already built your builder profile.</h2>
    <p style="line-height:1.6;color:#333;margin:0 0 12px;">
      We put together a founder-readable profile for you from your public work. We pulled:
    </p>
    <ul style="line-height:1.6;color:#333;margin:0 0 16px;padding-left:20px;">${proofList}</ul>
    <p style="line-height:1.6;color:#333;margin:0 0 20px;">
      It's <strong>currently private</strong> — founders can't see it yet. Tap below, open Messages, and send the pre-filled text. That verifies you and we'll finish your profile over text. ~90 seconds. No dashboard, no codes.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${contactUrl}" style="display:inline-block;background:#fa7d22;color:#000;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Open Messages</a>
    </p>
    <p style="line-height:1.6;color:#555;font-size:14px;margin:0 0 4px;">
      We only reach out when a founder actually wants to talk to you — no spam, no nudges.
    </p>
    <p style="margin-top:28px;font-size:12px;color:#aaa;">DevLabs · Reply STOP to opt out anytime.</p>
  </div>`;

  const text = `Hey ${firstName} — we already built your DevLabs builder profile.

We pulled: ${proof.join(', ')}.

It's currently private. Open Messages and send the pre-filled text to verify and finish your profile (~90 sec, all over text).

Open Messages → ${contactUrl}

We only reach out when a founder wants to talk. Reply STOP to opt out.`;

  return { subject, html, text };
}
