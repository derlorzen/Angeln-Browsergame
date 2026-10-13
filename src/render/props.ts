// Detail-Requisiten für Gebäude: Fenster, Türen, Sockel, Gauben, Schornsteine, Zäune, Karren, Tiere, Menschen …
// Alle Funktionen zeichnen in Sprite-Koordinaten (bereits mit Faktor S) über einen Iso-Projektor.
import { S, faceAt, faceQuad, poly, prng, shade, type Ctx, type Face, type Iso, type Pt } from './draw';

/** Feldsteinsockel am unteren Wandrand. */
export function plinth(g: Ctx, f: Face, h: number, light: number, seed: number): void {
  const r = prng(seed);
  poly(g, faceQuad(f, 0, 0, 1, h), shade('#7f7a6e', light - 0.05));
  const len = Math.hypot(f.br[0] - f.bl[0], f.br[1] - f.bl[1]);
  const n = Math.max(4, Math.round(len / 7));
  for (let row = 0; row < 2; row++)
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5 + (row % 2) * 0.5 + (r() - 0.5) * 0.3) / n;
      if (u > 0.98) continue;
      const v = h * (0.3 + row * 0.45);
      const p = faceAt(f, u, v);
      const c = ['#9a958a', '#8a8478', '#a8a296', '#7c776c'][Math.floor(r() * 4)];
      g.fillStyle = shade(c, light);
      g.beginPath();
      g.ellipse(p[0], p[1], 3.2 + r() * 1.2, 2 + r() * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
}

/** Schatten des Dachüberstands oben an der Wand und dunkler Fuß (Umgebungsverdeckung). */
export function wallShading(g: Ctx, f: Face): void {
  const q = (v0: number, v1: number, a0: number, a1: number) => {
    const p0 = faceAt(f, 0.5, v0), p1 = faceAt(f, 0.5, v1);
    const gr = g.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
    gr.addColorStop(0, `rgba(20,12,6,${a0})`);
    gr.addColorStop(1, `rgba(20,12,6,${a1})`);
    g.fillStyle = gr;
    poly(g, faceQuad(f, 0, v0, 1, v1));
    g.fill();
  };
  q(1, 0.72, 0.4, 0);
  q(0, 0.18, 0.22, 0);
}

/** Sprossenfenster mit Rahmen, Sohlbank, Lichtschein und optionalen Läden. */
export function window4(g: Ctx, f: Face, u: number, v: number, du: number, dv: number, light: number, shutters?: string, lit = 0.35): void {
  poly(g, faceQuad(f, u - du * 0.12, v - dv * 0.1, u + du * 1.12, v + dv * 1.1), shade('#e8e0cc', light - 0.1));
  const pane = faceQuad(f, u, v, u + du, v + dv);
  poly(g, pane, shade('#2c3238', light * 0.4));
  // warmer Lichtschein
  const c = faceAt(f, u + du / 2, v + dv / 2);
  const gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], 9);
  gr.addColorStop(0, `rgba(255,200,110,${lit})`);
  gr.addColorStop(1, 'rgba(255,200,110,0)');
  g.save();
  poly(g, pane);
  g.clip();
  g.fillStyle = gr;
  g.fillRect(c[0] - 12, c[1] - 12, 24, 24);
  // Spiegelung
  const a = faceAt(f, u + du * 0.15, v + dv * 0.9), b = faceAt(f, u + du * 0.45, v + dv * 0.55);
  g.strokeStyle = 'rgba(220,235,245,0.35)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.stroke();
  g.restore();
  // Sprossen
  g.strokeStyle = shade('#e8e0cc', light - 0.1);
  g.lineWidth = 1.2;
  const m1 = faceAt(f, u + du / 2, v), m2 = faceAt(f, u + du / 2, v + dv);
  const h1 = faceAt(f, u, v + dv / 2), h2 = faceAt(f, u + du, v + dv / 2);
  g.beginPath();
  g.moveTo(m1[0], m1[1]);
  g.lineTo(m2[0], m2[1]);
  g.moveTo(h1[0], h1[1]);
  g.lineTo(h2[0], h2[1]);
  g.stroke();
  // Sohlbank
  poly(g, faceQuad(f, u - du * 0.2, v - dv * 0.18, u + du * 1.2, v - dv * 0.06), shade('#6a5a48', light));
  if (shutters) {
    poly(g, faceQuad(f, u - du * 0.62, v, u - du * 0.14, v + dv), shade(shutters, light));
    poly(g, faceQuad(f, u + du * 1.14, v, u + du * 1.62, v + dv), shade(shutters, light));
    g.strokeStyle = shade(shutters, light - 0.3);
    g.lineWidth = 0.8;
    for (const uu of [u - du * 0.38, u + du * 1.38]) {
      const p0 = faceAt(f, uu, v), p1 = faceAt(f, uu, v + dv);
      g.beginPath();
      g.moveTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
      g.stroke();
    }
  }
}

