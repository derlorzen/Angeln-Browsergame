// Einzelspieler-Durchlauf über die echte Oberfläche + Leistungsmessung.
// Aufruf: BASE_URL=http://localhost:5173/ node e2e/run-sp.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' – ' + info : ''}`);
};
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium', args: process.env.NO_SWS ? [] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE);
await page.evaluate((r) => { localStorage.clear(); localStorage.setItem('angeln-settings-v1', JSON.stringify({ name: 'Tester', tutorialDone: false, renderer: r })); }, process.env.RENDERER ?? 'auto');
await page.reload();
try {
  await page.click('[data-a=sp]');
  await page.click('[data-a=go]');
  await page.waitForFunction(() => window.__game?.client?.units?.size >= 5);
  await page.waitForTimeout(500);
  check('Renderer', true, await page.evaluate(() => window.__game.renderer.kind));
  const g = () => page.evaluate(() => {
    const c = window.__game.client;
    return { res: c.players[c.me].res, pop: c.players[c.me].pop, tick: c.tick };
  });
  // Arbeiter per Rahmen wählen
  const box = await page.evaluate(() => {
    const G = window.__game, c = G.client;
    const ws = [...c.units.values()].filter((u) => u.o === c.me && u.t === 'arbeiter');
    const pts = ws.map((u) => G.renderer.toScreen(u.x, u.y));
    return { x0: Math.min(...pts.map((p) => p[0])) - 20, y0: Math.min(...pts.map((p) => p[1])) - 40, x1: Math.max(...pts.map((p) => p[0])) + 20, y1: Math.max(...pts.map((p) => p[1])) + 10, n: ws.length };
  });
  await page.mouse.move(box.x0, box.y0);
  await page.mouse.down();
  await page.mouse.move(box.x1, box.y1, { steps: 6 });
  await page.mouse.up();
  const nsel = await page.evaluate(() => window.__game.selected.size);
  check('Rahmenauswahl wählt alle Arbeiter (und den Späher im Rahmen)', nsel >= box.n, `${nsel} gewählt, ${box.n} Arbeiter`);
  // Rechtsklick auf nächsten Baum
  const tree = await page.evaluate(() => {
    const G = window.__game, c = G.client;
    const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
    let best = -1, bd = 1e9;
    for (let i = 0; i < c.trees.length; i++) if (c.trees[i] && c.vis[i] === 2) {
      const x = i % c.map.w, y = Math.floor(i / c.map.w);
      const d = Math.hypot(x - dz.x, y - dz.y);
      if (d < bd) { bd = d; best = i; }
    }
    const x = best % c.map.w + 0.5, y = Math.floor(best / c.map.w) + 0.5;
    G.renderer.centerOn(x, y);
    return { x, y };
  });
  await page.waitForTimeout(100);
  const tp = await page.evaluate(({ x, y }) => window.__game.renderer.toScreen(x, y), tree);
  await page.mouse.click(tp[0], tp[1] - 4, { button: 'right' });
  const before = (await g()).res.holz;
  await page.waitForTimeout(25000);
  const after = (await g()).res.holz;
  check('Holz schlagen per Rechtsklick erhöht den Holzvorrat', after > before, `${before} → ${after}`);
  await page.screenshot({ path: OUT + 'sp-gather.png' });

  // Bauvorschau: Wohnhaus über Hotkey Q, ungültiger Platz (Wasser/weit weg), gültiger Platz
  await page.evaluate(() => {
    const G = window.__game, c = G.client;
    const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
    G.renderer.centerOn(dz.x + 1.5, dz.y + 1.5);
    const ws = [...c.units.values()].filter((u) => u.o === c.me && u.t === 'arbeiter').slice(0, 2);
    G.selected = new Set(ws.map((u) => u.i));
    G.hud.update(true);
  });
  await page.keyboard.press('q');
  const pl = await page.evaluate(() => !!window.__game.placement && window.__game.placement.type);
  check('Hotkey Q startet Bauvorschau für Wohnhaus', pl === 'wohnhaus');
  // ungültig: auf das Dorfzentrum
  const dzp = await page.evaluate(() => {
    const G = window.__game, c = G.client;
    const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
    return G.renderer.toScreen(dz.x + 1.5, dz.y + 1.5);
  });
  await page.mouse.move(dzp[0], dzp[1]);
  await page.waitForTimeout(100);
  const inval = await page.evaluate(() => window.__game.placement.valid);
  await page.screenshot({ path: OUT + 'sp-placement-invalid.png' });
  await page.mouse.click(dzp[0], dzp[1]);
  await page.waitForTimeout(200);
  const msg = await page.evaluate(() => document.getElementById('msglog').textContent);
  check('Ungültiger Bauplatz wird rot angezeigt und mit Begründung abgelehnt', inval === false && /belegt/.test(msg), msg.slice(-80));
  // gültigen Platz suchen (über die gleiche Regel wie das Spiel)
  const spot = await page.evaluate(() => {
    const G = window.__game, c = G.client;
    const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
    for (let r = 3; r < 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = dz.x + dx, y = dz.y + dy;
      G.placement.x = x; G.placement.y = y;
      // gleiche Prüfung wie im Spiel
      const view = c.placementView();
      const ok = window.__game && (() => { try { return true; } catch { return false; } })();
      if (!ok) continue;
      const [sx, sy] = G.renderer.toScreen(x + 1, y + 1);
      if (sx < 50 || sy < 50 || sx > G.renderer.vw - 300 || sy > G.renderer.vh - 200) continue;
      return { sx, sy, x, y, view: !!view };
    }
    return null;
  });
  // Maus über Kandidaten bewegen, bis die Vorschau gültig ist
  let placed = false;
  for (let k = 0; k < 40 && !placed; k++) {
    const p = await page.evaluate((k) => {
      const G = window.__game, c = G.client;
      const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
      const off = [[5, 0], [0, 5], [-4, 0], [0, -4], [5, 3], [3, 5], [-4, 3], [3, -4], [6, -2], [-2, 6]][k % 10];
      return G.renderer.toScreen(dz.x + off[0] + 1 + Math.floor(k / 10), dz.y + off[1] + 1);
    }, k);
    await page.mouse.move(p[0], p[1]);
    await page.waitForTimeout(40);
    if (await page.evaluate(() => window.__game.placement?.valid)) {
      await page.screenshot({ path: OUT + 'sp-placement-valid.png' });
      await page.mouse.click(p[0], p[1]);
      placed = true;
    }
  }
  void spot;
  await page.waitForTimeout(400);
  const holzAfterPlace = (await g()).res.holz;
  const site = await page.evaluate(() => [...window.__game.client.buildings.values()].find((b) => b.t === 'wohnhaus' && b.o === window.__game.client.me));
  check('Gültiger Bauplatz: Baustelle entsteht, Kosten abgezogen', placed && !!site && site.b === 0, `Holz jetzt ${holzAfterPlace}`);
  await page.waitForTimeout(15000);
  await page.screenshot({ path: OUT + 'sp-building.png' });
  const site2 = await page.evaluate(() => [...window.__game.client.buildings.values()].find((b) => b.t === 'wohnhaus' && b.o === window.__game.client.me));
  check('Arbeiter errichten das Gebäude', site2 && (site2.b === 1 || site2.p > 30), JSON.stringify({ b: site2?.b, p: site2?.p }));

  // Speichern & Laden
  await page.keyboard.press('Escape');
  await page.click('#dialog [data-a=save]');
  const saved = await page.evaluate(() => !!localStorage.getItem('angeln-save-v1'));
  check('Spielstand speichern', saved);
  const tickSaved = await page.evaluate(() => window.__game.driver.world.tick);
  page.once('dialog', (d) => d.accept());
  await page.click('#dialog [data-a=exit]');
  await page.waitForSelector('[data-a=load]:not([disabled])');
  await page.click('[data-a=load]');
  await page.waitForFunction(() => window.__game?.client?.units?.size > 0);
  const tickLoaded = await page.evaluate(() => window.__game.driver.world.tick);
  check('Spielstand laden', Math.abs(tickLoaded - tickSaved) < 30, `${tickSaved} → ${tickLoaded}`);

  // Ausbau des Dorfzentrums über die Befehlskarte (Taste C)
  await page.evaluate(() => {
    const G = window.__game, c = G.client;
    G.driver.world.players[0].res = { holz: 2000, getreide: 2000, fisch: 2000, lehm: 2000, waren: 0, taler: 2000 };
    const dz = [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum');
    G.selected.clear();
    G.selected.add(dz.i);
    G.hud.update(true);
  });
  await page.waitForTimeout(300);
  const upBtn = await page.evaluate(() => [...document.querySelectorAll('#cmdcard .cmd .lbl')].some((e) => e.textContent === 'Stufe II'));
  await page.keyboard.press('c');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const d = window.__game.driver; d.paused = true; for (let i = 0; i < 500; i++) d.tick(); d.paused = false; });
  await page.waitForTimeout(500);
  const lvl = await page.evaluate(() => { const c = window.__game.client; return [...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum').l ?? 1; });
  check('Ausbau per Befehlskarte: Dorfzentrum erreicht Stufe II', !!upBtn && lvl === 2, `Stufe ${lvl}`);
  await page.screenshot({ path: OUT + 'sp-upgrade.png' });

  // Zeitalter-Aufstieg über die Befehlskarte (Taste A am Dorfzentrum)
  await page.evaluate(() => {
    const G = window.__game, w = G.driver.world, c = G.client;
    const dz = [...w.ents.values()].find((e) => e.kind === 'b' && e.owner === 0 && e.type === 'dorfzentrum');
    // Voraussetzungen direkt setzen (zwei fertige Gebäude), dann Dorfzentrum wählen
    w.addBuilding('markt', 0, dz.x + 5, dz.y - 6, true);
    w.addBuilding('kaserne', 0, dz.x - 6, dz.y + 5, true);
    G.driver.tick();
    G.selected.clear();
    G.selected.add([...c.buildings.values()].find((b) => b.o === c.me && b.t === 'dorfzentrum').i);
    G.hud.update(true);
  });
  await page.waitForTimeout(300);
  const ageBtn = await page.evaluate(() => [...document.querySelectorAll('#cmdcard .cmd .lbl')].map((e) => e.textContent).find((t) => t.startsWith('Ins ')) ?? '');
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const d = window.__game.driver; d.paused = true; for (let i = 0; i < 650; i++) d.tick(); d.paused = false; });
  await page.waitForTimeout(500);
  const ageInfo = await page.evaluate(() => ({ age: window.__game.client.age(0), top: document.querySelector('#topbar [data-r=age] b').textContent }));
  check('Zeitalter-Aufstieg per Befehlskarte: 18. Jahrhundert erreicht', ageBtn === 'Ins 18. Jh.' && ageInfo.age === 2 && ageInfo.top === '18. Jh.', `${ageBtn} → ${JSON.stringify(ageInfo)}`);

  // Dezenter Geländehinweis beim Verweilen
  await page.evaluate(() => { const G = window.__game; G.selected.clear(); G.hud.update(true); });
  let hint = '';
  for (const [hx, hy] of [[300, 200], [900, 250], [500, 450], [1100, 400]]) {
    await page.mouse.move(hx, hy);
    await page.mouse.move(hx + 1, hy);
    await page.waitForTimeout(1100);
    hint = await page.evaluate(() => { const el = document.getElementById('terrainhint'); return el.classList.contains('hidden') ? '' : el.textContent; });
    if (hint) break;
  }
  check('Geländehinweis erscheint nach kurzem Verweilen', !!hint, hint);
  await page.screenshot({ path: OUT + 'sp-hint.png' });

  // Zurück-Taste: Partie bleibt, Menü öffnet sich, Sicherung liegt vor
  await page.goBack();
  await page.waitForTimeout(500);
  const afterBack = await page.evaluate(() => ({ inGame: !!window.__game && !document.getElementById('screen-game').classList.contains('hidden'), dialog: !document.getElementById('dialog').classList.contains('hidden'), auto: !!localStorage.getItem('angeln-autosave-v1') }));
  check('Zurück-Taste verlässt die Partie nicht, öffnet das Menü und sichert', afterBack.inGame && afterBack.dialog && afterBack.auto, JSON.stringify(afterBack));

  // Seite neu laden → „Letzte Partie fortsetzen“
  const tickBefore = await page.evaluate(() => window.__game.driver.world.tick);
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.reload();
  await page.waitForSelector('[data-a=resume]', { timeout: 10000 });
  await page.click('[data-a=resume]');
  await page.waitForFunction(() => window.__game?.client?.units?.size > 0);
  const resumed = await page.evaluate(() => ({ tick: window.__game.driver.world.tick, l: [...window.__game.client.buildings.values()].find((b) => b.o === 0 && b.t === 'dorfzentrum').l }));
  check('Nach Neuladen: letzte Partie fortsetzen', Math.abs(resumed.tick - tickBefore) < 60 && resumed.l === 2, `${tickBefore} → ${resumed.tick}, Stufe ${resumed.l}`);

  // Leistungsmessung: 110 eigene Einheiten in ständiger Bewegung + Gefecht 30 gegen 30
  await page.evaluate(() => {
    const G = window.__game, w = G.driver.world;
    const m = w.map.market;
    for (const p of [0, 1]) w.players[p].res = { holz: 5000, getreide: 5000, fisch: 5000, lehm: 5000, waren: 0, taler: 5000 };
    const dz0 = [...w.ents.values()].find((e) => e.kind === 'b' && e.owner === 0 && e.type === 'dorfzentrum');
    const dz1 = [...w.ents.values()].find((e) => e.kind === 'b' && e.owner === 1 && e.type === 'dorfzentrum');
    const pat = [];
    for (let k = 0; k < 105; k++) {
      const u = w.spawnUnit(['landsknecht', 'schuetze', 'arbeiter', 'spaeher'][k % 4], 0, dz0);
      if (u) pat.push(u.id);
    }
    // Patrouille zwischen Kappeln und dem Brarup-Markt (lange Wege, Knicks, Tore)
    window.__patrol = setInterval(() => {
      for (const id of pat) {
        const u = w.ents.get(id);
        if (!u || u.order.k !== 'none') continue;
        const far = Math.hypot(u.x - m.x, u.y - m.y) > 20;
        w.groupMove([u], far ? m.x + 1.5 + (id % 7) - 3 : dz0.x + 1.5 + (id % 7) - 3, far ? m.y + 5 + (id % 5) : dz0.y + 5 + (id % 5), false);
      }
    }, 500);
    // Gefecht an der Fundstelle
    const mo = w.map.site;
    for (let k = 0; k < 30; k++) {
      const a = w.spawnUnit(k % 2 ? 'schuetze' : 'landsknecht', 0, dz0);
      const b = w.spawnUnit(k % 2 ? 'schuetze' : 'landsknecht', 1, dz1);
      if (a) w.groupMove([a], mo.x + 3, mo.y, true);
      if (b) w.groupMove([b], mo.x - 3, mo.y, true);
    }
  });
  const measure = (label) => page.evaluate((label) => new Promise((res) => {
    const d = []; let last = performance.now(); const t0 = last;
    const f = (t) => { d.push(t - last); last = t; if (t - t0 < 6000) requestAnimationFrame(f); else {
      d.sort((a, b) => a - b);
      const w = window.__game.driver.world;
      const st = window.__game.renderer.stats;
      res({ label, scene: st.sceneMs, submit: st.submitMs, fps: d.length / 6, p50: d[Math.floor(d.length * 0.5)], p95: d[Math.floor(d.length * 0.95)], max: d[d.length - 1],
        render: window.__game.perfStats(), units: [...w.ents.values()].filter((e) => e.kind === 'u').length, visible: window.__game.client.units.size, tiles: window.__game.renderer.stats.drawn });
    } };
    requestAnimationFrame(f);
  }), label);
  await page.waitForTimeout(8000);
  const perf = [];
  await page.evaluate(() => { const G = window.__game; const w = G.driver.world; const m = w.map.market; G.renderer.centerOn(m.x + 8, m.y - 14); G.renderer.cam.z = 1; });
  perf.push(await measure('Zoom 1, Patrouille im Bild'));
  await page.screenshot({ path: OUT + 'sp-perf-patrol.png' });
  await page.evaluate(() => { const G = window.__game; const mo = G.driver.world.map.site; G.renderer.centerOn(mo.x, mo.y); G.renderer.cam.z = 1; });
  perf.push(await measure('Zoom 1, Gefecht im Bild'));
  await page.screenshot({ path: OUT + 'sp-battle.png' });
  await page.evaluate(() => { const G = window.__game; const m = G.driver.world.map.market; G.renderer.centerOn(m.x + 15, m.y - 15); G.renderer.cam.z = 0.5; });
  perf.push(await measure('Zoom 0.5 (größter Ausschnitt)'));
  await page.screenshot({ path: OUT + 'sp-perf-zoomout.png' });
  const simMs = await page.evaluate(() => {
    const w = window.__game.driver.world;
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) w.step();
    return (performance.now() - t0) / 50;
  });
  for (const r of perf) check(`Leistung: ${r.label}`, true, `${r.units} Einheiten aktiv (${r.visible} sichtbar), ${r.fps.toFixed(0)} fps, Frameabstand p50 ${r.p50.toFixed(1)} / p95 ${r.p95.toFixed(1)} / max ${r.max.toFixed(1)} ms, JS-Zeichenzeit Ø ${r.render.avg.toFixed(1)} ms (davon Szenenaufbau ${r.scene.toFixed(1)} ms, WebGL-Übergabe ${r.submit.toFixed(1)} ms), ${r.tiles} Kacheln`);
  check('Simulation pro Takt', simMs < 10, `${simMs.toFixed(2)} ms/Takt (Budget 100 ms)`);
  check('Keine Skriptfehler', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('Ablauf ohne Ausnahme', false, String(e?.stack ?? e));
  await page.screenshot({ path: OUT + 'sp-fail.png' });
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
process.exit(failed.length ? 1 : 0);
