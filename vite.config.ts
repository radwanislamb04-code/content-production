// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },

  // Register the Nitro cron plugin that handles the `cloudflare:scheduled` hook.
  //
  // Why the cast: Nitro supports `plugins` at runtime, and the wrapper spreads
  // these options straight through to `nitro()`, but its declared type only
  // lists `preset` / `output` / `cloudflare`. Without the cast, `tsc --noEmit`
  // (which typechecks this file) fails with an excess-property error.
  //
  // Note: Nitro does NOT auto-scan a `server/plugins/` directory here, so the
  // plugin path must be listed explicitly.
  nitro: {
    preset: "cloudflare-module",
    plugins: ["./server/plugins/content-os-cron.ts"],
  } as unknown as { preset: string },
});
