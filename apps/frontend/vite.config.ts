import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig(({ mode }) => ({
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
    topLevelAwait(), // Top-level await support
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
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('i18next')) return 'vendor-i18n';
            if (
              id.includes('libsodium') ||
              id.includes('tweetnacl') ||
              id.includes('@noble') ||
              id.includes('secure-remote-password') ||
              id.includes('argon2-browser') ||
              id.includes('tlock-js') ||
              id.includes('drand-client')
            ) {
              return 'vendor-crypto';
            }
            if (id.includes('three')) return 'vendor-3d';
            return 'vendor';
          }

          if (id.includes('/src/screens/Recovery')) return 'screen-recovery';
          if (id.includes('/src/lib/e2ee/') || id.includes('/src/core/crypto/') || id.includes('/src/shared/signal')) return 'feature-e2ee';
          if (id.includes('/src/lib/p2p/') || id.includes('/src/hooks/useP2P') || id.includes('/src/hooks/useSocket')) return 'feature-p2p';
          if (id.includes('/src/components/conversations/') || id.includes('/src/screens/Conversations')) return 'feature-conversations';
          return undefined;
        },
      },
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
