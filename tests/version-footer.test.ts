import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, root), 'utf8');

describe('Versionskennzeichnung', () => {
  it('hat dieselbe Versionsnummer im Paket und im Lockfile', () => {
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    expect(pkg.version.split('.')).toHaveLength(3);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  it('hat einen dauerhaften Footer außerhalb von Menü und Spielbildschirm', () => {
    const html = read('index.html');
    expect(html).toContain('<footer id="app-version"');
    expect(html.indexOf('id="app-version"')).toBeGreaterThan(html.indexOf('id="screen-game"'));
    expect(read('src/main.ts')).toContain('__APP_VERSION__');
    expect(read('vite.config.ts')).toContain('__APP_COMMIT__');
  });

  it('hat keine abweichende hardcodierte Versionsnummer im Hauptmenü', () => {
    expect(read('src/ui/menu.ts')).not.toContain('Version 0.5');
  });
});