/** Bohlentür mit Beschlägen und Trittstein. */
export function plankDoor(g: Ctx, f: Face, u: number, du: number, dv: number, light: number, color = '#5b3b22'): void {
  poly(g, faceQuad(f, u - du * 0.1, 0, u + du * 1.1, dv * 1.08), shade('#4a3222', light));
  poly(g, faceQuad(f, u, 0, u + du, dv), shade(color, light));
  g.strokeStyle = shade(color, light - 0.3);
  g.lineWidth = 0.8;
  for (let k = 1; k < 4; k++) {
    const a = faceAt(f, u + (du * k) / 4, 0), b = faceAt(f, u + (du * k) / 4, dv);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  g.strokeStyle = '#2a2420';
  g.lineWidth = 1.4;
  for (const vv of [dv * 0.25, dv * 0.75]) {
    const a = faceAt(f, u + du * 0.05, vv), b = faceAt(f, u + du * 0.6, vv);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
  const k = faceAt(f, u + du * 0.82, dv * 0.5);
  g.fillStyle = '#c9a43a';
  g.fillRect(k[0] - 1, k[1] - 1, 2, 2);
}

/** Backstein-Ausfachung im Fachwerk: rote Gefache zwischen den Balken. */
export function brickNogging(g: Ctx, f: Face, light: number, seed: number): void {
  const r = prng(seed);
  const posts = Math.max(2, Math.round(Math.hypot(f.br[0] - f.bl[0], f.br[1] - f.bl[1]) / 18));
  for (let c = 0; c < posts; c++)
    for (const [v0, v1] of [[0.06, 0.48], [0.52, 0.94]]) {
      if (r() < 0.35) continue; // manche Felder bleiben verputzt
      const q = faceQuad(f, c / posts + 0.03, v0, (c + 1) / posts - 0.03, v1);
      poly(g, q, shade('#a24a32', light + (r() - 0.5) * 0.1));
      g.save();
      poly(g, q);
      g.clip();
      g.strokeStyle = shade('#d8c8a8', light - 0.1);
      g.lineWidth = 0.7;
      for (let k = 1; k < 6; k++) {
        const v = v0 + ((v1 - v0) * k) / 6;
        const a = faceAt(f, c / posts, v), b = faceAt(f, (c + 1) / posts, v);
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
      g.restore();
    }
}

export function chimney(g: Ctx, iso: Iso, x: number, y: number, z0: number, h: number): Pt {
  const d = 0.1;
  const l: Pt[] = [iso.p(x - d, y + d, z0), iso.p(x + d, y + d, z0), iso.p(x + d, y + d, z0 + h), iso.p(x - d, y + d, z0 + h)];
  const r: Pt[] = [iso.p(x + d, y + d, z0), iso.p(x + d, y - d, z0), iso.p(x + d, y - d, z0 + h), iso.p(x + d, y + d, z0 + h)];
  poly(g, l, '#9a4530');
  poly(g, r, '#73311f');
  g.strokeStyle = 'rgba(220,200,170,0.5)';
  g.lineWidth = 0.7;
  for (let k = 1; k < h / 3; k++) {
    const a = iso.p(x - d, y + d, z0 + k * 3), b = iso.p(x + d, y + d, z0 + k * 3), c = iso.p(x + d, y - d, z0 + k * 3);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.stroke();
  }
  poly(g, [iso.p(x - d - 0.03, y - d - 0.03, z0 + h), iso.p(x + d + 0.03, y - d - 0.03, z0 + h), iso.p(x + d + 0.03, y + d + 0.03, z0 + h), iso.p(x - d - 0.03, y + d + 0.03, z0 + h)], '#5e4a3c');
  poly(g, [iso.p(x - d * 0.6, y - d * 0.6, z0 + h), iso.p(x + d * 0.6, y - d * 0.6, z0 + h), iso.p(x + d * 0.6, y + d * 0.6, z0 + h), iso.p(x - d * 0.6, y + d * 0.6, z0 + h)], '#1e1814');
  return iso.p(x, y, z0 + h + 2);
}

/** Fledermausgaube: geschwungene Aufwölbung im Reetdach mit kleinem Fenster. */
export function eyebrow(g: Ctx, cx: number, cy: number, w: number): void {
  g.fillStyle = '#2c3238';
  g.beginPath();
  g.ellipse(cx, cy, w * 0.42, w * 0.2, 0, Math.PI, 0);
  g.fill();
  g.strokeStyle = '#e8e0cc';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx, cy - w * 0.2);
  g.lineTo(cx, cy);
  g.stroke();
  g.strokeStyle = '#b9a46a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - w * 0.75, cy + 2);
  g.quadraticCurveTo(cx, cy - w * 0.62, cx + w * 0.75, cy + 2);
  g.stroke();
  g.strokeStyle = '#7d6b40';
  g.lineWidth = 1;
  g.stroke();
}

/** Moosflecken auf Reet. */
export function moss(g: Ctx, pts: Pt[], seed: number, n = 6): void {
  const r = prng(seed);
  g.save();
  poly(g, pts);
  g.clip();
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  for (let k = 0; k < n; k++) {
    const x = minX + r() * (maxX - minX), y = minY + r() * (maxY - minY);
    const gr = g.createRadialGradient(x, y, 0, x, y, 6 + r() * 6);
    gr.addColorStop(0, 'rgba(80,105,45,0.55)');
    gr.addColorStop(1, 'rgba(80,105,45,0)');
    g.fillStyle = gr;
    g.fillRect(x - 12, y - 12, 24, 24);
  }
  g.restore();
}

/** Flechtzaun entlang einer Punktfolge (Kachelkoordinaten). */
export function wattle(g: Ctx, iso: Iso, pts: [number, number][], h = 8): void {
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 5));
    for (let j = 0; j <= n; j++) {
      const x = x0 + ((x1 - x0) * j) / n, y = y0 + ((y1 - y0) * j) / n;
      const a = iso.p(x, y), b = iso.p(x, y, h + 1);
      g.strokeStyle = '#5a4128';
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    for (const z of [h * 0.3, h * 0.55, h * 0.8]) {
      const a = iso.p(x0, y0, z), b = iso.p(x1, y1, z);
      g.strokeStyle = '#8a6a44';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
  }
}

export function flowers(g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const r = prng(seed);
  poly(g, [iso.p(x0, y0), iso.p(x1, y0), iso.p(x1, y1), iso.p(x0, y1)], '#5d4a30');
  for (let k = 0; k < 26; k++) {
    const p = iso.p(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0));
    g.fillStyle = '#4f7a30';
    g.fillRect(p[0] - 1, p[1] - 3, 2, 3);
    g.fillStyle = ['#e8d050', '#d05050', '#f0f0e8', '#9070c0', '#e89040'][Math.floor(r() * 5)];
    g.beginPath();
    g.arc(p[0], p[1] - 3.5, 1.6, 0, Math.PI * 2);
    g.fill();
  }
}

