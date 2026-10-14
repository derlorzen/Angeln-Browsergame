import { describe, expect, test } from 'vitest';
import { AI } from '../src/ai/ai';
import { RULES } from '../src/data/defs';
import { T, isWater } from '../src/sim/map';
import { findPath } from '../src/sim/path';
import { checkPlacement } from '../src/sim/rules';
import type { Building, Unit } from '../src/sim/types';
import { World } from '../src/sim/world';

function mkWorld(seed = 777, rich = true): World {
  return new World({
    seed,
    players: [
      { name: 'A', color: 0, slot: 0, isAI: false },
      { name: 'B', color: 1, slot: 1, isAI: false },
    ],
    richStart: rich,
  });
}
const run = (w: World, secs: number) => {
  for (let i = 0; i < secs * RULES.tickRate; i++) w.step();
};
const units = (w: World, p: number, t?: string) =>
  [...w.ents.values()].filter((e): e is Unit => e.kind === 'u' && e.owner === p && (!t || e.type === t));
const blds = (w: World, p: number, t?: string) =>
  [...w.ents.values()].filter((e): e is Building => e.kind === 'b' && e.owner === p && (!t || e.type === t));
const dz = (w: World, p: number) => blds(w, p, 'dorfzentrum')[0];

/** Bauplatz für Typ t nahe dem Dorfzentrum suchen (für Tests). */
function spot(w: World, p: number, t: Parameters<typeof checkPlacement>[1]): { x: number; y: number } {
  const d = dz(w, p);
  const v = w.placementView(p);
  for (let r = 2; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = d.x + dx, y = d.y + dy;
        if (!checkPlacement(v, t, x, y)) return { x, y };
      }
  throw new Error('kein Platz für ' + t);
}
function build(w: World, p: number, t: Parameters<typeof checkPlacement>[1], workers: Unit[]): Building {
  const s = spot(w, p, t);
  w.queueCommand(p, { c: 'place', ids: workers.map((u) => u.id), b: t, x: s.x, y: s.y });
  w.step();
  const b = blds(w, p, t).find((b) => b.x === s.x && b.y === s.y);
  if (!b) throw new Error('nicht platziert: ' + JSON.stringify(w.events));
  return b;
}

describe('Karte', () => {
  test('deterministisch und alle wichtigen Orte verbunden', () => {
    const a = mkWorld(42), b = mkWorld(42);
    expect(Array.from(a.map.terrain)).toEqual(Array.from(b.map.terrain));
    for (const seed of [1, 42, 777, 9001, 123456]) {
      const w = mkWorld(seed);
      const N = w.map.w * w.map.h;
      const seen = new Uint8Array(N);
      const s0 = w.idx(w.map.slots[0].x + 1, w.map.slots[0].y + 4);
      const start = w.grid.pass[s0] ? s0 : (() => { throw new Error('start blockiert'); })();
      const q = [start];
      seen[start] = 1;
      while (q.length) {
        const c = q.pop()!;
        const x = c % w.map.w, y = Math.floor(c / w.map.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!w.inMap(nx, ny)) continue;
          const ni = w.idx(nx, ny);
          if (!seen[ni] && w.grid.pass[ni]) {
            seen[ni] = 1;
            q.push(ni);
          }
        }
      }
      const reach = (x: number, y: number) => {
        for (let dy = -2; dy <= 4; dy++) for (let dx = -2; dx <= 4; dx++) if (w.inMap(x + dx, y + dy) && seen[w.idx(x + dx, y + dy)]) return true;
        return false;
      };
      expect(reach(w.map.slots[1].x, w.map.slots[1].y), `seed ${seed}: Arnis`).toBe(true);
      expect(reach(w.map.market.x, w.map.market.y), `seed ${seed}: Markt`).toBe(true);
      expect(reach(w.map.site.x - 1, w.map.site.y - 1), `seed ${seed}: Moor`).toBe(true);
      // Schlei, Knicks, Lehm und Ufer existieren
      let water = 0, knick = 0, lehm = 0, ufer = 0, tor = 0;
      for (const t of w.map.terrain) {
        if (isWater(t)) water++;
        if (t === T.KNICK) knick++;
        if (t === T.LEHM) lehm++;
        if (t === T.UFER) ufer++;
        if (t === T.TOR) tor++;
      }
      expect(water).toBeGreaterThan(800);
      expect(knick).toBeGreaterThan(100);
      expect(lehm).toBeGreaterThan(10);
      expect(ufer).toBeGreaterThan(50);
      expect(tor).toBeGreaterThan(0);
    }
  });
});

