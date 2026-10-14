import { defineConfig, type Plugin } from 'vitest/config';
import { createRooms } from './server/rooms.mjs';

/** Mehrspieler-Vermittlung (/api/rooms) auch im Entwicklungs- und Vorschauserver bereitstellen. */
function rooms(): Plugin {
  const r = createRooms();
  const mw = (req: Parameters<typeof r.handle>[0], res: Parameters<typeof r.handle>[1], next: () => void) => {
    r.handle(req, res).then((done) => done || next(), next);
  };
  return {
    name: 'angeln-rooms',
    configureServer: (s) => void s.middlewares.use(mw),
    configurePreviewServer: (s) => void s.middlewares.use(mw),
  };
}

// Relative base, damit das Build-Ergebnis in jedem Unterverzeichnis statisch gehostet werden kann.
export default defineConfig({
  base: './',
  plugins: [rooms()],
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
