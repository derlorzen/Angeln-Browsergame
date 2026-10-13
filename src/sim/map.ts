// Kartengenerator: spielerische, vereinfachte Interpretation der Landschaft Angeln.
// Kompass: Kachel (0,0) ist die Nordspitze der isometrischen Raute. "Ost" = x - y groß, "Süd" = x + y groß.
import { Rng, makeNoise } from './rng';
import { MinHeap } from './heap';

export const T = {
  GRAS: 0,
  WASSER: 1,
  FLACH: 2,
  UFER: 3,
  MOOR: 4,
  WEG: 5,
  KNICK: 6,
  LEHM: 7,
  TOR: 8,
} as const;
export type Terrain = (typeof T)[keyof typeof T];

export interface Slot {
  name: string;
  x: number; // Dorfzentrum oben-links
  y: number;
}

export interface GameMap {
  w: number;
  h: number;
  seed: number;
  terrain: Uint8Array;
  trees: Uint8Array; // Holzmenge je Kachel, 0 = kein Baum
  variant: Uint8Array; // Zufallsvariante für Grafik
  slots: Slot[];
  market: { x: number; y: number };
  moor: { x: number; y: number };
  labels: { name: string; x: number; y: number }[];
}

export const MAP_W = 96;
export const MAP_H = 96;

const geo = (e: number, s: number) => ({ x: Math.round((s + e) / 2), y: Math.round((s - e) / 2) });

export function isWater(t: number): boolean {
  return t === T.WASSER || t === T.FLACH;
}
/** Grundsätzlich begehbares Gelände (ohne Bäume und Gebäude). */
export function terrainWalkable(t: number): boolean {
  return t !== T.WASSER && t !== T.FLACH && t !== T.KNICK;
}