export function chicken(g: Ctx, x: number, y: number, flip = 1): void {
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(x, y, 4, 1.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2ede0';
  g.beginPath();
  g.ellipse(x, y - 3.5, 3.6, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(x + 3 * flip, y - 6, 1.7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d04030';
  g.fillRect(x + 2.6 * flip, y - 8.4, 1.2, 1.2);
  g.fillStyle = '#e0a030';
  g.fillRect(x + 4.4 * flip - (flip < 0 ? 1.4 : 0), y - 6.2, 1.4, 0.9);
}

export function cart(g: Ctx, iso: Iso, x: number, y: number, load: 'heu' | 'saecke' | 'leer'): void {
  const p = (dx: number, dy: number, z = 0) => iso.p(x + dx, y + dy, z);
  // Deichsel
  g.strokeStyle = '#5a3d22';
  g.lineWidth = 2;
  const d0 = p(0.55, 0.15, 6), d1 = p(1.0, 0.15, 2);
  g.beginPath();
  g.moveTo(d0[0], d0[1]);
  g.lineTo(d1[0], d1[1]);
  g.stroke();
  poly(g, [p(0, 0, 7), p(0.55, 0, 7), p(0.55, 0.32, 7), p(0, 0.32, 7)], '#8a6440');
  poly(g, [p(0, 0.32, 7), p(0.55, 0.32, 7), p(0.55, 0.32, 11), p(0, 0.32, 11)], '#6b4a2c');
  if (load === 'heu') {
    const c = p(0.27, 0.16, 12);
    g.fillStyle = '#c8ad5a';
    g.beginPath();
    g.ellipse(c[0], c[1], 13, 7, 0, Math.PI, 0);
    g.fill();
  } else if (load === 'saecke') {
    for (const [dx, dy] of [[0.12, 0.1], [0.32, 0.12], [0.22, 0.22]]) {
      const c = p(dx, dy, 11);
      g.fillStyle = '#cbb68a';
      g.beginPath();
      g.ellipse(c[0], c[1], 4, 3.4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const dx of [0.08, 0.47]) {
    const c = p(dx, 0.33, 4);
    g.strokeStyle = '#3a2818';
    g.lineWidth = 1.6;
    g.beginPath();
    g.ellipse(c[0], c[1], 3, 4.5, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

export function woodpile(g: Ctx, iso: Iso, x: number, y: number, n = 4): void {
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < n - row; k++) {
      const c = iso.p(x + k * 0.12 + row * 0.06, y, 3 + row * 4.5);
      g.fillStyle = '#6b4a2c';
      g.fillRect(c[0] - 9, c[1] - 2.5, 9, 5);
      g.fillStyle = '#d0a870';
      g.beginPath();
      g.ellipse(c[0], c[1], 2.6, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#8a6440';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(c[0], c[1], 1.2, 0, Math.PI * 2);
      g.stroke();
    }
}

export function crate(g: Ctx, iso: Iso, x: number, y: number, s = 0.22, z = 0): void {
  poly(g, [iso.p(x, y + s, z), iso.p(x + s, y + s, z), iso.p(x + s, y + s, z + s * 34), iso.p(x, y + s, z + s * 34)], '#9a7448');
  poly(g, [iso.p(x + s, y + s, z), iso.p(x + s, y, z), iso.p(x + s, y, z + s * 34), iso.p(x + s, y + s, z + s * 34)], '#7a5634');
  poly(g, [iso.p(x, y, z + s * 34), iso.p(x + s, y, z + s * 34), iso.p(x + s, y + s, z + s * 34), iso.p(x, y + s, z + s * 34)], '#b08a5a');
  const a = iso.p(x, y + s, z), b = iso.p(x + s, y + s, z + s * 34);
  g.strokeStyle = '#5a3d22';
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(a[0], a[1]);
  g.lineTo(b[0], b[1]);
  g.stroke();
}

/** Kleine statische Figur (Händler, Bauer) als Belebung. */
export function tinyPerson(g: Ctx, x: number, y: number, coat: string, hat: string, seed: number): void {
  const r = prng(seed);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(x + 1, y, 5, 2, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a4238';
  g.fillRect(x - 2.5, y - 9, 2.2, 9);
  g.fillRect(x + 0.5, y - 9, 2.2, 9);
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(x - 4, y - 8);
  g.lineTo(x + 4, y - 8);
  g.lineTo(x + 3.2, y - 18);
  g.lineTo(x - 3.2, y - 18);
  g.closePath();
  g.fill();
  g.fillStyle = shade(coat, -0.3);
  g.fillRect(x + 1, y - 18, 2.2, 10);
  g.fillStyle = '#e2b791';
  g.beginPath();
  g.arc(x, y - 21, 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hat;
  g.beginPath();
  g.ellipse(x, y - 23, 3.8, 1.8, 0, Math.PI, 0);
  g.fill();
  if (r() < 0.5) {
    g.fillStyle = '#e8dcc0';
    g.fillRect(x - 3, y - 14, 6, 6); // Schürze
  }
  void S;
}

/** Treppengiebel (Backsteingotik) auf einer Giebelseite mit Blendnischen. */
export function steppedGable(g: Ctx, iso: Iso, x: number, y0: number, y1: number, H: number, R: number, steps = 4): void {
  const ym = (y0 + y1) / 2;
  const pts: Pt[] = [iso.p(x, y0, H)];
  for (let k = 0; k < steps; k++) {
    const yy = y0 + ((ym - y0) * (k + 0.4)) / steps;
    const z0 = H + (R * k) / steps + 4, z1 = H + (R * (k + 1)) / steps + 4;
    pts.push(iso.p(x, yy, z0), iso.p(x, yy, z1));
  }
  pts.push(iso.p(x, ym - 0.08, H + R + 9), iso.p(x, ym + 0.08, H + R + 9));
  for (let k = steps - 1; k >= 0; k--) {
    const yy = y1 - ((y1 - ym) * (k + 0.4)) / steps;
    const z0 = H + (R * k) / steps + 4, z1 = H + (R * (k + 1)) / steps + 4;
    pts.push(iso.p(x, yy, z1), iso.p(x, yy, z0));
  }
  pts.push(iso.p(x, y1, H));
  poly(g, pts, '#8d3c27', 'rgba(40,20,10,0.6)', 1);
  // Blendnischen (weiß verputzt)
  for (let k = 0; k < 3; k++) {
    const yy = y0 + ((y1 - y0) * (k + 1)) / 4;
    const zb = H + 4, zt = H + R * (1 - Math.abs(yy - ym) / ((y1 - y0) / 2)) - 2;
    if (zt - zb < 6) continue;
    const a = iso.p(x, yy - 0.06, zb), b = iso.p(x, yy + 0.06, zb), c = iso.p(x, yy + 0.06, zt), d = iso.p(x, yy - 0.06, zt);
    poly(g, [a, b, c, d], '#e8dfc8');
  }
}

/** Helle Sandsteinbänder auf Backstein (dänische Renaissance). */
export function bands(g: Ctx, f: Face, light: number, vs = [0.34, 0.68]): void {
  for (const v of vs) poly(g, faceQuad(f, 0, v, 1, v + 0.05), shade('#e0d2b0', light));
  poly(g, faceQuad(f, 0, 0.96, 1, 1), shade('#e0d2b0', light));
}

/** Kupferhelm (grüne Patina): spitzer Turmhelm über quadratischem Grundriss. */
export function spire(g: Ctx, iso: Iso, x0: number, y0: number, x1: number, y1: number, z: number, h: number): void {
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const tip = iso.p(xm, ym, z + h);
  const neck = iso.p(xm, ym, z + h * 0.45);
  // Zwiebel/Laterne
  poly(g, [iso.p(x0, y1, z), iso.p(x1, y1, z), neck], '#6aa890');
  poly(g, [iso.p(x1, y1, z), iso.p(x1, y0, z), neck], '#4a8070');
  g.fillStyle = '#5e9a83';
  g.beginPath();
  g.ellipse(neck[0], neck[1], 4, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#4a8070';
  g.lineWidth = 2.6;
  g.beginPath();
  g.moveTo(neck[0], neck[1]);
  g.lineTo(tip[0], tip[1]);
  g.stroke();
  g.fillStyle = '#d8b040';
  g.beginPath();
  g.arc(tip[0], tip[1], 1.8, 0, Math.PI * 2);
  g.fill();
}

/** Weidetiere: Angler Rotvieh, Deichschaf, Pferd, Schwein. */
export function animal(g: Ctx, x: number, y: number, kind: 'kuh' | 'schaf' | 'pferd' | 'schwein', flip = 1): void {
  g.save();
  g.translate(x, y);
  g.scale(flip, 1);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.beginPath();
  g.ellipse(0, 0, 9, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  const leg = (lx: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(lx - 0.8, -h, 1.6, h);
  };
  if (kind === 'kuh') {
    for (const lx of [-5, -3, 3, 5]) leg(lx, 5, '#5a2418');
    g.fillStyle = '#9a3a24'; // Angler Rotvieh
    g.beginPath();
    g.ellipse(0, -7, 7.5, 3.6, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(7.4, -8.4, 2.6, 2, 0.3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8dcc8';
    g.fillRect(8.4, -11, 0.8, 2);
    g.fillRect(6.4, -11, 0.8, 2);
    g.fillStyle = '#c8a090';
    g.beginPath();
    g.ellipse(9.4, -7.6, 1.2, 1, 0, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'schaf') {
    for (const lx of [-3.5, -2, 2, 3.5]) leg(lx, 4, '#2a2420');
    g.fillStyle = '#ece8dc';
    for (const [dx, dy] of [[-3, -6], [0, -7], [3, -6], [-1.5, -4.5], [1.5, -4.5]]) {
      g.beginPath();
      g.arc(dx, dy, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#2a2420';
    g.beginPath();
    g.ellipse(6, -7, 2, 1.5, 0.2, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'pferd') {
    for (const lx of [-5, -3.5, 3.5, 5]) leg(lx, 7, '#4a2a18');
    g.fillStyle = '#7a4a2a';
    g.beginPath();
    g.ellipse(0, -9, 7, 3.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(4.5, -10.5);
    g.lineTo(7.5, -16);
    g.lineTo(9.5, -15.5);
    g.lineTo(7.5, -8.5);
    g.fill();
    g.fillStyle = '#2e1d12';
    g.fillRect(4.6, -15.5, 2, 5);
    g.fillRect(-8, -10, 1.6, 6);
  } else {
    for (const lx of [-3.5, -2, 2, 3.5]) leg(lx, 3, '#d89a8a');
    g.fillStyle = '#e8b0a0';
    g.beginPath();
    g.ellipse(0, -5.5, 6, 3.2, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(6, -5.8, 2, 1.8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c88a7a';
    g.fillRect(7.4, -6.4, 1.2, 1.4);
  }
  g.restore();
}

/** Friesischer Frontispiz: Zwerchgiebel über der Haustür mit weißer Einfassung. */
export function frontispiz(g: Ctx, f: Face, u: number, du: number, h: number, light: number): void {
  const a = faceAt(f, u, 0.95), b = faceAt(f, u + du, 0.95);
  const top: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h];
  const l = faceAt(f, u, 0.35), r = faceAt(f, u + du, 0.35);
  poly(g, [l, r, b, top, a], shade('#74332a', light), '#f2ede0', 2);
  const c: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - h * 0.45];
  g.fillStyle = '#f2ede0';
  g.beginPath();
  g.arc(c[0], c[1], 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2c3238';
  g.beginPath();
  g.arc(c[0], c[1], 2, 0, Math.PI * 2);
  g.fill();
}
