// Vier-Spieler-Karten: größere Karte, vier weit verteilte Startplätze, faire Wege und Rohstoffe.
import { describe, expect, test } from 'vitest';
import { BUILDINGS, type BuildingType } from '../src/data/defs';
import { MAP_IDS, T, generateMap, terrainWalkable, type GameMap, type MapId } from '../src/sim/map';
import { checkPlacement } from '../src/sim/rules';

const SEEDS = [1, 42, 777, 31337];

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
function count(m: GameMap, slot: number, r: number, pred: (i: number) => boolean): number {
  const s = m.slots[slot];
  const cx = s.x + 1, cy = s.y + 1;
  let n = 0;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++)
      if (x >= 0 && y >= 0 && x < m.w && y < m.h && Math.hypot(x - cx, y - cy) <= r && pred(y * m.w + x)) n++;
  return n;
}
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
const ratio = (v: number[]) => (Math.max(...v) === 0 ? 1 : Math.min(...v) / Math.max(...v));

describe.each(MAP_IDS.map((id) => [id]))('Vier Spieler: Karte %s', (id: MapId) => {
  test('größere Karte, vier weit verteilte, faire Startplätze', () => {
    for (const seed of SEEDS) {
      const m = generateMap(seed, id, 4);
      const tag = `${id}/${seed}`;
      expect(m.w).toBe(160);
      const st = m.slots.map((s) => ({ x: s.x + 1, y: s.y + 4 }));
      for (const p of st) expect(terrainWalkable(m.terrain[p.y * m.w + p.x]), `${tag}: Startfeld begehbar (${p.x},${p.y})`).toBe(true);
      for (let a = 0; a < 4; a++)
        for (let b = a + 1; b < 4; b++)
          expect(Math.hypot(m.slots[a].x - m.slots[b].x, m.slots[a].y - m.slots[b].y), `${tag}: Abstand ${a}-${b}`).toBeGreaterThanOrEqual(m.w * 0.35);
      const d = st.map((p) => bfs(m, p.x, p.y));
      for (let k = 1; k < 4; k++) expect(d[0][st[k].y * m.w + st[k].x], `${tag}: ${k} erreichbar`).toBeGreaterThan(0);
      const mk = (m.market.y + 1) * m.w + m.market.x + 1;
      const dm = d.map((dd) => dd[mk]);
      expect(Math.min(...dm), `${tag}: Markt erreichbar`).toBeGreaterThan(0);
      expect(Math.max(...dm) - Math.min(...dm), `${tag}: Marktwege ${dm}`).toBeLessThanOrEqual(Math.max(8, 0.45 * Math.max(...dm)));
      const wood = [0, 1, 2, 3].map((k) => count(m, k, 15, (i) => m.trees[i] > 0));
      const farm = [0, 1, 2, 3].map((k) => count(m, k, 10, (i) => (m.terrain[i] === T.GRAS || m.terrain[i] === T.LEHM) && !m.trees[i]));
      const fish = [0, 1, 2, 3].map((k) => spots(m, k, 'heringszaun'));
      console.log(`${tag}: Holz ${wood} Acker ${farm} Fisch ${fish} Markt ${dm}`);
      expect(Math.min(...wood), `${tag}: Holz ${wood}`).toBeGreaterThanOrEqual(45);
      expect(ratio(wood), `${tag}: Holz ${wood}`).toBeGreaterThanOrEqual(0.75);
      expect(Math.min(...farm), `${tag}: Acker ${farm}`).toBeGreaterThanOrEqual(130);
      expect(ratio(farm), `${tag}: Acker ${farm}`).toBeGreaterThanOrEqual(0.6);
      expect(Math.min(...fish), `${tag}: Fisch ${fish}`).toBeGreaterThanOrEqual(3);
      for (const t of ['bauernhof', 'kaserne', 'markt', 'lehmgrube'] as BuildingType[]) {
        const v = [0, 1, 2, 3].map((k) => spots(m, k, t));
        expect(Math.min(...v), `${tag}: Bauplätze ${t} ${v}`).toBeGreaterThan(t === 'lehmgrube' ? 0 : 5);
      }
    }
  });
});

describe('Vier Spieler: Partie', () => {
  test('vier KIs (auch zweimal dieselbe Partei) spielen auf der großen Karte ohne Fehler', async () => {
    const { World } = await import('../src/sim/world');
    const { AI } = await import('../src/ai/ai');
    const { RULES } = await import('../src/data/defs');
    const facs = ['angeln', 'angeln', 'daenen', 'friesen'] as const;
    const w = new World({ seed: 2024, mapId: 'danewerk', prestigeGoal: 0, players: facs.map((f, k) => ({ name: `KI ${k}`, color: k, slot: k, isAI: true, aiLevel: 'normal' as const, faction: f })) });
    expect(w.map.w).toBe(160);
    const ais = facs.map((_, k) => new AI(k, 'normal'));
    const t0 = performance.now();
    for (let t = 0; t < 15 * 60 * RULES.tickRate && w.winner < 0; t++) {
      for (const a of ais) a.update(w);
      w.step();
    }
    const ms = (performance.now() - t0) / w.tick;
    const bl = (p: number) => [...w.ents.values()].filter((e) => e.kind === 'b' && e.owner === p).length;
    console.log(`4 KIs: ${(w.tick / 600).toFixed(1)} min, Gebäude ${[0, 1, 2, 3].map(bl)}, besiegt ${w.players.map((p) => p.defeated)}, ${ms.toFixed(2)} ms/Takt`);
    for (const k of [0, 1, 2, 3]) expect(bl(k) + (w.players[k].defeated ? 99 : 0)).toBeGreaterThanOrEqual(6);
    expect(ms).toBeLessThan(20);
  }, 300000);
});
