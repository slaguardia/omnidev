import { defineConfig } from 'tsup';
import { resolve } from 'node:path';
import type { Plugin } from 'esbuild';

/**
 * esbuild plugin that strips 'use server' directives.
 * These are Next.js-specific and invalid in standalone Node.js.
 */
const stripUseServer: Plugin = {
  name: 'strip-use-server',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      const fs = await import('node:fs/promises');
      let contents = await fs.readFile(args.path, 'utf-8');
      // Remove 'use server' or "use server" at the top of files
      contents = contents.replace(/^(['"])use server\1;\s*\n/m, '');
      return { contents, loader: 'ts' };
    });
  },
};

export default defineConfig({
  entry: ['src/worker/src/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node18',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  // Native addons and packages that must be resolved at runtime.
  // @cursor/sdk ships dual ESM/CJS builds and uses dynamic imports the
  // bundler can't statically follow. @modelcontextprotocol/sdk + express
  // power the in-process MCP signals server (mcp-signals-server.ts) and
  // are heavy enough that bundling roughly doubles worker.cjs size; keep
  // them external so they resolve from node_modules at runtime.
  external: [
    'better-sqlite3',
    '@prisma/client',
    '@cursor/sdk',
    '@modelcontextprotocol/sdk',
    'express',
  ],
  // Resolve @/ to shared library (same as worker tsconfig)
  esbuildOptions(options) {
    options.alias = {
      '@': resolve(process.cwd(), 'src/shared/src'),
    };
  },
  esbuildPlugins: [stripUseServer],
  // Don't generate .d.ts — this is a runnable entry point, not a library
  dts: false,
});