describe('Wirtschaft', () => {
  test('Holz schlagen und abliefern', () => {
    const w = mkWorld(777, false);
    const ws = units(w, 0, 'arbeiter');
    const d = dz(w, 0);
    let tree = -1, best = Infinity;
    for (let i = 0; i < w.map.trees.length; i++)
      if (w.map.trees[i]) {
        const x = i % w.map.w, y = Math.floor(i / w.map.w);
        const dd = Math.hypot(x - d.x, y - d.y);
        if (dd < best) {
          best = dd;
          tree = i;
        }
      }
    const before = w.players[0].res.holz;
    w.queueCommand(0, { c: 'gather', ids: ws.map((u) => u.id), x: (tree % w.map.w) + 0.5, y: Math.floor(tree / w.map.w) + 0.5 });
    run(w, 90);
    expect(w.players[0].res.holz).toBeGreaterThan(before + 30);
    expect(w.players[0].stats.gathered.holz).toBeGreaterThan(30);
  });

  test('Produktionskette: Hof → Getreide → Mühle → Waren → Markt → Taler + Prestige', () => {
    const w = mkWorld(777, true);
    const ws = units(w, 0, 'arbeiter');
    const res = w.players[0].res;
    const holz0 = res.holz, lehm0 = res.lehm;
    const farm = build(w, 0, 'bauernhof', ws.slice(0, 3));
    expect(res.holz).toBe(holz0 - 60);
    expect(res.lehm).toBe(lehm0 - 20);
    expect(farm.built).toBe(false);
    const g0 = res.getreide;
    run(w, 5);
    expect(res.getreide).toBe(g0); // produziert vor Fertigstellung nichts
    run(w, 30);
    expect(farm.built).toBe(true);
    expect(farm.fields.length).toBeGreaterThanOrEqual(3);
    // Arbeiter wechseln nach dem Bau automatisch in den Hof
    run(w, 20);
    expect(farm.staff.length).toBe(3);
    expect(res.getreide).toBeGreaterThan(g0 + 5);
    // Mühle
    const mill = build(w, 0, 'muehle', ws.slice(0, 2));
    run(w, 40);
    expect(mill.built).toBe(true);
    const w0 = res.waren;
    run(w, 30);
    expect(res.waren).toBeGreaterThan(w0);
    // Markt + Verkauf
    const markt = build(w, 0, 'markt', [ws[3]]);
    run(w, 60);
    expect(markt.built).toBe(true);
    res.waren = 25;
    const t0 = res.taler, p0 = w.players[0].prestige;
    w.queueCommand(0, { c: 'sell', b: markt.id });
    w.step();
    expect(res.taler).toBe(t0 + RULES.marketSell.taler);
    expect(w.players[0].prestige).toBe(p0 + RULES.marketSell.prestige);
    expect(res.waren).toBeGreaterThanOrEqual(15); // Mühle kann im selben Takt nachliefern
    expect(res.waren).toBeLessThanOrEqual(18);
    // zu wenig Waren -> Fehlermeldung
    res.waren = 3;
    w.queueCommand(0, { c: 'sell', b: markt.id });
    w.step();
    expect(w.events.some((e) => e.e === 'err')).toBe(true);
  });

  test('Räucherei verbraucht Fisch und Holz', () => {
    const w = mkWorld(777, true);
    const ws = units(w, 0, 'arbeiter');
    const hz = build(w, 0, 'heringszaun', ws.slice(0, 2));
    run(w, 25);
    expect(hz.built).toBe(true);
    const r = build(w, 0, 'raeucherei', ws.slice(0, 3));
    run(w, 30);
    expect(r.built).toBe(true);
    const res = w.players[0].res;
    const f0 = res.fisch, w0 = res.waren;
    run(w, 20);
    expect(res.waren).toBeGreaterThan(w0);
    expect(res.fisch).toBeLessThan(f0 + 10); // Fang minus Verbrauch
  });

  test('Bevölkerungsgrenze stoppt Ausbildung, Wohnhaus hebt sie', () => {
    const w = mkWorld(777, true);
    const p = w.players[0];
    const d = dz(w, 0);
    for (let i = 0; i < 5; i++) w.queueCommand(0, { c: 'train', b: d.id, u: 'arbeiter' });
    run(w, 75);
    expect(p.pop).toBe(10);
    expect(d.queue.length).toBe(0);
    w.queueCommand(0, { c: 'train', b: d.id, u: 'arbeiter' });
    run(w, 20);
    expect(p.pop).toBe(10);
    expect(d.status).toMatch(/Wohnhaus/);
    const h = build(w, 0, 'wohnhaus', units(w, 0, 'arbeiter').slice(0, 3));
    run(w, 25);
    expect(h.built).toBe(true);
    run(w, 15);
    expect(p.pop).toBe(11);
  });
});

