// Ausbaustufen, Prestigeziel „aus“, Geländehinweise, Zufallskarte, Protokoll für die neuen Befehle.
import { describe, expect, test } from 'vitest';
import { BUILDINGS, RULES, UPGRADES } from '../src/data/defs';
import { ClientState } from '../src/game/client';
import { parseHostMsg, validateCommand } from '../src/net/protocol';
import { T, generateMap } from '../src/sim/map';
import { checkPlacement } from '../src/sim/rules';
import { Snapshotter } from '../src/sim/snapshot';
import type { Building } from '../src/sim/types';
import { World } from '../src/sim/world';
import { terrainHint } from '../src/ui/terrainhint';

const mk = (seed = 777, goal?: number) =>
  new World({ seed, prestigeGoal: goal, richStart: true, players: [
    { name: 'A', color: 0, slot: 0, isAI: false }, { name: 'B', color: 1, slot: 1, isAI: false }] });
const run = (w: World, secs: number) => {
  for (let i = 0; i < secs * RULES.tickRate; i++) w.step();
};
const blds = (w: World, p: number, t: string) => [...w.ents.values()].filter((e): e is Building => e.kind === 'b' && e.owner === p && e.type === t);
const dz = (w: World, p = 0) => blds(w, p, 'dorfzentrum')[0];
function place(w: World, t: Parameters<typeof checkPlacement>[1]): Building {
  for (const r of BUILDINGS[t].requires ?? []) if (!blds(w, 0, r).length) place(w, r);
  const d = dz(w);
  const v = w.placementView(0);
  for (let r = 3; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (!checkPlacement(v, t, d.x + dx, d.y + dy)) return w.addBuilding(t, 0, d.x + dx, d.y + dy, true);
  throw new Error('kein Platz für ' + t);
}

describe('Ausbaustufen', () => {
  test('Dorfzentrum: Kosten, Dauer, mehr Lebenspunkte und Wohnraum', () => {
    const w = mk();
    const d = dz(w);
    const res = w.players[0].res;
    res.taler = 500;
    const cap0 = w.players[0].popCap, hp0 = d.maxHp;
    const up = UPGRADES.dorfzentrum![0];
    const holz0 = res.holz;
    w.queueCommand(0, { c: 'upgrade', b: d.id });
    w.step();
    expect(d.up).toBeGreaterThanOrEqual(0);
    expect(res.holz).toBe(holz0 - up.cost.holz!);
    run(w, up.time - 2);
    expect(d.lvl).toBe(1);
    run(w, 3);
    expect(d.lvl).toBe(2);
    expect(d.maxHp).toBe(Math.round(hp0 * up.fx.hp!));
    expect(w.players[0].popCap).toBe(cap0 + up.fx.pop!);
  });

  test('Voraussetzungen: andere Gebäude brauchen das Dorfzentrum derselben Stufe; Stufe III des Dorfzentrums einen Markt', () => {
    const w = mk();
    w.players[0].res.taler = 2000;
    const hof = place(w, 'bauernhof');
    expect(w.upgradeBlock(hof)).toMatch(/Dorfzentrum der Stufe II/);
    w.queueCommand(0, { c: 'upgrade', b: hof.id });
    w.step();
    expect(hof.up).toBe(-1);
    const d = dz(w);
    d.lvl = 2;
    expect(w.upgradeBlock(hof)).toBeNull();
    expect(w.upgradeBlock(d)).toMatch(/Markt/);
  });

  test('Abbrechen erstattet die vollen Kosten; Bauernhof erhält mehr Felder und schnelleren Ertrag', () => {
    const w = mk();
    const res = w.players[0].res;
    res.taler = 2000;
    const d = dz(w);
    d.lvl = 2;
    const hof = place(w, 'bauernhof');
    const fields0 = hof.fields.length;
    const before = { ...res };
    w.queueCommand(0, { c: 'upgrade', b: hof.id });
    w.step();
    w.queueCommand(0, { c: 'upcancel', b: hof.id });
    w.step();
    expect(hof.up).toBe(-1);
    expect(res.holz).toBe(before.holz);
    expect(res.lehm).toBe(before.lehm);
    w.queueCommand(0, { c: 'upgrade', b: hof.id });
    run(w, UPGRADES.bauernhof![0].time + 1);
    expect(hof.lvl).toBe(2);
    expect(hof.fields.length).toBeGreaterThan(fields0);
    expect(w.bdl(hof).produce!.time).toBeLessThan(w.bd(0, 'bauernhof').produce!.time);
  });

  test('Markt-Ausbau erhöht den Talererlös, nicht das Prestige', () => {
    const w = mk();
    const res = w.players[0].res;
    const m = place(w, 'markt');
    m.lvl = 2;
    res.waren = 10;
    const t0 = res.taler, p0 = w.players[0].prestige;
    w.queueCommand(0, { c: 'sell', b: m.id });
    w.step();
    expect(res.taler - t0).toBe(Math.round(RULES.marketSell.taler * UPGRADES.markt![0].fx.taler!));
    expect(w.players[0].prestige - p0).toBe(RULES.marketSell.prestige);
  });

  test('Stufe bleibt im Spielstand erhalten und erscheint im Zustand für den Spieler', () => {
    const w = mk();
    const d = dz(w);
    d.lvl = 3;
    const w2 = World.deserialize(w.serialize());
    expect(dz(w2).lvl).toBe(3);
    const c = new ClientState(w.opts.seed, 0);
    // eigener Snapshot enthält die Stufe
    c.apply(new Snapshotter(0).make(w, true), 0);
    const cb = [...c.buildings.values()].find((b) => b.t === 'dorfzentrum' && b.o === 0)!;
    expect(cb.l).toBe(3);
    expect(c.bname(cb)).toMatch(/Stufe III/);
  });
});

describe('Prestige', () => {
  test('Prestigeziel 0: kein wirtschaftlicher Sieg', () => {
    const w = mk(777, 0);
    w.players[0].prestige = 5000;
    w.step();
    w.step();
    expect(w.winner).toBe(-1);
  });
  test('Schwansener erhalten 50 % mehr Prestige je Verkauf', () => {
    const w = new World({ seed: 777, richStart: true, players: [
      { name: 'A', color: 0, slot: 0, isAI: false, faction: 'schwansen' }, { name: 'B', color: 1, slot: 1, isAI: false }] });
    const m = place(w, 'markt');
    w.players[0].res.waren = 20;
    w.queueCommand(0, { c: 'sell', b: m.id });
    w.queueCommand(0, { c: 'sell', b: m.id });
    w.step();
    expect(w.players[0].prestige).toBeCloseTo(RULES.marketSell.prestige * 1.5 * 2);
  });
});

describe('Protokoll', () => {
  test('Ausbaubefehle werden geprüft weitergereicht', () => {
    expect(validateCommand({ c: 'upgrade', b: 12 })).toEqual({ c: 'upgrade', b: 12 });
    expect(validateCommand({ c: 'upcancel', b: 12 })).toEqual({ c: 'upcancel', b: 12 });
    expect(validateCommand({ c: 'upgrade', b: 'x' })).toBeNull();
  });
  test('Prestigeziel „aus“ (0) übersteht die Lobby-Prüfung, Unsinn wird auf den Standard gesetzt', () => {
    const lobby = (goal: unknown) => parseHostMsg({ t: 'lobby', st: { players: [], goal, rich: false, map: 'schlei' } });
    expect((lobby(0) as { st: { goal: number } }).st.goal).toBe(0);
    expect((lobby(600) as { st: { goal: number } }).st.goal).toBe(600);
    expect((lobby(123) as { st: { goal: number } }).st.goal).toBe(RULES.prestigeGoalDefault);
  });
});

describe('Geländehinweise', () => {
  test('nur für erkundete Kacheln, mit Gelände und Ortsangabe', () => {
    const c = new ClientState(777, 0);
    const m = c.map;
    const i = m.terrain.findIndex((t, k) => t === T.KNICK && !m.trees[k]);
    const x = i % m.w, y = Math.floor(i / m.w);
    expect(terrainHint(c, x, y)).toBeNull();
    c.vis[i] = 1;
    expect(terrainHint(c, x, y)).toMatch(/Knick/);
    expect(terrainHint(c, -1, 0)).toBeNull();
  });
});

describe('Zufallskarte', () => {
  test('gleicher Seed → gleiche Karte (Mehrspieler), andere Seeds → abwechslungsreich', () => {
    const a = generateMap(4242, 'random'), b = generateMap(4242, 'random');
    expect(a.terrain.join()).toBe(b.terrain.join());
    expect(a.slots[0].name).toBe(b.slots[0].name);
    const sigs = new Set<string>();
    const names = new Set<string>();
    for (let s = 1; s <= 12; s++) {
      const m = generateMap(s * 1009, 'random');
      const water = m.terrain.filter((t) => t === T.WASSER || t === T.WATT).length;
      sigs.add(`${Math.round(water / 400)}|${m.slots[0].x > m.slots[1].x}|${m.slots[0].y > m.slots[1].y}`);
      names.add(m.slots[0].name);
      expect(m.name).toMatch(/^Zufallskarte/);
    }
    expect(sigs.size).toBeGreaterThanOrEqual(5);
    expect(names.size).toBeGreaterThanOrEqual(6);
  });
});
