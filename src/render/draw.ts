// Zeichenhilfen für isometrische Sprites (eigener Stil: späte 90er, gedeckte Farben).
export const TW = 64; // Kachelbreite bei Zoom 1
export const TH = 32;
export const S = 2; // Sprites werden doppelt aufgelöst erzeugt

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  const g = c.getContext('2d')!;
  return [c, g];
}

/** Deterministische Pseudo-Zufallsfolge für Texturen. */
export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export function shade(col: string, f: number): string {
  let r: number, g: number, b: number;
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(col);
  if (m) {
    r = +m[1];
    g = +m[2];
    b = +m[3];
  } else {
    const n = parseInt(col.slice(1), 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  }
  if (f < 0) {
    r *= 1 + f; g *= 1 + f; b *= 1 + f;
  } else {
    r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function poly(g: Ctx, pts: Pt[], fill?: string, stroke?: string, lw = 1): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

/** Isometrischer Projektor in Sprite-Koordinaten (bereits mit Skalierung S). */
export class Iso {
  constructor(public ox: number, public oy: number, public s = S) {}
  p(tx: number, ty: number, z = 0): Pt {
    return [this.ox + (tx - ty) * (TW / 2) * this.s, this.oy + (tx + ty) * (TH / 2) * this.s - z * this.s];
  }
}

export interface Face {
  bl: Pt;
  br: Pt;
  tr: Pt;
  tl: Pt;
}
export function faceAt(f: Face, u: number, v: number): Pt {
  const bx = f.bl[0] + (f.br[0] - f.bl[0]) * u, by = f.bl[1] + (f.br[1] - f.bl[1]) * u;
  const tx = f.tl[0] + (f.tr[0] - f.tl[0]) * u, ty = f.tl[1] + (f.tr[1] - f.tl[1]) * u;
  return [bx + (tx - bx) * v, by + (ty - by) * v];
}
export function faceQuad(f: Face, u0: number, v0: number, u1: number, v1: number): Pt[] {
  return [faceAt(f, u0, v0), faceAt(f, u1, v0), faceAt(f, u1, v1), faceAt(f, u0, v1)];
}

export interface BoxFaces {
  left: Face; // y = y1 (links vorne)
  right: Face; // x = x1 (rechts vorne)
  top: Pt[];
}

export function boxFaces(iso: Iso, x0: number, y0: number, x1: number, y1: number, z0: number, H: number): BoxFaces {
  return {
    left: { bl: iso.p(x0, y1, z0), br: iso.p(x1, y1, z0), tr: iso.p(x1, y1, z0 + H), tl: iso.p(x0, y1, z0 + H) },
    right: { bl: iso.p(x1, y1, z0), br: iso.p(x1, y0, z0), tr: iso.p(x1, y0, z0 + H), tl: iso.p(x1, y1, z0 + H) },
    top: [iso.p(x0, y0, z0 + H), iso.p(x1, y0, z0 + H), iso.p(x1, y1, z0 + H), iso.p(x0, y1, z0 + H)],
  };
}

export function fillFace(g: Ctx, f: Face, color: string): void {
  poly(g, [f.bl, f.br, f.tr, f.tl], color);
}

/** Wand mit Material: 'putz' (Fachwerk), 'ziegel', 'holz', 'stein'. */
export type WallMat = 'fachwerk' | 'ziegel' | 'holz' | 'stein' | 'putz' | 'klinker' | 'beton' | 'glas' | 'blech' | 'paneel';
export function wall(g: Ctx, f: Face, mat: WallMat, light: number, seed = 1): void {
  if (mat === 'beton' || mat === 'glas' || mat === 'blech' || mat === 'paneel') return modernWall(g, f, mat, light, seed);
  if (mat === 'putz') {
    // weiß gekalkter Putz mit leichter Textur
    fillFace(g, f, shade('#ece5d4', light));
    g.save();
    poly(g, [f.bl, f.br, f.tr, f.tl]);
    g.clip();
    const r = prng(seed);
    for (let k = 0; k < 40; k++) {
      const p = faceAt(f, r(), r());
      g.fillStyle = r() < 0.5 ? 'rgba(120,100,70,0.08)' : 'rgba(255,255,255,0.12)';
      g.fillRect(p[0], p[1], 3 + r() * 4, 2);
    }
    g.restore();
    return;
  }
  // Klinker: dunklerer, friesischer Backstein
  const klinker = mat === 'klinker';
  const m2: 'fachwerk' | 'ziegel' | 'holz' | 'stein' = mat === 'klinker' ? 'ziegel' : mat;
  mat = m2;
  const base = klinker ? '#74332a' : { fachwerk: '#e3d8bd', ziegel: '#984530', holz: '#7b5634', stein: '#8f8a7e' }[m2];
  fillFace(g, f, shade(base, light));
  g.save();
  poly(g, [f.bl, f.br, f.tr, f.tl]);
  g.clip();
  const r = prng(seed);
  const len = Math.hypot(f.br[0] - f.bl[0], f.br[1] - f.bl[1]);
  const hgt = Math.hypot(f.tl[0] - f.bl[0], f.tl[1] - f.bl[1]);
  if (mat === 'ziegel' || mat === 'stein') {
    const rows = Math.max(3, Math.round(hgt / (mat === 'ziegel' ? 5 : 9)));
    g.strokeStyle = mat === 'ziegel' ? shade('#c8b597', light - 0.1) : shade('#6d685e', light);
    g.lineWidth = 1;
    for (let k = 1; k < rows; k++) {
      const v = k / rows;
      const a = faceAt(f, 0, v), b = faceAt(f, 1, v);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
      const cols = Math.max(2, Math.round(len / (mat === 'ziegel' ? 9 : 14)));
      for (let c = 0; c < cols; c++) {
        const u = (c + (k % 2) * 0.5) / cols;
        const p0 = faceAt(f, u, v), p1 = faceAt(f, u, v - 1 / rows);
        g.beginPath();
        g.moveTo(p0[0], p0[1]);
        g.lineTo(p1[0], p1[1]);
        g.stroke();
      }
    }
    // Farbvariation einzelner Steine
    for (let k = 0; k < len * hgt * 0.01; k++) {
      const u = r(), v = r();
      const p = faceAt(f, u, v);
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,230,200,0.10)';
      g.fillRect(p[0], p[1], 4, 2);
    }
  } else if (mat === 'holz') {
    const n = Math.max(3, Math.round(len / 7));
    for (let c = 0; c <= n; c++) {
      const a = faceAt(f, c / n, 0), b = faceAt(f, c / n, 1);
      g.strokeStyle = shade('#4a321c', light);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
  } else {
    // Fachwerk: Ständer, Riegel, Streben
    const beam = shade('#4a3222', light);
    g.strokeStyle = beam;
    g.lineWidth = 3;
    const posts = Math.max(2, Math.round(len / 18));
    const line = (u0: number, v0: number, u1: number, v1: number) => {
      const a = faceAt(f, u0, v0), b = faceAt(f, u1, v1);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    };
    line(0, 0.02, 1, 0.02);
    line(0, 0.98, 1, 0.98);
    line(0, 0.5, 1, 0.5);
    for (let c = 0; c <= posts; c++) line(c / posts, 0, c / posts, 1);
    g.lineWidth = 2.2;
    for (let c = 0; c < posts; c++) if ((c + seed) % 2 === 0) line(c / posts, 0.5, (c + 1) / posts, 0.98);
  }
  g.restore();
  // dunkle Sockelkante
  g.strokeStyle = 'rgba(30,20,10,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(f.bl[0], f.bl[1]);
  g.lineTo(f.br[0], f.br[1]);
  g.stroke();
}

/** Wände des 20./22. Jahrhunderts: Sichtbeton, Glasfassade, Wellblech, helle Verbundpaneele. */
function modernWall(g: Ctx, f: Face, mat: 'beton' | 'glas' | 'blech' | 'paneel', light: number, seed: number): void {
  const base = { beton: '#a7a49c', glas: '#4f7f9a', blech: '#8d9498', paneel: '#e9ecec' }[mat];
  fillFace(g, f, shade(base, light));
  g.save();
  poly(g, [f.bl, f.br, f.tr, f.tl]);
  g.clip();
  const r = prng(seed);
  const len = Math.hypot(f.br[0] - f.bl[0], f.br[1] - f.bl[1]);
  const hgt = Math.hypot(f.tl[0] - f.bl[0], f.tl[1] - f.bl[1]);
  const line = (u0: number, v0: number, u1: number, v1: number, col: string, w: number) => {
    const a = faceAt(f, u0, v0), b = faceAt(f, u1, v1);
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  };
  if (mat === 'beton') {
    // Schalungsfugen und Ankerlöcher
    const cols = Math.max(2, Math.round(len / 22)), rows = Math.max(2, Math.round(hgt / 16));
    for (let c = 1; c < cols; c++) line(c / cols, 0, c / cols, 1, shade(base, light - 0.18), 1);
    for (let k = 1; k < rows; k++) line(0, k / rows, 1, k / rows, shade(base, light - 0.12), 1);
    for (let k = 0; k < len * hgt * 0.004; k++) {
      const p = faceAt(f, r(), r());
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.08)';
      g.fillRect(p[0], p[1], 3, 2);
    }
  } else if (mat === 'glas') {
    // Pfosten-Riegel-Fassade mit Spiegelung
    const cols = Math.max(2, Math.round(len / 12)), rows = Math.max(2, Math.round(hgt / 10));
    const gr = g.createLinearGradient(f.bl[0], f.tl[1], f.br[0], f.bl[1]);
    gr.addColorStop(0, 'rgba(210,235,250,0.35)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(180,215,235,0.25)');
    g.fillStyle = gr;
    poly(g, [f.bl, f.br, f.tr, f.tl]);
    g.fill();
    for (let c = 0; c <= cols; c++) line(c / cols, 0, c / cols, 1, shade('#2e3b44', light), 1.4);
    for (let k = 0; k <= rows; k++) line(0, k / rows, 1, k / rows, shade('#2e3b44', light), 1);
  } else if (mat === 'blech') {
    // Wellblech: dichte senkrechte Rillen
    const n = Math.max(6, Math.round(len / 3));
    for (let c = 0; c < n; c++) line(c / n, 0, c / n, 1, c % 2 ? shade(base, light - 0.15) : shade(base, light + 0.12), 1);
    const p = faceAt(f, 0.2 + r() * 0.5, 0.3);
    g.fillStyle = 'rgba(120,70,40,0.18)';
    g.fillRect(p[0], p[1], 6, 10);
  } else {
    // helle Verbundpaneele mit feinen Fugen und Lichtband
    const cols = Math.max(2, Math.round(len / 16));
    for (let c = 1; c < cols; c++) line(c / cols, 0, c / cols, 1, shade(base, light - 0.12), 0.8);
    line(0, 0.62, 1, 0.62, 'rgba(90,200,230,0.85)', 2);
  }
  g.restore();
  g.strokeStyle = 'rgba(30,30,30,0.45)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(f.bl[0], f.bl[1]);
  g.lineTo(f.br[0], f.br[1]);
  g.stroke();
}

/** Flachdach mit Attika. */
export function flatRoof(g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, H: number, color = '#6e6a62', attika = 3): void {
  poly(g, [iso.p(x0, y0, H), iso.p(x1, y0, H), iso.p(x1, y1, H), iso.p(x0, y1, H)], color, 'rgba(30,30,30,0.5)', 1);
  if (attika) {
    poly(g, [iso.p(x0, y1, H), iso.p(x1, y1, H), iso.p(x1, y1, H + attika), iso.p(x0, y1, H + attika)], shade(color, 0.12));
    poly(g, [iso.p(x1, y1, H), iso.p(x1, y0, H), iso.p(x1, y0, H + attika), iso.p(x1, y1, H + attika)], shade(color, -0.1));
  }
}

/** Solarmodule auf einer Dach- oder Bodenfläche. */
export function solarPanels(g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, z: number, rows = 2, cols = 3): void {
  const dx = (x1 - x0) / cols, dy = (y1 - y0) / rows;
  for (let a = 0; a < cols; a++)
    for (let b = 0; b < rows; b++) {
      const px = x0 + a * dx + dx * 0.08, py = y0 + b * dy + dy * 0.08;
      const pts: Pt[] = [iso.p(px, py, z + 2), iso.p(px + dx * 0.84, py, z + 2), iso.p(px + dx * 0.84, py + dy * 0.84, z + 5), iso.p(px, py + dy * 0.84, z + 5)];
      poly(g, pts, '#1f3550', '#9fb4c8', 0.8);
      const m0 = iso.p(px + dx * 0.42, py, z + 2), m1 = iso.p(px + dx * 0.42, py + dy * 0.84, z + 5);
      g.strokeStyle = 'rgba(160,190,215,0.6)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.moveTo(m0[0], m0[1]);
      g.lineTo(m1[0], m1[1]);
      g.stroke();
    }
}

/** Kuppel (Halbkugel) über einem Mittelpunkt, isometrisch als Ellipsen. */
export function dome(g: Ctx, iso: Iso, cx: number, cy: number, r: number, z: number, color: string, glass = false): void {
  const c = iso.p(cx, cy, z);
  const rx = r * (TW / 2) * S * 1.42, ry = rx * 0.5;
  const h = rx * 0.9;
  const gr = g.createRadialGradient(c[0] - rx * 0.35, c[1] - h * 0.7, rx * 0.1, c[0], c[1] - h * 0.3, rx * 1.2);
  gr.addColorStop(0, glass ? 'rgba(220,245,255,0.95)' : shade(color, 0.35));
  gr.addColorStop(1, glass ? 'rgba(70,120,150,0.9)' : shade(color, -0.25));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(c[0], c[1], rx, ry, 0, 0, Math.PI);
  g.lineTo(c[0] - rx, c[1]);
  g.ellipse(c[0], c[1], rx, h, 0, Math.PI, Math.PI * 2);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(30,40,50,0.5)';
  g.lineWidth = 1;
  g.stroke();
  if (glass) {
    g.strokeStyle = 'rgba(40,70,90,0.6)';
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.ellipse(c[0], c[1], rx * (1 - k * 0.22), h, 0, Math.PI, Math.PI * 2);
      g.stroke();
    }
    for (let k = 1; k < 3; k++) {
      g.beginPath();
      g.ellipse(c[0], c[1] - h * k * 0.3, rx * Math.sqrt(1 - (k * 0.3) ** 2), ry * Math.sqrt(1 - (k * 0.3) ** 2), 0, Math.PI, Math.PI * 2);
      g.stroke();
    }
  }
}

export function windowOn(g: Ctx, f: Face, u: number, v: number, du: number, dv: number, light: number): void {
  poly(g, faceQuad(f, u, v, u + du, v + dv), shade('#2b2a2c', light * 0.5), shade('#4a3222', light), 1.5);
  const m = faceQuad(f, u + du / 2 - 0.004, v, u + du / 2 + 0.004, v + dv);
  poly(g, m, shade('#6a5440', light));
}
export function doorOn(g: Ctx, f: Face, u: number, du: number, dv: number, light: number, color = '#5b3b22'): void {
  poly(g, faceQuad(f, u, 0, u + du, dv), shade(color, light), shade('#2e1d10', 0), 1.5);
}

export type RoofMat = 'reet' | 'ziegel' | 'schindel' | 'kupfer';

/** Satteldach mit First entlang x ('x') oder y ('y'); hip > 0 ergibt Walmdach (typisch für Reetdächer). */
export function roof(
  g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, H: number, R: number,
  axis: 'x' | 'y', mat: RoofMat, hip = 0, seed = 3,
): void {
  const o = 0.12; // Überstand
  x0 -= o; y0 -= o; x1 += o; y1 += o;
  const base = { reet: '#9a8552', ziegel: '#8e3a27', schindel: '#6b5a48', kupfer: '#5e9a83' }[mat];
  const planes: { pts: Pt[]; light: number }[] = [];
  if (axis === 'x') {
    const ym = (y0 + y1) / 2;
    const a = x0 + hip, b = x1 - hip;
    planes.push({ pts: [iso.p(x0, y0, H), iso.p(x1, y0, H), iso.p(b, ym, H + R), iso.p(a, ym, H + R)], light: -0.25 });
    if (hip) planes.push({ pts: [iso.p(x0, y0, H), iso.p(x0, y1, H), iso.p(a, ym, H + R)], light: 0.05 });
    planes.push({ pts: [iso.p(x0, y1, H), iso.p(x1, y1, H), iso.p(b, ym, H + R), iso.p(a, ym, H + R)], light: 0.08 });
    planes.push({ pts: [iso.p(x1, y0, H), iso.p(x1, y1, H), iso.p(b, ym, H + R)], light: hip ? -0.18 : -0.1 });
  } else {
    const xm = (x0 + x1) / 2;
    const a = y0 + hip, b = y1 - hip;
    planes.push({ pts: [iso.p(x0, y0, H), iso.p(x0, y1, H), iso.p(xm, b, H + R), iso.p(xm, a, H + R)], light: 0.05 });
    if (hip) planes.push({ pts: [iso.p(x0, y0, H), iso.p(x1, y0, H), iso.p(xm, a, H + R)], light: -0.25 });
    planes.push({ pts: [iso.p(x1, y0, H), iso.p(x1, y1, H), iso.p(xm, b, H + R), iso.p(xm, a, H + R)], light: -0.18 });
    planes.push({ pts: [iso.p(x0, y1, H), iso.p(x1, y1, H), iso.p(xm, b, H + R)], light: hip ? 0.08 : 0.02 });
  }
  const r = prng(seed);
  for (const pl of planes) {
    const isGable = pl.pts.length === 3 && !hip;
    if (isGable && mat !== 'reet') {
      // Giebeldreieck in Holz/Fachwerk
      poly(g, pl.pts, shade(mat === 'ziegel' ? '#984530' : '#7b5634', pl.light), 'rgba(40,25,15,0.6)', 1);
      continue;
    }
    poly(g, pl.pts, shade(base, pl.light));
    g.save();
    poly(g, pl.pts);
    g.clip();
    const minX = Math.min(...pl.pts.map((p) => p[0])), maxX = Math.max(...pl.pts.map((p) => p[0]));
    const minY = Math.min(...pl.pts.map((p) => p[1])), maxY = Math.max(...pl.pts.map((p) => p[1]));
    if (mat === 'reet') {
      // Reet: viele kurze Halme
      const n = ((maxX - minX) * (maxY - minY)) / 6;
      for (let k = 0; k < n; k++) {
        const x = minX + r() * (maxX - minX), y = minY + r() * (maxY - minY);
        g.strokeStyle = r() < 0.5 ? shade(base, pl.light - 0.25) : shade(base, pl.light + 0.18);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 2, y + 4 + r() * 3);
        g.stroke();
      }
      // Moosflecken und Traufkante
      for (let k = 0; k < 4; k++) {
        const x = minX + r() * (maxX - minX), y = minY + (0.3 + r() * 0.6) * (maxY - minY);
        const gr = g.createRadialGradient(x, y, 0, x, y, 7 + r() * 6);
        gr.addColorStop(0, 'rgba(78,102,44,0.5)');
        gr.addColorStop(1, 'rgba(78,102,44,0)');
        g.fillStyle = gr;
        g.fillRect(x - 14, y - 14, 28, 28);
      }
    } else {
      // Ziegel/Schindeln: Reihen
      g.strokeStyle = shade(base, pl.light - 0.3);
      g.lineWidth = 1;
      for (let y = minY; y < maxY; y += 5) {
        g.beginPath();
        g.moveTo(minX, y);
        g.lineTo(maxX, y + (maxX - minX) * 0.0);
        g.stroke();
        for (let x = minX + ((y / 5) % 2) * 4; x < maxX; x += 8) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 5);
          g.stroke();
        }
      }
    }
    g.restore();
    poly(g, pl.pts, undefined, 'rgba(35,25,15,0.55)', 1);
  }
  // First
  if (mat === 'reet') {
    g.strokeStyle = '#5d6b3a';
    g.lineWidth = 4;
    g.beginPath();
    if (axis === 'x') {
      const ym = (y0 + y1) / 2;
      const a = iso.p(x0 + hip, ym, H + R), b = iso.p(x1 - hip, ym, H + R);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    } else {
      const xm = (x0 + x1) / 2;
      const a = iso.p(xm, y0 + hip, H + R), b = iso.p(xm, y1 - hip, H + R);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
    }
    g.stroke();
  }
}