describe('Bauplätze', () => {
  test('ungültige Plätze und fehlende Mittel werden abgelehnt', () => {
    const w = mkWorld(777, false);
    const v = w.placementView(0);
    const d = dz(w, 0);
    // belegt (Dorfzentrum)
    expect(checkPlacement(v, 'wohnhaus', d.x, d.y)).toMatch(/belegt/);
    // Wasser
    let wx = -1, wy = -1;
    for (let y = 0; y < w.map.h && wx < 0; y++) for (let x = 0; x < w.map.w; x++) if (w.map.terrain[w.idx(x, y)] === T.WASSER) { wx = x; wy = y; break; }
    w.vis[0].fill(1); // alles als erforscht annehmen, damit die Wasserprüfung greift
    expect(wx).toBeGreaterThanOrEqual(0);
    expect(checkPlacement(v, 'wohnhaus', wx, wy)).not.toBeNull();
    // zu weit von der Siedlung
    let fx = -1, fy = -1;
    const s1 = w.map.slots[1];
    for (let r = 4; r < 12 && fx < 0; r++)
      for (let k = 0; k < 16 && fx < 0; k++) {
        const x = Math.round(s1.x + Math.cos(k / 2.5) * r), y = Math.round(s1.y + Math.sin(k / 2.5) * r);
        let ok = true;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (w.map.terrain[w.idx(x + dx, y + dy)] !== T.GRAS || w.map.trees[w.idx(x + dx, y + dy)]) ok = false;
        if (ok) [fx, fy] = [x, y];
      }
    expect(checkPlacement(v, 'wohnhaus', fx, fy)).toMatch(/weit|belegt/);
    w.vis[0].fill(0);
    expect(checkPlacement(v, 'wohnhaus', d.x + 4, d.y)).toMatch(/unerforscht/);
    w.updateVisibility();
    // Voraussetzung
    expect(checkPlacement(v, 'muehle', d.x + 5, d.y)).toMatch(/Benötigt zuerst/);
    // Lehm-/Uferpflicht
    const grasSpot = spot(w, 0, 'wohnhaus');
    expect(checkPlacement(v, 'lehmgrube', grasSpot.x, grasSpot.y) ?? '').toMatch(/Lehmboden|belegt|Platz/);
    expect(checkPlacement(v, 'heringszaun', grasSpot.x, grasSpot.y)).toMatch(/Ufer/);
    // fehlende Mittel
    w.players[0].res.holz = 5;
    const s = spot(w, 0, 'kaserne');
    w.queueCommand(0, { c: 'place', ids: [], b: 'kaserne', x: s.x, y: s.y });
    w.step();
    expect(blds(w, 0, 'kaserne').length).toBe(0);
    expect(w.events.find((e) => e.e === 'err')).toBeTruthy();
    // Abbruch erstattet 75 %
    w.players[0].res.holz = 200;
    w.players[0].res.lehm = 200;
    w.queueCommand(0, { c: 'place', ids: [], b: 'kaserne', x: s.x, y: s.y });
    w.step();
    const k = blds(w, 0, 'kaserne')[0];
    expect(w.players[0].res.holz).toBe(80);
    w.queueCommand(0, { c: 'cancel', b: k.id });
    w.step();
    expect(blds(w, 0, 'kaserne').length).toBe(0);
    expect(w.players[0].res.holz).toBe(80 + 90);
  });
});

