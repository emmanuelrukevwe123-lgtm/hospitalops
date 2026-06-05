import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.ts'],
    environment: 'node',
    clearMocks: true,
    env: { NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Pure type declarations and the demo entrypoint carry no testable logic.
      exclude: ['src/core/types.ts', 'src/index.ts', 'src/app.ts'],
      reporter: ['text', 'text-summary'],
    },
  },
});
