import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
// vite-plugin-top-level-await removed: with build.target='esnext' and
// the bundled Electron 35 (= Chrome 134) supporting TLA natively, the
// plugin is redundant — and worse, it was re-emitting WASM-internal
// bare imports (e.g. `import "a"`) as top-level side-effect imports
// in the entry chunk, breaking module resolution at runtime.

export default defineConfig(({ mode }) => ({
  // Relative asset paths so the bundle works when loaded from `file://`
  // by the packaged Electron app. With the default `'/'` base, Vite emits
  // `<script src="/assets/...">` which Electron resolves to `C:/assets/...`
  // and 404s on every chunk — blank window. `'./'` produces relative
  // paths that resolve next to index.html in both Electron and browser.
  base: './',

  // Strip console.log / .debug / .info from production bundles. Most of the
  // 300+ raw console calls in the codebase are dev noise, but a few include
  // hashes, tokens, or peerIds that would leak into any production user's
  // DevTools. `pure` marks these calls as side-effect-free so the esbuild
  // minifier tree-shakes them away. console.warn and console.error are
  // preserved — they carry operational signal we want available on end-user
  // machines when things go wrong.
  esbuild: {
    pure:
      mode === 'production'
        ? ['console.log', 'console.debug', 'console.info']
        : [],
  },
  plugins: [
    wasm(), // WASM support for argon2-browser
    // Strip WASM-internal bare imports that vite-plugin-wasm leaks into
    // JS chunks. The argon2 / libsodium WASM binaries declare imports
    // named "a", "env", "wbg" (the wasm-bindgen import object); the
    // wasm plugin satisfies them at module-init time but Rollup still
    // emits them as side-effect `import "a";` statements at the top of
    // dependent JS chunks. Browsers can't resolve those bare specifiers
    // and the whole bundle fails to load (white screen). Stripping them
    // post-bundle is safe — no real npm package is called "a", "env",
    // or "wbg" — and unblocks the Electron load.
    {
      // vite-plugin-wasm emits unresolved bare specifiers ("a", "env",
      // "wbg") for the wasm-bindgen import object expected by Emscripten
      // / wasm-bindgen output. argon2-browser's lib/argon2.js triggers
      // it; the production code path actually uses
      // argon2-browser/dist/argon2-bundled.min.js (self-contained, no
      // bare imports), but Vite still bundles the unused wasm-importing
      // path. Provide an empty virtual module so module resolution
      // succeeds at startup. If the unused code path is ever hit at
      // runtime, the namespace will be `{}` and call will throw a clear
      // error — better than a white-screen module-resolution failure.
      name: 'wasm-bare-import-stub',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'a' || id === 'env' || id === 'wbg') {
          return '\0wasm-bare-stub:' + id;
        }
        return null;
      },
      load(id) {
        if (id.startsWith('\0wasm-bare-stub:')) {
          // Empty namespace export — satisfies `import * as X from "a"`
          // and `import { y } from "a"` patterns. Any access on an
          // imported binding will be undefined.
          return 'export {};';
        }
        return null;
      },
    },
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'util', 'stream', 'process', 'events'],
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/avatars': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext', // Support for modern features including WASM
    rollupOptions: {
      // Suppress the "Rollup failed to resolve import X from .wasm" warning
      // that vite-plugin-node-polyfills escalates to an error. The imports
      // in question are the WASM binary's internal metadata ("a", "env",
      // etc.), which the wasm plugin already handles — Rollup just can't
      // parse them as JS, and shouldn't try.
      onwarn(warning, defaultHandler) {
        if (
          warning.code === 'UNRESOLVED_IMPORT' &&
          typeof warning.message === 'string' &&
          warning.message.includes('.wasm')
        ) {
          return;
        }
        defaultHandler(warning);
      },
      // manualChunks removed: the previous custom strategy
      // (vendor-react / vendor-crypto / feature-e2ee / feature-p2p / …)
      // created circular cross-chunk dependencies that surfaced as TDZ
      // errors in production Electron builds — `auth.ts` in the entry
      // chunk would access `create` from the zustand binding before
      // the dependent vendor chunk had finished evaluating, despite the
      // dependency graph saying otherwise. Letting Rollup auto-split
      // by import graph is correct out of the box; we lose a bit of
      // first-paint optimisation but avoid white-screen on init. Can
      // be revisited later with `splitVendorChunkPlugin` or per-route
      // `splitChunks` if bundle size becomes a problem.
    },
  },
  optimizeDeps: {
    exclude: ['argon2-browser'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  worker: {
    format: 'es',
  },
}));
