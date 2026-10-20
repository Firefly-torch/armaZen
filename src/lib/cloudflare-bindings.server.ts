// Cloudflare's runtime provides this virtual module. It is loaded dynamically
// by runtime-env.server.ts so local Node/Vite development can fall back to .env.
// @ts-ignore Cloudflare Workers resolves this built-in module at deployment/runtime.
import { env } from "cloudflare:workers";

export function readCloudflareBinding(key: string): string | undefined {
  const value = (env as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
