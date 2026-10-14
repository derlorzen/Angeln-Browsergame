// Einzelspiel gegen drei KIs über die echte Oberfläche: große Karte, vier Parteien, Partie läuft ohne Fehler.
// Aufruf: BASE_URL=http://localhost:4173/ node e2e/run-sp4.mjs
import { chromium } from 'playwright-core';
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const b = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await b.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
const check = (name, ok, info = '') => {
  results.push(ok);
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' – ' + info : ''}`);
};
try {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Solo', tutorialDone: true, renderer: 'auto' })));
  await page.reload();
  await page.click('[data-a=sp]');
  await page.selectOption('[data-f=map]', 'eider');
  await page.selectOption('[data-f=n]', '3');
  const slots = await page.$$eval('[data-f=slot] option', (o) => o.map((x) => x.textContent));
  check('Mit drei Gegnern stehen vier Startorte zur Wahl', slots.length === 4, slots.join(' | '));
  await page.selectOption('[data-f=tut]', '0');
  await page.click('[data-a=go]');
  await page.waitForFunction(() => window.__game?.client?.units?.size > 0, null, { timeout: 15000 });
  await page.evaluate(() => { const d = window.__game.driver; d.paused = true; for (let i = 0; i < 1200; i++) d.tick(); d.paused = false; });
  const w = await page.evaluate(() => {
    const w = window.__game.driver.world;
    return { n: w.players.length, size: w.map.w, ai: w.players.map((p) => p.isAI), colors: w.players.map((p) => p.color), slots: w.players.map((p) => p.slot), blds: w.players.map((p) => [...w.ents.values()].filter((e) => e.kind === 'b' && e.owner === p.id).length) };
  });
  check('Vier Parteien auf der großen Karte', w.n === 4 && w.size === 160 && w.ai.join() === 'false,true,true,true', JSON.stringify(w));
  check('Farben und Startorte verschieden', new Set(w.colors).size === 4 && new Set(w.slots).size === 4);
  check('Die KIs bauen auf', w.blds.slice(1).every((n) => n >= 3), w.blds.join(','));
  await page.screenshot({ path: new URL('./out/sp4.png', import.meta.url).pathname });
  check('Keine Skriptfehler', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('Ablauf ohne Ausnahme', false, String(e?.stack ?? e));
} finally {
  await b.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} Prüfungen bestanden.`);
process.exit(results.every(Boolean) ? 0 : 1);
