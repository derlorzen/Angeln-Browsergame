// Kartentests: alle Karten × mehrere Seeds – Erreichbarkeit, Bauplätze und faire Rohstoffverteilung an den Startplätzen.
import { describe, expect, test } from 'vitest';
import { AI } from '../src/ai/ai';
import { BUILDINGS, RULES, type BuildingType } from '../src/data/defs';
import { MAP_IDS, T, generateMap, isWater, terrainWalkable, type GameMap, type MapId } from '../src/sim/map';
import { checkPlacement } from '../src/sim/rules';
import { World } from '../src/sim/world';

const SEEDS = [1, 7, 42, 777, 2024, 31337, 99999, 123456];

function bfs(m: GameMap, sx: number, sy: number): Int32Array {
  const { w, h, terrain, trees } = m;
  const d = new Int32Array(w * h).fill(-1);
  const q = [sy * w + sx];
  d[q[0]] = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k], cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (d[ni] >= 0 || !terrainWalkable(terrain[ni]) || trees[ni]) continue;
      d[ni] = d[c] + 1;
      q.push(ni);
    }
  }
  return d;
}

/** Wie viele gültige Bauplätze für t hat ein Spieler mit nur dem Dorfzentrum (Gelände als erkundet angenommen)? */
function spots(m: GameMap, slot: number, t: BuildingType): number {
  const s = m.slots[slot];
  const v = {
    map: m, trees: m.trees,
    occupied: (i: number) => {
      const x = i % m.w, y = (i / m.w) | 0;
      return x >= s.x && x < s.x + 3 && y >= s.y && y < s.y + 3;
    },
    explored: () => true,
    ownBuildings: [{ x: s.x, y: s.y, w: 3, h: 3, type: 'dorfzentrum' as BuildingType, built: true },
      ...(BUILDINGS[t].requires ?? []).map((r) => ({ x: -50, y: -50, w: 1, h: 1, type: r, built: true }))],
  };
  let n = 0;
  for (let y = s.y - 14; y <= s.y + 14; y++) for (let x = s.x - 14; x <= s.x + 14; x++) if (!checkPlacement(v, t, x, y)) n++;
  return n;
}

function count(m: GameMap, slot: number, r: number, pred: (i: number) => boolean): number {
  const s = m.slots[slot];
  const cx = s.x + 1, cy = s.y + 1;
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if (x >= 0 && y >= 0 && x < m.w && y < m.h && Math.hypot(x - cx, y - cy) <= r && pred(y * m.w + x)) n++;
  return n;
}

const ratio = (a: number, b: number) => (Math.max(a, b) === 0 ? 1 : Math.min(a, b) / Math.max(a, b));

