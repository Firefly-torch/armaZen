// Node/Vercel fallback for the Cloudflare-only virtual module.
// This file is selected by vite.config.ts only when building on Vercel.
// The runtime-env helper then falls back to process.env.
export const env: Record<string, unknown> = {};
