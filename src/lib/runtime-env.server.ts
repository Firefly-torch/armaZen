import { getRequest } from "@tanstack/react-start/server";

/**
 * Nitro v3 attaches Cloudflare runtime bindings to the current request at
 * request.runtime.cloudflare.env. This is the runtime contract used by the
 * existing Nitro Cloudflare preset; it does not require the Cloudflare Vite
 * plugin or the virtual "cloudflare:workers" module.
 *
 * Resolve values inside a request/server-function handler, not at module scope.
 */
type CloudflareRequest = Request & {
  runtime?: {
    cloudflare?: {
      env?: Record<string, unknown>;
    };
  };
};

type WorkerEnv = Record<string, unknown>;

export async function serverRuntimeEnv(key: string): Promise<string | undefined> {
  // Nitro v3 / Cloudflare Worker runtime: per-request bindings.
  try {
    const request = getRequest() as CloudflareRequest;
    const value = request.runtime?.cloudflare?.env?.[key];
    if (typeof value === "string") return value;
  } catch {
    // getRequest() can be unavailable outside a TanStack server request.
  }

  // Compatibility with the existing custom server entry, if present.
  const globals = globalThis as typeof globalThis & { __env__?: WorkerEnv };
  const globalValue = globals.__env__?.[key];
  if (typeof globalValue === "string") return globalValue;

  // Local Node/Vite development and CI.
  return typeof process !== "undefined" ? process.env?.[key] : undefined;
}