describe.each(MAP_IDS.map((id) => [id]))('Karte %s', (id: MapId) => {
  test('Startplätze, Markt und Fundstelle sind erreichbar und fair verteilt', () => {
    for (const seed of SEEDS) {
      const m = generateMap(seed, id);
      const tag = `${id}/${seed}`;
      const st = m.slots.slice(0, 2).map((s) => ({ x: s.x + 1, y: s.y + 4 })); // vor dem Dorfzentrum
      for (const p of st) expect(terrainWalkable(m.terrain[p.y * m.w + p.x]), `${tag}: Startfeld begehbar`).toBe(true);
      const d = st.map((p) => bfs(m, p.x, p.y));
      const at = (k: number, x: number, y: number) => d[k][y * m.w + x];
      // gegenseitig erreichbar
      expect(at(0, st[1].x, st[1].y), `${tag}: Startplätze verbunden`).toBeGreaterThan(0);
      // Markt (Rand des 3x3) und Fundstelle
      const mk = { x: m.market.x + 1, y: m.market.y + 1 };
      const dm = [0, 1].map((k) => at(k, mk.x, mk.y)); // Marktmitte (vor dem Bau des Markts begehbar)
      const ds = [0, 1].map((k) => at(k, m.site.x, m.site.y));
      expect(Math.min(...dm), `${tag}: Markt erreichbar (${mk.x},${mk.y})`).toBeGreaterThan(0);
      expect(Math.min(...ds), `${tag}: Fundstelle erreichbar`).toBeGreaterThan(0);
      expect(Math.abs(dm[0] - dm[1]), `${tag}: Marktwege ${dm}`).toBeLessThanOrEqual(Math.max(4, 0.15 * Math.max(...dm)));
      expect(Math.abs(ds[0] - ds[1]), `${tag}: Fundstellenwege ${ds}`).toBeLessThanOrEqual(Math.max(5, 0.2 * Math.max(...ds)));

      // Rohstoffe am Startplatz
      const wood = [0, 1].map((k) => count(m, k, 15, (i) => m.trees[i] > 0));
      const farm = [0, 1].map((k) => count(m, k, 10, (i) => (m.terrain[i] === T.GRAS || m.terrain[i] === T.LEHM) && !m.trees[i]));
      const shore = [0, 1].map((k) => count(m, k, RULES.buildRadius + 1, (i) => isWater(m.terrain[i]) || m.terrain[i] === T.WATT));
      const sp = (['lehmgrube', 'heringszaun', 'bauernhof', 'kaserne', 'markt'] as BuildingType[]).map((t) => [t, [0, 1].map((k) => spots(m, k, t))] as const);
      console.log(`${tag}: Holz ${wood} Acker ${farm} Wasser ${shore} Wege Markt ${dm} Fund ${ds} | ${sp.map(([t, v]) => `${t} ${v}`).join(' · ')}`);
      expect(Math.min(...wood), `${tag}: Holz ${wood}`).toBeGreaterThanOrEqual(45);
      expect(ratio(wood[0], wood[1]), `${tag}: Holz ${wood}`).toBeGreaterThanOrEqual(0.8);
      // Küstenplätze haben etwas weniger Acker, dafür mehr Fischgründe
      expect(ratio(farm[0], farm[1]), `${tag}: Acker ${farm}`).toBeGreaterThanOrEqual(0.75);
      expect(Math.min(...farm), `${tag}: Acker ${farm}`).toBeGreaterThanOrEqual(150);
      const fish = sp.find(([t]) => t === 'heringszaun')![1];
      expect(Math.min(...fish), `${tag}: Fischplätze ${fish}`).toBeGreaterThanOrEqual(3);
      expect(ratio(fish[0], fish[1]), `${tag}: Fischplätze ${fish}`).toBeGreaterThanOrEqual(0.25);
      for (const [t, v] of sp) expect(Math.min(...v), `${tag}: Bauplätze ${t} ${v}`).toBeGreaterThan(t === 'heringszaun' || t === 'lehmgrube' ? 0 : 5);
    }
  });

  test('KI gegen KI läuft ohne Fehler und kommt voran', () => {
    const w = new World({ seed: 31337, mapId: id, players: [
      { name: 'A', color: 0, slot: 0, isAI: true, aiLevel: 'normal', faction: 'angeln' },
      { name: 'B', color: 1, slot: 1, isAI: true, aiLevel: 'normal', faction: 'friesen' }] });
    const ais = [new AI(0, 'normal'), new AI(1, 'normal')];
    for (let t = 0; t < 8 * 60 * RULES.tickRate && w.winner < 0; t++) {
      for (const a of ais) a.update(w);
      w.step();
    }
    const bl = (p: number) => [...w.ents.values()].filter((e) => e.kind === 'b' && e.owner === p).length;
    console.log(`${id}: nach ${(w.tick / 600).toFixed(1)} min Gebäude ${bl(0)}/${bl(1)} Prestige ${w.players.map((p) => p.prestige)} Sieger ${w.winner}`);
    expect(bl(0)).toBeGreaterThanOrEqual(6);
    expect(bl(1)).toBeGreaterThanOrEqual(6);
  }, 120000);
});
