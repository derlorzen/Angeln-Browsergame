// Gemeinsame Nachbarschaftsmasken für Linienobjekte (Knick/Deich/Wall), Gräben und Tore.
import { T, isBarrier, isWater, type GameMap } from '../sim/map';

export type BarrierStyle = 'knick' | 'deich' | 'wall';

export function barrierStyle(t: number): BarrierStyle | null {
  return t === T.KNICK ? 'knick' : t === T.DEICH ? 'deich' : t === T.WALL ? 'wall' : null;
}

/** Maskenbits: 1 = +x, 2 = −x, 4 = +y, 8 = −y; 16 = Variante. */
export function barrierMask(m: GameMap, x: number, y: number): number {
  const { w, h, terrain, variant } = m;
  const own = terrain[y * w + x];
  const link = (xx: number, yy: number) => {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
    const q = terrain[yy * w + xx];
    return q === own || q === T.TOR;
  };
  let k = 0;
  if (link(x + 1, y)) k |= 1;
  if (link(x - 1, y)) k |= 2;
  if (link(x, y + 1)) k |= 4;
  if (link(x, y - 1)) k |= 8;
  if (variant[y * w + x] % 5 === 0) k |= 16;
  return k;
}

export function ditchMask(m: GameMap, x: number, y: number): number {
  const { w, h, terrain } = m;
  const link = (xx: number, yy: number) => {
    if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
    const q = terrain[yy * w + xx];
    return q === T.GRABEN || isWater(q);
  };
  let k = 0;
  if (link(x + 1, y)) k |= 1;
  if (link(x - 1, y)) k |= 2;
  if (link(x, y + 1)) k |= 4;
  if (link(x, y - 1)) k |= 8;
  return k;
}

/** Tor liegt in einer Linie entlang x (Nachbarn links/rechts sind Hindernisse). */
export function gateAlongX(m: GameMap, x: number, y: number): boolean {
  const { w, terrain } = m;
  return isBarrier(terrain[y * w + x + 1] ?? -1) || isBarrier(terrain[y * w + x - 1] ?? -1);
}
