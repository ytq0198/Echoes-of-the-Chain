import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/model.ts', 'src/lib/errors.ts'],
      thresholds: {
        statements: 85,
        lines: 85,
        functions: 90,
        branches: 70,
      },
    },
  },
});
