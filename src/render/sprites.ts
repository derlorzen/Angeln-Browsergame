// Prozedural erzeugte, gecachte Sprites: Gelände, Bäume, Knicks, Gebäude, Einheiten, Symbole.
import type { BuildingType, Res, UnitType } from '../data/defs';
import {
  S, TH, TW, Iso, boxFaces, bush, canvas, faceAt, fillFace, flag, ground, poly, prng, roof, shade, shadowDiamond,
  wall, windowOn, type Ctx, type Face, type Pt, type RoofMat, type WallMat,
} from './draw';
import { FACTION_DEFS, type ArchStyle, type FactionId } from '../data/factions';
import { ERA_SIZE, drawEra, eraTop } from './era';
import { animal, bands, frontispiz, spire, brickNogging, cart, chicken, chimney, crate, eyebrow, flowers, plankDoor, plinth, steppedGable, tinyPerson, wallShading, wattle, window4, woodpile } from './props';

export const PLAYER_COLORS = ['#b3342b', '#2f5ea6', '#d4a21f', '#3f8a3c'];
export const PLAYER_COLOR_NAMES = ['Ziegelrot', 'Schleiblau', 'Ockergelb', 'Knickgrün'];
export const NEUTRAL_COLOR = '#8c7f6a';

export interface Sprite {
  c: HTMLCanvasElement;
  ax: number; // Ankerpunkt in 1x-Pixeln
  ay: number;
  res?: number; // Pixel je 1x-Pixel (Standard: S)
}

// ------------------------------------------------------------------ Gelände
function diamondClip(g: Ctx, w: number, h: number): void {
  g.beginPath();
  g.moveTo(w / 2, -0.5);
  g.lineTo(w + 0.5, h / 2);
  g.lineTo(w / 2, h + 0.5);
  g.lineTo(-0.5, h / 2);
  g.closePath();
}

function tileCanvas(base: string, seed: number, paint: (g: Ctx, w: number, h: number, r: () => number) => void): HTMLCanvasElement {
  const w = TW * S, h = TH * S;
  const [c, g] = canvas(w, h);
  const r = prng(seed);
  g.save();
  diamondClip(g, w, h);
  g.fillStyle = base;
  g.fill();
  g.clip();
  paint(g, w, h, r);
  g.restore();
  return c;
}

function speckle(g: Ctx, w: number, h: number, r: () => number, colors: string[], n: number, size = 2): void {
  for (let k = 0; k < n; k++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.fillRect(r() * w, r() * h, size, size * (0.6 + r() * 0.8));
  }
}

export interface TerrainSprites {
  gras: HTMLCanvasElement[];
  lehm: HTMLCanvasElement[];
  ufer: HTMLCanvasElement[];
  moor: HTMLCanvasElement[];
  wasser: HTMLCanvasElement[];
  flach: HTMLCanvasElement[];
  feld: HTMLCanvasElement[];
  wave: HTMLCanvasElement[];
  road: HTMLCanvasElement[]; // 16 Nachbarschaftsmasken
  heide: HTMLCanvasElement[];
  watt: HTMLCanvasElement[];
  ditch: HTMLCanvasElement[]; // Gräben, 16 Masken
}

export function makeTerrain(): TerrainSprites {
  const gras = [0, 1, 2, 3].map((v) =>
    tileCanvas(['#6b8740', '#718c44', '#68833d', '#748f47'][v], 11 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#5d7835', '#7f9a50', '#62803a', '#87a056'], 160, 2);
      // Halme
      for (let k = 0; k < 40; k++) {
        const x = r() * w, y = r() * h;
        g.strokeStyle = r() < 0.5 ? '#56702f' : '#8aa45a';
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 2, y - 3);
        g.stroke();
      }
      if (v === 2) speckle(g, w, h, r, ['#e8e2c0', '#d9c64a'], 8, 2); // Wiesenblumen
    }),
  );
  const lehm = [0, 1].map((v) =>
    tileCanvas('#8a6a42', 31 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#7a5b36', '#9b7a4d', '#6f5232', '#a5845a'], 220, 2);
      speckle(g, w, h, r, ['#6b8740'], 20, 3);
    }),
  );
  const ufer = [0, 1, 2].map((v) =>
    tileCanvas('#a99a68', 41 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#b9aa77', '#968857', '#c4b788'], 200, 2);
      // Schilf
      for (let k = 0; k < 14; k++) {
        const x = r() * w, y = h * 0.2 + r() * h * 0.7;
        for (let s = 0; s < 4; s++) {
          g.strokeStyle = r() < 0.5 ? '#6f7a3a' : '#8c8f4a';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(x + s * 1.5, y);
          g.quadraticCurveTo(x + s * 1.5 + 1, y - 6, x + s * 2 + (r() - 0.5) * 4, y - 10 - r() * 4);
          g.stroke();
        }
      }
    }),
  );
  const moor = [0, 1, 2].map((v) =>
    tileCanvas('#4f4b2e', 51 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#5a5533', '#433f26', '#615a35', '#3a3a28'], 200, 2);
      for (let k = 0; k < 2; k++) {
        g.fillStyle = '#2f3d3f';
        g.beginPath();
        g.ellipse(w * (0.25 + r() * 0.5), h * (0.3 + r() * 0.4), 8 + r() * 10, 4 + r() * 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(140,170,170,0.25)';
        g.fillRect(w * 0.3 + r() * 20, h * 0.45, 6, 1);
      }
      speckle(g, w, h, r, ['#f2efe6', '#e8e4d6'], 14, 2); // Wollgras
      speckle(g, w, h, r, ['#7c4f5a', '#8a5a62'], 20, 2); // Heide
    }),
  );
  const wasser = [0, 1, 2, 3].map((v) =>
    tileCanvas('#3d5f78', 61 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#395a72', '#42667f', '#36556c'], 120, 3);
    }),
  );
  const flach = [0, 1].map((v) =>
    tileCanvas('#4f7a8c', 71 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#5a8696', '#4a7284', '#64909c'], 140, 3);
    }),
  );
  const feld = [0, 1, 2].map((v) =>
    tileCanvas(['#b39a4a', '#a8923f', '#8f9443'][v], 81 + v, (g, w, h, r) => {
      // Furchen parallel zur x-Achse
      for (let k = -8; k < 16; k++) {
        g.strokeStyle = k % 2 ? 'rgba(90,70,30,0.5)' : 'rgba(230,210,120,0.45)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(k * 12, 0);
        g.lineTo(k * 12 + w, h);
        g.stroke();
      }
      speckle(g, w, h, r, ['#d8c066', '#9e8a3a', '#c9b45a'], 90, 2);
    }),
  );
  const wave = [0, 1, 2, 3].map((f) => {
    const w = TW * S, h = TH * S;
    const [c, g] = canvas(w, h);
    const r = prng(91 + f);
    g.save();
    diamondClip(g, w, h);
    g.clip();
    g.strokeStyle = 'rgba(200,225,235,0.5)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 7; k++) {
      const x = r() * w, y = r() * h;
      const l = 6 + r() * 8;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y - 2, x + l, y);
      g.stroke();
    }
    g.restore();
    return c;
  });
  const road: HTMLCanvasElement[] = [];
  for (let m = 0; m < 16; m++) {
    const w = TW * S, h = TH * S;
    const [c, g] = canvas(w, h);
    const r = prng(100 + m);
    const cx = w / 2, cy = h / 2;
    g.save();
    diamondClip(g, w, h);
    g.clip();
    g.fillStyle = '#9b8458';
    g.strokeStyle = '#9b8458';
    g.lineCap = 'round';
    g.lineWidth = 26;
    // Maskenbits: 1 = +x (rechts unten), 2 = -x (links oben), 4 = +y (links unten), 8 = -y (rechts oben)
    const ends: Pt[] = [];
    if (m & 1) ends.push([cx + w / 4, cy + h / 4]);
    if (m & 2) ends.push([cx - w / 4, cy - h / 4]);
    if (m & 4) ends.push([cx - w / 4, cy + h / 4]);
    if (m & 8) ends.push([cx + w / 4, cy - h / 4]);
    for (const e of ends) {
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(e[0] + (e[0] - cx) * 0.2, e[1] + (e[1] - cy) * 0.2);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(cx, cy, 20, 11, 0, 0, Math.PI * 2);
    g.fill();
    // Fahrspuren und Steine
    g.globalCompositeOperation = 'source-atop';
    speckle(g, w, h, r, ['#8a7449', '#ad9568', '#7d6a45'], 160, 2);
    g.restore();
    road.push(c);
  }
  const heide = [0, 1, 2].map((v) =>
    tileCanvas(['#7a6a52', '#806e56', '#74664e'][v], 111 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#6a5a44', '#8a7a5c', '#5f6a3a'], 160, 2);
      // blühendes Heidekraut
      for (let k = 0; k < 60; k++) {
        g.fillStyle = r() < 0.6 ? '#8a5a78' : '#a07090';
        g.fillRect(r() * w, r() * h, 2, 2);
      }
      speckle(g, w, h, r, ['#5a6a34', '#6a7a3a'], 30, 3);
    }),
  );
  const watt = [0, 1, 2].map((v) =>
    tileCanvas(['#8a8270', '#857d6a', '#908874'][v], 121 + v, (g, w, h, r) => {
      speckle(g, w, h, r, ['#7a7260', '#9a927e', '#6f6858'], 160, 2);
      // Rippelmarken und Pfützen
      g.strokeStyle = 'rgba(70,64,52,0.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 9; k++) {
        const y = r() * h, x = r() * w;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 6, y - 2, x + 12, y);
        g.stroke();
      }
      for (let k = 0; k < 3; k++) {
        g.fillStyle = 'rgba(90,120,135,0.45)';
        g.beginPath();
        g.ellipse(r() * w, r() * h, 4 + r() * 8, 2 + r() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }),
  );
  const ditch: HTMLCanvasElement[] = [];
  for (let m = 0; m < 16; m++) {
    const w = TW * S, h = TH * S;
    const [c, g] = canvas(w, h);
    const cx = w / 2, cy = h / 2;
    g.save();
    diamondClip(g, w, h);
    g.clip();
    const ends: Pt[] = [];
    if (m & 1) ends.push([cx + w / 4, cy + h / 4]);
    if (m & 2) ends.push([cx - w / 4, cy - h / 4]);
    if (m & 4) ends.push([cx - w / 4, cy + h / 4]);
    if (m & 8) ends.push([cx + w / 4, cy - h / 4]);
    if (!ends.length) ends.push([cx + w / 4, cy + h / 4], [cx - w / 4, cy - h / 4]);
    g.lineCap = 'round';
    for (const [col, lw] of [['#5d7a3a', 18], ['#3f6274', 11], ['#5a8696', 4]] as [string, number][]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      for (const e of ends) {
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(e[0] + (e[0] - cx) * 0.2, e[1] + (e[1] - cy) * 0.2);
        g.stroke();
      }
    }
    g.restore();
    ditch.push(c);
  }
  return { gras, lehm, ufer, moor, wasser, flach, feld, wave, road, heide, watt, ditch };
}

