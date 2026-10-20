/**
 * Runtime environment variable resolver for Cloudflare Workers + Node.js/Vite dev.
 *
 * Why this exists:
 *   - In Node.js / Vite dev, variables live in `process.env` (populated from .env).
 *   - In Cloudflare Workers (cloudflare-module preset), the Nitro handler does
 *       `globalThis.__env__ = env`
 *     before each request, where `env` is the CF Workers bindings object that
 *     contains all secrets/vars configured in the Cloudflare dashboard.
 *     The `nodejs_compat` flag makes `node:process` available, but `process.env`
 *     is NOT automatically populated from CF bindings — it only has values that
 *     were declared in wrangler.json [vars], which the auto-generated file omits.
 *   - So for server-only code we must check both sources.
 */

type CFEnv = Record<string, string | undefined>;

function getCFEnv(): CFEnv {
  // globalThis.__env__ is set by the Nitro cloudflare-module handler on every request.
  // It is undefined during module initialisation (before the first request arrives),
  // so we return an empty object in that case — the caller will fall back to process.env.
  const g = globalThis as { __env__?: CFEnv };
  return g.__env__ ?? {};
}

/**
 * Reads a server-side environment variable from either:
 *   1. `process.env`          — Node.js, Vite dev, CI
 *   2. `globalThis.__env__`   — Cloudflare Workers runtime (Nitro cloudflare-module preset)
 *
 * Never use this for VITE_* variables — those are inlined at build time via
 * import.meta.env and are available in client bundles directly.
 */
export function serverEnv(key: string): string | undefined {
  // process.env wins when populated (Node / dev). CF Workers nodejs_compat sets
  // process.env from [vars] declarations in wrangler config; secrets do not appear
  // there, so __env__ is the reliable fallback for all CF bindings.
  return process.env[key] ?? getCFEnv()[key];
}
