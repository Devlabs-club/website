import type { APIRoute } from 'astro';
import type { RuntimeEnv } from './workosEnv';

const DEFAULT_API_PROXY_ORIGIN = 'https://www.devlabs.club';

function proxyOrigin(locals: App.Locals): string | undefined {
  const runtime = (locals as App.Locals & { runtime?: { env?: RuntimeEnv } }).runtime?.env;
  const fromRuntime = runtime?.API_PROXY_ORIGIN?.trim();
  if (fromRuntime) return fromRuntime.replace(/\/$/, '');
  if (typeof process !== 'undefined') {
    const fromProcess = process.env.API_PROXY_ORIGIN?.trim();
    if (fromProcess) return fromProcess.replace(/\/$/, '');
  }
  return undefined;
}

/** True on Cloudflare Worker when API_PROXY_ORIGIN is configured in wrangler.toml. */
export function shouldUseApiProxy(locals: App.Locals): boolean {
  return Boolean(proxyOrigin(locals));
}

export async function proxyToNodeBackend(
  request: Request,
  locals: App.Locals
): Promise<Response> {
  const origin = proxyOrigin(locals) || DEFAULT_API_PROXY_ORIGIN;
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);

  const headers = new Headers(request.headers);
  headers.set('Host', target.host);
  headers.set('X-Forwarded-Host', incoming.host);
  headers.set('X-Forwarded-Proto', incoming.protocol.replace(':', ''));

  const method = request.method;
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const proxied = await fetch(target.toString(), {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const outHeaders = new Headers(proxied.headers);
  outHeaders.delete('content-encoding');
  outHeaders.delete('transfer-encoding');

  return new Response(proxied.body, {
    status: proxied.status,
    statusText: proxied.statusText,
    headers: outHeaders,
  });
}

/** Re-export pattern for thin API route files. */
export function withNodeBackendProxy(
  handler: APIRoute
): APIRoute {
  return async (context) => {
    if (shouldUseApiProxy(context.locals)) {
      return proxyToNodeBackend(context.request, context.locals);
    }
    return handler(context);
  };
}
