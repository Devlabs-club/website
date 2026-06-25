/**
 * Transport-agnostic messaging layer for the Builder Agent.
 *
 * The agent core never imports a specific vendor. Swap BlueBubbles → Spectrum-TS
 * (or add SMS/WhatsApp fallback) by implementing this interface and changing one
 * line in the gateway factory.
 */

export type NormalizedInbound = {
  /** Provider-unique message id, used for idempotency. */
  providerMessageGuid: string;
  /** Normalized sender: E.164 phone or lowercased email. */
  handle: string;
  /** Raw handle/address as the provider gave it (for replying). */
  rawAddress: string;
  /** Provider chat/thread id to reply into. */
  chatGuid: string | null;
  text: string;
  service: 'iMessage' | 'SMS';
  attachments?: Array<{ url?: string; name?: string; mimeType?: string }>;
  isFromMe: boolean;
  receivedAt: Date;
};

export interface MessageProvider {
  readonly name: string;
  /** Send a text reply. Returns provider message guid if available. */
  send(to: { handle: string; chatGuid?: string | null }, body: string): Promise<{ guid?: string }>;
  /** Optional: show typing indicator before sending (no-op if unsupported). */
  setTyping?(to: { handle: string; chatGuid?: string | null }): Promise<void>;
  /** Parse a raw inbound webhook body into a NormalizedInbound, or null if not a user message. */
  parseInbound(rawBody: unknown): NormalizedInbound | null;
  /** Verify the inbound request is authentic (shared secret / signature). */
  verifyInbound(req: { searchParams: URLSearchParams; headers: Headers; rawBody: unknown }): boolean;
}

/** Normalize a phone/email handle to a stable key. */
export function normalizeHandle(raw: string): string {
  const trimmed = (raw || '').trim();
  if (trimmed.includes('@')) return trimmed.toLowerCase();
  // phone → strip everything but digits and leading +
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // assume US if 10 digits, else prefix +
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}
