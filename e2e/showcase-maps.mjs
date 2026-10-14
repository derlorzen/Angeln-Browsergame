// Screenshots: Kartenwahl und je eine Übersicht (aufgedeckt, mit Minikarte) und Startsiedlung jeder Karte.
// Aufruf: BASE_URL=http://localhost:4173/ OUT=/pfad node e2e/showcase-maps.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const OUT = (process.env.OUT ?? new URL('./out/maps/', import.meta.url).pathname).replace(/\/?$/, '/');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
p.on('pageerror', (e) => console.log('ERR', e.message));
await p.goto(process.env.BASE_URL ?? 'http://localhost:5173/');
await p.evaluate(() => localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Spieler', tutorialDone: true, renderer: 'auto' })));
await p.reload();
await p.click('[data-a=sp]');
await p.selectOption('[data-f=map]', 'ribe');
await p.waitForTimeout(300);
await p.screenshot({ path: OUT + 'setup-map.png' });
for (const map of ['schlei', 'foerde', 'danewerk', 'eider', 'marsch', 'ribe']) {
  await p.selectOption('[data-f=map]', map);
  await p.selectOption('[data-f=tut]', '0');
  await p.click('[data-a=go]');
  await p.waitForFunction(() => window.__game?.client?.units?.size > 0);
  await p.evaluate(() => {
    const G = window.__game, d = G.driver;
    d.paused = true;
    d.world.players[0].isAI = true;
    d.ais.push(new window.__debug.AI(0, 'normal'));
    for (let i = 0; i < 600 * 5; i++) d.tick();
    const c = G.client;
    const dz = [...c.buildings.values()].find((x) => x.o === c.me && x.t === 'dorfzentrum');
    G.renderer.cam.z = 1.1;
    G.renderer.centerOn(dz.x + 2, dz.y + 3);
  });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}${map}-base.png` });
  await p.evaluate(() => {
    const G = window.__game, c = G.client;
    c.vis.fill(2);
    c.visVersion++;
    G.renderer.cam.z = 0.5;
    G.renderer.centerOn(c.map.w / 2, c.map.h / 2);
  });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}${map}-overview.png` });
  await p.evaluate(() => window.__game.opts.onExit());
  await p.waitForSelector('[data-a=sp]');
  await p.click('[data-a=sp]');
}
await b.close();
console.log('Bilder in', OUT);
