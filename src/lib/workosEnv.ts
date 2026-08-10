import { WorkOS } from '@workos-inc/node';

/** Cloudflare Worker secrets / Vercel env. */
export type RuntimeEnv = Record<string, string | undefined>;

export function readEnv(key: string, runtime?: RuntimeEnv): string | undefined {
  const fromRuntime = runtime?.[key]?.trim();
  if (fromRuntime) return fromRuntime;

  if (typeof process !== 'undefined') {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }

  return undefined;
}

export function getWorkOSConfig(runtime?: RuntimeEnv) {
  return {
    apiKey: readEnv('WORKOS_API_KEY', runtime),
    clientId: readEnv('WORKOS_CLIENT_ID', runtime),
    cookiePassword: readEnv('WORKOS_COOKIE_PASSWORD', runtime),
    redirectUri: readEnv('WORKOS_REDIRECT_URI', runtime),
    websiteRoot: readEnv('WEBSITE_ROOT', runtime)?.replace(/\/$/, ''),
  };
}

export function createWorkOS(runtime?: RuntimeEnv): WorkOS {
  const { apiKey, clientId } = getWorkOSConfig(runtime);
  if (!apiKey || !clientId) {
    throw new Error('WorkOS is not configured (WORKOS_API_KEY / WORKOS_CLIENT_ID missing)');
  }
  return new WorkOS(apiKey, { clientId });
}

/** Resolve Astro Cloudflare `locals.runtime.env` when present. */
export function runtimeEnvFromLocals(locals: App.Locals): RuntimeEnv | undefined {
  const runtime = locals as App.Locals & {
    runtime?: { env?: RuntimeEnv };
  };
  return runtime.runtime?.env;
}
