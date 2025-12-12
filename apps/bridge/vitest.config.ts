import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // DB-backed tests must not run concurrently (they share the same database)
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    sequence: {
      concurrent: false,
    },
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/index.ts', // Legacy monolith (sera refactoré)
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
