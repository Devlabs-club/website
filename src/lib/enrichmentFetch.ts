/** Browser fetch helper for long-running onboarding enrichment APIs. */

export class EnrichmentFetchError extends Error {
  status?: number;
  timedOut: boolean;

  constructor(message: string, opts?: { status?: number; timedOut?: boolean }) {
    super(message);
    this.name = 'EnrichmentFetchError';
    this.status = opts?.status;
    this.timedOut = Boolean(opts?.timedOut);
  }
}

export async function fetchEnrichmentJson<T = any>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ res: Response; data: T }> {
  const { timeoutMs = 180_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...rest,
      credentials: rest.credentials ?? 'include',
      signal: controller.signal,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      if (res.status === 504 || /timed out|timeout/i.test(text)) {
        throw new EnrichmentFetchError(
          'This is taking longer than expected. Please try again in a moment.',
          { status: res.status, timedOut: true }
        );
      }
      throw new EnrichmentFetchError('Unexpected response from the server. Please try again.', {
        status: res.status,
      });
    }

    return { res, data: data as T };
  } catch (error) {
    if (error instanceof EnrichmentFetchError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new EnrichmentFetchError(
        'This is taking longer than expected. Please try again in a moment.',
        { timedOut: true }
      );
    }
    throw new EnrichmentFetchError('Network error. Please try again.');
  } finally {
    clearTimeout(timer);
  }
}