export function shadowDiamond(g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number): void {
  const pts: Pt[] = [iso.p(x0 + 0.2, y0 + 0.1), iso.p(x1 + 0.45, y0 + 0.1), iso.p(x1 + 0.45, y1 + 0.35), iso.p(x0 + 0.2, y1 + 0.35)];
  poly(g, pts, 'rgba(20,25,10,0.28)');
}

export function ground(g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, color: string): void {
  poly(g, [iso.p(x0, y0), iso.p(x1, y0), iso.p(x1, y1), iso.p(x0, y1)], color);
}

export function flag(g: Ctx, x: number, y: number, h: number, color: string, wave = 0): void {
  g.strokeStyle = '#3b2a1a';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - h);
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - h);
  g.quadraticCurveTo(x + 10, y - h - 3 + wave, x + 20, y - h + 2);
  g.lineTo(x + 20, y - h + 12);
  g.quadraticCurveTo(x + 10, y - h + 8 + wave, x, y - h + 12);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 1;
  g.stroke();
}

export function bush(g: Ctx, x: number, y: number, r: number, color: string, rnd: () => number): void {
  for (let k = 0; k < 5; k++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.5;
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * 0.6;
    const rr = r * (0.5 + rnd() * 0.4);
    g.fillStyle = shade(color, -0.25);
    g.beginPath();
    g.arc(cx + 1, cy + 1.5, rr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(color, (rnd() - 0.4) * 0.3);
    g.beginPath();
    g.arc(cx, cy, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = shade(color, 0.25);
  g.beginPath();
  g.arc(x - r * 0.25, y - r * 0.35, r * 0.3, 0, Math.PI * 2);
  g.fill();
}
