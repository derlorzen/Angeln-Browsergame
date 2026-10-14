// Reparieren, Forschungen je Gebäude (auch im 17. Jh.), Parteigebäude, Markt besetzen.
import { describe, expect, test } from 'vitest';
import { TECHS, TECH_IDS } from '../src/data/ages';
import { BUILDINGS, RULES } from '../src/data/defs';
import { validateCommand } from '../src/net/protocol';
import { checkPlacement } from '../src/sim/rules';
import type { Building, Unit } from '../src/sim/types';
import { World } from '../src/sim/world';

const mk = (faction: 'angeln' | 'schwansen' | 'friesen' | 'daenen' = 'angeln', seed = 777) =>
  new World({ seed, richStart: true, players: [
    { name: 'A', color: 0, slot: 0, isAI: false, faction }, { name: 'B', color: 1, slot: 1, isAI: false }] });
const run = (w: World, secs: number) => {
  for (let i = 0; i < secs * RULES.tickRate; i++) w.step();
};
const blds = (w: World, p: number, t: string) => [...w.ents.values()].filter((e): e is Building => e.kind === 'b' && e.owner === p && e.type === t);
const units = (w: World, p: number, t: string) => [...w.ents.values()].filter((e): e is Unit => e.kind === 'u' && e.owner === p && e.type === t);
const dz = (w: World, p = 0) => blds(w, p, 'dorfzentrum')[0];
function spot(w: World, t: Parameters<typeof checkPlacement>[1], p = 0): { x: number; y: number } {
  const d = dz(w, p);
  const v = w.placementView(p);
  v.explored = () => true;
  for (let r = 3; r < 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (!checkPlacement(v, t, d.x + dx, d.y + dy)) return { x: d.x + dx, y: d.y + dy };
  throw new Error('kein Platz für ' + t);
}
function place(w: World, t: Parameters<typeof checkPlacement>[1], p = 0): Building {
  for (const r of BUILDINGS[t].requires ?? []) if (!blds(w, p, r).length) place(w, r, p);
  const s = spot(w, t, p);
  return w.addBuilding(t, p, s.x, s.y, true);
}

describe('Reparieren', () => {
  test('Arbeiter reparieren ein beschädigtes Gebäude per Rechtsklick und verbrauchen Holz', () => {
    const w = mk();
    const house = place(w, 'wohnhaus');
    house.hp = Math.round(house.maxHp * 0.3);
    const hp0 = house.hp, holz0 = w.players[0].res.holz;
    const ws = units(w, 0, 'arbeiter').slice(0, 2);
    w.queueCommand(0, { c: 'smart', ids: ws.map((u) => u.id), x: house.x + 0.5, y: house.y + 0.5, t: house.id });
    w.step();
    expect(ws[0].order.k).toBe('repair');
    run(w, 60);
    expect(house.hp).toBe(house.maxHp);
    expect(house.hp).toBeGreaterThan(hp0);
    expect(w.players[0].res.holz).toBeLessThan(holz0);
    expect(holz0 - w.players[0].res.holz).toBeLessThanOrEqual(Math.ceil((BUILDINGS.wohnhaus.cost.holz ?? 0) / 3) + 1);
  });
  test('ohne Holz wird die Reparatur abgebrochen; Befehl wird geprüft', () => {
    const w = mk();
    const house = place(w, 'wohnhaus');
    house.hp = 50;
    w.players[0].res.holz = 0;
    const u = units(w, 0, 'arbeiter')[0];
    w.queueCommand(0, { c: 'repair', ids: [u.id], t: house.id });
    run(w, 40);
    expect(house.hp).toBeLessThan(house.maxHp);
    expect(w.events.some((e) => e.e === 'err') || u.order.k === 'none').toBe(true);
    expect(validateCommand({ c: 'repair', ids: [1, 2], t: 9 })).toEqual({ c: 'repair', ids: [1, 2], t: 9 });
  });
});

describe('Forschungen je Gebäude', () => {
  test('jedes Grundgebäude hat mindestens eine Forschung, viele schon im 17. Jahrhundert', () => {
    for (const t of ['bauernhof', 'holzfaeller', 'heringszaun', 'lehmgrube', 'muehle', 'raeucherei', 'kaserne', 'markt', 'dorfzentrum', 'wohnhaus'] as const)
      expect(TECH_IDS.filter((id) => TECHS[id].at === t && TECHS[id].age === 1).length, t).toBeGreaterThanOrEqual(1);
  });
  test('„Bessere Flügel“ lässt die Mühle schneller mahlen', () => {
    const w = mk();
    const m = place(w, 'muehle');
    w.queueCommand(0, { c: 'research', b: m.id, t: 'segel' });
    run(w, TECHS.segel.time + 1);
    expect(w.players[0].techs).toContain('segel');
    expect(w.tfx(0).process.muehle).toBeCloseTo(0.8);
  });
  test('Kachelöfen geben Wohnraum, Waage mehr Taler, Gezogene Läufe mehr Reichweite', () => {
    const w = mk();
    place(w, 'wohnhaus');
    w.updatePop();
    const cap0 = w.players[0].popCap;
    w.players[0].techs.push('kachelofen');
    w.updatePop();
    expect(w.players[0].popCap).toBe(cap0 + 1);
    w.players[0].techs.push('gezogen');
    expect(w.ud(0, "schuetze").range).toBe(6);
    expect(w.ud(0, 'landsknecht').range).toBe(1.2);
  });
});

describe('Parteigebäude', () => {
  test('nur die eigene Partei darf es bauen', () => {
    const w = mk('daenen');
    place(w, 'bauernhof');
    const s = spot(w, 'wohnhaus');
    w.queueCommand(0, { c: 'place', ids: [], b: 'meierei', x: s.x, y: s.y });
    w.step();
    expect(blds(w, 0, 'meierei').length).toBe(0);
    const z = spot(w, 'zollhaus');
    w.queueCommand(0, { c: 'place', ids: [], b: 'zollhaus', x: z.x, y: z.y });
    w.step();
    expect(blds(w, 0, 'zollhaus').length).toBe(1);
  });
  test('Zollhaus bringt stetig Taler, Meierei macht aus Getreide Waren, Gestüt bildet Reiter schneller aus', () => {
    const d = mk('daenen');
    const zh = place(d, 'zollhaus');
    const t0 = d.players[0].res.taler;
    run(d, 20);
    expect(d.players[0].res.taler - t0).toBeGreaterThanOrEqual(4);
    expect(zh.built).toBe(true);
    const a = mk('angeln');
    place(a, 'meierei');
    const w0 = a.players[0].stats.gathered.waren;
    run(a, 12);
    expect(a.players[0].stats.gathered.waren).toBeGreaterThan(w0);
    const s = mk('schwansen');
    const g = place(s, 'gestuet');
    const k = place(s, 'kaserne');
    expect(s.trainTime(g, 'gutsreiter')).toBeLessThan(s.trainTime(k, 'gutsreiter'));
  });
});

describe('Neutraler Markt', () => {
  test('Rechtsklick auf den Markt schickt Einheiten in den Besetzungsradius', () => {
    const w = mk();
    const m = [...w.ents.values()].find((e): e is Building => e.kind === 'b' && e.type === 'brarupmarkt')!;
    const sc = units(w, 0, 'spaeher')[0];
    w.queueCommand(0, { c: 'smart', ids: [sc.id], x: m.x + 1, y: m.y + 1, t: m.id });
    run(w, 90);
    expect(Math.hypot(sc.x - (m.x + 1.5), sc.y - (m.y + 1.5))).toBeLessThanOrEqual(RULES.brarupRadius);
    expect(w.brarup.controller).toBe(0);
  });
});
