// Ende-zu-Ende-Test des Mehrspielermodus mit ZWEI getrennten Chromium-Prozessen auf demselben Rechner.
// Hinweis: Das belegt den Ablauf (Codes, Lobby, Synchronisation, Abbruch), NICHT die Verbindbarkeit über das Internet.
// Aufruf: BASE_URL=http://localhost:5173/ node e2e/run-e2e.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const EXE = process.env.CHROME ?? '/opt/pw-browsers/chromium';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
// mDNS-Verschleierung lokaler Adressen abschalten, sonst können zwei Prozesse auf einem Rechner einander nicht auflösen
const ARGS = ['--disable-features=WebRtcHideLocalIpsWithMdns', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' – ' + info : ''}`);
};

async function newPlayer(label) {
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE);
  // ICE-Modus „ohne ICE-Dienste“ (kein externer STUN nötig, Test läuft lokal)
  await page.evaluate(() => {
    localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'x', ice: { mode: 'none', stunUrl: 'stun:stun.l.google.com:19302', turnUrl: '', turnUser: '', turnPass: '' }, tutorialDone: true, renderer: 'auto' }));
  });
  await page.reload();
  return { browser, page, errors, label };
}

const A = await newPlayer('Host');
const B = await newPlayer('Gast');
try {
  // ---------- Einladung
  await A.page.click('[data-a=host]');
  await A.page.fill('[data-f=name]', 'Anna');
  await A.page.click('[data-a=make]');
  await A.page.waitForFunction(() => document.querySelector('[data-f=offer]')?.value.length > 50, null, { timeout: 15000 });
  const offer = await A.page.inputValue('[data-f=offer]');
  check('Einladungscode erzeugt', offer.startsWith('ANGELN-EINLADUNG-1'), `${offer.length} Zeichen`);

  // ---------- Fehlerfälle beim Beitreten
  await B.page.click('[data-a=join]');
  await B.page.fill('[data-f=name]', 'Bert');
  await B.page.fill('[data-f=offer]', 'Unsinn123');
  await B.page.click('[data-a=answer]');
  await B.page.waitForTimeout(300);
  const err1 = await B.page.textContent('[data-msg]');
  check('Ungültiger Code wird verständlich abgelehnt', /kein gültiger Code/.test(err1), err1);
  await B.page.fill('[data-f=offer]', offer.slice(0, offer.length - 40));
  await B.page.click('[data-a=answer]');
  await B.page.waitForTimeout(500);
  const err2 = await B.page.textContent('[data-msg]');
  check('Abgeschnittener Code wird abgelehnt', /beschädigt|unvollständig|ungültig/.test(err2), err2);

  // ---------- Antwort
  await B.page.fill('[data-f=offer]', offer);
  await B.page.click('[data-a=answer]');
  await B.page.waitForFunction(() => document.querySelector('[data-f=ans]')?.value.length > 50, null, { timeout: 15000 });
  const answer = await B.page.inputValue('[data-f=ans]');
  check('Antwortcode erzeugt', answer.startsWith('ANGELN-ANTWORT-1'), `${answer.length} Zeichen`);
  // doppelte Erzeugung für dieselbe Einladung
  await B.page.click('[data-a=answer]');
  await B.page.waitForTimeout(200);
  check('Doppelte Antworterzeugung wird abgefangen', /bereits ein Antwortcode/.test(await B.page.textContent('[data-msg]')));

  // Einladungscode statt Antwort beim Host
  await A.page.fill('[data-f=answer]', offer);
  await A.page.click('[data-a=connect]');
  await A.page.waitForTimeout(300);
  check('Host erkennt vertauschten Code', /Einladungscode/.test(await A.page.textContent('[data-msg]')));

  await A.page.fill('[data-f=answer]', answer);
  await A.page.click('[data-a=connect]');
  // ---------- Lobby
  await A.page.waitForSelector('h2:has-text("Lobby")', { timeout: 20000 });
  await B.page.waitForSelector('h2:has-text("Lobby")', { timeout: 20000 });
  check('DataChannel offen, gemeinsame Lobby auf beiden Seiten', true);
  await B.page.waitForSelector('text=Anna', { timeout: 5000 });
  await A.page.waitForSelector('text=Bert', { timeout: 5000 });
  check('Namen werden in der Lobby ausgetauscht', true);
  // Start ohne Bereitschaft verweigert
  await A.page.click('[data-a=start]');
  await A.page.waitForTimeout(200);
  check('Start ohne Bereitschaft verweigert', /bereit/.test(await A.page.textContent('[data-msg]')));
  await B.page.check('[data-f=ready]');
  await A.page.waitForSelector('.lobby-table .ok', { timeout: 5000 });
  await A.page.check('[data-f=ready]');
  await A.page.waitForTimeout(300);
  await A.page.screenshot({ path: OUT + 'lobby-host.png' });
  await A.page.click('[data-a=start]');
  await A.page.waitForFunction(() => window.__game?.client?.units?.size > 0, null, { timeout: 10000 });
  await B.page.waitForFunction(() => window.__game?.client?.units?.size > 0, null, { timeout: 10000 });
  check('Partie startet auf beiden Seiten', true);
  await A.page.waitForTimeout(1500);

  // ---------- Synchronisation
  const info = await B.page.evaluate(() => {
    const g = window.__game;
    const c = g.client;
    const own = [...c.units.values()].filter((u) => u.o === c.me);
    const foreign = [...c.units.values()].filter((u) => u.o !== c.me);
    return { me: c.me, own: own.length, foreign: foreign.length, res: c.players[c.me].res, enemyRes: c.players[0].res ?? null, tick: c.tick };
  });
  check('Gast sieht eigene Einheiten', info.own === 5, JSON.stringify(info));
  check('Gast erhält keine verborgenen gegnerischen Einheiten', info.foreign === 0);
  check('Gast erhält keine gegnerischen Ressourcen', info.enemyRes === null);
  const hostTick = await A.page.evaluate(() => window.__game.driver.world.tick);
  check('Gast folgt dem Host-Takt', Math.abs(hostTick - info.tick) < 15, `Host ${hostTick}, Gast ${info.tick}`);

  // Gast steuert über die echte Oberfläche: Arbeiter auswählen und per Rechtsklick bewegen
  const target = await B.page.evaluate(() => {
    const g = window.__game;
    const c = g.client;
    const u = [...c.units.values()].find((u) => u.o === c.me && u.t === 'arbeiter');
    const [sx, sy] = g.renderer.toScreen(u.x, u.y);
    const [tx, ty] = g.renderer.toScreen(u.x - 3, u.y + 1);
    return { id: u.i, sx, sy, tx, ty, x0: u.x, y0: u.y };
  });
  const pickInfo = await B.page.evaluate(({ sx, sy }) => {
    const el = document.elementFromPoint(sx, sy);
    return { pick: window.__game.renderer.pick(sx, sy, performance.now()), el: el?.id || el?.className || el?.tagName };
  }, { sx: target.sx, sy: target.sy - 12 });
  check('Klickpunkt liegt auf der eigenen Einheit im Bild', pickInfo.pick === target.id && pickInfo.el === 'view', JSON.stringify(pickInfo));
  await B.page.mouse.click(target.sx, target.sy - 12);
  await B.page.waitForTimeout(150);
  const sel = await B.page.evaluate(() => [...window.__game.selected]);
  check('Gast kann eigene Einheit per Linksklick wählen', sel.includes(target.id), JSON.stringify(sel));
  await B.page.mouse.click(target.tx, target.ty, { button: 'right' });
  await A.page.waitForTimeout(2500);
  const moved = await A.page.evaluate((id) => {
    const u = window.__game.driver.world.ents.get(id);
    return { x: u.x, y: u.y, order: u.order.k };
  }, target.id);
  check('Gast-Befehl wird beim Host ausgeführt', Math.hypot(moved.x - target.x0, moved.y - target.y0) > 1, JSON.stringify(moved));
  const guestView = await B.page.evaluate((id) => {
    const u = window.__game.client.units.get(id);
    return { x: u.x, y: u.y };
  }, target.id);
  check('Gast sieht die Bewegung (Zustandsabgleich)', Math.hypot(guestView.x - moved.x, guestView.y - moved.y) < 1.5, JSON.stringify(guestView));

  // ---------- Manipulationsversuche des Gastes
  const hostUnit = await A.page.evaluate(() => {
    const w = window.__game.driver.world;
    const u = [...w.ents.values()].find((e) => e.kind === 'u' && e.owner === 0);
    const dz1 = [...w.ents.values()].find((e) => e.kind === 'b' && e.owner === 1 && e.type === 'dorfzentrum');
    return { id: u.id, x: u.x, y: u.y, res1: { ...w.players[1].res }, dz1: dz1.id, q: dz1.queue.length };
  });
  await B.page.evaluate(({ id, dz1 }) => {
    const link = window.__game.driver.link;
    link.send({ t: 'cmd', s: 100000, c: { c: 'move', ids: [id], x: 5, y: 5 } }); // fremde Einheit
    link.send({ t: 'cmd', s: 100001, c: { c: 'setRes', res: { taler: 99999 } } }); // erfundener Befehl
    link.send({ t: 'snap', s: { ents: [], hid: [], gone: [], trees: [], ev: [], players: [] } }); // Gast schickt Zustand
    link.send({ t: 'cmd', s: 100002, c: { c: 'train', b: dz1, u: 'arbeiter' } });
    link.send({ t: 'cmd', s: 100002, c: { c: 'train', b: dz1, u: 'arbeiter' } }); // doppelte Sequenznummer
    link.send({ t: 'cmd', s: 99999, c: { c: 'train', b: dz1, u: 'arbeiter' } }); // veraltete Sequenznummer
    link.send({ garbage: true });
    link.dc.send('kein json {');
  }, hostUnit);
  await A.page.waitForTimeout(1500);
  const after = await A.page.evaluate(({ id, dz1 }) => {
    const w = window.__game.driver.world;
    const u = w.ents.get(id);
    const d = w.ents.get(dz1);
    return { x: u.x, y: u.y, res1: { ...w.players[1].res }, q: d.queue.length, trained: w.players[1].stats.trained };
  }, hostUnit);
  check('Gast kann fremde Einheiten nicht steuern', Math.hypot(after.x - hostUnit.x, after.y - hostUnit.y) < 2.5, JSON.stringify(after));
  check('Erfundene Befehle erhöhen keine Ressourcen', after.res1.taler <= hostUnit.res1.taler);
  check('Doppelte/veraltete Befehle werden nur einmal ausgeführt', hostUnit.res1.getreide - after.res1.getreide === 40, `Getreide ${hostUnit.res1.getreide} → ${after.res1.getreide}`);
  check('Host läuft trotz Müllnachrichten weiter', (await A.page.evaluate(() => window.__game.driver.world.tick)) > hostTick);

  await A.page.screenshot({ path: OUT + 'game-host.png' });
  await B.page.screenshot({ path: OUT + 'game-guest.png' });

  // ---------- Verbindungsabbruch: Host schließt die Seite
  await A.page.close();
  await B.page.waitForSelector('#dialog h2:has-text("Verbindung beendet")', { timeout: 20000 });
  const msg = await B.page.textContent('#dialog');
  check('Gast erhält verständliche Meldung, wenn der Host geht', /Host|Verbindung/.test(msg), msg.replace(/\s+/g, ' ').slice(0, 160));
  await B.page.screenshot({ path: OUT + 'guest-disconnect.png' });
  check('Keine Skriptfehler (Host)', A.errors.length === 0, A.errors.join(' | '));
  check('Keine Skriptfehler (Gast)', B.errors.length === 0, B.errors.join(' | '));
} catch (e) {
  check('Ablauf ohne Ausnahme', false, String(e?.stack ?? e));
  await A.page.screenshot({ path: OUT + 'fail-host.png' }).catch(() => {});
  await B.page.screenshot({ path: OUT + 'fail-guest.png' }).catch(() => {});
} finally {
  await A.browser.close();
  await B.browser.close();
}

// ---------- Zweiter Durchlauf: Gast verlässt die Partie -> KI übernimmt beim Host
{
  const H = await newPlayer('Host2');
  const G = await newPlayer('Gast2');
  try {
    await H.page.click('[data-a=host]');
    await H.page.click('[data-a=make]');
    await H.page.waitForFunction(() => document.querySelector('[data-f=offer]')?.value.length > 50);
    const off = await H.page.inputValue('[data-f=offer]');
    await G.page.click('[data-a=join]');
    await G.page.fill('[data-f=offer]', off);
    await G.page.click('[data-a=answer]');
    await G.page.waitForFunction(() => document.querySelector('[data-f=ans]')?.value.length > 50);
    const ans = await G.page.inputValue('[data-f=ans]');
    // Neue Einladung erzeugen, dann die alte Antwort einfügen -> muss als veraltet erkannt werden
    await H.page.click('[data-a=make2]');
    await H.page.waitForFunction((o) => document.querySelector('[data-f=offer]')?.value.length > 50 && document.querySelector('[data-f=offer]').value !== o, off);
    await H.page.fill('[data-f=answer]', ans);
    await H.page.click('[data-a=connect]');
    await H.page.waitForTimeout(400);
    check('Antwort auf veraltete Einladung wird abgelehnt', /anderen \(älteren\) Einladung/.test(await H.page.textContent('[data-msg]')));
    // korrekter Ablauf mit neuer Einladung
    const off2 = await H.page.inputValue('[data-f=offer]');
    await G.page.fill('[data-f=offer]', off2);
    await G.page.click('[data-a=answer]');
    await G.page.waitForFunction((a) => document.querySelector('[data-f=ans]')?.value.length > 50 && document.querySelector('[data-f=ans]').value !== a, ans);
    const ans2 = await G.page.inputValue('[data-f=ans]');
    await H.page.fill('[data-f=answer]', ans2);
    await H.page.click('[data-a=connect]');
    await H.page.waitForSelector('h2:has-text("Lobby")', { timeout: 20000 });
    await G.page.waitForSelector('h2:has-text("Lobby")', { timeout: 20000 });
    check('Erneuter Verbindungsaufbau nach neuer Einladung', true);
    await G.page.check('[data-f=ready]');
    await H.page.waitForSelector('.lobby-table .ok');
    await H.page.check('[data-f=ready]');
    await H.page.click('[data-a=start]');
    await G.page.waitForFunction(() => window.__game?.client?.units?.size > 0, null, { timeout: 10000 });
    await H.page.waitForTimeout(1000);
    await G.page.close();
    await H.page.waitForFunction(() => window.__game.driver.guestGone === true, null, { timeout: 25000 });
    const ai = await H.page.evaluate(() => window.__game.driver.world.players[1].isAI);
    check('Gast verlässt Partie: Host erhält Meldung, KI übernimmt', ai === true);
    await H.page.screenshot({ path: OUT + 'host-guest-left.png' });
  } catch (e) {
    check('Zweiter Durchlauf ohne Ausnahme', false, String(e?.stack ?? e));
    await H.page.screenshot({ path: OUT + 'fail2-host.png' }).catch(() => {});
  } finally {
    await H.browser.close();
    await G.browser.close();
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
process.exit(failed.length ? 1 : 0);
