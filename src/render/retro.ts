// Retro-Grafik im Stil klassischer Isometrie-Strategiespiele (Age of Empires II, Red Alert 2):
// grobes Pixelraster, feste Farbpalette, harte Alphakanten, dunkle Konturen, geordnetes Dithering.
// Reine Pixelfunktion ohne DOM – dadurch in Node testbar. Die Bildmaße bleiben unverändert,
// jedes Rasterpixel wird als Block wieder hochgesetzt (Nearest-Neighbor), Anker bleiben gültig.
import type { ArtCategory } from './artstyles';

export interface RetroOptions {
  /** Kantenlänge eines Retro-Pixels in Quellpixeln (Sprites: 2, Einheiten: 4). */
  block: number;
  category: ArtCategory;
}

// ------------------------------------------------------------------ Palette
type RGB = [number, number, number];

function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Spielerfarben (siehe sprites.ts PLAYER_COLORS) bleiben als Ankerfarben exakt erhalten. */
const ANCHORS: RGB[] = [
  [0xb3, 0x34, 0x2b], [0x2f, 0x5e, 0xa6], [0xd4, 0xa2, 0x1f], [0x3f, 0x8a, 0x3c],
];

function buildPalette(): RGB[] {
  const out: RGB[] = [];
  // 12 Farbtöne x 3 Sättigungen x 6 Helligkeiten + Grautreppe: rund 240 Farben wie die 256er-Paletten der Vorbilder.
  for (let h = 0; h < 360; h += 30) {
    for (const s of [0.28, 0.5, 0.78]) {
      for (const l of [0.13, 0.25, 0.37, 0.5, 0.65, 0.82]) out.push(hsl(h, s, l));
    }
  }
  // Zusätzliche warme Braun-/Holz- und Erdtöne (viele Gebäude, Wege, Ufer) mit feinerer Abstufung.
  for (const [h, s] of [[22, 0.4], [30, 0.32], [38, 0.45], [14, 0.35]] as const) {
    for (const l of [0.18, 0.3, 0.43, 0.56, 0.7]) out.push(hsl(h, s, l));
  }
  for (let k = 0; k < 12; k++) {
    const v = Math.round((k / 11) * 255);
    out.push([v, v, v]);
  }
  for (const a of ANCHORS) {
    out.push(a);
    out.push([Math.round(a[0] * 0.68), Math.round(a[1] * 0.68), Math.round(a[2] * 0.68)]);
    out.push([Math.min(255, Math.round(a[0] * 1.25)), Math.min(255, Math.round(a[1] * 1.25)), Math.min(255, Math.round(a[2] * 1.25))]);
  }
  return out;
}

export const RETRO_PALETTE: readonly RGB[] = buildPalette();

// 15-Bit-Nachschlagetabelle (Index + 1; 0 = noch nicht berechnet).
const lut = new Uint16Array(32768);

function nearest(r: number, g: number, b: number): number {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  const hit = lut[key];
  if (hit) return hit - 1;
  // Mitte der Zelle, damit Rundung nicht systematisch dunkler ausfällt.
  const cr = (r & 0xf8) | 4, cg = (g & 0xf8) | 4, cb = (b & 0xf8) | 4;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < RETRO_PALETTE.length; i++) {
    const p = RETRO_PALETTE[i];
    const rm = (p[0] + cr) / 2; // „redmean“-Abstand: näher an der Wahrnehmung als reines RGB
    const dr = p[0] - cr, dg = p[1] - cg, db = p[2] - cb;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  lut[key] = best + 1;
  return best;
}

// ------------------------------------------------------------------ Verarbeitung
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clamp8 = (n: number): number => (n < 0 ? 0 : n > 255 ? 255 : n);

/**
 * Wandelt RGBA-Daten (w x h) in den Retro-Look um und liefert neue Daten gleicher Größe.
 * Ablauf: Block-Mittelung (alphagewichtet) → Kontrast/Sättigung → Dithering → Palette → Kontur → Hochsetzen.
 */
