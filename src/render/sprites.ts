// Prozedural erzeugte, gecachte Sprites: Gelände, Bäume, Knicks, Gebäude, Einheiten, Symbole.
import type { BuildingType, Res, UnitType } from '../data/defs';
import {
  S, TH, TW, Iso, boxFaces, bush, canvas, doorOn, fillFace, flag, ground, poly, prng, roof, shade, shadowDiamond,
  wall, windowOn, type Ctx, type Pt,
} from './draw';

export const PLAYER_COLORS = ['#b3342b', '#2f5ea6', '#d4a21f', '#3f8a3c'];
export const PLAYER_COLOR_NAMES = ['Ziegelrot', 'Schleiblau', 'Ockergelb', 'Knickgrün'];
export const NEUTRAL_COLOR = '#8c7f6a';

export interface Sprite {
  c: HTMLCanvasElement;
  ax: number; // Ankerpunkt in 1x-Pixeln
  ay: number;
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
  return { gras, lehm, ufer, moor, wasser, flach, feld, wave, road };
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

/** Knick-Wall mit Bewuchs; Maske wie bei Straßen. */
export function makeKnicks(): Sprite[] {
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

function drawBuilding(type: BuildingType, color: string): BuildingSprite {
  const tops: Record<BuildingType, number> = {
    dorfzentrum: 90, wohnhaus: 56, holzfaeller: 50, bauernhof: 56, muehle: 92, heringszaun: 50, raeucherei: 80,
    lehmgrube: 40, markt: 50, kaserne: 70, brarupmarkt: 74,
  };
  const size: Record<BuildingType, number> = {
    dorfzentrum: 3, wohnhaus: 2, holzfaeller: 2, bauernhof: 2, muehle: 2, heringszaun: 2, raeucherei: 2, lehmgrube: 2,
    markt: 3, kaserne: 3, brarupmarkt: 3,
  };
  const n = size[type];
  const B = bcanvas(n, n, tops[type]);
  const { g, iso } = B;
  const out: BuildingSprite = { c: B.c, ax: B.ax, ay: B.ay };
  const to1x = (p: Pt): Pt => [p[0] / S - B.ax, p[1] / S - B.ay];
  switch (type) {
    case 'dorfzentrum': {
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#8d8573');
      const r = prng(5);
      for (let k = 0; k < 90; k++) {
        const p = iso.p(0.1 + r() * 2.8, 0.1 + r() * 2.8);
        g.fillStyle = r() < 0.5 ? '#7d7563' : '#a39a86';
        g.fillRect(p[0], p[1], 5, 3);
      }
      shadowDiamond(g, iso, 0.3, 0.3, 2.5, 2.1);
      const f = boxFaces(iso, 0.3, 0.35, 2.4, 2.0, 0, 30);
      wall(g, f.left, 'ziegel', 0.05, 2);
      wall(g, f.right, 'ziegel', -0.2, 3);
      doorOn(g, f.left, 0.42, 0.16, 0.55, 0.05);
      windowOn(g, f.left, 0.12, 0.45, 0.1, 0.25, 0.05);
      windowOn(g, f.left, 0.72, 0.45, 0.1, 0.25, 0.05);
      windowOn(g, f.right, 0.25, 0.45, 0.14, 0.25, -0.2);
      windowOn(g, f.right, 0.62, 0.45, 0.14, 0.25, -0.2);
      roof(g, iso, 0.3, 0.35, 2.4, 2.0, 30, 30, 'x', 'ziegel', 0, 9);
      // Turm mit Glocke
      const t = boxFaces(iso, 2.0, 1.95, 2.75, 2.7, 0, 62);
      wall(g, t.left, 'ziegel', 0.05, 4);
      wall(g, t.right, 'ziegel', -0.2, 5);
      windowOn(g, t.left, 0.35, 0.7, 0.3, 0.18, 0.1);
      windowOn(g, t.right, 0.35, 0.7, 0.3, 0.18, -0.2);
      roof(g, iso, 2.0, 1.95, 2.75, 2.7, 62, 30, 'x', 'ziegel', 0.37, 12);
      const fp = iso.p(2.375, 2.325, 92);
      flag(g, fp[0], fp[1], 22, color, 2);
      out.flagPt = to1x(fp);
      out.smoke = [to1x(iso.p(0.9, 0.9, 64))];
      // Brunnen/Kisten
      barrel(g, ...iso.p(0.4, 2.6));
      sack(g, ...iso.p(0.8, 2.75));
      break;
    }
    case 'wohnhaus': {
      ground(g, iso, 0.15, 0.15, 1.85, 1.85, '#7a8a48');
      shadowDiamond(g, iso, 0.35, 0.45, 1.75, 1.6);
      const f = boxFaces(iso, 0.35, 0.45, 1.75, 1.6, 0, 20);
      wall(g, f.left, 'fachwerk', 0.08, 1);
      wall(g, f.right, 'fachwerk', -0.15, 2);
      doorOn(g, f.left, 0.38, 0.17, 0.7, 0.08, color);
      windowOn(g, f.left, 0.1, 0.4, 0.14, 0.3, 0.08);
      windowOn(g, f.left, 0.72, 0.4, 0.14, 0.3, 0.08);
      windowOn(g, f.right, 0.38, 0.4, 0.22, 0.3, -0.15);
      roof(g, iso, 0.35, 0.45, 1.75, 1.6, 20, 26, 'x', 'reet', 0.3, 21);
      const ch = iso.p(0.75, 1.0, 46);
      g.fillStyle = '#8d3e2b';
      g.fillRect(ch[0] - 4, ch[1] - 8, 8, 12);
      out.smoke = [to1x([ch[0], ch[1] - 10])];
      break;
    }
    case 'holzfaeller': {
      ground(g, iso, 0.1, 0.1, 1.9, 1.9, '#7d7046');
      shadowDiamond(g, iso, 0.3, 0.25, 1.6, 1.1);
      const f = boxFaces(iso, 0.3, 0.25, 1.6, 1.1, 0, 20);
      wall(g, f.left, 'holz', 0.05, 2);
      wall(g, f.right, 'holz', -0.2, 3);
      doorOn(g, f.left, 0.55, 0.3, 0.8, 0.0, '#3a2818');
      roof(g, iso, 0.3, 0.25, 1.6, 1.1, 20, 14, 'x', 'schindel', 0, 31);
      logs(g, ...iso.p(0.5, 1.6), 4);
      // Hackklotz mit Axt
      const hb = iso.p(1.5, 1.5);
      g.fillStyle = '#6b4a2c';
      g.fillRect(hb[0] - 7, hb[1] - 10, 14, 10);
      g.fillStyle = '#c9a16a';
      g.beginPath();
      g.ellipse(hb[0], hb[1] - 10, 7, 3.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(hb[0], hb[1] - 11);
      g.lineTo(hb[0] + 10, hb[1] - 26);
      g.stroke();
      g.fillStyle = '#9aa0a6';
      g.fillRect(hb[0] - 3, hb[1] - 15, 6, 6);
      const fp = iso.p(1.75, 0.3, 0);
      flag(g, fp[0], fp[1], 34, color, 1);
      break;
    }
    case 'bauernhof': {
      ground(g, iso, 0.1, 0.1, 1.9, 1.9, '#7e8248');
      shadowDiamond(g, iso, 0.2, 0.4, 1.85, 1.55);
      const f = boxFaces(iso, 0.2, 0.4, 1.85, 1.55, 0, 18);
      wall(g, f.left, 'fachwerk', 0.06, 3);
      wall(g, f.right, 'ziegel', -0.18, 4);
      doorOn(g, f.right, 0.28, 0.44, 0.85, -0.18, '#6a4a2c'); // Grotdör
      windowOn(g, f.left, 0.15, 0.4, 0.1, 0.3, 0.06);
      windowOn(g, f.left, 0.45, 0.4, 0.1, 0.3, 0.06);
      windowOn(g, f.left, 0.75, 0.4, 0.1, 0.3, 0.06);
      roof(g, iso, 0.2, 0.4, 1.85, 1.55, 18, 30, 'x', 'reet', 0.35, 41);
      // Heuhaufen
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
      const fp = iso.p(1.85, 0.45, 0);
      flag(g, fp[0], fp[1], 34, color, 2);
      break;
    }
    case 'muehle': {
      ground(g, iso, 0.2, 0.2, 1.8, 1.8, '#7a8a48');
      // Bock: Steinsockel und Streben
      for (const [x, y] of [[0.55, 1.0], [1.45, 1.0], [1.0, 0.55], [1.0, 1.45]] as Pt[]) {
        const b = boxFaces(iso, x - 0.1, y - 0.1, x + 0.1, y + 0.1, 0, 6);
        fillFace(g, b.left, '#8f8a7e');
        fillFace(g, b.right, '#6f6a5e');
        poly(g, b.top, '#a39e90');
      }
      g.strokeStyle = '#4a3222';
      g.lineWidth = 4;
      const post0 = iso.p(1, 1, 0), post1 = iso.p(1, 1, 30);
      for (const [x, y] of [[0.55, 1.0], [1.45, 1.0], [1.0, 0.55], [1.0, 1.45]] as Pt[]) {
        const a = iso.p(x, y, 6);
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
      // Mühlenkasten
      shadowDiamond(g, iso, 0.6, 0.6, 1.5, 1.4);
      const f = boxFaces(iso, 0.55, 0.6, 1.4, 1.4, 28, 40);
      wall(g, f.left, 'holz', 0.1, 5);
      wall(g, f.right, 'holz', -0.18, 6);
      windowOn(g, f.right, 0.4, 0.55, 0.2, 0.2, -0.18);
      roof(g, iso, 0.55, 0.6, 1.4, 1.4, 68, 14, 'y', 'schindel', 0, 51);
      // Treppe/Steert nach hinten links
      const s0 = iso.p(0.7, 1.4, 30), s1 = iso.p(0.2, 1.9, 0);
      g.strokeStyle = '#5a3d22';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(s0[0], s0[1]);
      g.lineTo(s1[0], s1[1]);
      g.moveTo(s0[0] + 6, s0[1] + 2);
      g.lineTo(s1[0] + 6, s1[1] + 2);
      g.stroke();
      for (let k = 1; k < 6; k++) {
        const a: Pt = [s0[0] + (s1[0] - s0[0]) * (k / 6), s0[1] + (s1[1] - s0[1]) * (k / 6)];
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(a[0] + 6, a[1] + 2);
        g.stroke();
      }
      out.hub = to1x(iso.p(1.42, 1.0, 58));
      const fp = iso.p(0.98, 1.0, 86);
      flag(g, fp[0], fp[1], 12, color, 1);
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
      const f = boxFaces(iso, 0.3, 0.3, 1.0, 1.0, 2, 16);
      wall(g, f.left, 'holz', 0.05, 7);
      wall(g, f.right, 'holz', -0.2, 8);
      doorOn(g, f.left, 0.3, 0.35, 0.75, 0.05, '#3a2818');
      roof(g, iso, 0.3, 0.3, 1.0, 1.0, 18, 12, 'y', 'reet', 0, 61);
      // Trockengestell mit Heringen
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
      for (let k = 1; k < 7; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / 7), y = a[1] - 22 + (b[1] - a[1]) * (k / 7);
        g.fillStyle = '#c4ccd2';
        g.beginPath();
        g.ellipse(x, y + 7, 2, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      const fp = iso.p(0.25, 1.6, 2);
      flag(g, fp[0], fp[1], 30, color, 2);
      break;
    }
    case 'raeucherei': {
      ground(g, iso, 0.15, 0.15, 1.85, 1.85, '#80784e');
      shadowDiamond(g, iso, 0.3, 0.4, 1.7, 1.6);
      const f = boxFaces(iso, 0.3, 0.4, 1.7, 1.6, 0, 22);
      wall(g, f.left, 'ziegel', 0.05, 9);
      wall(g, f.right, 'ziegel', -0.2, 10);
      doorOn(g, f.left, 0.4, 0.2, 0.7, 0.05);
      windowOn(g, f.right, 0.4, 0.45, 0.18, 0.25, -0.2);
      roof(g, iso, 0.3, 0.4, 1.7, 1.6, 22, 20, 'y', 'ziegel', 0, 71);
      const c = boxFaces(iso, 1.15, 0.55, 1.42, 0.82, 0, 66);
      wall(g, c.left, 'ziegel', 0.0, 11);
      wall(g, c.right, 'ziegel', -0.25, 12);
      poly(g, c.top, '#2a2220');
      out.smoke = [to1x(iso.p(1.28, 0.68, 68))];
      // Räuchergestell
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
      for (let k = 1; k < 6; k++) {
        const x = a[0] + (b[0] - a[0]) * (k / 6), y = a[1] - 20 + (b[1] - a[1]) * (k / 6);
        g.fillStyle = '#b08a3a';
        g.beginPath();
        g.ellipse(x, y + 6, 2, 6, 0, 0, Math.PI * 2);
        g.fill();
      }
      const fp = iso.p(1.75, 1.75, 0);
      flag(g, fp[0], fp[1], 30, color, 1);
      break;
    }
    case 'lehmgrube': {
      ground(g, iso, 0.05, 0.05, 1.95, 1.95, '#8a6a42');
      // Grube
      poly(g, [iso.p(0.35, 0.3), iso.p(1.5, 0.3), iso.p(1.5, 1.4), iso.p(0.35, 1.4)], '#4a3424');
      poly(g, [iso.p(0.45, 0.4, -6), iso.p(1.4, 0.4, -6), iso.p(1.4, 1.3, -6), iso.p(0.45, 1.3, -6)], '#5e432c');
      poly(g, [iso.p(0.35, 1.4), iso.p(1.5, 1.4), iso.p(1.4, 1.3, -6), iso.p(0.45, 1.3, -6)], '#6e5236');
      // Rampe
      poly(g, [iso.p(1.5, 0.75), iso.p(1.9, 0.75), iso.p(1.9, 1.0), iso.p(1.5, 1.0)], '#7a6040');
      // Lehmhaufen
      const r = prng(81);
      for (const [x, y] of [[0.3, 1.7], [0.7, 1.75], [1.75, 1.55]] as Pt[]) {
        const p = iso.p(x, y);
        g.fillStyle = '#9b7348';
        g.beginPath();
        g.ellipse(p[0], p[1] - 6, 14, 10, 0, Math.PI, 0);
        g.fill();
        g.fillStyle = '#b38a5a';
        g.beginPath();
        g.ellipse(p[0] - 3, p[1] - 9, 6, 4, 0, 0, Math.PI * 2);
        g.fill();
        void r;
      }
      // Eimer und Schubkarre
      barrel(g, ...iso.p(1.75, 0.35), 0.6);
      const fp = iso.p(1.8, 0.2, 0);
      flag(g, fp[0], fp[1], 32, color, 2);
      break;
    }
    case 'markt': {
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#968b72');
      const r = prng(91);
      for (let k = 0; k < 80; k++) {
        const p = iso.p(0.1 + r() * 2.8, 0.1 + r() * 2.8);
        g.fillStyle = r() < 0.5 ? '#857a62' : '#aaa088';
        g.fillRect(p[0], p[1], 5, 3);
      }
      stall(g, iso, 0.3, 0.3, color, 1);
      stall(g, iso, 1.7, 0.4, color, 2);
      // Marktkreuz / Brunnen in der Mitte
      const m = iso.p(1.5, 1.5);
      g.fillStyle = '#7d7a72';
      g.beginPath();
      g.ellipse(m[0], m[1], 18, 9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3d5f78';
      g.beginPath();
      g.ellipse(m[0], m[1] - 3, 13, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a554c';
      g.fillRect(m[0] - 2, m[1] - 34, 4, 30);
      g.fillRect(m[0] - 9, m[1] - 28, 18, 4);
      stall(g, iso, 0.4, 1.9, color, 3);
      stall(g, iso, 1.9, 1.9, color, 4);
      barrel(g, ...iso.p(1.3, 2.7));
      barrel(g, ...iso.p(1.55, 2.75));
      sack(g, ...iso.p(2.8, 1.2));
      sack(g, ...iso.p(2.75, 1.45));
      const fp = iso.p(2.85, 0.15);
      flag(g, fp[0], fp[1], 40, color, 2);
      break;
    }
    case 'kaserne': {
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#857a58');
      shadowDiamond(g, iso, 0.25, 0.3, 2.7, 1.5);
      const f = boxFaces(iso, 0.25, 0.3, 2.7, 1.45, 0, 26);
      wall(g, f.left, 'ziegel', 0.05, 13);
      wall(g, f.right, 'ziegel', -0.2, 14);
      doorOn(g, f.left, 0.44, 0.12, 0.65, 0.05);
      for (const u of [0.12, 0.27, 0.65, 0.8]) windowOn(g, f.left, u, 0.45, 0.07, 0.25, 0.05);
      roof(g, iso, 0.25, 0.3, 2.7, 1.45, 26, 24, 'x', 'ziegel', 0, 91);
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
      // Strohpuppe
      const d = iso.p(2.2, 2.3);
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
      const fp = iso.p(2.75, 1.5, 0);
      flag(g, fp[0], fp[1], 62, color, 2);
      out.flagPt = to1x([fp[0], fp[1]]);
      break;
    }
    case 'brarupmarkt': {
      ground(g, iso, 0.0, 0.0, 3.0, 3.0, '#9a8f74');
      const r = prng(95);
      for (let k = 0; k < 110; k++) {
        const p = iso.p(0.05 + r() * 2.9, 0.05 + r() * 2.9);
        g.fillStyle = r() < 0.5 ? '#877c62' : '#b0a68c';
        g.fillRect(p[0], p[1], 5, 3);
      }
      // kleine Feldsteinkirche im Hintergrund (Süderbrarups Kirche als Motiv)
      const c = boxFaces(iso, 0.2, 0.2, 1.3, 0.8, 0, 26);
      wall(g, c.left, 'stein', 0.05, 15);
      wall(g, c.right, 'stein', -0.2, 16);
      windowOn(g, c.left, 0.3, 0.45, 0.08, 0.3, 0.05);
      windowOn(g, c.left, 0.65, 0.45, 0.08, 0.3, 0.05);
      roof(g, iso, 0.2, 0.2, 1.3, 0.8, 26, 20, 'x', 'ziegel', 0, 97);
      const t = boxFaces(iso, 0.2, 0.25, 0.55, 0.75, 0, 46);
      wall(g, t.left, 'stein', 0.05, 17);
      wall(g, t.right, 'stein', -0.2, 18);
      roof(g, iso, 0.2, 0.25, 0.55, 0.75, 46, 26, 'y', 'schindel', 0.25, 98);
      stall(g, iso, 1.7, 0.3, '#7a6a4a', 5);
      stall(g, iso, 0.3, 1.5, '#5a7a8a', 6);
      stall(g, iso, 1.8, 1.6, '#8a5a3a', 7);
      barrel(g, ...iso.p(1.3, 2.6));
      sack(g, ...iso.p(2.6, 2.6));
      sack(g, ...iso.p(2.8, 2.4));
      out.flagPt = to1x(iso.p(1.45, 1.45));
      break;
    }
  }
  return out;
}

const buildingCache = new Map<string, BuildingSprite>();
export function buildingSprite(type: BuildingType, color: string): BuildingSprite {
  const k = type + color;
  let s = buildingCache.get(k);
  if (!s) {
    s = drawBuilding(type, color);
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

// ------------------------------------------------------------------ Einheiten
export const UNIT_FRAMES = 5; // 0 Stand, 1-2 Gehen, 3-4 Arbeiten/Kämpfen

function person(
  g: Ctx, x: number, y: number, frame: number,
  o: { tunic: string; legs: string; hat: (g: Ctx, hx: number, hy: number) => void; accent?: string; item?: (g: Ctx, hx: number, hy: number, f: number) => void; puffy?: boolean },
): void {
  const step = frame === 1 ? 3 : frame === 2 ? -3 : 0;
  // Beine
  g.fillStyle = o.legs;
  g.fillRect(x - 5 + step, y - 14, 4, 14);
  g.fillRect(x + 1 - step, y - 14, 4, 14);
  g.fillStyle = '#2e2218';
  g.fillRect(x - 6 + step, y - 2, 6, 3);
  g.fillRect(x + 1 - step, y - 2, 6, 3);
  if (o.puffy && o.accent) {
    g.fillStyle = o.accent;
    g.beginPath();
    g.ellipse(x - 3 + step, y - 12, 4, 4, 0, 0, Math.PI * 2);
    g.ellipse(x + 3 - step, y - 12, 4, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#f0ead8';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 5 + step, y - 13);
    g.lineTo(x - 2 + step, y - 9);
    g.moveTo(x + 2 - step, y - 13);
    g.lineTo(x + 5 - step, y - 9);
    g.stroke();
  }
  // Körper
  g.fillStyle = o.tunic;
  g.beginPath();
  g.moveTo(x - 7, y - 13);
  g.lineTo(x + 7, y - 13);
  g.lineTo(x + 6, y - 30);
  g.lineTo(x - 6, y - 30);
  g.closePath();
  g.fill();
  g.fillStyle = shade(o.tunic, -0.25);
  g.fillRect(x + 2, y - 30, 4, 17);
  if (o.accent) {
    g.fillStyle = o.accent;
    g.fillRect(x - 7, y - 18, 14, 3); // Gürtel/Schärpe in Spielerfarbe
  }
  // Kopf
  g.fillStyle = '#e0b48c';
  g.beginPath();
  g.arc(x, y - 35, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c99a72';
  g.fillRect(x + 2, y - 37, 3, 5);
  o.hat(g, x, y - 35);
  // Arme + Gegenstand
  if (o.item) o.item(g, x, y, frame);
  else {
    g.strokeStyle = o.tunic;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(x + 5, y - 28);
    g.lineTo(x + 7, y - 17 + step * 0.5);
    g.stroke();
  }
}

function drawUnitFrame(g: Ctx, type: UnitType, color: string, frame: number, x: number, y: number): void {
  const work = frame >= 3;
  const swing = frame === 4;
  // Schatten
  g.fillStyle = 'rgba(15,20,10,0.32)';
  g.beginPath();
  g.ellipse(x + 2, y, type === 'spaeher' ? 18 : 10, type === 'spaeher' ? 6 : 4, 0, 0, Math.PI * 2);
  g.fill();
  if (type === 'arbeiter') {
    person(g, x, y, work ? 0 : frame, {
      tunic: '#7b5b3a', legs: '#5c5348', accent: color,
      hat: (g, hx, hy) => {
        g.fillStyle = color;
        g.beginPath();
        g.ellipse(hx, hy - 3, 6, 4, 0, Math.PI, 0);
        g.fill();
        g.fillRect(hx - 6, hy - 4, 12, 2);
      },
      item: (g, hx, hy, f) => {
        const up = f === 3;
        g.strokeStyle = '#7b5b3a';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(hx + 4, hy - 28);
        const ex = hx + (work ? (up ? 6 : 11) : 7), ey = hy - (work ? (up ? 38 : 22) : 17);
        g.lineTo(ex, ey);
        g.stroke();
        if (work) {
          // Axt/Hacke
          g.strokeStyle = '#6b4a2c';
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(ex, ey);
          const tx = ex + (up ? -2 : 12), ty = ey + (up ? -12 : 6);
          g.lineTo(tx, ty);
          g.stroke();
          g.fillStyle = '#a8aeb4';
          g.fillRect(tx - 3, ty - 3, 6, 6);
        }
      },
    });
  } else if (type === 'spaeher') {
    // Pferd
    const leg = frame === 1 ? 4 : frame === 2 ? -4 : 0;
    g.fillStyle = '#6b4428';
    g.strokeStyle = '#4a2e1a';
    g.lineWidth = 3;
    for (const [lx, d] of [[-10, leg], [-5, -leg], [7, -leg], [12, leg]]) {
      g.beginPath();
      g.moveTo(x + lx, y - 14);
      g.lineTo(x + lx + d, y - 1);
      g.stroke();
    }
    g.beginPath();
    g.ellipse(x, y - 18, 15, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(x + 10, y - 20);
    g.lineTo(x + 17, y - 32);
    g.lineTo(x + 23, y - 30);
    g.lineTo(x + 16, y - 18);
    g.fill();
    g.fillStyle = '#3a2416';
    g.beginPath();
    g.moveTo(x - 14, y - 20);
    g.quadraticCurveTo(x - 22, y - 16, x - 19, y - 7);
    g.lineWidth = 3;
    g.stroke();
    g.fillRect(x + 14, y - 33, 5, 3);
    // Reiter
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x - 7, y - 20);
    g.lineTo(x + 5, y - 20);
    g.lineTo(x + 4, y - 36);
    g.lineTo(x - 5, y - 36);
    g.closePath();
    g.fill();
    g.fillStyle = '#4a4440';
    g.fillRect(x - 2, y - 22, 5, 8);
    g.fillStyle = '#e0b48c';
    g.beginPath();
    g.arc(x, y - 41, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3a3330';
    g.beginPath();
    g.ellipse(x, y - 44, 7, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - 3, y - 50, 7, 6);
    if (work) {
      g.strokeStyle = '#b8bcc0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 4, y - 30);
      g.lineTo(x + (swing ? 18 : 12), y - (swing ? 24 : 44));
      g.stroke();
    }
  } else if (type === 'landsknecht') {
    person(g, x, y, work ? 0 : frame, {
      tunic: shade(color, -0.1), legs: '#d9d0bc', accent: color, puffy: true,
      hat: (g, hx, hy) => {
        // Morion-Helm
        g.fillStyle = '#b8bcc0';
        g.beginPath();
        g.ellipse(hx, hy - 3, 6, 5, 0, Math.PI, 0);
        g.fill();
        g.beginPath();
        g.moveTo(hx - 9, hy - 2);
        g.quadraticCurveTo(hx, hy - 1, hx + 9, hy - 5);
        g.lineTo(hx + 9, hy - 3);
        g.quadraticCurveTo(hx, hy + 1, hx - 9, hy);
        g.fill();
        g.fillRect(hx - 1, hy - 11, 2, 4);
      },
      item: (g, hx, hy, f) => {
        // Spieß
        const thrust = f === 4 ? 8 : 0;
        const tilt = work ? 0.35 : 0.08;
        const bx = hx + 6 + thrust * 0.5, by = hy - 22;
        g.strokeStyle = '#6b4a2c';
        g.lineWidth = 2.5;
        const len = 46;
        const ex = bx + Math.sin(tilt + (work ? 0.9 : 0)) * len, ey = by - Math.cos(tilt + (work ? 0.9 : 0)) * len;
        g.beginPath();
        g.moveTo(bx - (ex - bx) * 0.25, by - (ey - by) * 0.25);
        g.lineTo(ex, ey);
        g.stroke();
        g.fillStyle = '#c8ccd0';
        g.beginPath();
        g.arc(ex, ey, 2.5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = shade(color, -0.1);
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(hx + 4, hy - 28);
        g.lineTo(bx, by);
        g.stroke();
      },
    });
  } else {
    person(g, x, y, work ? 0 : frame, {
      tunic: '#5d6748', legs: '#4c4a40', accent: color,
      hat: (g, hx, hy) => {
        g.fillStyle = color;
        g.beginPath();
        g.ellipse(hx, hy - 4, 8, 3, 0, 0, Math.PI * 2);
        g.fill();
        g.fillRect(hx - 4, hy - 9, 8, 5);
        g.strokeStyle = '#f0ead8';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(hx - 3, hy - 8);
        g.quadraticCurveTo(hx - 10, hy - 16, hx - 12, hy - 10);
        g.stroke();
      },
      item: (g, hx, hy, f) => {
        // Armbrust
        const aim = work;
        const cx = hx + (aim ? 10 : 6), cy = hy - (aim ? 30 : 22);
        g.strokeStyle = '#5d6748';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(hx + 4, hy - 28);
        g.lineTo(cx - 3, cy + 1);
        g.stroke();
        g.strokeStyle = '#6b4a2c';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(cx - 6, cy + 2);
        g.lineTo(cx + 10, cy - (aim ? 0 : 6));
        g.stroke();
        g.strokeStyle = '#3a3330';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx + 8, cy - (aim ? 0 : 5), 6, -Math.PI / 2, Math.PI / 2);
        g.stroke();
        if (aim && f === 3) {
          g.strokeStyle = '#ddd';
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(cx + 2, cy);
          g.lineTo(cx + 14, cy);
          g.stroke();
        }
      },
    });
  }
}

const unitCache = new Map<string, Sprite[]>();
export function unitSprites(type: UnitType, color: string): Sprite[] {
  const k = type + color;
  let arr = unitCache.get(k);
  if (arr) return arr;
  arr = [];
  for (let f = 0; f < UNIT_FRAMES; f++) {
    const w = 32 * S, h = 30 * S;
    const [c, g] = canvas(w, h);
    g.scale(S / 2, S / 2);
    // Figuren werden in 2x-Koordinaten (Fußpunkt) gezeichnet
    drawUnitFrame(g, type, color, f, 32, 52);
    arr.push({ c, ax: 16, ay: 26 });
  }
  unitCache.set(k, arr);
  return arr;
}

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

export function portrait(kind: 'b' | 'u', type: string, color: string): string {
  const k = `p:${kind}:${type}:${color}`;
  const hit = iconCache.get(k);
  if (hit) return hit;
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#3a3226';
  g.fillRect(0, 0, 64, 64);
  if (kind === 'b') {
    const s = buildingSprite(type as BuildingType, color);
    const sc = Math.min(60 / s.c.width, 60 / s.c.height);
    g.drawImage(s.c, (64 - s.c.width * sc) / 2, (64 - s.c.height * sc) / 2, s.c.width * sc, s.c.height * sc);
  } else {
    const s = unitSprites(type as UnitType, color)[0];
    g.drawImage(s.c, 0, 2, 64, 60);
  }
  const url = c.toDataURL();
  iconCache.set(k, url);
  return url;
}
