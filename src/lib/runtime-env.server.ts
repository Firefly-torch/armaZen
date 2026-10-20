/**
 * Runtime environment lookup for server-only code.
 *
 * On Cloudflare Workers, use the official cloudflare:workers env binding.
 * In Node/Vite development and other runtimes, fall back to the existing
 * global Worker-env bridge (if present) and process.env.
 *
 * Call this function from a request/server-function handler, not at module
 * initialization time.
 */
type RuntimeEnv = Record<string, string | undefined>;

export async function serverRuntimeEnv(key: string): Promise<string | undefined> {
  try {
    // This module contains the Cloudflare-only virtual import. Lazy loading
    // keeps bun run dev working in Node, where cloudflare:workers is absent.
    const { readCloudflareBinding } = await import("./cloudflare-bindings.server");
    const value = readCloudflareBinding(key);
    if (value !== undefined) return value;
  } catch {
    // Outside Cloudflare (e.g. local Vite dev), use the Node fallback below.
  }

  const globals = globalThis as typeof globalThis & { __env__?: RuntimeEnv };
  const workerBinding = globals.__env__?.[key];
  if (workerBinding !== undefined) return workerBinding;

  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}
