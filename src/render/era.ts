// Gebäude der späteren Zeitalter: neue Gebäude des 18., 20. und 22. Jahrhunderts sowie moderne Fassungen von
// Dorfzentrum, Wohnhaus, Kaserne und Markt ab dem 20. Jahrhundert. Alles prozedural gezeichnet.
import type { BuildingType } from '../data/defs';
import { TH, TW, S, boxFaces, bush, dome, flatRoof, ground, poly, prng, roof, shade, shadowDiamond, solarPanels, type Ctx, type Face, type Iso, type Pt, type WallMat } from './draw';
import { animal, cart, chimney, crate, frontispiz, plankDoor, steppedGable, tinyPerson, wattle, window4 } from './props';

export interface EraCtx {
  g: Ctx;
  iso: Iso;
  out: { smoke?: Pt[]; hub?: Pt; flagPt?: Pt };
  to1x: (p: Pt) => Pt;
  W: (f: Face, mat: WallMat, light: number, seed: number, opts?: { sockel?: boolean; bands?: boolean }) => void;
  banner: (x: number, y: number, h: number, wave: number) => void;
  color: string;
}

/** Größe und Höhe (über der Grundfläche) der neuen Gebäude. */
export const ERA_SIZE: Partial<Record<BuildingType, { n: number; top: number }>> = {
  manufaktur: { n: 3, top: 96 }, hafen: { n: 2, top: 92 }, schanze: { n: 2, top: 56 },
  bahnhof: { n: 3, top: 104 }, fabrik: { n: 3, top: 150 }, bunker: { n: 2, top: 44 },
  vertikalfarm: { n: 2, top: 170 }, gezeitenwerk: { n: 2, top: 84 }, schildturm: { n: 2, top: 160 },
  meierei: { n: 2, top: 66 }, gestuet: { n: 3, top: 70 }, salzsiederei: { n: 2, top: 70 }, zollhaus: { n: 2, top: 84 },
};
/** Höhe der modernen Fassungen alter Gebäude */
export function eraTop(type: BuildingType, age: number): number | undefined {
  if (age < 3) return undefined;
  const m: Partial<Record<BuildingType, number>> = age >= 4
    ? { dorfzentrum: 150, wohnhaus: 70, kaserne: 80, markt: 70 }
    : { dorfzentrum: 140, wohnhaus: 70, kaserne: 80, markt: 72 };
  return m[type];
}

const sandbags = (g: Ctx, iso: Iso, pts: [number, number][]) => {
  for (const [x, y] of pts) {
    const p = iso.p(x, y);
    g.fillStyle = '#b8a77a';
    g.beginPath();
    g.ellipse(p[0], p[1] - 3, 6, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(70,60,40,0.6)';
    g.lineWidth = 0.8;
    g.stroke();
  }
};
const lamp = (g: Ctx, x: number, y: number, h: number, glow: string) => {
  g.strokeStyle = '#3a3a3a';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y - h);
  g.stroke();
  const gr = g.createRadialGradient(x, y - h, 0, x, y - h, 7);
  gr.addColorStop(0, glow);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(x - 7, y - h - 7, 14, 14);
};
const car = (g: Ctx, x: number, y: number, col: string) => {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(x, y + 1, 12, 4, 0, 0, Math.PI * 2);
  g.fill();
  poly(g, [[x - 11, y - 2], [x + 11, y - 6], [x + 11, y - 11], [x - 11, y - 7]], col, 'rgba(0,0,0,0.5)', 0.8);
  poly(g, [[x - 5, y - 8], [x + 5, y - 10], [x + 3, y - 15], [x - 4, y - 13]], shade(col, 0.15), 'rgba(0,0,0,0.5)', 0.8);
  poly(g, [[x - 3.5, y - 9], [x + 3.5, y - 10.5], [x + 2, y - 13.5], [x - 3, y - 12.2]], '#9fc4d8');
  g.fillStyle = '#1a1a1a';
  for (const dx of [-7, 7]) {
    g.beginPath();
    g.arc(x + dx, y - 2 - dx * 0.18, 2.4, 0, Math.PI * 2);
    g.fill();
  }
};
const rails = (g: Ctx, iso: Iso, y: number, x0: number, x1: number) => {
  for (let x = x0; x < x1; x += 0.18) poly(g, [iso.p(x, y - 0.14), iso.p(x + 0.07, y - 0.14), iso.p(x + 0.07, y + 0.14), iso.p(x, y + 0.14)], '#5a4230');
  for (const dy of [-0.08, 0.08]) {
    const a = iso.p(x0, y + dy), b = iso.p(x1, y + dy);
    g.strokeStyle = '#8a8a8a';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }
};
const glow = (g: Ctx, x: number, y: number, r: number, col: string) => {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col);
  gr.addColorStop(1, 'rgba(120,230,255,0)');
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
};
const pavement = (g: Ctx, iso: Iso, n: number, col: string, seed: number) => {
  ground(g, iso, 0.05, 0.05, n - 0.05, n - 0.05, col);
  const r = prng(seed);
  for (let k = 0; k < 40 * n; k++) {
    const p = iso.p(0.1 + r() * (n - 0.2), 0.1 + r() * (n - 0.2));
    g.fillStyle = r() < 0.5 ? shade(col, -0.08) : shade(col, 0.08);
    g.fillRect(p[0], p[1], 4, 2);
  }
};

