/**
 * Builder profile-claim email. Proof-first, low-pressure framing (see
 * docs/prd-builder-imessage-claim.md): "we already built your profile — save our
 * contact and text us to confirm it." No dashboard, no forms.
 */
export function buildClaimEmail(params: {
  firstName: string;
  /** Signed claim token (createClaimToken) tying this link to the emailed builder. */
  token: string;
  /** Optional pre-pulled proof facts to personalize (production pulls from BuilderProfile). */
  proofFacts?: string[];
  websiteRoot?: string;
}) {
  const { firstName, token } = params;
  const root = (params.websiteRoot || process.env.WEBSITE_ROOT || 'https://devlabs.club').replace(/\/$/, '');
  // Single CTA → verify page: confirm phone via OTP, then the agent texts them.
  const contactUrl = `${root}/verify?t=${encodeURIComponent(token)}`;

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
      It's <strong>currently private</strong> — founders can't see it yet. Confirm it's right and we'll make it founder-readable. Takes about 90 seconds, all over text. No dashboard, no forms.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${contactUrl}" style="display:inline-block;background:#fa7d22;color:#000;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Talk to us</a>
    </p>
    <p style="line-height:1.6;color:#555;font-size:14px;margin:0 0 4px;">
      That's it. We only reach out when a founder actually wants to talk to you — no spam, no nudges.
    </p>
    <p style="margin-top:28px;font-size:12px;color:#aaa;">DevLabs · Reply STOP to opt out anytime.</p>
  </div>`;

  const text = `Hey ${firstName} — we already built your DevLabs builder profile.

We pulled: ${proof.join(', ')}.

It's currently private — founders can't see it yet. Confirm it's right and we'll make it founder-readable. ~90 seconds, all over text. No dashboard, no forms.

Talk to us → ${contactUrl}
(save our contact, then send your first message — we'll take it from there)

We only reach out when a founder actually wants to talk to you. Reply STOP to opt out.`;

  return { subject, html, text };
}
