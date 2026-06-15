import type { APIRoute } from 'astro';
import { readEnv, type RuntimeEnv } from './workosEnv';

const DEFAULT_API_PROXY_ORIGIN = 'https://www.devlabs.club';

function runtimeEnv(locals: App.Locals): RuntimeEnv | undefined {
  return (locals as App.Locals & { runtime?: { env?: RuntimeEnv } }).runtime?.env;
}

function proxyOrigin(locals: App.Locals): string | undefined {
  const runtime = runtimeEnv(locals);
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

function vercelBypassSecret(locals: App.Locals): string | undefined {
  const runtime = runtimeEnv(locals);
  return (
    readEnv('VERCEL_AUTOMATION_BYPASS_SECRET', runtime) ||
    readEnv('VERCEL_PROTECTION_BYPASS', runtime)
  );
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

  const bypass = vercelBypassSecret(locals);
  if (bypass) {
    headers.set('x-vercel-protection-bypass', bypass);
  }

  const method = request.method;
  const body =
    method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();

  const proxied = await fetch(target.toString(), {
    method,
    headers,
    body,
    redirect: 'manual',
  });

  const contentType = proxied.headers.get('content-type') || '';
  if (
    proxied.status === 401 &&
    contentType.includes('text/html') &&
    !bypass
  ) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          'API backend blocked by Vercel SSO. Set VERCEL_AUTOMATION_BYPASS_SECRET on the Worker (bun run deploy:stack:secrets).',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

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
