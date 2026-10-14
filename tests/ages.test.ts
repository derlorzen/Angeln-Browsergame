// Zeitalter: Aufstieg, Freischaltungen, Technologien, Flugeinheiten, KI.
import { describe, expect, test } from 'vitest';
import { AI } from '../src/ai/ai';
import { AGES, TECHS } from '../src/data/ages';
import { BUILDINGS, RULES } from '../src/data/defs';
import { validateCommand } from '../src/net/protocol';
import { T } from '../src/sim/map';
import { checkPlacement } from '../src/sim/rules';
import { Snapshotter } from '../src/sim/snapshot';
import type { Building, Unit } from '../src/sim/types';
import { World } from '../src/sim/world';

const mk = (seed = 777) =>
  new World({ seed, richStart: true, storageLimit: false, players: [
    { name: 'A', color: 0, slot: 0, isAI: false }, { name: 'B', color: 1, slot: 1, isAI: false }] });
const run = (w: World, secs: number) => {
  for (let i = 0; i < secs * RULES.tickRate; i++) w.step();
};
const blds = (w: World, p: number, t: string) => [...w.ents.values()].filter((e): e is Building => e.kind === 'b' && e.owner === p && e.type === t);
const dz = (w: World, p = 0) => blds(w, p, 'dorfzentrum')[0];
const rich = (w: World, p = 0) => (w.players[p].res = { holz: 9000, getreide: 9000, fisch: 9000, lehm: 9000, waren: 9000, taler: 9000 });
function place(w: World, t: Parameters<typeof checkPlacement>[1], p = 0): Building {
  for (const r of BUILDINGS[t].requires ?? []) if (!blds(w, p, r).length) place(w, r, p);
  const d = dz(w, p);
  const v = w.placementView(p);
  v.explored = () => true;
  for (let r = 3; r < 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (!checkPlacement(v, t, d.x + dx, d.y + dy)) return w.addBuilding(t, p, d.x + dx, d.y + dy, true);
  throw new Error('kein Platz für ' + t);
}
function ageUp(w: World, p = 0): void {
  const pl = w.players[p];
  for (const t of AGES[pl.age + 1].requires.slice(0, AGES[pl.age + 1].need)) if (!blds(w, p, t).length) place(w, t, p);
  w.queueCommand(p, { c: 'age', b: dz(w, p).id });
  run(w, AGES[pl.age + 1].time + 1);
}

describe('Zeitalter', () => {
  test('Aufstieg: Voraussetzungen, Kosten, Dauer, Prestige', () => {
    const w = mk();
    rich(w);
    const pl = w.players[0];
    w.queueCommand(0, { c: 'age', b: dz(w).id });
    w.step();
    expect(dz(w).up).toBe(-1); // Voraussetzungen fehlen
    expect(w.events.some((e) => e.e === 'err')).toBe(true);
    place(w, 'markt');
    place(w, 'kaserne');
    const holz0 = pl.res.holz, pr0 = pl.prestige;
    w.queueCommand(0, { c: 'age', b: dz(w).id });
    w.step();
    expect(pl.res.holz).toBe(holz0 - AGES[2].cost.holz!);
    run(w, AGES[2].time - 2);
    expect(pl.age).toBe(1);
    run(w, 3);
    expect(pl.age).toBe(2);
    expect(pl.prestige - pr0).toBeGreaterThanOrEqual(AGES[2].prestige);
  });

  test('Gebäude und Einheiten sind an das Zeitalter gebunden; alte Einheiten werden abgelöst', () => {
    const w = mk();
    rich(w);
    const k = place(w, 'kaserne');
    w.queueCommand(0, { c: 'train', b: k.id, u: 'fuesilier' });
    w.step();
    expect(k.queue.length).toBe(0);
    const v = w.placementView(0);
    void v;
    ageUp(w);
    expect(w.players[0].age).toBe(2);
    w.queueCommand(0, { c: 'train', b: k.id, u: 'fuesilier' });
    w.step();
    expect(k.queue).toContain('fuesilier');
    // 20. Jh.: Landsknechte nicht mehr, Panzer ja
    ageUp(w);
    expect(w.players[0].age).toBe(3);
    k.queue.length = 0;
    w.queueCommand(0, { c: 'train', b: k.id, u: 'landsknecht' });
    w.queueCommand(0, { c: 'train', b: k.id, u: 'panzer' });
    w.step();
    expect(k.queue).toEqual(['panzer']);
    ageUp(w);
    expect(w.players[0].age).toBe(4);
    const farm = place(w, 'vertikalfarm');
    const g0 = w.players[0].stats.gathered.getreide;
    run(w, 10);
    expect(w.players[0].stats.gathered.getreide).toBeGreaterThan(g0 + 10);
    expect(farm.built).toBe(true);
  });

  test('Technologien wirken parteiweit und auch auf vorhandene Soldaten', () => {
    const w = mk();
    rich(w);
    ageUp(w);
    const k = place(w, 'kaserne');
    w.queueCommand(0, { c: 'train', b: k.id, u: 'fuesilier' });
    run(w, 25);
    const f = [...w.ents.values()].find((e): e is Unit => e.kind === 'u' && e.type === 'fuesilier')!;
    const hp0 = f.hp;
    w.queueCommand(0, { c: 'research', b: k.id, t: 'exerzierreglement' });
    run(w, TECHS.exerzierreglement.time + 1);
    expect(w.players[0].techs).toContain('exerzierreglement');
    expect(f.hp).toBeGreaterThan(hp0);
    expect(w.ud(0, "fuesilier").hp).toBe(Math.round(95 * 1.15));
    // Technologie eines späteren Zeitalters wird abgelehnt
    const hof = place(w, 'bauernhof');
    w.queueCommand(0, { c: 'research', b: hof.id, t: 'kunstduenger' });
    w.step();
    expect(hof.up).toBe(-1);
    // Abbrechen erstattet
    const t0 = w.players[0].res.taler;
    w.queueCommand(0, { c: 'research', b: hof.id, t: 'fruchtwechsel' });
    w.step();
    expect(w.players[0].res.taler).toBe(t0 - TECHS.fruchtwechsel.cost.taler!);
    w.queueCommand(0, { c: 'upcancel', b: hof.id });
    w.step();
    expect(w.players[0].res.taler).toBe(t0);
  });

  test('Drohnen fliegen über Wasser', () => {
    const w = mk();
    const m = w.map;
    const water = m.terrain.findIndex((t, i) => t === T.WASSER && (i % m.w) > 5 && (i % m.w) < m.w - 5);
    const u = w.spawnUnit('drohne', 0, dz(w))!;
    const wx = water % m.w, wy = Math.floor(water / m.w);
    w.queueCommand(0, { c: 'move', ids: [u.id], x: wx + 0.5, y: wy + 0.5 });
    run(w, 60);
    expect(Math.hypot(u.x - (wx + 0.5), u.y - (wy + 0.5))).toBeLessThan(1.5);
  });

  test('Zustand und Protokoll kennen Zeitalter und Technologien', () => {
    const w = mk();
    rich(w);
    ageUp(w);
    const s = new Snapshotter(0).make(w, true);
    expect(s.players[0].age).toBe(2);
    expect(s.players[1].age).toBe(1);
    expect(validateCommand({ c: 'age', b: 5 })).toEqual({ c: 'age', b: 5 });
    expect(validateCommand({ c: 'research', b: 5, t: 'robotik' })).toEqual({ c: 'research', b: 5, t: 'robotik' });
    expect(validateCommand({ c: 'research', b: 5, t: 'zauberei' })).toBeNull();
    const w2 = World.deserialize(w.serialize());
    expect(w2.players[0].age).toBe(2);
  });

  test('KI steigt in einer langen Partie auf und nutzt neue Gebäude', () => {
    const w = new World({ seed: 4242, prestigeGoal: 0, players: [
      { name: 'A', color: 0, slot: 0, isAI: true, aiLevel: 'normal', faction: 'schwansen' },
      { name: 'B', color: 1, slot: 1, isAI: true, aiLevel: 'normal', faction: 'angeln' }] });
    const ais = [new AI(0, 'normal'), new AI(1, 'normal')];
    let maxAge = 1;
    const types = new Set<string>();
    for (let t = 0; t < 40 * 60 * RULES.tickRate && w.winner < 0; t++) {
      for (const a of ais) a.update(w);
      w.step();
      if (t % 600 === 0) {
        maxAge = Math.max(maxAge, ...w.players.map((p) => p.age));
        for (const e of w.ents.values()) if (e.kind === 'b' && e.owner >= 0) types.add(e.type);
      }
    }
    console.log('KI-Zeitalter', w.players.map((p) => p.age), 'Gebäude', [...types].join(','), 'Sieger', w.winner, (w.tick / 600).toFixed(1));
    expect(maxAge).toBeGreaterThanOrEqual(3);
    expect(types.has('manufaktur') || types.has('hafen') || types.has('schanze')).toBe(true);
  }, 300000);
});
