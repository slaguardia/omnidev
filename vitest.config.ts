import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    setupFiles: ['./tests/vitest-setup.ts'],
    environment: 'node',
    globals: true,
    include: [
      'src/shared/**/*.{test,spec}.ts',
      'src/web/**/*.{test,spec}.ts',
      'tests/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'cobertura'],
      include: ['src/shared/**/*.ts', 'src/web/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.config.ts',
        'src/web/src/app/layout.tsx',
        'src/web/src/app/providers.tsx',
      ],
      all: true,
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },
  },
  resolve: {
    alias: [
      {
        find: '@/lib/auth/get-server-session',
        replacement: path.resolve(__dirname, './tests/mocks/get-server-session-stub.ts'),
      },
      { find: '@', replacement: path.resolve(__dirname, './src/shared/src') },
    ],
  },
});
