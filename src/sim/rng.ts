// Deterministischer Zufallsgenerator (mulberry32). Zustand ist eine einzelne Zahl und damit speicherbar.
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
}

/** Wertrauschen auf einem groben Gitter, bilinear interpoliert. */
export function makeNoise(rng: Rng, w: number, h: number, cell: number): (x: number, y: number) => number {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return (x, y) => {
    const fx = x / cell, fy = y / cell;
    const fx0 = Math.floor(fx), fy0 = Math.floor(fy);
    const tx = fx - fx0, ty = fy - fy0;
    // periodisch kacheln, damit beliebige (auch negative/große) Koordinaten gültig sind
    const ix = ((fx0 % gw) + gw) % gw, iy = ((fy0 % gh) + gh) % gh;
    const ix1 = (ix + 1) % gw, iy1 = (iy + 1) % gh;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix1];
    const c = g[iy1 * gw + ix], d = g[iy1 * gw + ix1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
