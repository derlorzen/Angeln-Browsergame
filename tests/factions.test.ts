import { describe, expect, test } from 'vitest';
import { AI } from '../src/ai/ai';
import { RULES } from '../src/data/defs';
import { FACTIONS, FACTION_DEFS, fbdef, fudef, type FactionId } from '../src/data/factions';
import { T } from '../src/sim/map';
import { checkPlacement } from '../src/sim/rules';
import type { Building, Unit } from '../src/sim/types';
import { World } from '../src/sim/world';

const mk = (f0: FactionId, f1: FactionId = 'angeln', seed = 777) =>
  new World({ seed, richStart: true, players: [
    { name: 'A', color: 0, slot: 0, isAI: false, faction: f0 },
    { name: 'B', color: 1, slot: 1, isAI: false, faction: f1 },
  ] });
const dz = (w: World, p: number) => [...w.ents.values()].find((e) => e.kind === 'b' && e.owner === p && e.type === 'dorfzentrum') as Building;
const units = (w: World, p: number, t?: string) => [...w.ents.values()].filter((e): e is Unit => e.kind === 'u' && e.owner === p && (!t || e.type === t));

function kaserne(w: World, p: number): Building {
  const d = dz(w, p);
  const v = w.placementView(p);
  for (let r = 2; r < 12; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++)
        if (!checkPlacement(v, 'kaserne', d.x + dx, d.y + dy)) {
          const b = w.addBuilding('kaserne', p, d.x + dx, d.y + dy, true);
          return b;
        }
  throw new Error('kein Platz');
}

