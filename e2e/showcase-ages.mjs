// Screenshots: dieselbe Siedlung im 20. und im 22. Jahrhundert mit neuen Gebäuden und Einheiten.
// Aufruf: BASE_URL=http://localhost:4173/ OUT=/pfad node e2e/showcase-ages.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const OUT = (process.env.OUT ?? new URL('./out/ages/', import.meta.url).pathname).replace(/\/?$/, '/');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
await p.evaluate(() => localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Spieler', tutorialDone: true, renderer: 'auto', map: 'foerde' })));
await p.reload();
await p.click('[data-a=sp]');
await p.selectOption('[data-f=tut]', '0');
await p.click('[data-a=go]');
await p.waitForFunction(() => window.__game?.client?.units?.size > 0);
for (const age of [3, 4]) {
  await p.evaluate((age) => {
    const G = window.__game, d = G.driver, w = d.world;
    d.paused = true;
    const pl = w.players[0];
    pl.age = age;
    const dz = [...w.ents.values()].find((e) => e.kind === 'b' && e.owner === 0 && e.type === 'dorfzentrum');
    if (!window.__placed) {
      window.__placed = true;
      pl.res = { holz: 9999, getreide: 9999, fisch: 9999, lehm: 9999, waren: 9999, taler: 9999 };
      const want = ['bauernhof', 'muehle', 'raeucherei', 'wohnhaus', 'wohnhaus', 'kaserne', 'markt', 'bahnhof', 'fabrik', 'bunker', 'vertikalfarm', 'schildturm', 'manufaktur'];
      w.vis[0].fill(1);
      for (const t of want) {
        let done = false;
        for (let r = 4; r < 16 && !done; r++)
          for (let k = 0; k < 24 && !done; k++) {
            const x = dz.x + Math.round(Math.cos(k / 3.8) * r), y = dz.y + Math.round(Math.sin(k / 3.8) * r);
            const before = w.ents.size;
            w.queueCommand(0, { c: 'place', ids: [], b: t, x, y });
            d.tick();
            if (w.ents.size > before) {
              const nb = [...w.ents.values()].filter((e) => e.kind === 'b' && e.type === t && !e.built)[0];
              if (nb) {
                nb.built = true;
                nb.hp = nb.maxHp;
                nb.prog = 999;
              }
              done = true;
            }
          }
      }
      for (const [t, n] of [['panzer', 2], ['infanterist', 4], ['exosoldat', 3], ['drohne', 3]]) for (let k = 0; k < n; k++) w.spawnUnit(t, 0, dz);
    }
    for (let i = 0; i < 30; i++) d.tick();
    G.renderer.cam.z = 0.75;
    G.renderer.centerOn(dz.x + 2, dz.y + 3);
    window.__game.client.vis.fill(2);
    window.__game.client.visVersion++;
  }, age);
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}age-${age}.png` });
}
await b.close();
console.log('Bilder in', OUT);
