// Rasterbasierte Wegfindung: A* mit 8 Richtungen, ohne Eckenschneiden, Geländekosten
// (Weg schneller, Moor langsamer) und anschließender Glättung über Sichtlinien.
import { MinHeap } from './heap';

export interface PathGrid {
  w: number;
  h: number;
  /** 1 = begehbar */
  pass: Uint8Array;
  /** Bewegungskostenfaktor pro Kachel (1 = normal) */
  cost: Float32Array;
}

const SQ2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2],
];

let gScore = new Float32Array(0);
let parent = new Int32Array(0);
let stamp = new Uint32Array(0);
let closed = new Uint32Array(0);
let curStamp = 1;
const heap = new MinHeap();

export interface PathStats {
  calls: number;
  expanded: number;
}
export const pathStats: PathStats = { calls: 0, expanded: 0 };

/**
 * Sucht einen Weg von (sx,sy) zu einer Zielkachel, für die isGoal wahr ist.
 * hx/hy: Zielpunkt für die Heuristik. Liefert Kachelindizes ohne Start oder null.
 * Wird das Ziel nicht erreicht, endet der Weg an der erreichbaren Kachel mit der kleinsten Heuristik
 * (sofern allowPartial), damit Einheiten sich wenigstens annähern.
 */
export function findPath(
  grid: PathGrid,
  sx: number,
  sy: number,
  isGoal: (i: number) => boolean,
  hx: number,
  hy: number,
  maxNodes = 16000,
  allowPartial = true,
): number[] | null {
  const { w, h, pass, cost } = grid;
  const N = w * h;
  if (gScore.length !== N) {
    gScore = new Float32Array(N);
    parent = new Int32Array(N);
    stamp = new Uint32Array(N);
    closed = new Uint32Array(N);
  }
  curStamp++;
  if (curStamp > 0xfffffff0) {
    stamp.fill(0);
    closed.fill(0);
    curStamp = 1;
  }
  pathStats.calls++;
  const start = sy * w + sx;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const heur = (i: number) => {
    const dx = Math.abs((i % w) - hx), dy = Math.abs(((i / w) | 0) - hy);
    return (dx + dy + (SQ2 - 2) * Math.min(dx, dy)) * 0.8;
  };
  heap.clear();
  stamp[start] = curStamp;
  gScore[start] = 0;
  parent[start] = -1;
  heap.push(start, heur(start));
  let best = start, bestH = heur(start);
  let expanded = 0;
  let found = -1;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur] === curStamp) continue;
    closed[cur] = curStamp;
    if (isGoal(cur)) {
      found = cur;
      break;
    }
    if (++expanded > maxNodes) break;
    const hc = heur(cur);
    if (hc < bestH) {
      bestH = hc;
      best = cur;
    }
    const cx = cur % w, cy = (cur / w) | 0;
    const gc = gScore[cur];
    for (let k = 0; k < 8; k++) {
      const d = DIRS[k];
      const nx = cx + d[0], ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!pass[ni]) continue;
      if (k >= 4 && (!pass[cy * w + nx] || !pass[ny * w + cx])) continue; // keine Ecken schneiden
      const ng = gc + d[2] * cost[ni];
      if (stamp[ni] !== curStamp || ng < gScore[ni]) {
        stamp[ni] = curStamp;
        gScore[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + heur(ni));
      }
    }
  }
  pathStats.expanded += expanded;
  let end = found;
  if (end < 0) {
    if (!allowPartial || best === start) return null;
    end = best;
  }
  const out: number[] = [];
  for (let c = end; c !== start && c >= 0; c = parent[c]) out.push(c);
  out.reverse();
  return smooth(grid, start, out);
}

/** Sichtlinie für Bewegung: alle überstrichenen Kacheln begehbar (Supercover-Linie). */
export function walkLine(grid: PathGrid, a: number, b: number): boolean {
  const { w, pass } = grid;
  let x0 = a % w, y0 = (a / w) | 0;
  const x1 = b % w, y1 = (b / w) | 0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let n = dx + dy + 2;
  while (n-- > 0) {
    if (!pass[y0 * w + x0]) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 > -dy && e2 < dx) {
      // diagonaler Schritt: beide Nachbarn müssen frei sein
      if (!pass[y0 * w + x0 + sx] || !pass[(y0 + sy) * w + x0]) return false;
      err += -dy + dx;
      x0 += sx;
      y0 += sy;
    } else if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    } else {
      err += dx;
      y0 += sy;
    }
  }
  return true;
}

function smooth(grid: PathGrid, start: number, path: number[]): number[] {
  if (path.length < 3) return path;
  const out: number[] = [];
  let anchor = start;
  let i = 0;
  while (i < path.length) {
    // weitester Punkt mit freier Linie (begrenzt, damit es billig bleibt)
    let j = Math.min(path.length - 1, i + 12);
    while (j > i && !(walkLine(grid, anchor, path[j]) && sameCost(grid, anchor, path[j]))) j--;
    out.push(path[j]);
    anchor = path[j];
    i = j + 1;
  }
  return out;
}

function sameCost(grid: PathGrid, a: number, b: number): boolean {
  // Wege nicht über teureres Gelände abkürzen (Straßen sollen genutzt werden)
  return Math.abs(grid.cost[a] - grid.cost[b]) < 0.01;
}

/** Nächste begehbare Kachel um (x,y) per Breitensuche. */
export function nearestPassable(grid: PathGrid, x: number, y: number, maxR = 8): number {
  const { w, h, pass } = grid;
  x = Math.max(0, Math.min(w - 1, x | 0));
  y = Math.max(0, Math.min(h - 1, y | 0));
  if (pass[y * w + x]) return y * w + x;
  for (let r = 1; r <= maxR; r++) {
    let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        if (!pass[ny * w + nx]) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = ny * w + nx;
        }
      }
    if (best >= 0) return best;
  }
  return -1;
}
