import {
  SIGNUP_EMAIL_REJECT_MESSAGE,
  evaluateSignupEmailSync,
  type SignupEmailSyncResult,
} from './signupEmail';

export type MailLookupResult = 'yes' | 'no' | 'unknown';

export type SignupEmailLookup = (domain: string) => Promise<MailLookupResult>;

type DnsJsonResponse = {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
};

const MX_TYPE = 15;
const A_TYPE = 1;
const AAAA_TYPE = 28;
const NXDOMAIN = 3;

async function queryDnsJson(
  name: string,
  type: 'MX' | 'A' | 'AAAA',
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<DnsJsonResponse | null> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetchFn(url, {
    headers: { Accept: 'application/dns-json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) return null;
  return (await response.json()) as DnsJsonResponse;
}

function answersOfType(payload: DnsJsonResponse | null, type: number): string[] {
  return (payload?.Answer || [])
    .filter((answer) => answer.type === type && typeof answer.data === 'string' && answer.data.trim())
    .map((answer) => String(answer.data).trim());
}

/**
 * Does this domain accept mail? MX is required when present; an A/AAAA record
 * is a last-resort fallback for rare hosts without MX. NXDOMAIN is a hard no.
 */
export async function lookupDomainMail(
  domain: string,
  opts?: { fetch?: typeof fetch; timeoutMs?: number }
): Promise<MailLookupResult> {
  const fetchFn = opts?.fetch ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 2500;

  try {
    const mx = await queryDnsJson(domain, 'MX', fetchFn, timeoutMs);
    if (!mx) return 'unknown';
    if (mx.Status === NXDOMAIN) return 'no';
    if (typeof mx.Status === 'number' && mx.Status !== 0) return 'unknown';
    if (answersOfType(mx, MX_TYPE).length > 0) return 'yes';

    const a = await queryDnsJson(domain, 'A', fetchFn, timeoutMs);
    if (a?.Status === NXDOMAIN) return 'no';
    if (answersOfType(a, A_TYPE).length > 0) return 'yes';

    const aaaa = await queryDnsJson(domain, 'AAAA', fetchFn, timeoutMs);
    if (aaaa?.Status === NXDOMAIN) return 'no';
    if (answersOfType(aaaa, AAAA_TYPE).length > 0) return 'yes';

    return 'no';
  } catch (error) {
    console.warn('[signup-email] mail lookup failed', { domain, error });
    return 'unknown';
  }
}

export type SignupEmailResult =
  | SignupEmailSyncResult
  | { ok: false; reason: 'undeliverable'; message: string };

/**
 * Full signup-email policy: format, disposable hosts, throwaway TLDs, then MX.
 * DNS failures fail open so a Cloudflare/Google DNS blip does not block real signups.
 */
export async function evaluateSignupEmail(
  email: string,
  opts?: { lookupMail?: SignupEmailLookup }
): Promise<SignupEmailResult> {
  const sync = evaluateSignupEmailSync(email);
  if (!sync.ok) return sync;

  const lookup = opts?.lookupMail ?? ((domain: string) => lookupDomainMail(domain));
  const mail = await lookup(sync.domain);
  if (mail === 'no') {
    return { ok: false, reason: 'undeliverable', message: SIGNUP_EMAIL_REJECT_MESSAGE };
  }
  return sync;
}