// ------------------------------------------------------------------ Bäume, Knicks
export function makeTrees(): Sprite[] {
  const out: Sprite[] = [];
  for (let v = 0; v < 6; v++) {
    const w = 56 * S, h = 76 * S;
    const [c, g] = canvas(w, h);
    const r = prng(200 + v);
    const bx = w / 2, by = h - 10 * S;
    g.fillStyle = 'rgba(20,30,10,0.3)';
    g.beginPath();
    g.ellipse(bx + 6, by, 22, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4b3727';
    g.fillRect(bx - 4, by - 34, 8, 34);
    g.fillStyle = '#3a2a1d';
    g.fillRect(bx + 1, by - 34, 3, 34);
    const crown = v < 4 ? ['#3f6a2e', '#4a7534', '#36602a', '#56803a'][v] : v === 4 ? '#5b7a33' : '#456d33';
    const cy = by - 58 - r() * 10;
    for (let k = 0; k < 9; k++) {
      const a = r() * Math.PI * 2, d = r() * 18;
      bush(g, bx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 16 + r() * 8, crown, r);
    }
    bush(g, bx - 4, cy - 12, 14, shade(crown, 0.1), r);
    out.push({ c, ax: w / 2 / S, ay: (by - 6) / S });
  }
  return out;
}

/** Linienhindernisse: Knick (Wall mit Bewuchs), Deich (breiter Grasdeich), Danewerk (hoher Erdwall); Maske wie bei Straßen. */
export function makeKnicks(style: 'knick' | 'deich' | 'wall' = 'knick'): Sprite[] {
  if (style !== 'knick') return makeEmbankments(style);
  const out: Sprite[] = [];
  for (let m = 0; m < 32; m++) {
    const mask = m & 15;
    const w = TW * S, h = (TH + 30) * S;
    const [c, g] = canvas(w, h);
    const r = prng(300 + m);
    const iso = new Iso(w / 2, 30 * S);
    const ends: [number, number][] = [];
    if (mask & 1) ends.push([1, 0.5]);
    if (mask & 2) ends.push([0, 0.5]);
    if (mask & 4) ends.push([0.5, 1]);
    if (mask & 8) ends.push([0.5, 0]);
    if (!ends.length) ends.push([0.5, 0.5]);
    // Erdwall
    for (const [ex, ey] of ends) {
      const dx = ex - 0.5, dy = ey - 0.5;
      const px = -dy * 0.32, py = dx * 0.32; // senkrecht
      const pts: Pt[] = [
        iso.p(0.5 + px, 0.5 + py), iso.p(ex + px, ey + py), iso.p(ex + px * 0.5, ey + py * 0.5, 7),
        iso.p(ex - px * 0.5, ey - py * 0.5, 7), iso.p(ex - px, ey - py), iso.p(0.5 - px, 0.5 - py),
      ];
      poly(g, pts, '#6e5a3a');
      poly(g, [iso.p(0.5 + px * 0.5, 0.5 + py * 0.5, 7), iso.p(ex + px * 0.5, ey + py * 0.5, 7), iso.p(ex - px * 0.5, ey - py * 0.5, 7), iso.p(0.5 - px * 0.5, 0.5 - py * 0.5, 7)], '#5f7a36');
    }
    poly(g, [iso.p(0.32, 0.5, 7), iso.p(0.5, 0.32, 7), iso.p(0.68, 0.5, 7), iso.p(0.5, 0.68, 7)], '#5f7a36');
    // Sträucher entlang der Achsen
    const spots: Pt[] = [];
    for (const [ex, ey] of ends) for (let k = 0; k <= 3; k++) spots.push(iso.p(0.5 + (ex - 0.5) * (k / 3), 0.5 + (ey - 0.5) * (k / 3), 9));
    spots.sort((a, b) => a[1] - b[1]);
    for (const [x, y] of spots) bush(g, x + (r() - 0.5) * 4, y - 4 - r() * 4, 9 + r() * 5, r() < 0.7 ? '#4d6e2c' : '#6a7d34', r);
    if (m >= 16 || r() < 0.3) {
      // vereinzelte Überhälter (Bäume im Knick)
      const [x, y] = iso.p(0.5, 0.5, 8);
      g.fillStyle = '#4b3727';
      g.fillRect(x - 2, y - 30, 4, 22);
      bush(g, x, y - 36, 14, '#3f6a2e', r);
    }
    out.push({ c, ax: w / 2 / S, ay: 30 });
  }
  return out;
}

function makeEmbankments(style: 'deich' | 'wall'): Sprite[] {
  const out: Sprite[] = [];
  const width = style === 'deich' ? 0.46 : 0.44;
  const H = style === 'deich' ? 11 : 15;
  const side = style === 'deich' ? '#5a7f38' : '#6a5a36';
  const top = style === 'deich' ? '#76a04a' : '#5f7a36';
  for (let m = 0; m < 32; m++) {
    const mask = m & 15;
    const w = TW * S, h = (TH + 34) * S;
    const [c, g] = canvas(w, h);
    const r = prng(500 + m + (style === 'wall' ? 50 : 0));
    const iso = new Iso(w / 2, 34 * S);
    const ends: [number, number][] = [];
    if (mask & 1) ends.push([1, 0.5]);
    if (mask & 2) ends.push([0, 0.5]);
    if (mask & 4) ends.push([0.5, 1]);
    if (mask & 8) ends.push([0.5, 0]);
    if (!ends.length) ends.push([0.5, 0.5]);
    for (const [ex, ey] of ends) {
      const dx = ex - 0.5, dy = ey - 0.5;
      const px = -dy * width, py = dx * width;
      poly(g, [iso.p(0.5 + px, 0.5 + py), iso.p(ex + px, ey + py), iso.p(ex + px * 0.35, ey + py * 0.35, H), iso.p(0.5 + px * 0.35, 0.5 + py * 0.35, H)], shade(side, 0.08));
      poly(g, [iso.p(0.5 - px, 0.5 - py), iso.p(ex - px, ey - py), iso.p(ex - px * 0.35, ey - py * 0.35, H), iso.p(0.5 - px * 0.35, 0.5 - py * 0.35, H)], shade(side, -0.15));
      poly(g, [iso.p(0.5 + px * 0.35, 0.5 + py * 0.35, H), iso.p(ex + px * 0.35, ey + py * 0.35, H), iso.p(ex - px * 0.35, ey - py * 0.35, H), iso.p(0.5 - px * 0.35, 0.5 - py * 0.35, H)], top);
    }
    poly(g, [iso.p(0.5 - width * 0.35, 0.5, H), iso.p(0.5, 0.5 - width * 0.35, H), iso.p(0.5 + width * 0.35, 0.5, H), iso.p(0.5, 0.5 + width * 0.35, H)], top);
    // Grasbüschel
    for (let k = 0; k < 14; k++) {
      const [x, y] = iso.p(0.25 + r() * 0.5, 0.25 + r() * 0.5, H * (0.4 + r() * 0.6));
      g.strokeStyle = r() < 0.5 ? shade(top, 0.15) : shade(top, -0.2);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 4);
      g.stroke();
    }
    if (style === 'deich' && m >= 16) {
      // Deichschaf
      const [x, y] = iso.p(0.45, 0.55, H);
      g.fillStyle = '#ece8dc';
      for (const [ddx, ddy] of [[-3, 0], [0, -1], [3, 0]]) {
        g.beginPath();
        g.arc(x + ddx, y - 4 + ddy, 3.4, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#2a2420';
      g.beginPath();
      g.ellipse(x + 6.5, y - 5, 2.2, 1.6, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (style === 'wall') {
      // überwachsener Wall mit Sträuchern; gelegentlich Feldstein- bzw. Backsteinreste (Waldemarsmauer)
      for (let k = 0; k < 2; k++) {
        const [x, y] = iso.p(0.3 + r() * 0.4, 0.3 + r() * 0.4, H + 2);
        bush(g, x, y - 4, 7 + r() * 4, r() < 0.6 ? '#4d6e2c' : '#6a7d34', r);
      }
      if (m >= 16) {
        const [x, y] = iso.p(0.55, 0.65, 2);
        for (let row = 0; row < 3; row++)
          for (let k = 0; k < 4; k++) {
            g.fillStyle = (row + k) % 2 ? '#9a4630' : '#8a3a26';
            g.fillRect(x - 12 + k * 6 + (row % 2) * 3, y - 6 - row * 4, 5.4, 3.4);
          }
      }
    }
    out.push({ c, ax: w / 2 / S, ay: 34 });
  }
  return out;
}

export function makeGate(axis: 'x' | 'y'): Sprite {
  const w = TW * S, h = (TH + 30) * S;
  const [c, g] = canvas(w, h);
  const iso = new Iso(w / 2, 30 * S);
  // Pfosten an den Enden der Knicklinie, offenes Holzgatter
  const a: [number, number] = axis === 'x' ? [0.5, 0.12] : [0.12, 0.5];
  const b: [number, number] = axis === 'x' ? [0.5, 0.88] : [0.88, 0.5];
  for (const [x, y] of [a, b]) {
    const p = iso.p(x, y);
    g.fillStyle = '#4a3322';
    g.fillRect(p[0] - 3, p[1] - 30, 6, 30);
    g.fillStyle = '#6b4a30';
    g.fillRect(p[0] - 3, p[1] - 30, 3, 30);
  }
  // Gatterflügel aufgeklappt
  const p0 = iso.p(a[0], a[1]);
  const p1 = axis === 'x' ? iso.p(0.85, 0.2) : iso.p(0.2, 0.85);
  g.strokeStyle = '#7a5838';
  g.lineWidth = 3;
  for (const z of [8, 16, 24]) {
    g.beginPath();
    g.moveTo(p0[0], p0[1] - z);
    g.lineTo(p1[0], p1[1] - z);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(p0[0], p0[1] - 8);
  g.lineTo(p1[0], p1[1] - 24);
  g.stroke();
  return { c, ax: w / 2 / S, ay: 30 };
}

// ------------------------------------------------------------------ Gebäude
interface BCanvas {
  g: Ctx;
  c: HTMLCanvasElement;
  iso: Iso;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

function bcanvas(fw: number, fh: number, top: number): BCanvas {
  const pad = 14 * S;
  const w = (fw + fh) * (TW / 2) * S + pad * 2;
  const h = (fw + fh) * (TH / 2) * S + top * S + 8 * S;
  const [c, g] = canvas(w, h);
  const ox = fh * (TW / 2) * S + pad, oy = top * S;
  return { g, c, iso: new Iso(ox, oy), w, h, ax: ox / S, ay: oy / S };
}

/** Zusätzliche Ankerpunkte (1x-Pixel relativ zur Footprint-Spitze) für animierte Teile. */
export interface BuildingSprite extends Sprite {
  smoke?: Pt[];
  hub?: Pt;
  flagPt?: Pt;
}

function logs(g: Ctx, x: number, y: number, n: number): void {
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < n - row; k++) {
      const cx = x + k * 9 + row * 4.5, cy = y - row * 7;
      g.fillStyle = '#6b4a2c';
      g.fillRect(cx - 14, cy - 4, 14, 8);
      g.fillStyle = '#c9a16a';
      g.beginPath();
      g.ellipse(cx, cy, 4, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#7b5634';
      g.stroke();
    }
}

function barrel(g: Ctx, x: number, y: number, s = 1): void {
  g.fillStyle = '#6e4b2b';
  g.beginPath();
  g.ellipse(x, y - 8 * s, 6 * s, 9 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x - 6 * s, y - 12 * s);
  g.lineTo(x + 6 * s, y - 12 * s);
  g.moveTo(x - 6 * s, y - 4 * s);
  g.lineTo(x + 6 * s, y - 4 * s);
  g.stroke();
}

function sack(g: Ctx, x: number, y: number): void {
  g.fillStyle = '#cbb68a';
  g.beginPath();
  g.ellipse(x, y - 6, 6, 7, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#a8946a';
  g.fillRect(x - 2, y - 15, 4, 4);
}

function stall(g: Ctx, iso: Iso, x: number, y: number, color: string, goods: number): void {
  const H = 16;
  for (const [px, py] of [[x, y], [x + 0.7, y], [x, y + 0.5], [x + 0.7, y + 0.5]] as Pt[]) {
    const a = iso.p(px, py), b = iso.p(px, py, H);
    g.strokeStyle = '#4a3322';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  // Tisch
  poly(g, [iso.p(x, y, 7), iso.p(x + 0.7, y, 7), iso.p(x + 0.7, y + 0.5, 7), iso.p(x, y + 0.5, 7)], '#8a6440');
  const r = prng(goods + 7);
  for (let k = 0; k < 5; k++) {
    const p = iso.p(x + 0.1 + r() * 0.5, y + 0.1 + r() * 0.3, 8);
    g.fillStyle = ['#c9a24a', '#a8b0b8', '#8a5a3a', '#d8cfa8', '#6a8a3a'][(k + goods) % 5];
    g.beginPath();
    g.arc(p[0], p[1] - 2, 3, 0, Math.PI * 2);
    g.fill();
  }
  // gestreiftes Sonnendach
  const pts: Pt[] = [iso.p(x - 0.08, y - 0.05, H), iso.p(x + 0.78, y - 0.05, H), iso.p(x + 0.78, y + 0.6, H - 5), iso.p(x - 0.08, y + 0.6, H - 5)];
  poly(g, pts, '#e8e0cc');
  g.save();
  poly(g, pts);
  g.clip();
  for (let k = 0; k < 6; k++) {
    if (k % 2) continue;
    const u0 = k / 6, u1 = (k + 1) / 6;
    const q: Pt[] = [
      [pts[0][0] + (pts[1][0] - pts[0][0]) * u0, pts[0][1] + (pts[1][1] - pts[0][1]) * u0],
      [pts[0][0] + (pts[1][0] - pts[0][0]) * u1, pts[0][1] + (pts[1][1] - pts[0][1]) * u1],
      [pts[3][0] + (pts[2][0] - pts[3][0]) * u1, pts[3][1] + (pts[2][1] - pts[3][1]) * u1],
      [pts[3][0] + (pts[2][0] - pts[3][0]) * u0, pts[3][1] + (pts[2][1] - pts[3][1]) * u0],
    ];
    poly(g, q, color);
  }
  g.restore();
  poly(g, pts, undefined, 'rgba(40,30,20,0.5)', 1);
}

function drawBuilding(type: BuildingType, color: string, arch: ArchStyle, age = 1): BuildingSprite {
  const tops: Partial<Record<BuildingType, number>> = {
    dorfzentrum: 124, wohnhaus: 62, holzfaeller: 50, bauernhof: 56, muehle: 92, heringszaun: 50, raeucherei: 80,
    lehmgrube: 40, markt: 50, kaserne: 96, brarupmarkt: 74,
  };
  const size: Partial<Record<BuildingType, number>> = {
    dorfzentrum: 3, wohnhaus: 2, holzfaeller: 2, bauernhof: 2, muehle: 2, heringszaun: 2, raeucherei: 2, lehmgrube: 2,
    markt: 3, kaserne: 3, brarupmarkt: 3,
  };
  const n = size[type] ?? ERA_SIZE[type]?.n ?? 2;
  const B = bcanvas(n, n, eraTop(type, age) ?? tops[type] ?? ERA_SIZE[type]?.top ?? 80);
  const { g, iso } = B;
  const out: BuildingSprite = { c: B.c, ax: B.ax, ay: B.ay };
  const to1x = (p: Pt): Pt => [p[0] / S - B.ax, p[1] / S - B.ay];
  // Wand mit Schattierung (Dachüberstand oben, Fuß unten)
  const A = ARCH[arch];
  const W = (f: Face, mat: Parameters<typeof wall>[2], light: number, seed: number, opts: WallOpts = {}) => {
    wall(g, f, mat, light, seed);
    if (opts.ausfachung) {
      brickNogging(g, f, light, seed + 7);
      // Balken über der Ausfachung erneut zeichnen
      g.save();
      g.globalAlpha = 0.95;
      const posts = Math.max(2, Math.round(Math.hypot(f.br[0] - f.bl[0], f.br[1] - f.bl[1]) / 18));
      g.strokeStyle = shade('#4a3222', light);
      g.lineWidth = 3;
      const line = (u0: number, v0: number, u1: number, v1: number) => {
        const a = faceAt(f, u0, v0), b = faceAt(f, u1, v1);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      };
      line(0, 0.5, 1, 0.5);
      for (let c = 0; c <= posts; c++) line(c / posts, 0, c / posts, 1);
      g.restore();
    }
    if (opts.bands) bands(g, f, light);
    if (opts.sockel) plinth(g, f, 0.16, light, seed + 3);
    wallShading(g, f);
  };
  /** Flagge in Spielerfarbe; Dänen mit weißem Kreuz. */
  const banner = (x: number, y: number, h: number, wave: number) => {
    flag(g, x, y, h, color, wave);
    if (arch === 'daenen') {
      g.fillStyle = '#f4f0e6';
      g.fillRect(x + 6, y - h, 2.6, 12.5);
      g.fillRect(x, y - h + 4.8, 20, 2.6);
    }
  };
  // ---------------------------------------------------------------- Dorfzentren der anderen Parteien
  const otherHQ = () => {
    if (arch === 'schwansen') {
      // Herrenhaus: weiß verputzt, Walmdach, Mittelrisalit mit Dreiecksgiebel, Freitreppe, Allee
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#b8ae94');
      const r = prng(15);
      for (let k = 0; k < 120; k++) {
        const p = iso.p(0.1 + r() * 2.8, 0.1 + r() * 2.8);
        g.fillStyle = r() < 0.5 ? '#a89e84' : '#c8bea4';
        g.fillRect(p[0], p[1], 3, 2);
      }
      shadowDiamond(g, iso, 0.35, 0.45, 2.65, 1.95);
      const f = boxFaces(iso, 0.35, 0.45, 2.65, 1.85, 0, 34);
      W(f.left, 'putz', 0.06, 2, { sockel: true });
      W(f.right, 'putz', -0.16, 3, { sockel: true });
      for (const u of [0.06, 0.2, 0.72, 0.86]) for (const v of [0.2, 0.62]) window4(g, f.left, u, v, 0.07, 0.24, 0.06);
      for (const u of [0.25, 0.6]) for (const v of [0.2, 0.62]) window4(g, f.right, u, v, 0.14, 0.24, -0.16);
      roof(g, iso, 0.35, 0.45, 2.65, 1.85, 34, 26, 'x', 'ziegel', 0.55, 9);
      // Mittelrisalit
      const m = boxFaces(iso, 1.15, 1.85, 1.85, 2.1, 0, 36);
      W(m.left, 'putz', 0.1, 4, { sockel: true });
      W(m.right, 'putz', -0.12, 5);
      plankDoor(g, m.left, 0.36, 0.28, 0.5, 0.1, '#3a4a3a');
      window4(g, m.left, 0.38, 0.65, 0.24, 0.2, 0.1);
      const p0 = iso.p(1.1, 2.12, 36), p1 = iso.p(1.9, 2.12, 36), pt = iso.p(1.5, 2.12, 52);
      poly(g, [p0, p1, pt], '#ece5d4', 'rgba(60,50,40,0.6)', 1);
      const wp = iso.p(1.5, 2.12, 42);
      g.fillStyle = color;
      g.beginPath();
      g.arc(wp[0], wp[1], 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#d8b040';
      g.lineWidth = 1;
      g.stroke();
      // Freitreppe
      for (let k = 0; k < 3; k++) poly(g, [iso.p(1.3, 2.12 + k * 0.08, 6 - k * 2), iso.p(1.7, 2.12 + k * 0.08, 6 - k * 2), iso.p(1.7, 2.2 + k * 0.08, 6 - k * 2), iso.p(1.3, 2.2 + k * 0.08, 6 - k * 2)], '#d8d0bc', 'rgba(0,0,0,0.2)', 0.5);
      out.smoke = [chimney(g, iso, 0.8, 0.9, 50, 10), chimney(g, iso, 2.2, 0.9, 50, 10)].map(to1x);
      // Allee: gestutzte Linden an der Zufahrt
      for (const [x, y] of [[0.3, 2.5], [0.3, 2.85], [2.75, 2.2], [2.75, 2.6]] as Pt[]) {
        const p = iso.p(x, y);
        g.fillStyle = '#4b3727';
        g.fillRect(p[0] - 2, p[1] - 18, 4, 18);
        bush(g, p[0], p[1] - 26, 11, '#4a7534', prng(Math.round(x * 100 + y)));
      }
      const fp = iso.p(1.5, 1.15, 60);
      banner(fp[0], fp[1], 20, 2);
      out.flagPt = to1x(fp);
    } else if (arch === 'friesen') {
      // Haubarg: riesiges, fast pyramidenförmiges Reetdach über niedrigen Klinkerwänden, Wassergraben
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#7e8a4a');
      poly(g, [iso.p(0.05, 2.75), iso.p(2.95, 2.75), iso.p(2.95, 2.95), iso.p(0.05, 2.95)], '#3d6078');
      g.strokeStyle = 'rgba(200,225,235,0.5)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const p = iso.p(0.3 + k * 0.45, 2.85);
        g.beginPath();
        g.moveTo(p[0] - 4, p[1]);
        g.quadraticCurveTo(p[0], p[1] - 2, p[0] + 4, p[1]);
        g.stroke();
      }
      shadowDiamond(g, iso, 0.3, 0.3, 2.7, 2.5);
      const f = boxFaces(iso, 0.3, 0.3, 2.65, 2.55, 0, 15);
      W(f.left, 'klinker', 0.06, 2);
      W(f.right, 'klinker', -0.18, 3);
      frontispiz(g, f.left, 0.4, 0.22, 34, 0.06);
      plankDoor(g, f.left, 0.44, 0.14, 0.8, 0.06, '#2f5f9a');
      for (const u of [0.1, 0.24, 0.72, 0.84]) window4(g, f.left, u, 0.35, 0.08, 0.4, 0.06);
      plankDoor(g, f.right, 0.3, 0.4, 0.92, -0.18, '#2f5f9a'); // Dielentor
      window4(g, f.right, 0.8, 0.35, 0.1, 0.4, -0.18);
      roof(g, iso, 0.3, 0.3, 2.65, 2.55, 15, 66, 'x', 'reet', 1.0, 9);
      out.smoke = [chimney(g, iso, 1.45, 1.4, 70, 8)].map(to1x);
      const fp = iso.p(1.6, 1.43, 81);
      banner(fp[0], fp[1], 26, 2);
      out.flagPt = to1x(fp);
      animal(g, ...iso.p(0.35, 2.55), 'schaf', 1);
      animal(g, ...iso.p(2.85, 1.0), 'schaf', -1);
      animal(g, ...iso.p(2.8, 1.5), 'schaf', 1);
      cart(g, iso, 2.5, 2.35, 'saecke');
    } else {
      // Amtshaus: Backstein-Renaissance mit Sandsteinbändern, Treppengiebel, Turm mit Kupferhelm, Kanone
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#8d8573');
      const r = prng(25);
      for (let k = 0; k < 140; k++) {
        const p = iso.p(0.1 + r() * 2.8, 0.1 + r() * 2.8);
        g.fillStyle = r() < 0.5 ? '#7d7563' : '#a39a86';
        g.fillRect(p[0], p[1], 5, 3);
      }
      shadowDiamond(g, iso, 0.3, 0.3, 2.5, 2.1);
      const f = boxFaces(iso, 0.3, 0.35, 2.4, 2.0, 0, 34);
      W(f.left, 'ziegel', 0.05, 2, { sockel: true, bands: true });
      W(f.right, 'ziegel', -0.2, 3, { sockel: true, bands: true });
      plankDoor(g, f.left, 0.42, 0.14, 0.56, 0.05, '#7a2a1e');
      for (const u of [0.1, 0.25, 0.68, 0.83]) window4(g, f.left, u, 0.42, 0.08, 0.22, 0.05, '#8a2a22');
      window4(g, f.right, 0.3, 0.42, 0.14, 0.22, -0.2);
      roof(g, iso, 0.3, 0.35, 2.4, 2.0, 34, 32, 'x', 'ziegel', 0, 9);
      steppedGable(g, iso, 2.4, 0.35, 2.0, 34, 32, 5);
      out.smoke = [chimney(g, iso, 0.9, 1.0, 50, 14)].map(to1x);
      const t = boxFaces(iso, 2.0, 1.95, 2.72, 2.67, 0, 60);
      W(t.left, 'ziegel', 0.05, 4, { sockel: true, bands: true });
      W(t.right, 'ziegel', -0.2, 5, { sockel: true, bands: true });
      plankDoor(g, t.left, 0.32, 0.36, 0.2, 0.05, '#7a2a1e');
      windowOn(g, t.left, 0.3, 0.76, 0.4, 0.12, 0.1);
      windowOn(g, t.right, 0.3, 0.76, 0.4, 0.12, -0.2);
      spire(g, iso, 2.0, 1.95, 2.72, 2.67, 60, 58);
      // Kanone auf Lafette
      const kn = iso.p(0.7, 2.55);
      g.fillStyle = '#5a3d22';
      g.fillRect(kn[0] - 9, kn[1] - 6, 16, 4);
      g.strokeStyle = '#3a2818';
      g.lineWidth = 1.6;
      for (const dx of [-6, 4]) {
        g.beginPath();
        g.arc(kn[0] + dx, kn[1] - 3, 3.6, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = '#a8803a';
      g.beginPath();
      g.moveTo(kn[0] - 10, kn[1] - 9);
      g.lineTo(kn[0] + 12, kn[1] - 11);
      g.lineTo(kn[0] + 12, kn[1] - 7.5);
      g.lineTo(kn[0] - 10, kn[1] - 5.5);
      g.closePath();
      g.fill();
      for (let k = 0; k < 3; k++) {
        const b = iso.p(1.05 + k * 0.08, 2.75);
        g.fillStyle = '#2a2a2a';
        g.beginPath();
        g.arc(b[0], b[1] - 2, 2, 0, Math.PI * 2);
        g.fill();
      }
      barrel(g, ...iso.p(2.75, 0.4));
      crate(g, iso, 2.6, 1.0);
      const fp = iso.p(1.35, 1.17, 66);
      banner(fp[0], fp[1], 24, 2);
      out.flagPt = to1x(fp);
    }
  };

  const otherHouse = () => {
    ground(g, iso, 0.12, 0.12, 1.88, 1.88, '#7a8a48');
    shadowDiamond(g, iso, 0.35, 0.45, 1.75, 1.6);
    if (arch === 'schwansen') {
      // Gutskate: verputzt, Ziegel-Walmdach, Hecke
      for (let k = 0; k < 5; k++) {
        const p = iso.p(0.2 + k * 0.2, 1.85);
        bush(g, p[0], p[1] - 4, 6, '#4a6e30', prng(k + 40));
      }
      const f = boxFaces(iso, 0.35, 0.45, 1.75, 1.55, 0, 22);
      W(f.left, 'putz', 0.08, 1, { sockel: true });
      W(f.right, 'putz', -0.15, 2, { sockel: true });
      plankDoor(g, f.left, 0.42, 0.16, 0.7, 0.08, color);
      window4(g, f.left, 0.1, 0.42, 0.13, 0.3, 0.08, A.shutter);
      window4(g, f.left, 0.74, 0.42, 0.13, 0.3, 0.08, A.shutter);
      window4(g, f.right, 0.36, 0.42, 0.24, 0.3, -0.15, A.shutter);
      roof(g, iso, 0.35, 0.45, 1.75, 1.55, 22, 22, 'x', 'ziegel', 0.4, 21);
      out.smoke = [chimney(g, iso, 1.05, 1.0, 40, 8)].map(to1x);
    } else if (arch === 'friesen') {
      // Friesenhaus: niedrige Klinkerwände, mächtiges Reetdach, Frontispiz, blaue Tür
      const f = boxFaces(iso, 0.3, 0.45, 1.8, 1.55, 0, 14);
      W(f.left, 'klinker', 0.08, 1);
      W(f.right, 'klinker', -0.15, 2);
      frontispiz(g, f.left, 0.36, 0.26, 26, 0.08);
      plankDoor(g, f.left, 0.42, 0.14, 0.8, 0.08, '#2f5f9a');
      window4(g, f.left, 0.1, 0.35, 0.1, 0.4, 0.08);
      window4(g, f.left, 0.78, 0.35, 0.1, 0.4, 0.08);
      window4(g, f.right, 0.38, 0.35, 0.22, 0.4, -0.15);
      roof(g, iso, 0.3, 0.45, 1.8, 1.55, 14, 30, 'x', 'reet', 0.35, 21);
      out.smoke = [chimney(g, iso, 1.05, 1.0, 40, 6)].map(to1x);
      animal(g, ...iso.p(1.6, 1.8), 'schaf', -1);
      wattle(g, iso, [[0.12, 1.92], [1.0, 1.92]], 6);
    } else {
      // dänisches Bürgerhaus: Backstein mit Sandsteinbändern, Treppengiebel, Ziegeldach
      const f = boxFaces(iso, 0.35, 0.45, 1.75, 1.55, 0, 26);
      W(f.left, 'ziegel', 0.08, 1, { sockel: true, bands: true });
      W(f.right, 'ziegel', -0.15, 2, { sockel: true, bands: true });
      plankDoor(g, f.left, 0.42, 0.16, 0.56, 0.08, '#7a2a1e');
      window4(g, f.left, 0.1, 0.42, 0.13, 0.24, 0.08, A.shutter);
      window4(g, f.left, 0.74, 0.42, 0.13, 0.24, 0.08, A.shutter);
      window4(g, f.right, 0.36, 0.42, 0.24, 0.24, -0.15);
      roof(g, iso, 0.35, 0.45, 1.75, 1.55, 26, 22, 'x', 'ziegel', 0, 21);
      steppedGable(g, iso, 1.75, 0.45, 1.55, 26, 22, 3);
      out.smoke = [chimney(g, iso, 0.75, 1.0, 44, 8)].map(to1x);
      animal(g, ...iso.p(1.55, 1.85), 'schwein', -1);
    }
    woodpile(g, iso, 1.78, 0.5, 3);
  };

  if (drawEra(type, age, { g, iso, out, to1x, W, banner, color })) return out;

  switch (type) {
    case 'dorfzentrum': {
      if (arch !== 'angeln') {
        otherHQ();
        break;
      }
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#8d8573');
      const r = prng(5);
      for (let k = 0; k < 140; k++) {
        const p = iso.p(0.1 + r() * 2.8, 0.1 + r() * 2.8);
        g.fillStyle = r() < 0.5 ? '#7d7563' : '#a39a86';
        g.fillRect(p[0], p[1], 5, 3);
      }
      // Ziehbrunnen und Karren im Hof
      const wb = iso.p(0.45, 2.45);
      g.fillStyle = '#7d7a72';
      g.beginPath();
      g.ellipse(wb[0], wb[1] - 4, 10, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2f4a5c';
      g.beginPath();
      g.ellipse(wb[0], wb[1] - 6, 7, 3.4, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(wb[0] - 8, wb[1] - 4);
      g.lineTo(wb[0] - 8, wb[1] - 22);
      g.lineTo(wb[0] + 8, wb[1] - 22);
      g.lineTo(wb[0] + 8, wb[1] - 4);
      g.stroke();
      poly(g, [[wb[0] - 11, wb[1] - 21], [wb[0], wb[1] - 30], [wb[0] + 11, wb[1] - 21]], '#8e3a27');
      shadowDiamond(g, iso, 0.3, 0.3, 2.5, 2.1);
      const f = boxFaces(iso, 0.3, 0.35, 2.4, 2.0, 0, 30);
      W(f.left, 'ziegel', 0.05, 2, { sockel: true });
      W(f.right, 'ziegel', -0.2, 3, { sockel: true });
      plankDoor(g, f.left, 0.42, 0.14, 0.58, 0.05, '#6a3a22');
      window4(g, f.left, 0.1, 0.42, 0.09, 0.3, 0.05, '#3f5a3a');
      window4(g, f.left, 0.25, 0.42, 0.09, 0.3, 0.05, '#3f5a3a');
      window4(g, f.left, 0.68, 0.42, 0.09, 0.3, 0.05, '#3f5a3a');
      window4(g, f.left, 0.83, 0.42, 0.09, 0.3, 0.05, '#3f5a3a');
      window4(g, f.right, 0.3, 0.42, 0.14, 0.3, -0.2);
      roof(g, iso, 0.3, 0.35, 2.4, 2.0, 30, 30, 'x', 'ziegel', 0, 9);
      steppedGable(g, iso, 2.4, 0.35, 2.0, 30, 30, 4);
      out.smoke = [chimney(g, iso, 0.9, 1.0, 44, 18)].map(to1x);
      // Turm mit Glockenstube, Uhr und Wetterfahne
      const t = boxFaces(iso, 2.0, 1.95, 2.75, 2.7, 0, 62);
      W(t.left, 'ziegel', 0.05, 4, { sockel: true });
      W(t.right, 'ziegel', -0.2, 5, { sockel: true });
      plankDoor(g, t.left, 0.32, 0.36, 0.2, 0.05, '#6a3a22');
      window4(g, t.left, 0.38, 0.45, 0.24, 0.14, 0.05);
      windowOn(g, t.left, 0.3, 0.76, 0.4, 0.14, 0.1);
      windowOn(g, t.right, 0.3, 0.76, 0.4, 0.14, -0.2);
      const cl = faceAt(t.right, 0.5, 0.56);
      g.fillStyle = '#efe6cc';
      g.beginPath();
      g.ellipse(cl[0], cl[1], 6, 7, -0.45, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2a2420';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cl[0], cl[1]);
      g.lineTo(cl[0] + 1, cl[1] - 4);
      g.moveTo(cl[0], cl[1]);
      g.lineTo(cl[0] + 3, cl[1] + 1);
      g.stroke();
      roof(g, iso, 2.0, 1.95, 2.75, 2.7, 62, 30, 'x', 'ziegel', 0.37, 12);
      const fp = iso.p(2.375, 2.325, 92);
      banner(fp[0], fp[1], 22, 2);
      out.flagPt = to1x(fp);
      // Wappenbanner an der Hauswand
      const bn = faceAt(f.left, 0.56, 0.9);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(bn[0] - 5, bn[1]);
      g.lineTo(bn[0] + 5, bn[1] + 2.5);
      g.lineTo(bn[0] + 5, bn[1] + 20);
      g.lineTo(bn[0], bn[1] + 16);
      g.lineTo(bn[0] - 5, bn[1] + 18);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8d890';
      g.beginPath();
      g.arc(bn[0], bn[1] + 9, 2.4, 0, Math.PI * 2);
      g.fill();
      cart(g, iso, 0.9, 2.5, 'saecke');
      barrel(g, ...iso.p(2.75, 0.4));
      barrel(g, ...iso.p(2.85, 0.65), 0.8);
      crate(g, iso, 2.6, 1.0);
      chicken(g, ...iso.p(1.6, 2.6), 1);
      chicken(g, ...iso.p(1.85, 2.75), -1);
      tinyPerson(g, ...iso.p(1.4, 2.3), '#6a5a8a', '#3a3020', 3);
      break;
    }
    case 'wohnhaus': {
      if (arch !== 'angeln') {
        otherHouse();
        break;
      }
      ground(g, iso, 0.12, 0.12, 1.88, 1.88, '#7a8a48');
      flowers(g, iso, 0.2, 1.68, 1.0, 1.88, 12);
      wattle(g, iso, [[0.12, 1.92], [1.15, 1.92]], 7);
      shadowDiamond(g, iso, 0.35, 0.45, 1.75, 1.6);
      const f = boxFaces(iso, 0.35, 0.45, 1.75, 1.55, 0, 20);
      W(f.left, 'fachwerk', 0.08, 1, { sockel: true, ausfachung: true });
      W(f.right, 'fachwerk', -0.15, 2, { sockel: true, ausfachung: true });
      plankDoor(g, f.left, 0.4, 0.17, 0.72, 0.08, color);
      window4(g, f.left, 0.1, 0.42, 0.13, 0.3, 0.08, '#3f5a3a');
      window4(g, f.left, 0.74, 0.42, 0.13, 0.3, 0.08, '#3f5a3a');
      window4(g, f.right, 0.36, 0.42, 0.24, 0.3, -0.15);
      roof(g, iso, 0.35, 0.45, 1.75, 1.55, 20, 26, 'x', 'reet', 0.3, 21);
      const eb = iso.p(1.05, 1.45, 27);
      eyebrow(g, eb[0], eb[1], 24);
      out.smoke = [chimney(g, iso, 0.8, 0.95, 40, 6)].map(to1x);
      woodpile(g, iso, 1.78, 0.5, 3);
      // Bank vor dem Haus
      const bk = iso.p(1.2, 1.7);
      g.fillStyle = '#7a5634';
      g.fillRect(bk[0] - 8, bk[1] - 6, 16, 2.5);
      g.fillRect(bk[0] - 7, bk[1] - 4, 2, 4);
      g.fillRect(bk[0] + 5, bk[1] - 4, 2, 4);
      break;
    }
    case 'holzfaeller': {
      ground(g, iso, 0.1, 0.1, 1.9, 1.9, '#7d7046');
      // Sägespäne
      const r = prng(31);
      for (let k = 0; k < 40; k++) {
        const p = iso.p(0.3 + r() * 1.5, 1.1 + r() * 0.7);
        g.fillStyle = r() < 0.5 ? '#c9a46a' : '#a88450';
        g.fillRect(p[0], p[1], 2, 1.5);
      }
      shadowDiamond(g, iso, 0.3, 0.25, 1.6, 1.1);
      const f = boxFaces(iso, 0.3, 0.25, 1.6, 1.1, 0, 20);
      W(f.left, 'holz', 0.05, 2);
      W(f.right, 'holz', -0.2, 3);
      plankDoor(g, f.left, 0.55, 0.3, 0.8, 0.0, '#3a2818');
      window4(g, f.right, 0.35, 0.45, 0.3, 0.25, -0.2);
      roof(g, iso, 0.3, 0.25, 1.6, 1.1, 20, 14, 'x', 'schindel', 0, 31);
      // Werkzeug an der Wand
      const tw = faceAt(f.left, 0.2, 0.6);
      g.strokeStyle = '#6b4a2c';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(tw[0], tw[1]);
      g.lineTo(tw[0] + 3, tw[1] - 16);
      g.stroke();
      g.fillStyle = '#a8aeb4';
      g.fillRect(tw[0] + 1, tw[1] - 18, 5, 4);
      // Holzstapel, Sägebock mit Stamm, Hackklotz
      woodpile(g, iso, 0.35, 1.55, 5);
      woodpile(g, iso, 1.05, 1.75, 3);
      const sb = iso.p(1.45, 1.35);
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 2;
      for (const dx of [-8, 8]) {
        g.beginPath();
        g.moveTo(sb[0] + dx - 4, sb[1]);
        g.lineTo(sb[0] + dx + 4, sb[1] - 12);
        g.moveTo(sb[0] + dx + 4, sb[1]);
        g.lineTo(sb[0] + dx - 4, sb[1] - 12);
        g.stroke();
      }
      g.fillStyle = '#7a5634';
      g.fillRect(sb[0] - 16, sb[1] - 13, 32, 5);
      g.fillStyle = '#d0a870';
      g.beginPath();
      g.ellipse(sb[0] + 16, sb[1] - 10.5, 2.5, 2.5, 0, 0, Math.PI * 2);
      g.fill();
      const hb = iso.p(1.75, 1.75);
      g.fillStyle = '#6b4a2c';
      g.fillRect(hb[0] - 6, hb[1] - 9, 12, 9);
      g.fillStyle = '#c9a16a';
      g.beginPath();
      g.ellipse(hb[0], hb[1] - 9, 6, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(hb[0], hb[1] - 10);
      g.lineTo(hb[0] + 9, hb[1] - 24);
      g.stroke();
      g.fillStyle = '#9aa0a6';
      g.fillRect(hb[0] - 3, hb[1] - 14, 6, 5);
      const fp = iso.p(1.75, 0.3, 0);
      banner(fp[0], fp[1], 34, 1);
      break;
    }
    case 'bauernhof': {
      ground(g, iso, 0.1, 0.1, 1.9, 1.9, '#7e8248');
      shadowDiamond(g, iso, 0.2, 0.4, 1.85, 1.55);
      const f = boxFaces(iso, 0.2, 0.4, 1.85, 1.5, 0, 18);
      W(f.left, A.house, 0.06, 3, A.houseOpts);
      W(f.right, arch === 'angeln' ? 'ziegel' : A.house, -0.18, 4, arch === 'angeln' ? { sockel: true } : A.houseOpts);
      // Grotdör (großes Dielentor) mit Rautenmuster
      plankDoor(g, f.right, 0.28, 0.44, 0.86, -0.18, '#6a4a2c');
      g.strokeStyle = 'rgba(40,25,10,0.6)';
      g.lineWidth = 1;
      const d0 = faceAt(f.right, 0.28, 0), d1 = faceAt(f.right, 0.72, 0.86), d2 = faceAt(f.right, 0.72, 0), d3 = faceAt(f.right, 0.28, 0.86);
      g.beginPath();
      g.moveTo(d0[0], d0[1]);
      g.lineTo(d1[0], d1[1]);
      g.moveTo(d2[0], d2[1]);
      g.lineTo(d3[0], d3[1]);
      g.stroke();
      window4(g, f.left, 0.12, 0.42, 0.1, 0.3, 0.06, A.shutter);
      window4(g, f.left, 0.45, 0.42, 0.1, 0.3, 0.06, A.shutter);
      window4(g, f.left, 0.78, 0.42, 0.1, 0.3, 0.06, A.shutter);
      roof(g, iso, 0.2, 0.4, 1.85, 1.5, 18, 30, 'x', A.houseRoof, 0.35, 41);
      if (A.houseRoof === 'reet') {
        const eb = iso.p(1.0, 1.4, 27);
        eyebrow(g, eb[0], eb[1], 26);
      }
      // Pferdeköpfe am First (Giebelzier)
      const gz = iso.p(1.5, 0.95, 48);
      g.strokeStyle = '#4a3222';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(gz[0], gz[1]);
      g.lineTo(gz[0] - 5, gz[1] - 8);
      g.moveTo(gz[0], gz[1]);
      g.lineTo(gz[0] + 5, gz[1] - 8);
      g.stroke();
      // Heuhaufen, Karren, Hühner, Zaun
      const hp = iso.p(0.35, 1.85);
      g.fillStyle = '#c8ad5a';
      g.beginPath();
      g.ellipse(hp[0], hp[1] - 9, 13, 11, 0, Math.PI, 0);
      g.fill();
      g.strokeStyle = '#a28a40';
      for (let k = 0; k < 8; k++) {
        g.beginPath();
        g.moveTo(hp[0] - 10 + k * 3, hp[1] - 2);
        g.lineTo(hp[0] - 8 + k * 2.5, hp[1] - 16);
        g.stroke();
      }
      cart(g, iso, 1.05, 1.62, 'heu');
      // typisches Vieh der Partei
      const vieh = A.vieh;
      animal(g, ...iso.p(1.6, 0.25), vieh, -1);
      animal(g, ...iso.p(1.95, 0.75), vieh, 1);
      chicken(g, ...iso.p(0.7, 1.75), 1);
      chicken(g, ...iso.p(0.9, 1.9), -1);
      chicken(g, ...iso.p(1.75, 1.85), 1);
      wattle(g, iso, [[1.92, 0.1], [1.92, 0.38]], 7);
      const fp = iso.p(1.88, 0.42, 0);
      banner(fp[0], fp[1], 34, 2);
      break;
    }
    case 'muehle': {
      ground(g, iso, 0.2, 0.2, 1.8, 1.8, '#7a8a48');
      // Steinsockel und Bock
      for (const [x, y] of [[0.55, 1.0], [1.45, 1.0], [1.0, 0.55], [1.0, 1.45]] as Pt[]) {
        const b = boxFaces(iso, x - 0.11, y - 0.11, x + 0.11, y + 0.11, 0, 7);
        fillFace(g, b.left, '#8f8a7e');
        fillFace(g, b.right, '#6f6a5e');
        poly(g, b.top, '#a39e90');
      }
      g.strokeStyle = '#4a3222';
      g.lineWidth = 4;
      const post0 = iso.p(1, 1, 0), post1 = iso.p(1, 1, 30);
      for (const [x, y] of [[0.55, 1.0], [1.45, 1.0], [1.0, 0.55], [1.0, 1.45]] as Pt[]) {
        const a = iso.p(x, y, 7);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(post1[0], post1[1] + 14);
        g.stroke();
      }
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(post0[0], post0[1] - 6);
      g.lineTo(post1[0], post1[1]);
      g.stroke();
      // Mehlsäcke am Fuß
      sack(g, ...iso.p(1.55, 1.55));
      sack(g, ...iso.p(1.72, 1.45));
      sack(g, ...iso.p(1.62, 1.72));
      shadowDiamond(g, iso, 0.6, 0.6, 1.5, 1.4);
      const f = boxFaces(iso, 0.55, 0.6, 1.4, 1.4, 28, 40);
      W(f.left, 'holz', 0.1, 5);
      W(f.right, 'holz', -0.18, 6);
      window4(g, f.right, 0.38, 0.5, 0.22, 0.18, -0.18);
      window4(g, f.left, 0.4, 0.62, 0.2, 0.14, 0.1);
      plankDoor(g, f.left, 0.2, 0.22, 0.4, 0.1, '#4a3222');
      roof(g, iso, 0.55, 0.6, 1.4, 1.4, 68, 14, 'y', 'schindel', 0, 51);
      // Treppe und Steert (Drehbalken) nach hinten links, mit Krühwerk-Rad
      const s0 = iso.p(0.7, 1.4, 30), s1 = iso.p(0.15, 1.95, 0);
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s0[0], s0[1]);
      g.lineTo(s1[0], s1[1]);
      g.moveTo(s0[0] + 6, s0[1] + 2);
      g.lineTo(s1[0] + 6, s1[1] + 2);
      g.stroke();
      for (let k = 1; k < 7; k++) {
        const a: Pt = [s0[0] + (s1[0] - s0[0]) * (k / 7), s0[1] + (s1[1] - s0[1]) * (k / 7)];
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(a[0] + 6, a[1] + 2);
        g.stroke();
      }
      g.strokeStyle = '#3a2818';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(s1[0] + 3, s1[1] - 6, 6, 0, Math.PI * 2);
      g.moveTo(s1[0] - 3, s1[1] - 6);
      g.lineTo(s1[0] + 9, s1[1] - 6);
      g.moveTo(s1[0] + 3, s1[1] - 12);
      g.lineTo(s1[0] + 3, s1[1]);
      g.stroke();
      out.hub = to1x(iso.p(1.42, 1.0, 58));
      const fp = iso.p(0.98, 1.0, 86);
      banner(fp[0], fp[1], 12, 1);
      break;
    }
    case 'heringszaun': {
      ground(g, iso, 0.1, 0.1, 1.9, 1.9, '#9d8f63');
      // Holzsteg
      poly(g, [iso.p(0.2, 0.2, 2), iso.p(1.8, 0.2, 2), iso.p(1.8, 1.8, 2), iso.p(0.2, 1.8, 2)], '#8a6a44');
      g.strokeStyle = '#5e4429';
      g.lineWidth = 1.5;
      for (let k = 0; k <= 8; k++) {
        const a = iso.p(0.2 + k * 0.2, 0.2, 2), b = iso.p(0.2 + k * 0.2, 1.8, 2);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
      // Kahn am Steg
      const kb = iso.p(1.2, 0.35, 2);
      g.fillStyle = '#5a3d22';
      g.beginPath();
      g.moveTo(kb[0] - 18, kb[1] - 2);
      g.quadraticCurveTo(kb[0], kb[1] + 9, kb[0] + 20, kb[1] - 4);
      g.lineTo(kb[0] + 16, kb[1] - 8);
      g.quadraticCurveTo(kb[0], kb[1] - 1, kb[0] - 15, kb[1] - 6);
      g.closePath();
      g.fill();
      g.fillStyle = '#7a5634';
      g.fillRect(kb[0] - 3, kb[1] - 5, 6, 2);
      const f = boxFaces(iso, 0.3, 0.3, 1.0, 1.0, 2, 16);
      W(f.left, 'holz', 0.05, 7);
      W(f.right, 'holz', -0.2, 8);
      plankDoor(g, f.left, 0.3, 0.35, 0.75, 0.05, '#3a2818');
      roof(g, iso, 0.3, 0.3, 1.0, 1.0, 18, 12, 'y', 'reet', 0, 61);
      // Netze zum Trocknen
      const n0 = iso.p(0.25, 1.15, 2), n1 = iso.p(0.25, 1.75, 2);
      g.strokeStyle = '#4a3222';
      g.lineWidth = 2;
      for (const p of [n0, n1]) {
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0], p[1] - 24);
        g.stroke();
      }
      g.strokeStyle = 'rgba(70,80,70,0.85)';
      g.lineWidth = 0.7;
      for (let k = 0; k <= 8; k++) {
        const x = n0[0] + ((n1[0] - n0[0]) * k) / 8, y = n0[1] + ((n1[1] - n0[1]) * k) / 8 - 24;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (k % 2 ? 2 : -2), y + 18);
        g.stroke();
      }
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.moveTo(n0[0], n0[1] - 22 + j * 5);
        g.quadraticCurveTo((n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2 - 18 + j * 5, n1[0], n1[1] - 22 + j * 5);
        g.stroke();
      }
      // Trockengestell mit Heringen, Fischkorb
      const a = iso.p(1.2, 1.3, 2), b = iso.p(1.75, 1.3, 2);
      g.strokeStyle = '#4a3222';
      g.lineWidth = 2.5;
      for (const p of [a, b]) {
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0], p[1] - 22);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(a[0], a[1] - 22);
      g.lineTo(b[0], b[1] - 22);
      g.stroke();
      for (let k = 1; k < 9; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / 9), y = a[1] - 22 + (b[1] - a[1]) * (k / 9);
        g.fillStyle = k % 2 ? '#c4ccd2' : '#aeb8c0';
        g.beginPath();
        g.ellipse(x, y + 7, 1.8, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      const kb2 = iso.p(1.55, 1.75, 2);
      g.fillStyle = '#8a6a3a';
      g.beginPath();
      g.ellipse(kb2[0], kb2[1] - 4, 7, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c4ccd2';
      g.beginPath();
      g.ellipse(kb2[0], kb2[1] - 7, 5, 2, 0, 0, Math.PI * 2);
      g.fill();
      const fp = iso.p(0.25, 1.6, 2);
      banner(fp[0] + 22, fp[1] - 6, 30, 2);
      break;
    }
    case 'raeucherei': {
      ground(g, iso, 0.15, 0.15, 1.85, 1.85, '#80784e');
      shadowDiamond(g, iso, 0.3, 0.4, 1.7, 1.6);
      const f = boxFaces(iso, 0.3, 0.4, 1.7, 1.6, 0, 22);
      W(f.left, A.main, 0.05, 9, A.mainOpts);
      W(f.right, A.main, -0.2, 10, A.mainOpts);
      plankDoor(g, f.left, 0.4, 0.2, 0.7, 0.05);
      window4(g, f.right, 0.4, 0.45, 0.18, 0.25, -0.2, undefined, 0.8);
      roof(g, iso, 0.3, 0.4, 1.7, 1.6, 22, 20, 'y', A.mainRoof, A.mainRoof === 'reet' ? 0.3 : 0, 71);
      const c = boxFaces(iso, 1.15, 0.55, 1.42, 0.82, 0, 66);
      wall(g, c.left, 'ziegel', 0.0, 11);
      wall(g, c.right, 'ziegel', -0.25, 12);
      poly(g, c.top, '#2a2220');
      out.smoke = [to1x(iso.p(1.28, 0.68, 68))];
      // Räuchergestell mit Bücklingen, Buchenholz, Fässer
      const a = iso.p(0.15, 1.75), b = iso.p(0.15, 1.15);
      g.strokeStyle = '#4a3222';
      g.lineWidth = 2.5;
      for (const p of [a, b]) {
        g.beginPath();
        g.moveTo(p[0], p[1]);
        g.lineTo(p[0], p[1] - 20);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(a[0], a[1] - 20);
      g.lineTo(b[0], b[1] - 20);
      g.stroke();
      for (let k = 1; k < 8; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / 8), y = a[1] - 20 + (b[1] - a[1]) * (k / 8);
        g.fillStyle = k % 2 ? '#b08a3a' : '#9a7428';
        g.beginPath();
        g.ellipse(x, y + 6, 1.8, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      woodpile(g, iso, 1.2, 1.85, 4);
      barrel(g, ...iso.p(1.85, 0.4));
      barrel(g, ...iso.p(1.85, 0.7), 0.85);
      const fp = iso.p(1.78, 1.78, 0);
      banner(fp[0], fp[1], 30, 1);
      break;
    }
    case 'lehmgrube': {
      ground(g, iso, 0.05, 0.05, 1.95, 1.95, '#8a6a42');
      // Grube mit Stufen
      poly(g, [iso.p(0.35, 0.3), iso.p(1.5, 0.3), iso.p(1.5, 1.4), iso.p(0.35, 1.4)], '#4a3424');
      poly(g, [iso.p(0.45, 0.4, -6), iso.p(1.4, 0.4, -6), iso.p(1.4, 1.3, -6), iso.p(0.45, 1.3, -6)], '#5e432c');
      poly(g, [iso.p(0.35, 1.4), iso.p(1.5, 1.4), iso.p(1.4, 1.3, -6), iso.p(0.45, 1.3, -6)], '#6e5236');
      poly(g, [iso.p(1.5, 0.3), iso.p(1.5, 1.4), iso.p(1.4, 1.3, -6), iso.p(1.4, 0.4, -6)], '#7a5c3c');
      // Wasserpfütze, Spaten, Leiter
      const pw = iso.p(0.8, 0.8, -6);
      g.fillStyle = 'rgba(70,90,100,0.7)';
      g.beginPath();
      g.ellipse(pw[0], pw[1], 9, 4, 0, 0, Math.PI * 2);
      g.fill();
      const sp = iso.p(1.1, 1.05, -6);
      g.strokeStyle = '#6b4a2c';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(sp[0], sp[1]);
      g.lineTo(sp[0] + 4, sp[1] - 18);
      g.stroke();
      g.fillStyle = '#9aa0a6';
      g.fillRect(sp[0] - 2.5, sp[1] - 2, 5, 5);
      // Rampe
      poly(g, [iso.p(1.5, 0.75), iso.p(1.9, 0.75), iso.p(1.9, 1.0), iso.p(1.5, 1.0)], '#7a6040');
      // Lehmziegel zum Trocknen in Reihen
      for (let row = 0; row < 2; row++)
        for (let k = 0; k < 6; k++) {
          const p = iso.p(0.25 + k * 0.17, 1.62 + row * 0.15);
          g.fillStyle = row ? '#b8895a' : '#a87a4c';
          g.fillRect(p[0] - 4, p[1] - 3, 8, 3);
          g.fillStyle = '#c9996a';
          g.fillRect(p[0] - 4, p[1] - 4, 8, 1.2);
        }
      // Lehmhaufen
      for (const [x, y] of [[1.75, 1.55], [1.7, 0.3]] as Pt[]) {
        const p = iso.p(x, y);
        g.fillStyle = '#9b7348';
        g.beginPath();
        g.ellipse(p[0], p[1] - 6, 14, 10, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = '#b38a5a';
        g.beginPath();
        g.ellipse(p[0] - 3, p[1] - 9, 6, 4, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Schubkarre
      const wb = iso.p(1.75, 1.15);
      g.fillStyle = '#7a5634';
      g.beginPath();
      g.moveTo(wb[0] - 10, wb[1] - 8);
      g.lineTo(wb[0] + 6, wb[1] - 8);
      g.lineTo(wb[0] + 3, wb[1] - 2);
      g.lineTo(wb[0] - 8, wb[1] - 2);
      g.fill();
      g.fillStyle = '#9b7348';
      g.beginPath();
      g.ellipse(wb[0] - 2, wb[1] - 9, 7, 3, 0, Math.PI, 0);
      g.fill();
      g.strokeStyle = '#3a2818';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(wb[0] + 7, wb[1] - 2, 3, 0, Math.PI * 2);
      g.moveTo(wb[0] - 10, wb[1] - 6);
      g.lineTo(wb[0] - 17, wb[1] - 4);
      g.stroke();
      const fp = iso.p(1.85, 0.12, 0);
      banner(fp[0], fp[1], 32, 2);
      break;
    }
    case 'markt': {
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#968b72');
      const r = prng(91);
      for (let k = 0; k < 120; k++) {
        const p = iso.p(0.1 + r() * 2.8, 0.1 + r() * 2.8);
        g.fillStyle = r() < 0.5 ? '#857a62' : '#aaa088';
        g.fillRect(p[0], p[1], 5, 3);
      }
      stall(g, iso, 0.3, 0.3, color, 1);
      stall(g, iso, 1.7, 0.4, color, 2);
      tinyPerson(g, ...iso.p(0.65, 0.95), '#7a3a2a', '#e8dcc0', 1);
      tinyPerson(g, ...iso.p(2.05, 1.05), '#3a5a6a', '#3a3020', 2);
      // Marktkreuz mit Brunnen in der Mitte
      const m = iso.p(1.5, 1.5);
      g.fillStyle = '#7d7a72';
      g.beginPath();
      g.ellipse(m[0], m[1], 18, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3d5f78';
      g.beginPath();
      g.ellipse(m[0], m[1] - 3, 13, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(220,235,245,0.4)';
      g.fillRect(m[0] - 6, m[1] - 4, 6, 1);
      g.fillStyle = '#5a554c';
      g.fillRect(m[0] - 2, m[1] - 34, 4, 30);
      g.fillRect(m[0] - 9, m[1] - 28, 18, 4);
      // Waage
      const sc = iso.p(2.55, 1.2);
      g.strokeStyle = '#4a3222';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(sc[0], sc[1]);
      g.lineTo(sc[0], sc[1] - 22);
      g.moveTo(sc[0] - 10, sc[1] - 20);
      g.lineTo(sc[0] + 10, sc[1] - 20);
      g.stroke();
      g.fillStyle = '#c9a43a';
      for (const dx of [-10, 10]) {
        g.beginPath();
        g.ellipse(sc[0] + dx, sc[1] - 13, 4, 1.6, 0, 0, Math.PI * 2);
        g.fill();
      }
      stall(g, iso, 0.4, 1.9, color, 3);
      stall(g, iso, 1.9, 1.9, color, 4);
      tinyPerson(g, ...iso.p(1.2, 2.2), '#5a6a3a', '#7a5634', 5);
      cart(g, iso, 2.25, 0.2, 'saecke');
      barrel(g, ...iso.p(1.3, 2.75));
      barrel(g, ...iso.p(1.55, 2.82));
      crate(g, iso, 2.6, 2.55);
      crate(g, iso, 2.75, 2.35, 0.18);
      sack(g, ...iso.p(2.8, 1.6));
      sack(g, ...iso.p(2.75, 1.85));
      const fp = iso.p(2.9, 0.1);
      banner(fp[0], fp[1], 40, 2);
      break;
    }
    case 'kaserne': {
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#857a58');
      shadowDiamond(g, iso, 0.25, 0.3, 2.7, 1.5);
      const f = boxFaces(iso, 0.25, 0.3, 2.7, 1.4, 0, 26);
      W(f.left, A.main, 0.05, 13, A.mainOpts);
      W(f.right, A.main, -0.2, 14, A.mainOpts);
      plankDoor(g, f.left, 0.44, 0.12, 0.65, 0.05, '#5a2a1a');
      for (const u of [0.1, 0.25, 0.64, 0.79]) window4(g, f.left, u, 0.42, 0.07, 0.28, 0.05, shade(color, -0.2));
      window4(g, f.right, 0.35, 0.42, 0.3, 0.28, -0.2);
      roof(g, iso, 0.25, 0.3, 2.7, 1.4, 26, 24, 'x', A.mainRoof, A.mainRoof === 'reet' ? 0.4 : arch === 'schwansen' ? 0.45 : 0, 91);
      if (arch === 'angeln' || arch === 'daenen') steppedGable(g, iso, 2.7, 0.3, 1.4, 26, 24, 3);
      if (arch === 'daenen') {
        // Dachreiter mit Kupferhelm
        const tb = boxFaces(iso, 1.3, 0.75, 1.6, 1.05, 44, 10);
        fillFace(g, tb.left, '#984530');
        fillFace(g, tb.right, '#73311f');
        spire(g, iso, 1.28, 0.73, 1.62, 1.07, 54, 34);
      }
      if (arch === 'schwansen') {
        animal(g, ...iso.p(1.4, 2.45), 'pferd', 1);
        animal(g, ...iso.p(2.3, 2.6), 'pferd', -1);
      }
      // Wappenschild über dem Tor
      const ws = faceAt(f.left, 0.5, 0.82);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(ws[0] - 6, ws[1] - 5);
      g.lineTo(ws[0] + 6, ws[1] - 2);
      g.lineTo(ws[0] + 5, ws[1] + 6);
      g.lineTo(ws[0], ws[1] + 10);
      g.lineTo(ws[0] - 5, ws[1] + 4);
      g.closePath();
      g.fill();
      g.strokeStyle = '#e8d890';
      g.lineWidth = 1.2;
      g.stroke();
      // Palisade um den Übungsplatz (mit Toröffnung)
      const stake = (x: number, y: number) => {
        const p0 = iso.p(x, y), p1 = iso.p(x, y, 15);
        g.strokeStyle = '#5e4128';
        g.lineWidth = 3.4;
        g.beginPath();
        g.moveTo(p0[0], p0[1]);
        g.lineTo(p1[0], p1[1]);
        g.stroke();
        g.fillStyle = '#8a6440';
        g.beginPath();
        g.moveTo(p1[0] - 1.7, p1[1]);
        g.lineTo(p1[0], p1[1] - 4);
        g.lineTo(p1[0] + 1.7, p1[1]);
        g.fill();
      };
      for (let x = 0.1; x <= 2.9; x += 0.1) if (x < 1.3 || x > 1.75) stake(x, 2.92);
      for (let y = 1.55; y <= 2.92; y += 0.1) stake(2.92, y);
      for (const [x0, y0, x1, y1] of [[0.1, 2.92, 1.3, 2.92], [1.75, 2.92, 2.92, 2.92], [2.92, 1.55, 2.92, 2.92]]) {
        const p0 = iso.p(x0, y0, 9), p1 = iso.p(x1, y1, 9);
        g.strokeStyle = '#4a3222';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(p0[0], p0[1]);
        g.lineTo(p1[0], p1[1]);
        g.stroke();
      }
      // Waffengestell mit Spießen
      const a = iso.p(0.4, 2.2), b = iso.p(1.2, 2.2);
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(a[0], a[1] - 12);
      g.lineTo(b[0], b[1] - 12);
      g.stroke();
      for (let k = 0; k < 6; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / 5), y = a[1] + (b[1] - a[1]) * (k / 5);
        g.strokeStyle = '#6b4a2c';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 3, y - 44);
        g.stroke();
        g.fillStyle = '#b8bcc0';
        g.beginPath();
        g.moveTo(x + 3, y - 52);
        g.lineTo(x + 6, y - 44);
        g.lineTo(x, y - 44);
        g.fill();
      }
      // Schießscheibe (Strohballen mit Ringen)
      const t = iso.p(2.3, 1.9);
      g.fillStyle = '#c8ad5a';
      g.beginPath();
      g.ellipse(t[0], t[1] - 12, 10, 12, 0, 0, Math.PI * 2);
      g.fill();
      for (const [rr, col] of [[7, '#e8e0cc'], [4.5, '#b3342b'], [2, '#e8e0cc']] as [number, string][]) {
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(t[0] + 1, t[1] - 13, rr * 0.8, rr, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#3a2818';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(t[0] + 1, t[1] - 14);
      g.lineTo(t[0] - 8, t[1] - 18);
      g.stroke();
      // Strohpuppe
      const d = iso.p(1.75, 2.45);
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(d[0], d[1]);
      g.lineTo(d[0], d[1] - 30);
      g.moveTo(d[0] - 10, d[1] - 22);
      g.lineTo(d[0] + 10, d[1] - 22);
      g.stroke();
      g.fillStyle = '#c8ad5a';
      g.beginPath();
      g.ellipse(d[0], d[1] - 24, 6, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(d[0], d[1] - 36, 5, 0, Math.PI * 2);
      g.fill();
      const fp = iso.p(2.75, 1.45, 0);
      banner(fp[0], fp[1], 62, 2);
      out.flagPt = to1x([fp[0], fp[1]]);
      break;
    }
    case 'brarupmarkt': {
      ground(g, iso, 0.0, 0.0, 3.0, 3.0, '#9a8f74');
      const r = prng(95);
      for (let k = 0; k < 150; k++) {
        const p = iso.p(0.05 + r() * 2.9, 0.05 + r() * 2.9);
        g.fillStyle = r() < 0.5 ? '#877c62' : '#b0a68c';
        g.fillRect(p[0], p[1], 5, 3);
      }
      // kleine Feldsteinkirche im Hintergrund (Süderbrarups Kirche als Motiv)
      const c = boxFaces(iso, 0.2, 0.2, 1.3, 0.8, 0, 26);
      W(c.left, 'stein', 0.05, 15);
      W(c.right, 'stein', -0.2, 16);
      window4(g, c.left, 0.3, 0.45, 0.07, 0.32, 0.05);
      window4(g, c.left, 0.62, 0.45, 0.07, 0.32, 0.05);
      plankDoor(g, c.right, 0.35, 0.3, 0.6, -0.2, '#5a3a22');
      roof(g, iso, 0.2, 0.2, 1.3, 0.8, 26, 20, 'x', 'ziegel', 0, 97);
      const t = boxFaces(iso, 0.2, 0.25, 0.55, 0.75, 0, 46);
      W(t.left, 'stein', 0.05, 17);
      W(t.right, 'stein', -0.2, 18);
      windowOn(g, t.left, 0.35, 0.72, 0.3, 0.12, 0.05);
      roof(g, iso, 0.2, 0.25, 0.55, 0.75, 46, 26, 'y', 'schindel', 0.25, 98);
      stall(g, iso, 1.7, 0.3, '#7a6a4a', 5);
      stall(g, iso, 0.3, 1.5, '#5a7a8a', 6);
      stall(g, iso, 1.8, 1.6, '#8a5a3a', 7);
      tinyPerson(g, ...iso.p(1.0, 1.4), '#6a4a3a', '#2a2420', 7);
      tinyPerson(g, ...iso.p(2.3, 1.1), '#4a5a7a', '#e8dcc0', 8);
      tinyPerson(g, ...iso.p(1.4, 2.5), '#7a6a3a', '#5a3d22', 9);
      cart(g, iso, 0.3, 2.5, 'heu');
      barrel(g, ...iso.p(1.3, 2.6));
      sack(g, ...iso.p(2.6, 2.6));
      sack(g, ...iso.p(2.8, 2.4));
      crate(g, iso, 2.7, 0.3);
      out.flagPt = to1x(iso.p(1.45, 1.45));
      break;
    }
  }
  return out;
}

// Baustile der Parteien
type WallOpts = { sockel?: boolean; ausfachung?: boolean; bands?: boolean };
const ARCH: Record<ArchStyle, { house: WallMat; houseOpts: WallOpts; houseRoof: RoofMat; main: WallMat; mainOpts: WallOpts; mainRoof: RoofMat; shutter: string; vieh: 'kuh' | 'schaf' | 'pferd' | 'schwein' }> = {
  angeln: { house: 'fachwerk', houseOpts: { sockel: true, ausfachung: true }, houseRoof: 'reet', main: 'ziegel', mainOpts: { sockel: true }, mainRoof: 'ziegel', shutter: '#3f5a3a', vieh: 'kuh' },
  schwansen: { house: 'putz', houseOpts: { sockel: true }, houseRoof: 'ziegel', main: 'putz', mainOpts: { sockel: true }, mainRoof: 'ziegel', shutter: '#2f4a32', vieh: 'pferd' },
  friesen: { house: 'klinker', houseOpts: {}, houseRoof: 'reet', main: 'klinker', mainOpts: {}, mainRoof: 'reet', shutter: '#2f4f78', vieh: 'schaf' },
  daenen: { house: 'ziegel', houseOpts: { sockel: true, bands: true }, houseRoof: 'ziegel', main: 'ziegel', mainOpts: { sockel: true, bands: true }, mainRoof: 'ziegel', shutter: '#8a2a22', vieh: 'schwein' },
};

const buildingCache = new Map<string, BuildingSprite>();
/** Zeitalter für die Darstellung: alte Gebäude ändern ihr Aussehen erst ab dem 20. und 22. Jahrhundert. */
export function lookAge(age: number): number {
  return age >= 4 ? 4 : age >= 3 ? 3 : 1;
}
export function buildingSprite(type: BuildingType, color: string, arch: ArchStyle = 'angeln', age = 1): BuildingSprite {
  const la = lookAge(age);
  const k = `${type}|${color}|${arch}|${la}`;
  let s = buildingCache.get(k);
  if (!s) {
    s = drawBuilding(type, color, arch, la);
    buildingCache.set(k, s);
  }
  return s;
}

const foundationCache = new Map<number, Sprite>();
export function foundationSprite(n: number): Sprite {
  let s = foundationCache.get(n);
  if (s) return s;
  const B = bcanvas(n, n, 50);
  const { g, iso } = B;
  ground(g, iso, 0.1, 0.1, n - 0.1, n - 0.1, '#86704c');
  const r = prng(n * 7);
  for (let k = 0; k < 60 * n; k++) {
    const p = iso.p(0.15 + r() * (n - 0.3), 0.15 + r() * (n - 0.3));
    g.fillStyle = r() < 0.5 ? '#77623f' : '#9b8560';
    g.fillRect(p[0], p[1], 3, 2);
  }
  // Schnurgerüst
  g.strokeStyle = '#e8dcc0';
  g.lineWidth = 1;
  poly(g, [iso.p(0.2, 0.2, 3), iso.p(n - 0.2, 0.2, 3), iso.p(n - 0.2, n - 0.2, 3), iso.p(0.2, n - 0.2, 3)], undefined, '#e8dcc0', 1);
  // Bretterstapel
  const p = iso.p(n - 0.5, n - 0.3);
  for (let k = 0; k < 4; k++) {
    g.fillStyle = k % 2 ? '#a0784c' : '#8a6440';
    g.fillRect(p[0] - 16, p[1] - 4 - k * 3, 30, 3);
  }
  s = { c: B.c, ax: B.ax, ay: B.ay };
  foundationCache.set(n, s);
  return s;
}

/** Gerüststangen, über das wachsende Gebäude gezeichnet. */
export function drawScaffold(g: Ctx, sx: number, sy: number, n: number, z: number, prog: number): void {
  const iso = new Iso(sx, sy, z);
  const H = 10 + prog * 40;
  g.strokeStyle = '#6b4a2c';
  g.lineWidth = Math.max(1, 2 * z);
  const pts: [number, number][] = [[0.2, n - 0.2], [n - 0.2, n - 0.2], [n - 0.2, 0.2]];
  for (const [x, y] of pts) {
    const a = iso.p(x, y), b = iso.p(x, y, H);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  for (const zz of [H * 0.45, H * 0.9]) {
    const a = iso.p(0.2, n - 0.2, zz), b = iso.p(n - 0.2, n - 0.2, zz), c = iso.p(n - 0.2, 0.2, zz);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.stroke();
  }
}

// Einheiten: siehe units.ts
export { UNIT_FRAMES, unitSprites, unitFrame } from './units';
import { unitSprites } from './units';

// ------------------------------------------------------------------ Symbole für die Oberfläche
const iconCache = new Map<string, string>();
export function resIcon(r: Res | 'pop' | 'prestige'): string {
  const k = 'res:' + r;
  const hit = iconCache.get(k);
  if (hit) return hit;
  const [c, g] = canvas(32, 32);
  switch (r) {
    case 'holz':
      logs(g, 13, 26, 2);
      break;
    case 'getreide':
      g.strokeStyle = '#c9a43a';
      g.lineWidth = 2;
      for (let k2 = -3; k2 <= 3; k2++) {
        g.beginPath();
        g.moveTo(16, 30);
        g.quadraticCurveTo(16 + k2 * 2, 18, 16 + k2 * 3.5, 6);
        g.stroke();
        g.fillStyle = '#e0bf55';
        g.beginPath();
        g.ellipse(16 + k2 * 3.5, 7, 2, 4, k2 * 0.2, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#8a6a2a';
      g.fillRect(10, 19, 12, 3);
      break;
    case 'fisch':
      g.fillStyle = '#a9b6be';
      g.beginPath();
      g.ellipse(14, 16, 11, 5, -0.2, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(24, 14);
      g.lineTo(31, 8);
      g.lineTo(30, 22);
      g.fill();
      g.fillStyle = '#5d6c78';
      g.fillRect(4, 13, 18, 2);
      g.fillStyle = '#222';
      g.fillRect(6, 15, 2, 2);
      break;
    case 'lehm':
      g.fillStyle = '#9b6f45';
      g.beginPath();
      g.ellipse(16, 20, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b8895a';
      g.beginPath();
      g.ellipse(12, 16, 6, 4, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 'waren':
      barrel(g, 11, 30, 1.1);
      sack(g, 23, 30);
      break;
    case 'taler':
      g.fillStyle = '#c9a43a';
      g.beginPath();
      g.arc(16, 16, 11, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8a6a1a';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#8a6a1a';
      g.font = 'bold 13px Georgia, serif';
      g.textAlign = 'center';
      g.fillText('T', 16, 21);
      break;
    case 'pop':
      g.fillStyle = '#7b5b3a';
      g.fillRect(10, 14, 12, 14);
      g.fillStyle = '#e0b48c';
      g.beginPath();
      g.arc(16, 9, 5, 0, Math.PI * 2);
      g.fill();
      break;
    case 'prestige':
      g.fillStyle = '#d4a21f';
      g.beginPath();
      g.moveTo(4, 24);
      g.lineTo(6, 10);
      g.lineTo(11, 17);
      g.lineTo(16, 6);
      g.lineTo(21, 17);
      g.lineTo(26, 10);
      g.lineTo(28, 24);
      g.closePath();
      g.fill();
      g.strokeStyle = '#7a5a10';
      g.lineWidth = 1.5;
      g.stroke();
      break;
  }
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}

export function portrait(kind: 'b' | 'u', type: string, color: string, fac: FactionId = 'angeln', age = 1): string {
  const k = `p:${kind}:${type}:${color}:${fac}:${kind === 'b' ? lookAge(age) : 1}`;
  const hit = iconCache.get(k);
  if (hit) return hit;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#3a3226';
  g.fillRect(0, 0, 64, 64);
  if (kind === 'b') {
    const s = buildingSprite(type as BuildingType, color, FACTION_DEFS[fac].arch, age);
    const sc = Math.min(60 / s.c.width, 60 / s.c.height);
    g.drawImage(s.c, (64 - s.c.width * sc) / 2, (64 - s.c.height * sc) / 2, s.c.width * sc, s.c.height * sc);
  } else {
    const s = unitSprites(type as UnitType, color, fac)[0];
    // Figur (ohne Spieß-Überstand) formatfüllend
    const r = s.res ?? S;
    const fw = 22, fh = 30; // 1x-Ausschnitt um die Figur
    const dh = 62, dw = (dh * fw) / fh;
    g.drawImage(s.c, (s.ax - fw / 2) * r, (s.ay - fh + 2) * r, fw * r, fh * r, (64 - dw) / 2, 1, dw, dh);
  }
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}