describe('Bewegung und Wegfindung', () => {
  test('Weg umgeht Hindernisse und betritt nie gesperrte Kacheln', () => {
    const w = mkWorld(777);
    const u = units(w, 0, 'spaeher')[0];
    const target = { x: w.map.market.x + 1.5, y: w.map.market.y + 4.5 };
    w.queueCommand(0, { c: 'move', ids: [u.id], x: target.x, y: target.y });
    let bad = 0;
    w.step();
    expect(u.order.k).toBe('move');
    for (let i = 0; i < 600 && u.order.k !== 'none'; i++) {
      w.step();
      const t = w.map.terrain[w.idx(Math.floor(u.x), Math.floor(u.y))];
      if (t === T.KNICK || isWater(t) || w.bocc[w.idx(Math.floor(u.x), Math.floor(u.y))]) bad++;
    }
    expect(bad).toBe(0);
    expect(Math.hypot(u.x - target.x, u.y - target.y)).toBeLessThan(2);
  });

  test('A* findet um eine Wand herum und meldet Unerreichbares als Teilweg', () => {
    const w = mkWorld(777);
    const g = w.grid;
    // künstliche Wand
    const pass = new Uint8Array(g.w * g.h).fill(1);
    for (let y = 0; y < 30; y++) pass[y * g.w + 20] = 0;
    const grid = { ...g, pass, cost: new Float32Array(g.w * g.h).fill(1) };
    const p = findPath(grid, 10, 10, (i) => i === 10 * g.w + 30, 30, 10)!;
    expect(p[p.length - 1]).toBe(10 * g.w + 30);
    for (const i of p) expect(pass[i]).toBe(1);
    // eingeschlossenes Ziel
    for (let x = 49; x <= 51; x++) for (let y = 49; y <= 51; y++) if (x !== 50 || y !== 50) pass[y * g.w + x] = 0;
    const q = findPath(grid, 10, 10, (i) => i === 50 * g.w + 50, 50, 50);
    expect(q).not.toBeNull();
    expect(q![q!.length - 1]).not.toBe(50 * g.w + 50);
  });
});

