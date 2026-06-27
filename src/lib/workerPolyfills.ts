/** Minimal Node polyfills for Cloudflare Workers nodejs_compat. */
const proc = globalThis.process as NodeJS.Process & { emitWarning?: (...args: unknown[]) => void };
if (proc && typeof proc.emitWarning !== 'function') {
  proc.emitWarning = () => {};
}

export {};