export function retroProcess(src: Uint8ClampedArray, w: number, h: number, opt: RetroOptions): Uint8ClampedArray {
  const b = Math.max(1, Math.round(opt.block));
  const gw = Math.ceil(w / b), gh = Math.ceil(h / b);
  const cat = opt.category;
  const ground = cat === 'terrain';
  const outline = cat !== 'terrain';
  const dither = 0;

  // 1) Raster füllen
  const cr = new Uint8Array(gw * gh), cg = new Uint8Array(gw * gh), cb = new Uint8Array(gw * gh);
  const ca = new Uint8Array(gw * gh); // 0 = leer, 1 = Schatten (halbtransparent), 2 = deckend
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let sr = 0, sg = 0, sb = 0, sa = 0, n = 0;
      const x1 = Math.min(w, (gx + 1) * b), y1 = Math.min(h, (gy + 1) * b);
      for (let y = gy * b; y < y1; y++) {
        for (let x = gx * b; x < x1; x++) {
          const i = (y * w + x) * 4;
          const a = src[i + 3];
          n++;
          if (!a) continue;
          sr += src[i] * a;
          sg += src[i + 1] * a;
          sb += src[i + 2] * a;
          sa += a;
        }
      }
      const gi = gy * gw + gx;
      if (!sa) continue;
      const alpha = sa / (n * 255); // mittlere Deckkraft des Blocks
      let r = sr / sa, g = sg / sa, bl = sb / sa;
      const lum = r * 0.299 + g * 0.587 + bl * 0.114;
      if (ground) {
        // Gelände: jede Berührung zählt als deckend, damit zwischen den Rauten keine Lücken bleiben.
        ca[gi] = 2;
      } else if (alpha < 0.12) {
        continue;
      } else if (alpha < 0.62 && lum < 70) {
        ca[gi] = 1; // Schlagschatten: bleibt halbtransparent (eine einzige Stufe)
      } else if (alpha >= 0.5) {
        ca[gi] = 2;
      } else {
        continue;
      }
      if (ca[gi] === 2 || ground) {
        // Kontrast und Sättigung leicht anheben: kräftigere, „gemalte“ Farben
        const l2 = lum;
        r = l2 + (r - l2) * 1.14;
        g = l2 + (g - l2) * 1.14;
        bl = l2 + (bl - l2) * 1.14;
        r = (r - 128) * 1.06 + 128;
        g = (g - 128) * 1.06 + 128;
        bl = (bl - 128) * 1.06 + 128;
      }
      if (dither && ca[gi] === 2) {
        const d = (BAYER4[(gy & 3) * 4 + (gx & 3)] / 15 - 0.5) * dither * 2;
        r += d;
        g += d;
        bl += d;
      }
      cr[gi] = clamp8(Math.round(r));
      cg[gi] = clamp8(Math.round(g));
      cb[gi] = clamp8(Math.round(bl));
    }
  }

  // 2) Palette anwenden und Kontur ermitteln
  const pr = new Uint8Array(gw * gh), pg = new Uint8Array(gw * gh), pb = new Uint8Array(gw * gh);
  for (let gi = 0; gi < gw * gh; gi++) {
    if (!ca[gi]) continue;
    const p = RETRO_PALETTE[nearest(cr[gi], cg[gi], cb[gi])];
    pr[gi] = p[0];
    pg[gi] = p[1];
    pb[gi] = p[2];
  }
  if (outline) {
    const dark = cat === 'foliage' ? 0.62 : cat === 'unit' ? 0.42 : 0.5;
    const edge = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const gi = gy * gw + gx;
        if (ca[gi] !== 2) continue;
        // Kontur dort, wo ein deckendes Pixel an „leer“ oder an einen Schatten grenzt.
        const left = gx > 0 && ca[gi - 1] === 2, right = gx + 1 < gw && ca[gi + 1] === 2;
        const up = gy > 0 && ca[gi - gw] === 2, down = gy + 1 < gh && ca[gi + gw] === 2;
        if (!left || !right || !up || !down) edge[gi] = 1;
      }
    }
    for (let gi = 0; gi < gw * gh; gi++) {
      if (!edge[gi]) continue;
      // Warm-dunkle Kontur statt Schwarz (Vorbild: Sprites von AoE II); anschließend ebenfalls an die Palette gebunden.
      const p = RETRO_PALETTE[nearest(pr[gi] * dark * 0.95, pg[gi] * dark * 0.88, pb[gi] * dark * 0.8)];
      pr[gi] = p[0];
      pg[gi] = p[1];
      pb[gi] = p[2];
    }
  }

  // 3) Hochsetzen auf Originalgröße
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const gy = Math.floor(y / b);
    for (let x = 0; x < w; x++) {
      const gi = gy * gw + Math.floor(x / b);
      const t = ca[gi];
      if (!t) continue;
      const o = (y * w + x) * 4;
      out[o] = pr[gi];
      out[o + 1] = pg[gi];
      out[o + 2] = pb[gi];
      out[o + 3] = t === 2 ? 255 : 105;
    }
  }
  return out;
}
