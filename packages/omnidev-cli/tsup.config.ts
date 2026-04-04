import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['commander', 'dotenv'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
