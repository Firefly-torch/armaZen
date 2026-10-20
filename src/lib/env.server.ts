/**
 * Runtime environment variable resolver for Cloudflare Workers + Node.js/Vite dev.
 *
 * On Cloudflare, the custom server entry receives runtime bindings as the
 * `env` argument. `src/server.ts` exposes that object through
 * `globalThis.__env__` before invoking TanStack Start. Runtime bindings take
 * precedence over process.env so build-time values cannot shadow dashboard
 * secrets/variables.
 *
 * In Node.js / Vite dev, no Worker env argument exists, so values fall back
 * to process.env (including values loaded from the local .env file).
 */

type CFEnv = Record<string, string | undefined>;

function getCFEnv(): CFEnv {
  const g = globalThis as { __env__?: CFEnv };
  return g.__env__ ?? {};
}

/**
 * Read a server-side variable from the live Cloudflare Worker bindings first,
 * then fall back to process.env for Node.js, Vite dev, and CI.
 *
 * Never use this for VITE_* variables — those are inlined at build time via
 * import.meta.env and available in client bundles directly.
 */
export function serverEnv(key: string): string | undefined {
  const bindingValue = getCFEnv()[key];
  if (bindingValue !== undefined) return bindingValue;

  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}
