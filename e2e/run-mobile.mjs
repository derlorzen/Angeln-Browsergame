// Echte Touch-Ereignisse via Chromium, inklusive Rotation und Desktop-Rückprüfung.
// BASE_URL=http://localhost:5173 CHROME=/path/to/chrome node e2e/run-mobile.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const out = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/opt/pw-browsers/chromium'),
  headless: true,
});
const errors = [];
const check = (name, ok) => { assert.ok(ok, name); console.log(`OK ${name}`); };
try {
  for (const [width, height, renderer] of [[320, 568, 'canvas'], [390, 844, 'auto'], [844, 390, 'auto'], [568, 320, 'canvas'], [1024, 768, 'auto']]) {
    const tag = `${width}x${height}-${renderer}`;
    const ctx = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(BASE);
    await page.evaluate((renderer) => {
      localStorage.clear();
      localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Mobiltest', renderer, tutorialDone: true }));
    }, renderer);
    await page.reload();
    await page.locator('[data-a=sp]').tap();
    check(`${tag}: Menü ohne horizontales Überlaufen`, await page.evaluate(() => {
      const box = document.querySelector('.menu-box');
      return box.scrollWidth <= box.clientWidth + 1;
    }));
    await page.selectOption('[data-f=map]', 'schlei');
    await page.selectOption('[data-f=ai]', 'leicht');
    await page.selectOption('[data-f=rich]', '1');
    await page.selectOption('[data-f=tut]', '0');
    await page.locator('[data-a=go]').tap();
    await page.waitForFunction(() => window.__game?.client.units.size > 0);
    await page.waitForTimeout(500);
    const cdp = await ctx.newCDPSession(page);
    const touch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 4, radiusY: 4, force: 1 })) });
    };
    const tap = async (x, y) => { await touch('touchStart', [[1, x, y]]); await touch('touchEnd', []); };
    const swipe = async (a, b) => {
      await touch('touchStart', [[1, ...a]]);
      for (let i = 1; i <= 6; i++) await touch('touchMove', [[1, a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6]]);
      await touch('touchEnd', []);
    };
    const cam = () => page.evaluate(() => ({ ...window.__game.renderer.cam }));
    await page.evaluate(() => {
      const G = window.__game;
      window.__orders = [];
      const send = G.driver.send.bind(G.driver);
      G.driver.send = (cmd) => { window.__orders.push(cmd); send(cmd); };
    });
    check(`${tag}: HUD und Knöpfe vollständig erreichbar`, await page.evaluate(() => {
      const nodes = document.querySelectorAll('#bottom, #touch-controls, .top-actions .btn:not([data-act=tut]):not([data-act=mute])');
      return [...nodes].every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1;
      });
    }));
    check(`${tag}: Dorfzentrum im freien Kartenbereich`, await page.evaluate(() => {
      const G = window.__game, c = G.client;
      const d = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
      const [, y] = G.renderer.toScreen(d.x + 1.5, d.y + 1.5);
      return y >= G.renderer.playTop && y < G.renderer.playBottom;
    }));
    const worker = await page.evaluate(() => {
      const G = window.__game, c = G.client;
      const u = [...c.units.values()].find((u) => u.o === c.me && u.t === 'arbeiter');
      G.renderer.centerOn(u.x, u.y);
      const [x, y] = G.renderer.toScreen(u.x, u.y);
      return { id: u.i, x, y: y - 12 };
    });
    await tap(worker.x, worker.y);
    check(`${tag}: Einheit durch Tippen gewählt`, await page.evaluate((id) => window.__game.selected.has(id), worker.id));
    await page.locator('[data-touch=order]').tap();
    await tap(width / 2 + 40, await page.evaluate(() => window.__game.renderer.centerY));
    check(`${tag}: Befehl per Touch über vorhandenen Spieltreiber`, await page.evaluate(() => window.__orders.some((c) => ['smart', 'move'].includes(c.c))));
    await page.locator('[data-touch=select]').tap();
    const cy = await page.evaluate(() => window.__game.renderer.centerY);
    const beforePan = await cam();
    const nBefore = await page.evaluate(() => window.__orders.length);
    await swipe([width / 2, cy], [width / 2 + 55, cy + 20]);
    const afterPan = await cam();
    check(`${tag}: Wischen bewegt Kamera ohne Spielbefehl`, Math.abs(afterPan.x - beforePan.x) > 20 && nBefore === await page.evaluate(() => window.__orders.length));
    const z = afterPan.z;
    await touch('touchStart', [[1, width / 2 - 25, cy]]);
    await touch('touchStart', [[1, width / 2 - 25, cy], [2, width / 2 + 25, cy]]);
    await touch('touchMove', [[1, width / 2 - 45, cy], [2, width / 2 + 45, cy]]);
    await touch('touchEnd', [[1, width / 2 - 45, cy]]);
    await touch('touchMove', [[1, width / 2 - 35, cy]]);
    await touch('touchEnd', []);
    check(`${tag}: Pinch zoomt ohne anschließenden Tap-Befehl`, (await cam()).z > z && nBefore === await page.evaluate(() => window.__orders.length));
    // Rahmen auf eigener Truppe: Nur den Ausschnitt/Zoom als Testvorbereitung setzen.
    const box = await page.evaluate(() => {
      const G = window.__game, c = G.client;
      G.renderer.cam.z = 0.7;
      const us = [...c.units.values()].filter((u) => u.o === c.me);
      const x = us.reduce((s, u) => s + u.x, 0) / us.length;
      const y = us.reduce((s, u) => s + u.y, 0) / us.length;
      G.renderer.centerOn(x, y);
      const ps = us.map((u) => G.renderer.toScreen(u.x, u.y));
      return { a: [Math.max(3, Math.min(...ps.map((p) => p[0])) - 15), Math.max(G.renderer.playTop + 2, Math.min(...ps.map((p) => p[1])) - 28)],
        b: [Math.min(innerWidth - 3, Math.max(...ps.map((p) => p[0])) + 15), Math.min(G.renderer.playBottom - 2, Math.max(...ps.map((p) => p[1])) + 5)] };
    });
    await page.locator('[data-touch=box]').tap();
    await swipe(box.a, box.b);
    check(`${tag}: Rahmen wählt mehrere Einheiten`, await page.evaluate(() => window.__game.selected.size >= 2));
    await page.locator('[data-r=idle]').tap();
    // Der benutzte Arbeiter kann unterwegs sein; Dorf und dann einen stehenden Arbeiter direkt wählen.
    await page.evaluate(() => {
      const G = window.__game, c = G.client;
      const u = [...c.units.values()].find((u) => u.o === c.me && u.t === 'arbeiter');
      G.selected = new Set([u.i]);
      G.hud.update(true);
    });
    const buildButton = await page.locator('.cmd[data-k="0"]').boundingBox();
    await touch('touchStart', [[1, buildButton.x + buildButton.width / 2, buildButton.y + buildButton.height / 2]]);
    await page.waitForTimeout(550);
    await touch('touchEnd', []);
    check(`${tag}: Langes Drücken zeigt Baukosten ohne Bauauftrag`, await page.locator('#tooltip').isVisible() && await page.evaluate(() => !window.__game.placement));
    await page.locator('#tooltip').tap();
    await page.locator('[data-touch=select]').tap();
    await page.locator('.cmd[data-k="0"]').tap();
    check(`${tag}: Wohnhaus-Bauvorschau über HUD`, await page.evaluate(() => window.__game.placement?.type === 'wohnhaus'));
    const spot = await page.evaluate(() => {
      const G = window.__game, c = G.client;
      const d = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
      for (let y = d.y - 7; y < d.y + 8; y++) for (let x = d.x - 7; x < d.x + 8; x++) {
        G.renderer.centerOn(x + 1, y + 1);
        const [sx, sy] = G.renderer.toScreen(x + 1, y + 1);
        G.mouse.x = sx; G.mouse.y = sy; G.updatePlacement();
        if (G.placement.valid) return [sx, sy];
      }
      throw new Error('Kein gültiger Wohnhaus-Bauplatz');
    });
    const beforeBuild = await page.evaluate(() => window.__orders.filter((c) => c.c === 'place').length);
    // Abgebrochene Geste muss auch während der Bauplatzsuche ohne Auftrag enden.
    await touch('touchStart', [[1, ...spot]]);
    await touch('touchCancel', []);
    check(`${tag}: Touch-Abbruch erstellt kein Gebäude`, beforeBuild === await page.evaluate(() => window.__orders.filter((c) => c.c === 'place').length));
    await tap(...spot);
    check(`${tag}: Bauplatz-Tap baut noch nicht`, beforeBuild === await page.evaluate(() => window.__orders.filter((c) => c.c === 'place').length));
    await page.locator('[data-touch=place]').tap();
    check(`${tag}: Bestätigen erteilt genau einen Bauauftrag`, beforeBuild + 1 === await page.evaluate(() => window.__orders.filter((c) => c.c === 'place').length));
    await page.locator('[data-touch=home]').tap();
    await page.evaluate(() => { document.querySelector('.resources').scrollLeft = 0; });
    await page.screenshot({ path: `${out}/${tag}.png` });
    const oldBottom = await page.evaluate(() => window.__game.renderer.playBottom);
    await page.locator('[data-act=hud]').tap();
    check(`${tag}: Spielleiste lässt sich für mehr Kartenfläche ausblenden`, oldBottom < await page.evaluate(() => window.__game.renderer.playBottom));
    await page.locator('[data-act=hud]').tap();
    // In laufender Partie drehen; Auswahl, Zentrum und Befehle bleiben nutzbar.
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(200);
    check(`${tag}: Rotation passt Zeichenfläche und Spielfeld an`, await page.evaluate(() => {
      const r = window.__game.renderer;
      return r.vw === innerWidth && r.vh === innerHeight && r.playBottom - r.playTop > 60;
    }));
    await page.locator('[data-act=help]').tap();
    check(`${tag}: Touch-Hilfe erreichbar`, await page.locator('#dialog').getByText('Smartphone & Tablet', { exact: false }).isVisible());
    await page.locator('[data-close]').tap();
    await ctx.close();
  }
  const desktop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  desktop.on('pageerror', (e) => errors.push(e.message));
  await desktop.goto(BASE);
  await desktop.locator('[data-a=sp]').click();
  await desktop.selectOption('[data-f=tut]', '0');
  await desktop.locator('[data-a=go]').click();
  await desktop.waitForFunction(() => window.__game?.client.units.size > 0);
  await desktop.evaluate(() => {
    const G = window.__game, send = G.driver.send.bind(G.driver);
    window.__orders = [];
    G.driver.send = (cmd) => { window.__orders.push(cmd); send(cmd); };
  });
  check('Desktop: Touch-Leiste ausgeblendet', !(await desktop.locator('#touch-controls').isVisible()));
  await desktop.keyboard.press('.');
  check('Desktop: Arbeiter-Tastenkürzel funktioniert', await desktop.evaluate(() => window.__game.selected.size === 1));
  await desktop.keyboard.press('q');
  check('Desktop: Bau-Tastenkürzel funktioniert', await desktop.evaluate(() => window.__game.placement?.type === 'wohnhaus'));
  await desktop.keyboard.press('Escape');
  await desktop.mouse.click(640, 330, { button: 'right' });
  check('Desktop: Rechtsklick bewegt ausgewählten Arbeiter', await desktop.evaluate(() => window.__orders.some((c) => ['smart', 'move'].includes(c.c))));
  await desktop.screenshot({ path: `${out}/desktop-after.png` });
  check('Keine JavaScript-Laufzeitfehler', errors.length === 0);
} finally {
  await browser.close();
}
