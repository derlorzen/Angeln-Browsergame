import { defineConfig } from 'vitest/config';

// Relative base, damit das Build-Ergebnis in jedem Unterverzeichnis statisch gehostet werden kann.
export default defineConfig({
  base: './',
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
