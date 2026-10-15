import { defineConfig, type Plugin } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

// Eine Quelle für die Versionsnummer (package.json), Git-SHA identifiziert jeden ausgelieferten Build.
const appVersion: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
let commit = process.env.GITHUB_SHA?.slice(0, 8) || 'local';
if (commit === 'local') {
  try { commit = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { /* Ohne Git bleibt der Build als lokal gekennzeichnet. */ }
}

// Relative base, damit das Build-Ergebnis in jedem Unterverzeichnis statisch gehostet werden kann.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  plugins: [rooms()],
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
