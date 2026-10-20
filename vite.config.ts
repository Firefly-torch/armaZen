import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vercel runs the server on Node.js and cannot resolve Cloudflare's virtual
// "cloudflare:workers" module. Cloudflare Workers builds keep the native binding.
const viteOverrides =
  process.env.VERCEL === "1"
    ? {
        resolve: {
          alias: {
            "cloudflare:workers": fileURLToPath(
              new URL("./src/lib/cloudflare-bindings.node.ts", import.meta.url),
            ),
          },
        },
      }
    : {};

export default defineConfig({
  ...({ vite: viteOverrides } as Record<string, unknown>),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