export function generateMap(seed: number): GameMap {
  const w = MAP_W, h = MAP_H;
  const rng = new Rng(seed);
  const n1 = makeNoise(rng, w, h, 9);
  const n2 = makeNoise(rng, w, h, 5);
  const n3 = makeNoise(rng, w, h, 4);
  const terrain = new Uint8Array(w * h);
  const trees = new Uint8Array(w * h);
  const variant = new Uint8Array(w * h);
  for (let i = 0; i < variant.length; i++) variant[i] = rng.int(256);

  const kappeln = geo(32, 60);
  const arnis = geo(32, 130);
  const slots: Slot[] = [
    { name: 'Kappeln', x: kappeln.x - 1, y: kappeln.y - 1 },
    { name: 'Arnis', x: arnis.x - 1, y: arnis.y - 1 },
    // Für spätere 4-Spieler-Partien vorbereitet:
    { name: 'Steinberg', ...geo(-18, 40) },
    { name: 'Boren', ...geo(-18, 150) },
  ];
  const marketC = geo(-41, 95);
  const market = { x: marketC.x - 1, y: marketC.y - 1 };
  const moor = geo(-62, 95);

  const idx = (x: number, y: number) => y * w + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;

  // 1) Schlei (Meeresarm der Ostsee) im Osten, Ostufer (Schwansen) als unerreichbares Gegenufer.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const e = x - y, s = x + y;
      const wob = Math.sin(s * 0.075) * 5 + (n1(x, y) - 0.5) * 6;
      const thr = 49 + wob - Math.max(0, 50 - s) * 0.35;
      let water = e > thr;
      const eastBank = 80 + Math.sin(s * 0.11) * 4 + (n2(x, y) - 0.5) * 5;
      if (e > eastBank && s > 70 && s < 140) water = false;
      terrain[idx(x, y)] = water ? T.WASSER : T.GRAS;
    }
  // Kleine Noor-Bucht zwischen den Siedlungen, damit die Uferlinie lebendig wirkt.
  {
    const c = geo(44, 96);
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x * 1.2, y) + (n3(c.x + x, c.y + y) - 0.5) * 2;
        if (d < 3.6 && inside(c.x + x, c.y + y)) terrain[idx(c.x + x, c.y + y)] = T.WASSER;
      }
  }
  // Ufer und Flachwasser
  const near = (x: number, y: number, pred: (t: number) => boolean) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && inside(nx, ny) && pred(terrain[idx(nx, ny)])) return true;
      }
    return false;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = terrain[idx(x, y)];
      if (t === T.GRAS && near(x, y, (q) => q === T.WASSER)) terrain[idx(x, y)] = T.UFER;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (terrain[idx(x, y)] === T.WASSER && near(x, y, (q) => q === T.UFER)) terrain[idx(x, y)] = T.FLACH;
    }

  // 2) Thorsberger Moor
  for (let y = -7; y <= 7; y++)
    for (let x = -7; x <= 7; x++) {
      const px = moor.x + x, py = moor.y + y;
      if (!inside(px, py)) continue;
      const d = Math.hypot(x, y * 1.3) + (n2(px, py) - 0.5) * 4;
      if (d < 5.2 && terrain[idx(px, py)] === T.GRAS) terrain[idx(px, py)] = T.MOOR;
    }

  // Schutzzonen um Siedlungsplätze und Markt
  const clearZones = [...slots.slice(0, 2).map((s) => ({ x: s.x + 1, y: s.y + 1, r: 7 })), { x: market.x + 1, y: market.y + 1, r: 6 }];
  const inClear = (x: number, y: number, extra = 0) =>
    clearZones.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + extra) || Math.hypot(x - moor.x, y - moor.y) < 7;

  // 3) Lehmboden (Grundmoräne): Rauschflecken + garantiert je ein Feld nahe jedem Startplatz
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (terrain[idx(x, y)] === T.GRAS && n3(x + 50, y + 50) > 0.78 && !inClear(x, y)) terrain[idx(x, y)] = T.LEHM;
  const blob = (cx: number, cy: number, r: number, fn: (x: number, y: number) => void) => {
    for (let y = -r - 1; y <= r + 1; y++)
      for (let x = -r - 1; x <= r + 1; x++) {
        const px = cx + x, py = cy + y;
        if (inside(px, py) && Math.hypot(x, y) + (n2(px * 3, py * 3) - 0.5) * 1.5 < r) fn(px, py);
      }
  };
  const symOffsets = (dx: number, dy: number, slotIndex: number) => {
    // Kappeln (0) und Arnis (1) sind an der Achse s=95 gespiegelt: (x,y) -> (95-y, 95-x)
    if (slotIndex === 0) return { dx, dy };
    return { dx: -dy, dy: -dx };
  };
  for (let si = 0; si < 2; si++) {
    const sl = slots[si];
    const cx = sl.x + 1, cy = sl.y + 1;
    const lo = symOffsets(-8, 3, si);
    blob(cx + lo.dx, cy + lo.dy, 2.2, (x, y) => {
      if (terrain[idx(x, y)] === T.GRAS) terrain[idx(x, y)] = T.LEHM;
    });
  }

  // 4) Wälder
  const plantTree = (x: number, y: number) => {
    const i = idx(x, y);
    if (terrain[i] === T.GRAS) trees[i] = 50 + rng.int(40);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = n2(x, y) * 0.6 + n1(x + 13, y + 7) * 0.4;
      if (v > 0.66 && !inClear(x, y, 1)) plantTree(x, y);
    }
  for (let si = 0; si < 2; si++) {
    const sl = slots[si];
    const cx = sl.x + 1, cy = sl.y + 1;
    const fo = symOffsets(-3, 10, si);
    blob(cx + fo.dx, cy + fo.dy, 3.2, plantTree);
    const fo2 = symOffsets(-11, -4, si);
    blob(cx + fo2.dx, cy + fo2.dy, 2.6, plantTree);
  }
  // Wälder am Markt (neutrale Holzquelle)
  blob(market.x + 9, market.y - 5, 3, plantTree);
  blob(market.x - 4, market.y + 9, 2.5, plantTree);

  // 5) Dorfwege via A* auf Kosten (Gras billig, Wald teuer, Wasser unpassierbar)
  const carveRoad = (ax: number, ay: number, bx: number, by: number) => {
    const N = w * h;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const open = new MinHeap();
    const s0 = idx(ax, ay), goal = idx(bx, by);
    g[s0] = 0;
    open.push(s0, 0);
    const done = new Uint8Array(N);
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) break;
      if (done[cur]) continue;
      done[cur] = 1;
      const cx = cur % w, cy = Math.floor(cur / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inside(nx, ny)) continue;
        const ni = idx(nx, ny);
        const t = terrain[ni];
        if (isWater(t)) continue;
        let c = 1 + n3(nx * 2, ny * 2) * 0.6;
        if (trees[ni]) c += 6;
        if (t === T.MOOR) c += 3;
        if (t === T.UFER) c += 1.5;
        if (t === T.WEG) c = 0.4;
        if (g[cur] + c < g[ni]) {
          g[ni] = g[cur] + c;
          from[ni] = cur;
          open.push(ni, g[ni] + Math.abs(nx - bx) + Math.abs(ny - by) * 0.9);
        }
      }
    }
    let cur = goal;
    let guard = 0;
    while (cur !== -1 && guard++ < N) {
      if (terrain[cur] !== T.MOOR) terrain[cur] = T.WEG;
      trees[cur] = 0;
      cur = from[cur];
    }
  };
  const mC = { x: market.x + 1, y: market.y + 1 };
  carveRoad(slots[0].x + 1, slots[0].y + 3, mC.x, mC.y + 2);
  carveRoad(slots[1].x - 1, slots[1].y + 1, mC.x + 2, mC.y);
  carveRoad(slots[0].x + 3, slots[0].y + 2, slots[1].x + 1, slots[1].y - 1);
  carveRoad(mC.x - 2, mC.y, moor.x + 2, moor.y);
  carveRoad(slots[2].x, slots[2].y, mC.x, mC.y - 2);
  carveRoad(slots[3].x, slots[3].y, mC.x - 1, mC.y + 2);

  // 6) Knicks: bewachsene Erdwälle entlang eines Feldrasters, mit Toren an Wegen und Lücken.
  const isKnickLine = (x: number, y: number) => (x + 2) % 10 === 0 || (y + 6) % 10 === 0;
  const canKnick = (x: number, y: number) => {
    const t = terrain[idx(x, y)];
    return (t === T.GRAS || t === T.LEHM) && !trees[idx(x, y)] && !inClear(x, y, 2) && !near(x, y, (q) => q === T.UFER || isWater(q));
  };
  // Segmente entlang x-Linien
  const segRng = new Rng(seed ^ 0x5eed);
  const placeSegment = (tiles: [number, number][]) => {
    if (segRng.next() > 0.62) return;
    const gap = tiles.length > 4 && segRng.next() < 0.45 ? 1 + segRng.int(tiles.length - 2) : -1;
    tiles.forEach(([x, y], k) => {
      const i = idx(x, y);
      if (terrain[i] === T.WEG) {
        terrain[i] = T.TOR;
        return;
      }
      if (k === gap) return;
      if (canKnick(x, y)) terrain[i] = T.KNICK;
    });
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((x + 2) % 10 === 0 && (y + 6) % 10 === 1) {
        const seg: [number, number][] = [];
        for (let k = 0; k < 9 && y + k < h; k++) seg.push([x, y + k]);
        placeSegment(seg);
      }
      if ((y + 6) % 10 === 0 && (x + 2) % 10 === 1) {
        const seg: [number, number][] = [];
        for (let k = 0; k < 9 && x + k < w; k++) seg.push([x + k, y]);
        placeSegment(seg);
      }
    }
  // Knick an Wegkreuzung ohne Wall daneben -> wieder Weg
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (terrain[i] === T.TOR && !near(x, y, (q) => q === T.KNICK)) terrain[i] = T.WEG;
      if (terrain[i] === T.TOR && !isKnickLine(x, y)) terrain[i] = T.WEG;
    }

  // Startplätze garantiert frei
  for (const z of clearZones)
    for (let y = -3; y <= 3; y++)
      for (let x = -3; x <= 3; x++) {
        const px = z.x + x, py = z.y + y;
        if (!inside(px, py)) continue;
        const i = idx(px, py);
        trees[i] = 0;
        if (terrain[i] !== T.WEG && !isWater(terrain[i])) terrain[i] = T.GRAS;
      }

  // Garantie: Jeder Startplatz hat in Baureichweite eine freie 3x3-Fläche Lehmboden.
  for (let si = 0; si < 2; si++) {
    const sl = slots[si];
    const cx = sl.x + 1, cy = sl.y + 1;
    const cands: [number, number][] = [[-8, 3], [-7, -3], [-3, 7], [3, -8], [-8, -1], [-6, 6], [6, -6], [-9, 1], [1, 8]];
    for (const [ox, oy] of cands) {
      const o = symOffsets(ox, oy, si);
      const x0 = cx + o.dx - 1, y0 = cy + o.dy - 1;
      let ok = true;
      for (let y = y0 - 1; y <= y0 + 3 && ok; y++)
        for (let x = x0 - 1; x <= x0 + 3 && ok; x++) {
          if (!inside(x, y)) ok = false;
          else {
            const t = terrain[idx(x, y)];
            if (isWater(t) || t === T.WEG || t === T.TOR || t === T.KNICK || t === T.MOOR || t === T.UFER) ok = false;
          }
        }
      if (!ok) continue;
      for (let y = y0; y < y0 + 3; y++)
        for (let x = x0; x < x0 + 3; x++) {
          terrain[idx(x, y)] = T.LEHM;
          trees[idx(x, y)] = 0;
        }
      break;
    }
  }

  const labels = [
    { name: 'Kappeln', x: slots[0].x + 1, y: slots[0].y - 3 },
    { name: 'Arnis', x: slots[1].x + 1, y: slots[1].y - 3 },
    { name: 'Süderbrarup', x: market.x + 1, y: market.y - 3 },
    { name: 'Thorsberger Moor', x: moor.x, y: moor.y + 5 },
    { name: 'Die Schlei', ...geo(62, 80) },
    { name: 'Ostsee', ...geo(72, 40) },
    { name: 'Schwansen', ...geo(87, 105) },
  ];

  return { w, h, seed, terrain, trees, variant, slots, market, moor, labels };
}
