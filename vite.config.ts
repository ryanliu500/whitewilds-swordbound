// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The devtools source injector adds data-tsd-source to every JSX element; React Three Fiber
// treats dashed props as nested paths and crashes, so strip it from 3D scene files.
const stripTsdSourceInGame = {
  name: "strip-tsd-source-in-game",
  transform(code: string, id: string) {
    if (!id.includes("/src/game/") || !code.includes("data-tsd-source")) return null;
    return {
      code: code
        .replace(/\s*data-tsd-source=("[^"]*"|\{[^}]*\})/g, "")
        .replace(/,?\s*"data-tsd-source":\s*"[^"]*"/g, "")
        .replace(/\{\s*,/g, "{"),
      map: null,
    };
  },
};

export default defineConfig({
  vite: { plugins: [stripTsdSourceInGame] },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