/** Zeichnet das Gebäude des Zeitalters; false, wenn es keine eigene Fassung gibt. */
export function drawEra(type: BuildingType, age: number, x: EraCtx): boolean {
  const { g, iso, out, to1x, W, banner, color } = x;
  const fut = age >= 4;
  switch (type) {
    // ================================================================ 18. Jahrhundert
    case 'manufaktur': {
      pavement(g, iso, 3, '#8d8573', 61);
      shadowDiamond(g, iso, 0.25, 0.35, 2.75, 1.9);
      const f = boxFaces(iso, 0.25, 0.35, 2.75, 1.85, 0, 34);
      W(f.left, 'ziegel', 0.05, 61, { sockel: true, bands: true });
      W(f.right, 'ziegel', -0.2, 62, { sockel: true, bands: true });
      for (let k = 0; k < 6; k++) for (const v of [0.18, 0.6]) window4(g, f.left, 0.06 + k * 0.15, v, 0.08, 0.24, 0.05);
      for (const u of [0.2, 0.62]) for (const v of [0.18, 0.6]) window4(g, f.right, u, v, 0.16, 0.24, -0.2);
      plankDoor(g, f.left, 0.44, 0.12, 0.4, 0.05, '#4a3222');
      roof(g, iso, 0.25, 0.35, 2.75, 1.85, 34, 20, 'x', 'ziegel', 0, 63);
      out.smoke = [chimney(g, iso, 0.7, 0.9, 52, 12), chimney(g, iso, 2.2, 0.9, 52, 12)].map(to1x);
      // Leinenballen und Bleiche
      for (let k = 0; k < 4; k++) crate(g, iso, 0.4 + k * 0.28, 2.45, 0.2);
      const bl = iso.p(2.5, 2.4);
      g.fillStyle = '#f2efe4';
      g.fillRect(bl[0] - 16, bl[1] - 4, 32, 6);
      g.strokeStyle = '#d8d2c0';
      g.strokeRect(bl[0] - 16, bl[1] - 4, 32, 6);
      tinyPerson(g, ...iso.p(1.9, 2.3), '#5a4a6a', '#e8dcc0', 7);
      const fp = iso.p(1.5, 1.1, 62);
      banner(fp[0], fp[1], 18, 2);
      return true;
    }
    case 'hafen': {
      // Ufer mit Steg, Lagerschuppen und Fischkutter
      ground(g, iso, 0.05, 0.05, 1.95, 1.95, '#c8b98a');
      for (let k = 0; k < 9; k++) {
        const a = iso.p(1.0 + k * 0.1, 0.15), b = iso.p(1.0 + k * 0.1, 1.95);
        poly(g, [a, [a[0] + 7, a[1] + 3.5], [b[0] + 7, b[1] + 3.5], b], k % 2 ? '#8a6a44' : '#7a5c3a', 'rgba(40,25,15,0.5)', 0.6);
      }
      shadowDiamond(g, iso, 0.15, 0.2, 0.9, 1.1);
      const f = boxFaces(iso, 0.15, 0.2, 0.9, 1.1, 0, 20);
      W(f.left, 'holz', 0.05, 71);
      W(f.right, 'holz', -0.2, 72);
      plankDoor(g, f.left, 0.3, 0.4, 0.75, 0.05, '#4a3a2a');
      roof(g, iso, 0.15, 0.2, 0.9, 1.1, 20, 14, 'y', 'schindel', 0, 73);
      // Fischkutter mit Mast und Segel
      const h = iso.p(1.55, 1.55);
      poly(g, [[h[0] - 26, h[1] - 4], [h[0] + 22, h[1] - 16], [h[0] + 18, h[1] - 6], [h[0] - 20, h[1] + 6]], '#5a3a24', 'rgba(20,10,5,0.6)', 1);
      poly(g, [[h[0] - 24, h[1] - 6], [h[0] + 22, h[1] - 18], [h[0] + 22, h[1] - 16], [h[0] - 26, h[1] - 4]], '#c8a060');
      g.strokeStyle = '#3a2a1a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(h[0], h[1] - 10);
      g.lineTo(h[0], h[1] - 66);
      g.stroke();
      poly(g, [[h[0] + 1, h[1] - 64], [h[0] + 24, h[1] - 22], [h[0] + 1, h[1] - 16]], age >= 3 ? '#e8e4dc' : '#c04a2a', 'rgba(60,30,20,0.5)', 1);
      poly(g, [[h[0] - 1, h[1] - 56], [h[0] - 18, h[1] - 18], [h[0] - 1, h[1] - 14]], '#d8c8a0', 'rgba(60,30,20,0.5)', 1);
      // Netze an Stangen
      const n0 = iso.p(0.35, 1.5);
      g.strokeStyle = '#4a3222';
      g.lineWidth = 1.5;
      for (const dx of [0, 22]) {
        g.beginPath();
        g.moveTo(n0[0] + dx, n0[1]);
        g.lineTo(n0[0] + dx, n0[1] - 22);
        g.stroke();
      }
      g.strokeStyle = 'rgba(60,60,50,0.55)';
      g.lineWidth = 0.6;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.moveTo(n0[0], n0[1] - 20 + k * 3);
        g.lineTo(n0[0] + 22, n0[1] - 20 + k * 3);
        g.stroke();
        g.beginPath();
        g.moveTo(n0[0] + k * 4, n0[1] - 21);
        g.lineTo(n0[0] + k * 4, n0[1] - 4);
        g.stroke();
      }
      const fp = iso.p(0.5, 0.6, 34);
      banner(fp[0], fp[1], 14, 2);
      out.flagPt = to1x(fp);
      return true;
    }
    case 'schanze': {
      // sternförmiges Erdwerk mit Geschütz
      ground(g, iso, 0.02, 0.02, 1.98, 1.98, '#6f7a44');
      const c = iso.p(1, 1);
      const star: Pt[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const r = k % 2 ? 0.55 : 0.92;
        const p = iso.p(1 + Math.cos(a) * r, 1 + Math.sin(a) * r);
        star.push(p);
      }
      poly(g, star.map((p) => [p[0], p[1] + 4] as Pt), 'rgba(20,25,10,0.3)');
      poly(g, star.map((p) => [p[0], p[1] - 10] as Pt), '#7f9150', 'rgba(40,50,20,0.7)', 1.2);
      for (const p of star) {
        g.strokeStyle = 'rgba(60,70,30,0.6)';
        g.beginPath();
        g.moveTo(p[0], p[1] - 10);
        g.lineTo(p[0], p[1]);
        g.stroke();
      }
      poly(g, star.map((p) => [c[0] + (p[0] - c[0]) * 0.6, c[1] - 10 + (p[1] - c[1]) * 0.6] as Pt), '#6a7840');
      // Geschütz
      g.fillStyle = '#4a3a2a';
      g.fillRect(c[0] - 9, c[1] - 18, 16, 5);
      g.fillStyle = '#2a2a2a';
      poly(g, [[c[0] - 4, c[1] - 20], [c[0] + 18, c[1] - 26], [c[0] + 18, c[1] - 22], [c[0] - 4, c[1] - 16]], '#2e2e2e');
      for (const dx of [-6, 4]) {
        g.strokeStyle = '#3a2818';
        g.lineWidth = 1.6;
        g.beginPath();
        g.arc(c[0] + dx, c[1] - 14, 3.4, 0, Math.PI * 2);
        g.stroke();
      }
      const fp = iso.p(0.6, 0.6, 14);
      banner(fp[0], fp[1], 26, 2);
      out.flagPt = to1x(fp);
      return true;
    }
    // ================================================================ 20. Jahrhundert
    case 'bahnhof': {
      pavement(g, iso, 3, '#8f8b80', 81);
      rails(g, iso, 2.55, 0.05, 2.95);
      shadowDiamond(g, iso, 0.3, 0.3, 2.3, 1.7);
      const f = boxFaces(iso, 0.3, 0.3, 2.3, 1.7, 0, 32);
      W(f.left, 'ziegel', 0.05, 81, { sockel: true, bands: true });
      W(f.right, 'ziegel', -0.2, 82, { sockel: true, bands: true });
      for (let k = 0; k < 5; k++) window4(g, f.left, 0.08 + k * 0.18, 0.4, 0.09, 0.36, 0.05);
      plankDoor(g, f.left, 0.44, 0.12, 0.6, 0.05, '#3a4a5a');
      window4(g, f.right, 0.3, 0.4, 0.3, 0.36, -0.2);
      roof(g, iso, 0.3, 0.3, 2.3, 1.7, 32, 16, 'x', 'ziegel', 0.3, 83);
      // Uhrturm
      const t = boxFaces(iso, 2.25, 0.4, 2.75, 0.9, 0, 66);
      W(t.left, 'ziegel', 0.05, 84, { bands: true });
      W(t.right, 'ziegel', -0.2, 85, { bands: true });
      const ck = iso.p(2.5, 0.9, 54);
      g.fillStyle = '#f2ecd8';
      g.beginPath();
      g.arc(ck[0] - 2, ck[1], 5.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#2a2a2a';
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(ck[0] - 2, ck[1]);
      g.lineTo(ck[0] - 2, ck[1] - 4);
      g.moveTo(ck[0] - 2, ck[1]);
      g.lineTo(ck[0] + 1, ck[1] + 1);
      g.stroke();
      roof(g, iso, 2.25, 0.4, 2.75, 0.9, 66, 14, 'x', 'kupfer', 0.25, 86);
      // Bahnsteigdach
      for (const xx of [0.5, 1.4, 2.3]) {
        const a = iso.p(xx, 2.15), b = iso.p(xx, 2.15, 22);
        g.strokeStyle = '#3a3a3a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
      poly(g, [iso.p(0.3, 1.85, 22), iso.p(2.6, 1.85, 22), iso.p(2.6, 2.3, 20), iso.p(0.3, 2.3, 20)], '#5a5f5a', 'rgba(20,20,20,0.6)', 1);
      // kleine Lok
      const l = iso.p(0.9, 2.55);
      poly(g, [[l[0] - 18, l[1] - 4], [l[0] + 14, l[1] - 20], [l[0] + 14, l[1] - 30], [l[0] - 18, l[1] - 14]], '#2a2a2a', '#111', 1);
      poly(g, [[l[0] + 4, l[1] - 15], [l[0] + 14, l[1] - 20], [l[0] + 14, l[1] - 38], [l[0] + 4, l[1] - 33]], '#3a3a3a', '#111', 1);
      g.fillStyle = '#b3342b';
      g.fillRect(l[0] - 18, l[1] - 6, 32, 2);
      out.smoke = [to1x([l[0] - 12, l[1] - 22])];
      tinyPerson(g, ...iso.p(1.8, 2.1), '#2f3e5a', '#2a2a2a', 3);
      const fp = iso.p(2.5, 0.65, 82);
      banner(fp[0], fp[1], 16, 2);
      out.flagPt = to1x(fp);
      return true;
    }
    case 'fabrik': {
      pavement(g, iso, 3, '#86827a', 91);
      shadowDiamond(g, iso, 0.25, 0.3, 2.55, 2.3);
      const f = boxFaces(iso, 0.25, 0.3, 2.55, 2.25, 0, 30);
      W(f.left, 'ziegel', 0.05, 91, { sockel: true });
      W(f.right, 'ziegel', -0.2, 92, { sockel: true });
      for (let k = 0; k < 5; k++) window4(g, f.left, 0.06 + k * 0.19, 0.35, 0.12, 0.4, 0.05);
      plankDoor(g, f.right, 0.35, 0.3, 0.6, -0.2, '#4a5560');
      // Sheddach (Sägezahn)
      for (let k = 0; k < 4; k++) {
        const y0 = 0.3 + k * 0.49, y1 = y0 + 0.49;
        poly(g, [iso.p(0.25, y0, 30), iso.p(2.55, y0, 30), iso.p(2.55, y1, 44), iso.p(0.25, y1, 44)], '#6a5a52', 'rgba(20,20,20,0.5)', 1);
        poly(g, [iso.p(0.25, y1, 30), iso.p(2.55, y1, 30), iso.p(2.55, y1, 44), iso.p(0.25, y1, 44)], '#7fa6bd', 'rgba(20,20,20,0.5)', 1);
      }
      // Schornstein
      const s = boxFaces(iso, 2.6, 0.45, 2.85, 0.7, 0, 120);
      W(s.left, 'ziegel', 0.05, 93, { bands: true });
      W(s.right, 'ziegel', -0.2, 94, { bands: true });
      const top = iso.p(2.72, 0.58, 120);
      out.smoke = [to1x([top[0], top[1] - 4]), to1x([top[0] + 2, top[1] - 6])];
      // Fässer/Kisten, Lastwagen
      for (let k = 0; k < 3; k++) crate(g, iso, 0.4 + k * 0.25, 2.6, 0.2);
      car(g, ...iso.p(2.1, 2.65), '#4a5a3a');
      const fp = iso.p(0.5, 0.5, 48);
      banner(fp[0], fp[1], 16, 2);
      return true;
    }
    case 'bunker': {
      ground(g, iso, 0.05, 0.05, 1.95, 1.95, '#6d6a52');
      shadowDiamond(g, iso, 0.25, 0.25, 1.75, 1.75);
      const f = boxFaces(iso, 0.3, 0.3, 1.7, 1.7, 0, 16);
      W(f.left, 'beton', 0.05, 101);
      W(f.right, 'beton', -0.2, 102);
      flatRoof(g, iso, 0.3, 0.3, 1.7, 1.7, 16, '#8f8c84', 0);
      // Sehschlitze
      for (const ff of [f.left, f.right]) {
        const a = [ff.bl[0] + (ff.br[0] - ff.bl[0]) * 0.25, ff.bl[1] + (ff.br[1] - ff.bl[1]) * 0.25 - 10];
        const b = [ff.bl[0] + (ff.br[0] - ff.bl[0]) * 0.75, ff.bl[1] + (ff.br[1] - ff.bl[1]) * 0.75 - 10];
        g.strokeStyle = '#1a1a1a';
        g.lineWidth = 2.4;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
      // Tarnflecken
      const r = prng(103);
      for (let k = 0; k < 10; k++) {
        const p = iso.p(0.4 + r() * 1.2, 0.4 + r() * 1.2, 16);
        g.fillStyle = r() < 0.5 ? 'rgba(80,90,50,0.45)' : 'rgba(110,100,70,0.4)';
        g.beginPath();
        g.ellipse(p[0], p[1], 6 + r() * 6, 3 + r() * 2, 0, 0, Math.PI * 2);
        g.fill();
      }
      sandbags(g, iso, [[0.15, 1.85], [0.45, 1.9], [0.75, 1.92], [1.85, 0.2], [1.9, 0.5], [1.92, 0.8]]);
      const fp = iso.p(1.4, 0.6, 16);
      banner(fp[0], fp[1], 18, 2);
      out.flagPt = to1x(fp);
      return true;
    }
    // ================================================================ 22. Jahrhundert
    case 'vertikalfarm': {
      pavement(g, iso, 2, '#c8ccc8', 111);
      shadowDiamond(g, iso, 0.35, 0.35, 1.65, 1.65);
      const levels = 6, lh = 20;
      for (let k = 0; k < levels; k++) {
        const f = boxFaces(iso, 0.4, 0.4, 1.6, 1.6, k * lh, lh);
        W(f.left, 'glas', 0.08, 111 + k);
        W(f.right, 'glas', -0.15, 121 + k);
        // Pflanzenreihen hinter Glas
        for (const ff of [f.left, f.right]) {
          const r = prng(130 + k);
          for (let q = 0; q < 8; q++) {
            const u = 0.08 + q * 0.11;
            const p = [ff.bl[0] + (ff.br[0] - ff.bl[0]) * u, ff.bl[1] + (ff.br[1] - ff.bl[1]) * u - 5];
            bush(g, p[0], p[1], 3.4, r() < 0.5 ? '#4f9a3a' : '#6ab04a', r);
          }
        }
        poly(g, [f.left.tl, f.left.tr, f.right.tr], 'rgba(240,245,245,0.9)');
        g.strokeStyle = 'rgba(160,240,255,0.5)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(f.left.tl[0], f.left.tl[1]);
        g.lineTo(f.left.tr[0], f.left.tr[1]);
        g.lineTo(f.right.tr[0], f.right.tr[1]);
        g.stroke();
      }
      flatRoof(g, iso, 0.4, 0.4, 1.6, 1.6, levels * lh, '#e6ecec', 2);
      // Windrad auf dem Dach
      const w0 = iso.p(1.0, 1.0, levels * lh);
      g.strokeStyle = '#e8eef0';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w0[0], w0[1]);
      g.lineTo(w0[0], w0[1] - 30);
      g.stroke();
      for (let k = 0; k < 3; k++) {
        const a = k * 2.094 + 0.4;
        g.beginPath();
        g.moveTo(w0[0], w0[1] - 30);
        g.lineTo(w0[0] + Math.cos(a) * 14, w0[1] - 30 + Math.sin(a) * 14);
        g.stroke();
      }
      out.hub = to1x([w0[0], w0[1] - 30]);
      return true;
    }
    case 'gezeitenwerk': {
      ground(g, iso, 0.05, 0.05, 1.95, 1.95, '#b8bcb6');
      // Wasserkanal mit Turbine
      poly(g, [iso.p(1.2, 0.1), iso.p(1.8, 0.1), iso.p(1.8, 1.9), iso.p(1.2, 1.9)], '#3d6a88', 'rgba(20,40,60,0.6)', 1);
      g.strokeStyle = 'rgba(220,240,250,0.6)';
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const p = iso.p(1.5, 0.3 + k * 0.28);
        g.beginPath();
        g.moveTo(p[0] - 6, p[1]);
        g.quadraticCurveTo(p[0], p[1] - 2, p[0] + 6, p[1]);
        g.stroke();
      }
      shadowDiamond(g, iso, 0.2, 0.3, 1.15, 1.6);
      const f = boxFaces(iso, 0.2, 0.3, 1.15, 1.6, 0, 30);
      W(f.left, 'paneel', 0.08, 141);
      W(f.right, 'paneel', -0.15, 142);
      flatRoof(g, iso, 0.2, 0.3, 1.15, 1.6, 30, '#dfe5e5', 2);
      solarPanels(g, iso, 0.3, 0.4, 1.05, 1.5, 30, 2, 2);
      // Turbinenrad
      const c = iso.p(1.5, 1.0, 18);
      g.strokeStyle = '#d8e0e4';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(c[0], c[1], 9, 16, -0.45, 0, Math.PI * 2);
      g.stroke();
      out.hub = to1x(c);
      glow(g, c[0], c[1], 10, 'rgba(120,230,255,0.6)');
      // Stromleitung
      const m = iso.p(0.3, 1.8);
      g.strokeStyle = '#9aa4a8';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(m[0], m[1]);
      g.lineTo(m[0], m[1] - 44);
      g.moveTo(m[0] - 8, m[1] - 40);
      g.lineTo(m[0] + 8, m[1] - 40);
      g.stroke();
      return true;
    }
    case 'schildturm': {
      pavement(g, iso, 2, '#c4c8c8', 151);
      shadowDiamond(g, iso, 0.6, 0.6, 1.4, 1.4);
      const f = boxFaces(iso, 0.7, 0.7, 1.3, 1.3, 0, 96);
      W(f.left, 'paneel', 0.08, 151);
      W(f.right, 'paneel', -0.15, 152);
      flatRoof(g, iso, 0.7, 0.7, 1.3, 1.3, 96, '#e8eeee', 0);
      const top = iso.p(1, 1, 112);
      glow(g, top[0], top[1], 26, 'rgba(120,230,255,0.85)');
      g.fillStyle = '#d8fbff';
      g.beginPath();
      g.arc(top[0], top[1], 7, 0, Math.PI * 2);
      g.fill();
      // durchscheinende Schildkuppel
      g.save();
      g.globalAlpha = 0.28;
      dome(g, iso, 1, 1, 0.95, 0, '#7fe6ff', true);
      g.restore();
      out.hub = to1x(top);
      const fp = iso.p(0.8, 0.8, 96);
      banner(fp[0], fp[1], 16, 2);
      return true;
    }
    // ================================================================ Parteigebäude
    case 'meierei': {
      // Angeliter: Fachwerk-Kuhstall mit Reetdach, Milchkannen, Rotvieh
      ground(g, iso, 0.08, 0.08, 1.92, 1.92, '#7a8a48');
      wattle(g, iso, [[0.1, 1.9], [1.9, 1.9]], 6);
      shadowDiamond(g, iso, 0.25, 0.25, 1.4, 1.3);
      const f = boxFaces(iso, 0.25, 0.25, 1.4, 1.25, 0, 18);
      W(f.left, 'fachwerk', 0.08, 241, { sockel: true });
      W(f.right, 'fachwerk', -0.15, 242, { sockel: true });
      plankDoor(g, f.left, 0.35, 0.3, 0.8, 0.08, '#8a3a2a');
      window4(g, f.right, 0.35, 0.45, 0.25, 0.3, -0.15);
      roof(g, iso, 0.25, 0.25, 1.4, 1.25, 18, 22, 'x', 'reet', 0.25, 243);
      // Milchkannen
      for (let k = 0; k < 3; k++) {
        const p = iso.p(1.55 + k * 0.1, 0.45 + k * 0.08);
        g.fillStyle = '#c8ccd0';
        g.fillRect(p[0] - 2.5, p[1] - 9, 5, 9);
        g.fillStyle = '#9aa0a6';
        g.fillRect(p[0] - 1.5, p[1] - 11, 3, 2);
      }
      animal(g, ...iso.p(1.55, 1.45), 'kuh', -1);
      animal(g, ...iso.p(0.6, 1.7), 'kuh', 1);
      const fp = iso.p(1.1, 0.75, 40);
      banner(fp[0], fp[1], 14, 2);
      return true;
    }
    case 'gestuet': {
      // Schwansener: weißer Pferdestall mit Ziegeldach, Koppel mit Pferden
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, '#86a050');
      wattle(g, iso, [[0.1, 1.5], [0.1, 2.9], [2.9, 2.9], [2.9, 1.5]], 7);
      shadowDiamond(g, iso, 0.3, 0.3, 2.6, 1.3);
      const f = boxFaces(iso, 0.3, 0.3, 2.6, 1.25, 0, 20);
      W(f.left, 'putz', 0.08, 251, { sockel: true });
      W(f.right, 'putz', -0.15, 252, { sockel: true });
      for (let k = 0; k < 4; k++) plankDoor(g, f.left, 0.06 + k * 0.24, 0.12, 0.62, 0.08, k % 2 ? '#2f4a32' : '#3a5a3a');
      roof(g, iso, 0.3, 0.3, 2.6, 1.25, 20, 18, 'x', 'ziegel', 0.3, 253);
      const t = iso.p(1.45, 0.78, 46);
      g.fillStyle = '#e8e2d0';
      g.fillRect(t[0] - 4, t[1] - 12, 8, 12);
      poly(g, [[t[0] - 6, t[1] - 12], [t[0] + 6, t[1] - 12], [t[0], t[1] - 22]], '#5e9a83');
      animal(g, ...iso.p(0.9, 2.2), 'pferd', 1);
      animal(g, ...iso.p(1.9, 2.5), 'pferd', -1);
      animal(g, ...iso.p(2.4, 1.9), 'pferd', 1);
      const fp = iso.p(2.85, 1.5);
      banner(fp[0], fp[1], 34, 2);
      out.flagPt = to1x([fp[0], fp[1] - 34]);
      return true;
    }
    case 'salzsiederei': {
      // Nordfriesen: Klinkerkate mit Siedepfanne, Salzhaufen und Dampf
      ground(g, iso, 0.05, 0.05, 1.95, 1.95, '#a8a07a');
      shadowDiamond(g, iso, 0.2, 0.2, 1.2, 1.2);
      const f = boxFaces(iso, 0.2, 0.2, 1.2, 1.2, 0, 14);
      W(f.left, 'klinker', 0.08, 261);
      W(f.right, 'klinker', -0.15, 262);
      frontispiz(g, f.left, 0.3, 0.4, 20, 0.08);
      plankDoor(g, f.left, 0.4, 0.2, 0.8, 0.08, '#2f5f9a');
      roof(g, iso, 0.2, 0.2, 1.2, 1.2, 14, 26, 'x', 'reet', 0.3, 263);
      out.smoke = [chimney(g, iso, 0.7, 0.6, 32, 6)].map(to1x);
      // Siedepfanne auf Feuer
      const pf = iso.p(1.5, 1.0);
      g.fillStyle = '#c84a1a';
      g.beginPath();
      g.ellipse(pf[0], pf[1] - 2, 9, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#5a5a5a';
      g.beginPath();
      g.ellipse(pf[0], pf[1] - 6, 11, 5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e8eef0';
      g.beginPath();
      g.ellipse(pf[0], pf[1] - 7, 9, 3.6, 0, 0, Math.PI * 2);
      g.fill();
      out.smoke.push(to1x([pf[0], pf[1] - 10]));
      // Salzkegel
      for (const [x, y] of [[0.5, 1.6], [0.85, 1.7], [1.25, 1.65]] as [number, number][]) {
        const p = iso.p(x, y);
        poly(g, [[p[0] - 8, p[1]], [p[0] + 8, p[1]], [p[0], p[1] - 11]], '#f2f2ec', 'rgba(120,120,110,0.5)', 0.8);
      }
      const fp = iso.p(1.75, 0.3);
      banner(fp[0], fp[1], 30, 2);
      return true;
    }
    case 'zollhaus': {
      // Dänen: Backsteinhaus mit Treppengiebel und Schlagbaum
      pavement(g, iso, 2, '#8d8573', 271);
      shadowDiamond(g, iso, 0.25, 0.25, 1.4, 1.35);
      const f = boxFaces(iso, 0.25, 0.25, 1.4, 1.35, 0, 28);
      W(f.left, 'ziegel', 0.08, 271, { sockel: true, bands: true });
      W(f.right, 'ziegel', -0.15, 272, { sockel: true, bands: true });
      plankDoor(g, f.left, 0.38, 0.24, 0.5, 0.08, '#7a2a1e');
      window4(g, f.left, 0.08, 0.5, 0.18, 0.28, 0.08, '#8a2a22');
      window4(g, f.right, 0.3, 0.5, 0.35, 0.28, -0.15);
      roof(g, iso, 0.25, 0.25, 1.4, 1.35, 28, 22, 'x', 'ziegel', 0, 273);
      steppedGable(g, iso, 1.4, 0.25, 1.35, 28, 22, 4);
      // Schlagbaum rot-weiß
      const a = iso.p(1.55, 1.75), b = iso.p(1.55, 0.5);
      g.fillStyle = '#4a3a2a';
      g.fillRect(a[0] - 1.5, a[1] - 14, 3, 14);
      for (let k = 0; k < 6; k++) {
        const x0 = a[0] + ((b[0] - a[0]) * k) / 6, y0 = a[1] - 12 + ((b[1] - a[1]) * k) / 6;
        const x1 = a[0] + ((b[0] - a[0]) * (k + 1)) / 6, y1 = a[1] - 12 + ((b[1] - a[1]) * (k + 1)) / 6;
        g.strokeStyle = k % 2 ? '#f4f0e6' : '#c03028';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      crate(g, iso, 0.4, 1.7, 0.2);
      tinyPerson(g, ...iso.p(1.75, 1.3), '#7a2a1e', '#2a2a2a', 21);
      const fp = iso.p(0.8, 0.8, 50);
      banner(fp[0], fp[1], 20, 2);
      return true;
    }
    // ================================================================ moderne Fassungen alter Gebäude
    case 'dorfzentrum': {
      if (age < 3) return false;
      if (!fut) {
        // Rathaus der Nachkriegszeit: Backstein, flach geneigtes Dach, Uhrturm, Parkplatz
        pavement(g, iso, 3, '#8a8780', 161);
        shadowDiamond(g, iso, 0.3, 0.35, 2.5, 2.0);
        const f = boxFaces(iso, 0.3, 0.35, 2.4, 1.95, 0, 44);
        W(f.left, 'ziegel', 0.05, 161, { sockel: true });
        W(f.right, 'ziegel', -0.2, 162, { sockel: true });
        for (let k = 0; k < 6; k++) for (const v of [0.12, 0.45, 0.75]) window4(g, f.left, 0.05 + k * 0.155, v, 0.1, 0.17, 0.05);
        for (const u of [0.15, 0.6]) for (const v of [0.12, 0.45, 0.75]) window4(g, f.right, u, v, 0.22, 0.17, -0.2);
        plankDoor(g, f.left, 0.45, 0.1, 0.28, 0.05, '#3a3a3a');
        roof(g, iso, 0.3, 0.35, 2.4, 1.95, 44, 12, 'x', 'ziegel', 0.4, 163);
        const t = boxFaces(iso, 2.1, 1.6, 2.7, 2.2, 0, 92);
        W(t.left, 'ziegel', 0.05, 164);
        W(t.right, 'ziegel', -0.2, 165);
        const ck = iso.p(2.4, 2.2, 78);
        g.fillStyle = '#f0ead6';
        g.beginPath();
        g.arc(ck[0], ck[1] - 2, 6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#222';
        g.stroke();
        flatRoof(g, iso, 2.1, 1.6, 2.7, 2.2, 92, '#5a5550', 2);
        car(g, ...iso.p(0.6, 2.55), '#3a5f8a');
        car(g, ...iso.p(1.2, 2.6), '#8a3a2a');
        lamp(g, ...iso.p(1.9, 2.5), 26, 'rgba(255,230,160,0.8)');
        const fp = iso.p(1.35, 1.15, 62);
        banner(fp[0], fp[1], 26, 2);
        out.flagPt = to1x(fp);
        return true;
      }
      // Zentrum des 22. Jahrhunderts: Ring aus Paneelen, Glaskuppel, Antenne, Solarfeld
      pavement(g, iso, 3, '#d4d8d6', 171);
      solarPanels(g, iso, 0.15, 2.3, 1.4, 2.9, 0, 1, 4);
      shadowDiamond(g, iso, 0.35, 0.35, 2.65, 2.4);
      const f = boxFaces(iso, 0.35, 0.35, 2.65, 2.4, 0, 26);
      W(f.left, 'paneel', 0.08, 171);
      W(f.right, 'paneel', -0.15, 172);
      flatRoof(g, iso, 0.35, 0.35, 2.65, 2.4, 26, '#e6ecec', 2);
      dome(g, iso, 1.5, 1.38, 0.95, 26, '#9fd8f0', true);
      const an = iso.p(1.5, 1.38, 100);
      g.strokeStyle = '#d0d8dc';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(an[0], an[1] + 22);
      g.lineTo(an[0], an[1] - 26);
      g.stroke();
      glow(g, an[0], an[1] - 26, 10, 'rgba(255,120,120,0.9)');
      glow(g, ...iso.p(0.5, 2.45, 6), 9, 'rgba(120,230,255,0.8)');
      const fp = iso.p(2.4, 0.6, 26);
      banner(fp[0], fp[1], 30, 2);
      out.flagPt = to1x(fp);
      return true;
    }
    case 'wohnhaus': {
      if (age < 3) return false;
      ground(g, iso, 0.12, 0.12, 1.88, 1.88, fut ? '#a8c08a' : '#7a8a48');
      shadowDiamond(g, iso, 0.35, 0.45, 1.75, 1.6);
      if (!fut) {
        // Siedlungshaus: Klinker, steiles Ziegeldach, Antenne, Gartenzaun
        const f = boxFaces(iso, 0.35, 0.45, 1.75, 1.55, 0, 24);
        W(f.left, 'klinker', 0.08, 181, { sockel: true });
        W(f.right, 'klinker', -0.15, 182, { sockel: true });
        plankDoor(g, f.left, 0.42, 0.16, 0.66, 0.08, color);
        window4(g, f.left, 0.1, 0.4, 0.16, 0.32, 0.08);
        window4(g, f.left, 0.72, 0.4, 0.16, 0.32, 0.08);
        window4(g, f.right, 0.34, 0.4, 0.3, 0.32, -0.15);
        roof(g, iso, 0.35, 0.45, 1.75, 1.55, 24, 26, 'x', 'ziegel', 0, 183);
        const a = iso.p(0.7, 1.0, 48);
        g.strokeStyle = '#3a3a3a';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(a[0], a[1] - 14);
        for (const h of [4, 8, 12]) {
          g.moveTo(a[0] - 5, a[1] - h);
          g.lineTo(a[0] + 5, a[1] - h);
        }
        g.stroke();
        out.smoke = [chimney(g, iso, 1.4, 1.0, 44, 6)].map(to1x);
        cart(g, iso, 1.75, 0.35, 'leer');
        return true;
      }
      // Ökohaus: gerundete helle Paneele, Gründach-Kuppel, Solarmodule
      const f = boxFaces(iso, 0.35, 0.45, 1.75, 1.55, 0, 22);
      W(f.left, 'paneel', 0.08, 191);
      W(f.right, 'paneel', -0.15, 192);
      plankDoor(g, f.left, 0.42, 0.16, 0.66, 0.08, '#4a8aa0');
      flatRoof(g, iso, 0.35, 0.45, 1.75, 1.55, 22, '#7aa860', 2);
      solarPanels(g, iso, 0.45, 0.55, 1.65, 1.0, 22, 1, 3);
      dome(g, iso, 1.2, 1.25, 0.32, 22, '#bfe8f4', true);
      for (let k = 0; k < 3; k++) bush(g, ...iso.p(0.2 + k * 0.25, 1.82), 5, '#5a9a40', prng(k + 9));
      return true;
    }
    case 'kaserne': {
      if (age < 3) return false;
      ground(g, iso, 0.05, 0.05, 2.95, 2.95, fut ? '#b8bcba' : '#7d7a62');
      if (!fut) {
        // Kaserne des 20. Jh.: Betonblock, Fahrzeughalle aus Wellblech, Fahnenmast
        shadowDiamond(g, iso, 0.25, 0.3, 2.7, 1.5);
        const f = boxFaces(iso, 0.25, 0.3, 2.7, 1.4, 0, 30);
        W(f.left, 'beton', 0.05, 201);
        W(f.right, 'beton', -0.2, 202);
        for (let k = 0; k < 7; k++) for (const v of [0.2, 0.6]) window4(g, f.left, 0.04 + k * 0.137, v, 0.08, 0.22, 0.05);
        flatRoof(g, iso, 0.25, 0.3, 2.7, 1.4, 30, '#6a6862', 2);
        const h = boxFaces(iso, 1.6, 1.7, 2.7, 2.7, 0, 22);
        W(h.left, 'blech', 0.05, 203);
        W(h.right, 'blech', -0.2, 204);
        plankDoor(g, h.left, 0.15, 0.7, 0.75, 0.05, '#4a5038');
        roof(g, iso, 1.6, 1.7, 2.7, 2.7, 22, 8, 'y', 'schindel', 0, 205);
        sandbags(g, iso, [[0.3, 2.0], [0.55, 2.05], [0.8, 2.1], [0.3, 2.3]]);
        const fp = iso.p(1.0, 2.4);
        banner(fp[0], fp[1], 56, 2);
        out.flagPt = to1x([fp[0], fp[1] - 56]);
        return true;
      }
      // Hangar des 22. Jh.: Halbtonne aus Paneelen, Landeplatz
      const c = iso.p(2.1, 2.1);
      g.strokeStyle = 'rgba(255,200,60,0.9)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(c[0], c[1], 28, 14, 0, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,200,60,0.9)';
      g.font = `bold ${14}px sans-serif`;
      g.fillText('H', c[0] - 5, c[1] + 5);
      shadowDiamond(g, iso, 0.25, 0.25, 2.2, 1.35);
      const f = boxFaces(iso, 0.25, 0.25, 2.2, 1.3, 0, 22);
      W(f.left, 'paneel', 0.08, 211);
      W(f.right, 'paneel', -0.15, 212);
      plankDoor(g, f.left, 0.3, 0.4, 0.8, 0.08, '#3a4a55');
      roof(g, iso, 0.25, 0.25, 2.2, 1.3, 22, 22, 'x', 'kupfer', 0.5, 213);
      glow(g, ...iso.p(0.3, 1.35, 18), 10, 'rgba(120,230,255,0.8)');
      const fp = iso.p(2.6, 0.5);
      banner(fp[0], fp[1], 50, 2);
      out.flagPt = to1x([fp[0], fp[1] - 50]);
      return true;
    }
    case 'markt': {
      if (age < 3) return false;
      pavement(g, iso, 3, fut ? '#d8dcd8' : '#9a958a', 221);
      if (!fut) {
        // Kaufhaus mit Markise, Kiosk, Autos
        shadowDiamond(g, iso, 0.3, 0.3, 2.0, 1.6);
        const f = boxFaces(iso, 0.3, 0.3, 2.0, 1.6, 0, 36);
        W(f.left, 'glas', 0.05, 221);
        W(f.right, 'beton', -0.2, 222);
        flatRoof(g, iso, 0.3, 0.3, 2.0, 1.6, 36, '#6a6862', 3);
        poly(g, [iso.p(0.3, 1.6, 16), iso.p(2.0, 1.6, 16), iso.p(2.0, 1.9, 10), iso.p(0.3, 1.9, 10)], color, 'rgba(0,0,0,0.5)', 1);
        for (let k = 0; k < 8; k++) {
          const a = iso.p(0.3 + k * 0.21, 1.9, 10);
          g.fillStyle = k % 2 ? '#f0ece0' : shade(color, -0.1);
          g.fillRect(a[0], a[1], 6, 3);
        }
        car(g, ...iso.p(2.4, 1.0), '#c8b040');
        car(g, ...iso.p(2.5, 1.7), '#2a6a5a');
        tinyPerson(g, ...iso.p(1.0, 2.2), '#6a3a5a', '#2a2a2a', 11);
        tinyPerson(g, ...iso.p(1.6, 2.4), '#3a5a6a', '#e8dcc0', 12);
        lamp(g, ...iso.p(2.6, 2.6), 26, 'rgba(255,230,160,0.8)');
        const fp = iso.p(1.9, 0.4, 36);
        banner(fp[0], fp[1], 18, 2);
        return true;
      }
      // Handelsplatz der Zukunft: weiße Kioske, Hologramm
      for (const [xx, yy] of [[0.4, 0.4], [1.8, 0.4], [0.4, 1.9], [1.9, 1.9]] as [number, number][]) {
        const f = boxFaces(iso, xx, yy, xx + 0.7, yy + 0.6, 0, 16);
        W(f.left, 'paneel', 0.08, 230 + xx * 10);
        W(f.right, 'paneel', -0.15, 231 + yy * 10);
        flatRoof(g, iso, xx, yy, xx + 0.7, yy + 0.6, 16, '#e8eeee', 0);
        poly(g, [iso.p(xx - 0.05, yy + 0.6, 14), iso.p(xx + 0.75, yy + 0.6, 14), iso.p(xx + 0.75, yy + 0.8, 11), iso.p(xx - 0.05, yy + 0.8, 11)], color);
      }
      const h = iso.p(1.5, 1.5);
      glow(g, h[0], h[1] - 20, 22, 'rgba(120,230,255,0.75)');
      g.strokeStyle = 'rgba(160,240,255,0.9)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(h[0], h[1] - 4, 14, 6, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(h[0], h[1] - 24, 9, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(h[0], h[1] - 24, 9, 3.5, 0, 0, Math.PI * 2);
      g.stroke();
      tinyPerson(g, ...iso.p(1.1, 1.2), '#e0e0e0', '#3a8aa0', 13);
      tinyPerson(g, ...iso.p(2.0, 1.6), '#3a8aa0', '#e0e0e0', 14);
      return true;
    }
  }
  void TH;
  void TW;
  void S;
  return false;
}
