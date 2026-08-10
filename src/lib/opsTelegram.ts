/**
 * Ops alerts → Telegram (for you + OpenClaw).
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHAT_ID    — your user/group/channel id
 *
 * Messages use: "<event> <Name> from <email>"
 *   e.g. "New builder signed up Dhanush from dhanush.kalaiselvan@gmail.com"
 */

export type OpsAlertEvent =
  | 'account_created'
  | 'role_selected'
  | 'role_created'
  | 'search_run'
  | 'agent_trace_uploaded'
  | 'link_claimed'
  | 'enrichment_run'
  | 'enrichment_failed'
  | 'enrichment_slow'
  | 'enrichment_timeout'
  | 'ops';

export type OpsAlertParams = {
  event: OpsAlertEvent;
  /** The full human-readable message sent to Telegram. */
  title: string;
  /** Optional second line (errors only). */
  body?: string;
  severity?: 'info' | 'warning' | 'error';
};

/** Prefer a real name; fall back to email local-part. */
export function opsDisplayName(
  name?: string | null,
  email?: string | null,
  fallback = 'Someone'
): string {
  const cleaned = typeof name === 'string' ? name.trim() : '';
  if (cleaned) return cleaned;
  const local = typeof email === 'string' ? email.split('@')[0]?.trim() : '';
  if (local) return local;
  return fallback;
}

/** Shared person label: "<Name> from <email>". */
export function opsPersonFrom(name?: string | null, email?: string | null): string {
  const display = opsDisplayName(name, email);
  const address = typeof email === 'string' ? email.trim() : '';
  if (address) return `${display} from ${address}`;
  return display;
}

function readEnv(key: string): string | undefined {
  if (typeof process !== 'undefined') {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

function buildMessage(params: OpsAlertParams): string {
  const lines = [params.title];
  if (params.body?.trim()) lines.push(params.body.trim());
  return lines.join('\n');
}

/**
 * Send an ops alert to Telegram. Never throws — safe to fire-and-forget from request paths.
 * No-ops when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are unset.
 */
export async function sendOpsTelegram(params: OpsAlertParams): Promise<{ ok: boolean; skipped?: boolean }> {
  const token = readEnv('TELEGRAM_BOT_TOKEN');
  const chatId = readEnv('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return { ok: false, skipped: true };

  const text = buildMessage(params);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.warn('[opsTelegram] send failed', res.status, detail.slice(0, 200));
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[opsTelegram] send error', err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

/** Fire-and-forget wrapper — use this from API handlers. */
export function notifyOps(params: OpsAlertParams): void {
  void sendOpsTelegram(params).catch(() => {});
}

/**
 * Schedule a one-shot "still running" alert. Call the returned cancel() when the
 * work finishes so a fast job never fires.
 */
export function watchOpsDuration(params: {
  event: OpsAlertEvent;
  title: string;
  /** Default 2 minutes. */
  afterMs?: number;
}): { cancel: () => void } {
  const afterMs = params.afterMs ?? 120_000;
  const timer = setTimeout(() => {
    notifyOps({
      event: params.event,
      title: params.title,
      severity: 'warning',
    });
  }, afterMs);

  return {
    cancel: () => {
      clearTimeout(timer);
    },
  };
}