describe('Kampf und Sieg', () => {
  test('Angriff, Schaden, Tod, Entfernung, automatische Verteidigung', () => {
    const w = mkWorld(777);
    const kz = build(w, 0, 'kaserne', units(w, 0, 'arbeiter'));
    run(w, 20);
    expect(kz.built).toBe(true);
    for (let i = 0; i < 4; i++) w.queueCommand(0, { c: 'train', b: kz.id, u: i % 2 ? 'schuetze' : 'landsknecht' });
    run(w, 80);
    const army = units(w, 0).filter((u) => u.type === 'landsknecht' || u.type === 'schuetze');
    expect(army.length).toBe(4);
    // gegnerischer Späher kommt nahe – Soldaten verteidigen automatisch
    const scout = units(w, 1, 'spaeher')[0];
    scout.x = army[0].x + 3;
    scout.y = army[0].y + 1;
    scout.path = null;
    const hp0 = scout.hp;
    run(w, 3);
    expect(scout.hp).toBeLessThan(hp0);
    run(w, 20);
    expect(w.ents.has(scout.id)).toBe(false);
    expect(w.players[0].stats.kills).toBeGreaterThanOrEqual(1);
    expect(w.players[1].stats.lost).toBeGreaterThanOrEqual(1);
  });

  test('Dorfzentrum verteidigt sich selbst', () => {
    const w = mkWorld(777);
    const enemy = units(w, 1, 'arbeiter')[0];
    const d = dz(w, 0);
    enemy.x = d.x + 5;
    enemy.y = d.y + 1.5;
    w.step();
    const hp0 = enemy.hp;
    run(w, 4);
    expect(enemy.hp).toBeLessThan(hp0);
  });

  test('Militärischer Sieg durch Zerstörung des Dorfzentrums', () => {
    const w = mkWorld(777);
    const d = dz(w, 1);
    d.hp = 1;
    // eigene Einheit neben das gegnerische Dorfzentrum stellen
    const u = units(w, 0, 'spaeher')[0];
    u.x = d.x - 0.6;
    u.y = d.y + 1.5;
    w.queueCommand(0, { c: 'attack', ids: [u.id], t: d.id });
    run(w, 3);
    expect(w.ents.has(d.id)).toBe(false);
    expect(w.players[1].defeated).toBe(true);
    expect(w.winner).toBe(0);
    expect(w.winReason).toMatch(/Militärischer Sieg/);
    expect(units(w, 1).length).toBe(0);
  });

  test('Wirtschaftlicher Sieg durch Prestige', () => {
    const w = mkWorld(777);
    w.players[1].prestige = w.prestigeGoal;
    w.step();
    expect(w.winner).toBe(1);
    expect(w.winReason).toMatch(/Wirtschaftlicher Sieg/);
  });

  test('Brarup-Markt: Besetzung gibt Kontrolle und Prestige', () => {
    const w = mkWorld(777);
    const u = units(w, 0, 'spaeher')[0];
    u.x = w.map.market.x + 1.5;
    u.y = w.map.market.y + 4;
    run(w, 1);
    expect(w.brarup.controller).toBe(0);
    run(w, RULES.brarupTrickle.every + 1);
    expect(w.players[0].prestige).toBeGreaterThanOrEqual(1);
    // Gegner dazu -> umkämpft
    const e = units(w, 1, 'spaeher')[0];
    e.x = u.x + 1;
    e.y = u.y;
    run(w, 1);
    expect(w.brarup.controller).toBe(-1);
  });

  test('Thorsberger Moor: einmalige Erkundungsbelohnung', () => {
    const w = mkWorld(777);
    const u = units(w, 0, 'spaeher')[0];
    const t0 = w.players[0].res.taler;
    w.queueCommand(0, { c: 'move', ids: [u.id], x: w.map.site.x + 0.5, y: w.map.site.y + 0.5 });
    run(w, 60);
    expect(w.moorFoundBy).toBe(0);
    expect(w.players[0].prestige).toBe(RULES.moorReward.prestige);
    expect(w.players[0].res.taler).toBe(t0 + RULES.moorReward.taler);
  });
});