describe('Parteien', () => {
  test('Datenmodell: jede Partei hat Namen, Motto, Boni und eine eigene Spezialeinheit in der Kaserne', () => {
    const uniques = new Set<string>();
    for (const f of FACTIONS) {
      const d = FACTION_DEFS[f];
      expect(d.bonuses.length).toBeGreaterThan(2);
      uniques.add(d.unique);
      const trains = fbdef(f, 'kaserne').trains!;
      expect(trains).toContain(d.unique);
      for (const o of FACTIONS) if (o !== f) expect(trains).not.toContain(FACTION_DEFS[o].unique);
    }
    expect(uniques.size).toBe(4);
    expect(fbdef('daenen', 'dorfzentrum').name).toBe('Amtshaus');
    expect(fbdef('friesen', 'dorfzentrum').name).toBe('Haubarg');
    expect(fbdef('schwansen', 'dorfzentrum').name).toBe('Herrenhaus');
  });

  test('Spezialeinheiten nur für die eigene Partei', () => {
    const w = mk('angeln', 'daenen');
    const k0 = kaserne(w, 0), k1 = kaserne(w, 1);
    w.queueCommand(0, { c: 'train', b: k0.id, u: 'musketier' });
    w.queueCommand(0, { c: 'train', b: k0.id, u: 'knickwaechter' });
    w.queueCommand(1, { c: 'train', b: k1.id, u: 'musketier' });
    w.step();
    expect(k0.queue).toEqual(['knickwaechter']);
    expect(k1.queue).toEqual(['musketier']);
    expect(w.events.some((e) => e.e === 'err' && /Dänen/.test(e.msg))).toBe(true);
  });

  test('Wirtschaftsboni: Friesen bezahlen Arbeiter mit Fisch, Schwansener verkaufen teurer, Angeliter ernten mehr', () => {
    const w = mk('friesen', 'schwansen');
    const r0 = w.players[0].res;
    const g0 = r0.getreide, f0 = r0.fisch;
    w.queueCommand(0, { c: 'train', b: dz(w, 0).id, u: 'arbeiter' });
    w.step();
    expect(r0.getreide).toBe(g0);
    expect(r0.fisch).toBe(f0 - 30);
    const m = w.addBuilding('markt', 1, dz(w, 1).x - 5, dz(w, 1).y, true);
    w.players[1].res.waren = 10;
    const t0 = w.players[1].res.taler;
    w.queueCommand(1, { c: 'sell', b: m.id });
    w.step();
    expect(w.players[1].res.taler - t0).toBe(Math.round(RULES.marketSell.taler * 1.25));
    expect(fbdef('angeln', 'bauernhof').produce!.time).toBeLessThan(fbdef('daenen', 'bauernhof').produce!.time);
    expect(fbdef('friesen', 'heringszaun').produce!.time).toBeLessThan(fbdef('angeln', 'heringszaun').produce!.time);
    expect(fudef('daenen', 'landsknecht').cost.taler).toBeLessThan(fudef('angeln', 'landsknecht').cost.taler!);
    expect(dz(mk('daenen'), 0).maxHp).toBeGreaterThan(dz(mk('angeln'), 0).maxHp);
  });

  test('Grabenspringer überwindet Knicks, andere Einheiten müssen ausweichen', () => {
    const w = mk('friesen', 'angeln', 42);
    const W = w.map.w;
    // geschlossenes Knickstück suchen: Knick bei (x,y) senkrecht, links und rechts freie Wiese
    let found: [number, number] | null = null;
    for (let y = 10; y < 86 && !found; y++)
      for (let x = 10; x < 86 && !found; x++) {
        const i = y * W + x;
        if (w.map.terrain[i] !== T.KNICK) continue;
        const run = [-2, -1, 1, 2].every((d) => w.map.terrain[(y + d) * W + x] === T.KNICK);
        if (run && w.grid.pass[i - 1] && w.grid.pass[i + 1] && w.grid.pass[i - 2] && w.grid.pass[i + 2]) found = [x, y];
      }
    expect(found).not.toBeNull();
    const [kx, ky] = found!;
    const k = kaserne(w, 0);
    const sp = w.spawnUnit('grabenspringer', 0, k)!;
    const lk = w.spawnUnit('landsknecht', 0, k)!;
    for (const u of [sp, lk]) {
      u.x = kx - 1.5;
      u.y = ky + 0.5;
    }
    w.queueCommand(0, { c: 'move', ids: [sp.id], x: kx + 2.5, y: ky + 0.5 });
    w.queueCommand(0, { c: 'move', ids: [lk.id], x: kx + 2.5, y: ky + 0.5 });
    let crossedKnick = false;
    let tSp = -1, tLk = -1;
    for (let t = 0; t < 900 && (tSp < 0 || tLk < 0); t++) {
      w.step();
      if (w.map.terrain[Math.floor(sp.y) * W + Math.floor(sp.x)] === T.KNICK) crossedKnick = true;
      expect(w.map.terrain[Math.floor(lk.y) * W + Math.floor(lk.x)]).not.toBe(T.KNICK);
      if (tSp < 0 && sp.order.k === 'none') tSp = t;
      if (tLk < 0 && lk.order.k === 'none') tLk = t;
    }
    expect(crossedKnick).toBe(true);
    expect(tSp).toBeGreaterThan(0);
    expect(tSp).toBeLessThan(tLk < 0 ? 900 : tLk);
  });

  test('Knickwächter sind neben einem Knick zäher; Musketiere schießen weit', () => {
    const w = mk('angeln', 'daenen', 42);
    const W = w.map.w;
    let spot = -1;
    for (let i = 0; i < W * W && spot < 0; i++) if (w.map.terrain[i] === T.KNICK && w.grid.pass[i + 1]) spot = i + 1;
    const k0 = kaserne(w, 0), k1 = kaserne(w, 1);
    const a = w.spawnUnit('knickwaechter', 0, k0)!;
    const b = w.spawnUnit('knickwaechter', 0, k0)!;
    a.x = (spot % W) + 0.5;
    a.y = Math.floor(spot / W) + 0.5;
    b.x = w.map.market.x + 1.5;
    b.y = w.map.market.y + 5;
    const dmg = (u: Unit) => {
      const before = u.hp;
      (w as unknown as { damage: (t: Unit, d: number, a: number, id: number) => void }).damage(u, 20, 1, 0);
      return before - u.hp;
    };
    expect(dmg(a)).toBeLessThan(dmg(b));
    const m = w.spawnUnit('musketier', 1, k1)!;
    expect(fudef('daenen', 'musketier').range).toBeGreaterThan(fudef('daenen', 'schuetze').range);
    // Musketier trifft ein Ziel in 6 Kacheln Entfernung
    const target = w.spawnUnit('arbeiter', 0, k0)!;
    target.x = 40; target.y = 40; m.x = 46; m.y = 40.2;
    w.updateVisibility();
    w.queueCommand(1, { c: 'attack', ids: [m.id], t: target.id });
    let shot = false;
    for (let t = 0; t < 40; t++) {
      w.step();
      if (w.events.some((e) => e.e === 'shot' && e.r === 2)) shot = true;
    }
    expect(shot).toBe(true);
    expect(target.hp).toBeLessThan(40);
  });

  test('Spielstand mit Parteien speichern und laden', () => {
    const w = mk('daenen', 'friesen');
    const w2 = World.deserialize(w.serialize());
    expect(w2.players.map((p) => p.faction)).toEqual(['daenen', 'friesen']);
    expect(dz(w2, 0).maxHp).toBe(dz(w, 0).maxHp);
  });

  test('KI jeder Partei baut auf, bildet ihre Spezialeinheit aus und die Partie endet', () => {
    const results: string[] = [];
    const pairs: [FactionId, FactionId][] = [['angeln', 'daenen'], ['schwansen', 'friesen'], ['friesen', 'angeln'], ['daenen', 'schwansen']];
    for (const [a, b] of pairs) {
      const w = new World({ seed: 99, players: [
        { name: 'A', color: 0, slot: 0, isAI: true, faction: a }, { name: 'B', color: 1, slot: 1, isAI: true, faction: b }] });
      const ais = [new AI(0, 'normal'), new AI(1, 'normal')];
      const uniqueSeen = [false, false];
      for (let t = 0; t < 600 * 40 && w.winner < 0; t++) {
        ais.forEach((x) => x.update(w));
        w.step();
        if (t % 50 === 0) for (const p of [0, 1]) if (units(w, p, FACTION_DEFS[w.players[p].faction].unique).length) uniqueSeen[p] = true;
      }
      results.push(`${a} vs ${b}: Sieger ${w.winner >= 0 ? w.players[w.winner].faction : '-'} nach ${(w.tick / 600).toFixed(1)} min (${w.winReason})`);
      expect(w.winner).toBeGreaterThanOrEqual(0);
      expect(uniqueSeen.some(Boolean)).toBe(true);
    }
    console.log(results.join('\n'));
  }, 120000);
});
