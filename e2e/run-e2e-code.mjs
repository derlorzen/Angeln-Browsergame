// Ende-zu-Ende-Test: Mehrspieler mit SPIELCODE und vier Plätzen (Host + zwei Mitspieler in getrennten Chromium-
// Prozessen + eine KI). Die Vermittlung läuft über /api/rooms (Vite-Vorschau oder node server/server.mjs).
// Hinweis: Alle Browser laufen auf einem Rechner – das belegt den Ablauf, nicht die Verbindbarkeit über das Internet.
// Aufruf: BASE_URL=http://localhost:4173/ node e2e/run-e2e-code.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const ARGS = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' – ' + info : ''}`);
};

async function newPlayer(label, url = BASE) {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'x', ice: { mode: 'none', stunUrl: 'stun:stun.l.google.com:19302', turnUrl: '', turnUser: '', turnPass: '' }, tutorialDone: true, renderer: 'auto' }));
  });
  await page.goto(url);
  return { browser, page, errors, label };
}

const H = await newPlayer('Host');
const players = [H];
try {
  // ---------- Host eröffnet ein Spiel und erhält einen Spielcode
  await H.page.click('[data-a=host]');
  await H.page.fill('[data-f=name]', 'Anna');
  await H.page.click('[data-a=make]');
  await H.page.waitForSelector('[data-code]', { timeout: 10000 });
  const shown = (await H.page.textContent('[data-code]')).trim();
  check('Host erhält einen kurzen Spielcode', /^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(shown), shown);
  const code = shown.replace('-', '');

  // ---------- Falscher Code wird verständlich abgelehnt
  const B = await newPlayer('Gast 1');
  players.push(B);
  await B.page.click('[data-a=join]');
  await B.page.fill('[data-f=name]', 'Bert');
  await B.page.fill('[data-f=code]', 'ZZZ-ZZZ');
  await B.page.click('[data-a=join]');
  await B.page.waitForFunction(() => document.querySelector('[data-msg]')?.textContent.length > 5, null, { timeout: 8000 });
  check('Unbekannter Spielcode wird verständlich abgelehnt', /kein offenes Spiel|Code/.test(await B.page.textContent('[data-msg]')), await B.page.textContent('[data-msg]'));

  // ---------- Gast 1 gibt nur den Code ein (klein geschrieben, ohne Bindestrich)
  await B.page.fill('[data-f=code]', code.toLowerCase());
  await B.page.click('[data-a=join]');
  await B.page.waitForSelector('h2:has-text("Lobby")', { timeout: 25000 });
  await H.page.waitForFunction(() => /Bert/.test(document.querySelector('.lobby-table')?.textContent ?? ''), null, { timeout: 15000 });
  check('Gast 1 tritt nur mit dem Spielcode bei', true);

  // ---------- Gast 2 öffnet den Einladungslink
  const C = await newPlayer('Gast 2', `${BASE}?spiel=${code}`);
  players.push(C);
  const pre = await C.page.inputValue('[data-f=code]');
  check('Einladungslink füllt den Spielcode aus', pre.replace('-', '') === code, pre);
  await C.page.fill('[data-f=name]', 'Carla');
  await C.page.click('[data-a=join]');
  await C.page.waitForSelector('h2:has-text("Lobby")', { timeout: 25000 });
  await H.page.waitForFunction(() => /Carla/.test(document.querySelector('.lobby-table')?.textContent ?? ''), null, { timeout: 15000 });
  check('Gast 2 tritt über den Einladungslink bei', true);

  // ---------- Platz 4: KI; beide Gäste wählen die Angeliter (doppelte Partei erlaubt)
  await H.page.selectOption('select[data-seat="3"][data-k="kind"]', 'ai:normal');
  await B.page.waitForFunction(() => /KI/.test((document.querySelector('.lobby-table')?.textContent ?? '')), null, { timeout: 5000 });
  await B.page.selectOption('[data-f=fac]', 'angeln');
  await C.page.selectOption('[data-f=fac]', 'angeln');
  await H.page.selectOption('[data-f=fac]', 'angeln');
  await H.page.waitForTimeout(500);
  // der eigene Name steht im Eingabefeld, daher die Sicht zweier Teilnehmer kombinieren
  const hostText = await H.page.textContent('.lobby-table'), guestText = await C.page.textContent('.lobby-table');
  check('Vier Plätze in der Lobby: Host, zwei Mitspieler, KI', /Anna/.test(guestText) && /Bert/.test(hostText) && /Carla/.test(hostText) && /KI/.test(hostText) && /KI/.test(guestText));
  check('Lobby kündigt die große Karte an', /160 × 160/.test(await H.page.textContent('body')));
  await H.page.selectOption('[data-f=map]', 'danewerk');
  await C.page.waitForFunction(() => /Danewerk/.test(document.body.textContent), null, { timeout: 5000 });
  await B.page.check('[data-f=ready]');
  await C.page.check('[data-f=ready]');
  await H.page.waitForFunction(() => document.querySelectorAll('.lobby-table .ok').length >= 2, null, { timeout: 5000 });
  await H.page.check('[data-f=ready]');
  await H.page.waitForTimeout(300);
  await H.page.screenshot({ path: OUT + 'lobby-code-host.png' });
  await H.page.click('[data-a=start]');
  for (const p of players) await p.page.waitForFunction(() => window.__game?.client?.units?.size > 0, null, { timeout: 15000 });
  check('Partie startet bei allen drei Menschen', true);
  await H.page.waitForTimeout(2000);

  // ---------- Partie mit vier Parteien auf der großen Karte
  const world = await H.page.evaluate(() => {
    const w = window.__game.driver.world;
    return { n: w.players.length, size: w.map.w, facs: w.players.map((p) => p.faction), ai: w.players.map((p) => p.isAI), names: w.players.map((p) => p.name) };
  });
  check('Vier Parteien, Karte 160 × 160', world.n === 4 && world.size === 160, JSON.stringify(world));
  check('Dieselbe Partei mehrfach möglich', world.facs.filter((f) => f === 'angeln').length >= 3, world.facs.join(','));
  check('Platz 4 spielt die KI', world.ai[3] === true && world.ai[1] === false && world.ai[2] === false, JSON.stringify(world.ai));
  for (const [P, id] of [[B, 1], [C, 2]]) {
    const v = await P.page.evaluate(() => {
      const c = window.__game.client;
      return { me: c.me, size: c.map.w, own: [...c.units.values()].filter((u) => u.o === c.me).length, foreign: [...c.units.values()].filter((u) => u.o !== c.me).length };
    });
    check(`${P.label}: eigene Spielernummer, große Karte, nur eigene Einheiten sichtbar`, v.me === id && v.size === 160 && v.own === 5 && v.foreign === 0, JSON.stringify(v));
  }
  // Befehl von Gast 2 kommt beim Host an
  const tgt = await C.page.evaluate(() => {
    const c = window.__game.client;
    const u = [...c.units.values()].find((u) => u.o === c.me && u.t === 'arbeiter');
    window.__game.driver.send({ c: 'move', ids: [u.i], x: u.x + 3, y: u.y + 2 });
    return { id: u.i, x: u.x, y: u.y };
  });
  await H.page.waitForTimeout(2500);
  const moved = await H.page.evaluate((id) => {
    const u = window.__game.driver.world.ents.get(id);
    return { x: u.x, y: u.y, owner: u.owner };
  }, tgt.id);
  check('Befehl von Gast 2 wird beim Host ausgeführt', moved.owner === 2 && Math.hypot(moved.x - tgt.x, moved.y - tgt.y) > 1, JSON.stringify(moved));
  await B.page.screenshot({ path: OUT + 'game-code-guest1.png' });

  // ---------- Gast 1 verlässt die Partie: KI übernimmt, Gast 2 spielt weiter
  await B.page.close();
  await H.page.waitForFunction(() => window.__game.driver.world.players[1].isAI === true, null, { timeout: 25000 });
  const t0 = await C.page.evaluate(() => window.__game.client.tick);
  await C.page.waitForTimeout(1500);
  const t1 = await C.page.evaluate(() => window.__game.client.tick);
  check('Gast 1 geht: KI übernimmt, Gast 2 spielt weiter', t1 > t0, `Takt ${t0} → ${t1}`);
  check('Keine Skriptfehler (Host, Gast 2)', H.errors.length === 0 && C.errors.length === 0, [...H.errors, ...C.errors].join(' | '));
} catch (e) {
  check('Ablauf ohne Ausnahme', false, String(e?.stack ?? e));
  for (const p of players) {
    const st = await p.page.evaluate(() => ({ h2: document.querySelector('h2')?.textContent, st: document.querySelector('[data-st]')?.textContent, msg: document.querySelector('[data-msg]')?.textContent, p: document.querySelector('.menu-box p')?.textContent })).catch(() => null);
    console.log('  Zustand', p.label, JSON.stringify(st));
  }
  const lob = await H.page.evaluate(() => {
    const l = window.__lobby;
    if (!l) return null;
    const ls = (k) => ({ state: k.state, answered: k.answered, dc: k.dc?.readyState, pc: k.pc.connectionState, ice: k.pc.iceConnectionState });
    return { seats: [...l.seats].map(([k, v]) => [k, ls(v)]), pending: [...l.pending].map(([k, v]) => [k, ls(v)]), kinds: l.st.players.map((p) => p.kind + ':' + p.name) };
  }).catch((e) => String(e));
  console.log('  Host-Lobby', JSON.stringify(lob));
  for (const p of players) await p.page.screenshot({ path: OUT + `fail-code-${p.label.replace(/\s/g, '')}.png` }).catch(() => {});
} finally {
  for (const p of players) await p.browser.close().catch(() => {});
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
process.exit(failed.length ? 1 : 0);