describe('Regeltreue und Sicherheit', () => {
  test('fremde Einheiten und Gebäude lassen sich nicht steuern', () => {
    const w = mkWorld(777);
    const enemy = units(w, 1, 'arbeiter')[0];
    const ex = enemy.x, ey = enemy.y;
    w.queueCommand(0, { c: 'move', ids: [enemy.id], x: 10, y: 10 });
    w.queueCommand(0, { c: 'train', b: dz(w, 1).id, u: 'arbeiter' });
    w.queueCommand(0, { c: 'resign' as never } as never); // gültig: nur eigener Spieler
    run(w, 2);
    expect(enemy.x).toBeCloseTo(ex, 0);
    expect(enemy.y).toBeCloseTo(ey, 0);
    expect(dz(w, 1).queue.length).toBe(0);
    expect(w.players[0].defeated).toBe(true); // resign wirkt nur auf den Absender
    expect(w.players[1].defeated).toBe(false);
  });

  test('Müllbefehle werfen nicht und ändern nichts', () => {
    const w = mkWorld(777);
    const res = JSON.stringify(w.players[0].res);
    const junk: unknown[] = [null, 1, 'x', {}, { c: 'place', b: 'dorfzentrum', x: 1, y: 1, ids: [] }, { c: 'train', b: -5, u: 'drache' },
      { c: 'move', ids: 'abc', x: NaN, y: 1 }, { c: 'buy', b: 1, r: 'gold' }, { c: 'smart', ids: [1e9], x: 1e9, y: -4 }];
    for (const j of junk) w.queueCommand(0, j as never);
    expect(() => run(w, 1)).not.toThrow();
    expect(JSON.stringify(w.players[0].res)).toBe(res);
  });

  test('Speichern und Laden ergibt denselben Zustand', () => {
    const w = mkWorld(5);
    const ai = [new AI(0, 'normal'), new AI(1, 'normal')];
    for (let i = 0; i < 1200; i++) {
      ai.forEach((a) => a.update(w));
      w.step();
    }
    const json = w.serialize();
    const w2 = World.deserialize(json);
    expect(w2.serialize()).toBe(json);
    for (let i = 0; i < 100; i++) {
      w.step();
      w2.step();
    }
    expect(w2.players.map((p) => p.res)).toEqual(w.players.map((p) => p.res));
  });
});

describe('KI', () => {
  test('KI wirtschaftet, baut, bildet aus und greift an; Partie endet mit Sieger', () => {
    const w = new World({
      seed: 2024,
      players: [
        { name: 'A', color: 0, slot: 0, isAI: true },
        { name: 'B', color: 1, slot: 1, isAI: true },
      ],
    });
    const ais = [new AI(0, 'normal'), new AI(1, 'normal')];
    let maxArmy = 0, attackSeen = false;
    const everBuilt = [new Set<string>(), new Set<string>()];
    for (let t = 0; t < 10 * 60 * 40 && w.winner < 0; t++) {
      ais.forEach((a) => a.update(w));
      w.step();
      if (t % 100 === 0) {
        for (const p of [0, 1]) for (const b of blds(w, p)) everBuilt[p].add(b.type);
        maxArmy = Math.max(maxArmy, units(w, 0).filter((u) => u.type === 'landsknecht' || u.type === 'schuetze').length);
        // Angriff: Soldaten nahe eines gegnerischen Dorfzentrums
        for (const p of [0, 1]) {
          const ed = dz(w, 1 - p);
          if (ed && units(w, p).some((u) => (u.type === 'landsknecht' || u.type === 'schuetze') && Math.hypot(u.x - ed.x, u.y - ed.y) < 14)) attackSeen = true;
        }
      }
    }
    for (const p of [0, 1]) {
      const types = everBuilt[p]; // im Kampf zerstörte Gebäude zählen mit
      for (const t of ['holzfaeller', 'bauernhof', 'lehmgrube', 'heringszaun', 'muehle', 'kaserne', 'markt', 'wohnhaus'])
        expect(types.has(t), `Spieler ${p} baut ${t}`).toBe(true);
    }
    expect(maxArmy).toBeGreaterThan(3);
    expect(w.players[0].stats.sold + w.players[1].stats.sold).toBeGreaterThan(50);
    expect(w.winner).toBeGreaterThanOrEqual(0);
    expect(attackSeen).toBe(true);
  }, 120000);
});

describe('Startfairness', () => {
  test('jeder Startplatz hat Lehm-, Ufer- und Hofbauplätze in Reichweite', async () => {
    const { findSpot } = await import('../src/ai/ai');
    for (const seed of [1, 5, 42, 77, 99, 777, 1234, 2024, 9001, 31337]) {
      const w = mkWorld(seed);
      for (const p of [0, 1]) {
        w.vis[p].fill(1);
        for (const t of ['lehmgrube', 'heringszaun', 'bauernhof', 'kaserne'] as const)
          expect(findSpot(w, p, t, dz(w, p)), `seed ${seed} Spieler ${p}: ${t}`).not.toBeNull();
      }
    }
  });
});
