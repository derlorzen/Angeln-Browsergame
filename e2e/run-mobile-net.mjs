// Zwei mobile Browserkontexte auf einem Rechner: Lobby und Touch-Befehl über echtes WebRTC.
// Belegt nicht die Verbindbarkeit zwischen unterschiedlichen Internetanschlüssen.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/opt/pw-browsers/chromium'),
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  headless: true,
});
const errors = [];
const check = (name, ok) => { assert.ok(ok, name); console.log(`OK ${name}`); };
try {
  const pages = [];
  for (const [width, height, name] of [[390, 844, 'Host'], [844, 390, 'Gast']]) {
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE);
    await page.evaluate((name) => {
      localStorage.setItem('angeln-settings-v1', JSON.stringify({ name, renderer: 'canvas', tutorialDone: true, ice: { mode: 'none' } }));
    }, name);
    await page.reload();
    pages.push(page);
  }
  const [host, guest] = pages;
  await host.locator('[data-a=host]').tap();
  await host.locator('[data-a=make]').tap();
  await host.waitForSelector('[data-code]');
  const code = (await host.locator('[data-code]').textContent()).trim();
  await guest.locator('[data-a=join]').tap();
  await guest.locator('[data-f=code]').fill(code);
  await guest.locator('[data-a=join]').tap();
  await guest.waitForSelector('h2:has-text("Lobby")', { timeout: 30000 });
  check('Mobile Lobby: Host im Hochformat, Gast im Querformat verbunden', true);
  await guest.locator('[data-f=ready]').check();
  await host.locator('[data-f=ready]').check();
  await host.locator('[data-a=start]').tap();
  for (const page of pages) await page.waitForFunction(() => window.__game?.client.units.size > 0);
  check('Beide mobilen Spieler starten eine echte Netzwerkpartie', true);
  const unit = await guest.evaluate(() => {
    const G = window.__game, c = G.client;
    const u = [...c.units.values()].find((u) => u.o === c.me && u.t === 'arbeiter');
    G.renderer.centerOn(u.x, u.y);
    const [sx, sy] = G.renderer.toScreen(u.x, u.y);
    // Sichtbares, freies Nachbarfeld, deutlich außerhalb der Touch-Auswahlbox.
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (Math.abs(dx) + Math.abs(dy) < 3) continue;
      const x = Math.floor(u.x) + dx, y = Math.floor(u.y) + dy, i = y * c.map.w + x;
      if (x < 0 || y < 0 || x >= c.map.w || y >= c.map.h || c.vis[i] !== 2 || c.occ[i] || c.trees[i] || [1, 2, 6, 11, 12, 13].includes(c.map.terrain[i])) continue;
      const [tx, ty] = G.renderer.toScreen(x + 0.5, y + 0.5);
      if (tx < 10 || tx > innerWidth - 10 || ty < G.renderer.playTop + 10 || ty > G.renderer.playBottom - 10) continue;
      return { id: u.i, x: u.x, y: u.y, sx, sy: sy - 12, tx, ty };
    }
    throw new Error('Kein freies sichtbares Nachbarfeld');
  });
  await guest.touchscreen.tap(unit.sx, unit.sy);
  check('Gast wählt eigenen Arbeiter per Touch', await guest.evaluate((id) => window.__game.selected.has(id), unit.id));
  await guest.locator('[data-touch=order]').tap();
  await guest.touchscreen.tap(unit.tx, unit.ty);
  await host.waitForFunction(({ id, x, y }) => {
    const u = window.__game.driver.world.ents.get(id);
    return u && Math.hypot(u.x - x, u.y - y) > 0.5;
  }, unit, { timeout: 10000 });
  check('Touch-Befehl des Gasts wird beim Host ausgeführt', true);
  check('Keine JavaScript-Laufzeitfehler in der mobilen Netzwerkpartie', errors.length === 0);
} finally {
  await browser.close();
}
