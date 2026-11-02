import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  // Bundle the TypeScript-source workspace package; keep real npm dependencies external.
  noExternal: ['@dhaaga/shared'],
});
