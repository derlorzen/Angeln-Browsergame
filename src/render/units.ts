// Detaillierte Einheiten-Sprites: hoch aufgelöst gezeichnet, mit Kontur, Schattierung und Gehzyklus.
// Koordinaten in 1x-Pixeln, Fußpunkt (0,0); Figuren blicken nach rechts (Spiegelung im Renderer).
import type { UnitType } from '../data/defs';
import type { FactionId } from '../data/factions';
import { canvas, shade, type Ctx } from './draw';
import type { Sprite } from './sprites';

export const UNIT_RES = 4; // Pixel je 1x-Pixel
export const UNIT_FRAMES = 7; // 0 Stand, 1–4 Gehen, 5–6 Arbeiten/Kämpfen
const W1 = 40, H1 = 46, AX = 20, AY = 40; // Leinwand in 1x-Pixeln, Ankerpunkt = Fuß

const SKIN = '#e2b791';

function limb(g: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
function bent(g: Ctx, x0: number, y0: number, xm: number, ym: number, x1: number, y1: number, w: number, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(xm, ym);
  g.lineTo(x1, y1);
  g.stroke();
}
function dot(g: Ctx, x: number, y: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function ell(g: Ctx, x: number, y: number, rx: number, ry: number, color: string, rot = 0): void {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
}

interface Pose {
  legL: number; // Fußversatz (x) und Hebung
  legR: number;
  liftL: number;
  liftR: number;
  armBack: number; // Winkel (rad) des hinteren Arms
  bob: number; // Körperhebung
}
function pose(frame: number): Pose {
  if (frame >= 1 && frame <= 4) {
    const ph = ((frame - 1) / 4) * Math.PI * 2;
    return {
      legL: Math.sin(ph) * 2.6, legR: -Math.sin(ph) * 2.6,
      liftL: Math.max(0, Math.cos(ph)) * 1.2, liftR: Math.max(0, -Math.cos(ph)) * 1.2,
      armBack: -Math.sin(ph) * 0.45, bob: Math.abs(Math.cos(ph)) * 0.6,
    };
  }
  return { legL: -0.6, legR: 0.8, liftL: 0, liftR: 0, armBack: 0.1, bob: 0 };
}

interface Body {
  coat: string;
  coat2?: string; // Schlitzfarbe (Landsknecht)
  sleeve: string;
  legL: string;
  legR: string;
  boot: string;
  belt: string;
  puffy?: boolean;
  beard?: string;
  hair: string;
}

/** Zeichnet Beine, Rumpf, Kopf und den hinteren Arm. Gibt Schulterpunkt des vorderen Arms zurück. */
function figure(g: Ctx, p: Pose, b: Body, hat: (hx: number, hy: number) => void, back?: () => void): { sx: number; sy: number; hy: number } {
  const by = -p.bob;
  // hinterer Arm (dunkler)
  const shBx = -2.2, shBy = -17.2 + by;
  const ab = p.armBack;
  bent(g, shBx, shBy, shBx - Math.sin(ab) * 3.4, shBy + Math.cos(ab) * 3.4, shBx - Math.sin(ab) * 4.2 + 0.6, shBy + Math.cos(ab) * 6.6, b.puffy ? 2.6 : 1.9, shade(b.sleeve, -0.3));
  dot(g, shBx - Math.sin(ab) * 4.2 + 0.6, shBy + Math.cos(ab) * 6.6 + 0.3, 0.9, shade(SKIN, -0.2));
  if (back) back();
  // Beine
  const leg = (x: number, off: number, lift: number, col: string, dark: number) => {
    const hx = x, hy = -9.8 + by;
    const fx = x + off, fy = -lift;
    bent(g, hx, hy, (hx + fx) / 2 + 0.5, (hy + fy) / 2, fx, fy - 1.2, b.puffy ? 2.5 : 2.1, shade(col, dark));
    if (b.puffy) {
      ell(g, hx + off * 0.25, hy + 2.5, 1.8, 2.3, shade(col, dark));
      g.strokeStyle = 'rgba(240,232,210,0.9)';
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(hx + off * 0.25 - 0.8, hy + 1);
      g.lineTo(hx + off * 0.25 - 0.4, hy + 4);
      g.moveTo(hx + off * 0.25 + 0.6, hy + 1);
      g.lineTo(hx + off * 0.25 + 0.8, hy + 4);
      g.stroke();
    }
    // Stiefel
    ell(g, fx + 0.6, fy - 0.6, 1.7, 0.95, shade(b.boot, dark));
    g.fillStyle = shade(b.boot, dark);
    g.fillRect(fx - 1, fy - 3, 2, 2.6);
  };
  leg(-1.5, p.legL, p.liftL, b.legL, -0.2);
  leg(1.4, p.legR, p.liftR, b.legR, 0);
  // Rumpf
  const top = -18.6 + by, bot = -9.4 + by;
  const gr = g.createLinearGradient(-3.6, 0, 3.6, 0);
  gr.addColorStop(0, shade(b.coat, 0.12));
  gr.addColorStop(0.55, b.coat);
  gr.addColorStop(1, shade(b.coat, -0.35));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-3.2, top + 0.6);
  g.quadraticCurveTo(0, top - 0.6, 3.2, top + 0.6);
  g.lineTo(3.7, bot);
  g.quadraticCurveTo(0, bot + 1.6, -3.7, bot);
  g.closePath();
  g.fill();
  if (b.coat2) {
    // Schlitze im Wams
    g.strokeStyle = b.coat2;
    g.lineWidth = 0.7;
    for (const x of [-1.8, 0, 1.8]) {
      g.beginPath();
      g.moveTo(x, top + 1.5);
      g.quadraticCurveTo(x + 0.6, (top + bot) / 2, x, bot - 0.8);
      g.stroke();
    }
  }
  // Gürtel mit Schnalle und Tasche
  g.fillStyle = b.belt;
  g.fillRect(-3.6, bot - 2.3, 7.3, 1.2);
  g.fillStyle = '#c9a43a';
  g.fillRect(-0.5, bot - 2.4, 1, 1.4);
  ell(g, 2.6, bot - 0.9, 1, 1.3, shade(b.belt, 0.15));
  // Hals und Kopf
  g.fillStyle = shade(SKIN, -0.15);
  g.fillRect(-0.8, top - 1.6, 1.6, 1.8);
  const hx = 0.3, hy = top - 3.6;
  const hg = g.createRadialGradient(hx - 0.8, hy - 0.8, 0.3, hx, hy, 3);
  hg.addColorStop(0, shade(SKIN, 0.15));
  hg.addColorStop(1, shade(SKIN, -0.18));
  g.fillStyle = hg;
  g.beginPath();
  g.arc(hx, hy, 2.6, 0, Math.PI * 2);
  g.fill();
  // Haare hinten, Ohr, Auge, Nase
  g.fillStyle = b.hair;
  g.beginPath();
  g.arc(hx - 0.6, hy - 0.2, 2.6, Math.PI * 0.55, Math.PI * 1.45);
  g.fill();
  dot(g, hx - 0.4, hy + 0.2, 0.55, shade(SKIN, -0.25));
  dot(g, hx + 1.3, hy - 0.4, 0.38, '#2a1d14');
  g.fillStyle = shade(SKIN, -0.2);
  g.fillRect(hx + 2.3, hy - 0.1, 0.6, 0.9);
  if (b.beard) {
    g.fillStyle = b.beard;
    g.beginPath();
    g.arc(hx + 0.6, hy + 1.2, 1.9, 0, Math.PI);
    g.fill();
  }
  hat(hx, hy);
  return { sx: 2.4, sy: -17.2 + by, hy };
}

function frontArm(g: Ctx, sx: number, sy: number, ex: number, ey: number, hx: number, hy: number, sleeve: string, puffy = false): void {
  bent(g, sx, sy, ex, ey, hx, hy, puffy ? 2.7 : 2, sleeve);
  if (puffy) {
    ell(g, (sx + ex) / 2, (sy + ey) / 2, 1.7, 1.9, sleeve);
    g.strokeStyle = 'rgba(240,232,210,0.9)';
    g.lineWidth = 0.5;
    g.beginPath();
    g.moveTo((sx + ex) / 2 - 0.6, (sy + ey) / 2 - 1.3);
    g.lineTo((sx + ex) / 2 + 0.2, (sy + ey) / 2 + 1.3);
    g.stroke();
  }
  dot(g, hx, hy, 0.95, SKIN);
}

function shadowUnder(g: Ctx, rx: number): void {
  ell(g, 0.8, 0, rx, rx * 0.38, 'rgba(15,20,10,0.35)');
}

// ------------------------------------------------------------------ Kopfbedeckungen
type Hat = (g: Ctx, hx: number, hy: number) => void;
const hats = {
  zipfel: (c: string): Hat => (g, hx, hy) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(hx - 2.8, hy - 0.4);
    g.quadraticCurveTo(hx - 0.5, hy - 4.6, hx + 2.7, hy - 0.8);
    g.quadraticCurveTo(hx - 1.5, hy - 2.6, hx - 4.6, hy + 1.6);
    g.closePath();
    g.fill();
    g.fillStyle = shade(c, -0.3);
    g.fillRect(hx - 2.8, hy - 1.1, 5.6, 1);
    dot(g, hx - 4.6, hy + 1.6, 0.7, shade(c, 0.3));
  },
  stroh: (c: string): Hat => (g, hx, hy) => {
    ell(g, hx, hy - 1.6, 4.6, 1.3, '#d8c070');
    ell(g, hx, hy - 2.7, 2.6, 1.7, '#e0c87a');
    g.fillStyle = c;
    g.fillRect(hx - 2.6, hy - 2.3, 5.2, 0.8);
    g.strokeStyle = '#b09848';
    g.lineWidth = 0.3;
    g.beginPath();
    g.ellipse(hx, hy - 1.6, 3.6, 0.9, 0, 0, Math.PI * 2);
    g.stroke();
  },
  strick: (c: string): Hat => (g, hx, hy) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(hx - 0.2, hy - 1.6, 2.9, 2.3, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = shade(c, -0.25);
    g.fillRect(hx - 3.1, hy - 1.8, 6, 1.1);
    for (let k = -2; k <= 2; k++) dot(g, hx + k * 1.2, hy - 1.25, 0.25, shade(c, 0.3));
    dot(g, hx - 0.4, hy - 4, 0.9, shade(c, 0.25));
  },
  filz: (c: string): Hat => (g, hx, hy) => {
    ell(g, hx, hy - 2.1, 3.1, 1.9, c);
    g.fillStyle = shade(c, -0.3);
    g.fillRect(hx - 3.1, hy - 1.6, 6.2, 0.9);
  },
  barett: (c: string, feather = '#f2ecd8'): Hat => (g, hx, hy) => {
    ell(g, hx - 0.2, hy - 2, 3.8, 1.4, c, -0.12);
    ell(g, hx - 0.2, hy - 2.8, 2.6, 1.3, shade(c, -0.15));
    g.strokeStyle = feather;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(hx - 1.5, hy - 3.2);
    g.quadraticCurveTo(hx - 4.8, hy - 6.5, hx - 6.2, hy - 3.6);
    g.stroke();
  },
  breit: (c: string): Hat => (g, hx, hy) => {
    ell(g, hx, hy - 1.6, 3.8, 1.1, '#2e2a26');
    ell(g, hx - 0.1, hy - 2.6, 2.2, 1.4, '#3a3530');
    g.strokeStyle = c;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(hx - 1.6, hy - 3);
    g.quadraticCurveTo(hx - 4.5, hy - 6, hx - 5.4, hy - 2.6);
    g.stroke();
  },
  kessel: (plume?: string): Hat => (g, hx, hy) => {
    ell(g, hx, hy - 1.3, 4.3, 1.1, '#9aa0a6');
    g.fillStyle = '#b9bec4';
    g.beginPath();
    g.ellipse(hx, hy - 1.6, 2.7, 2.3, 0, Math.PI, 0);
    g.fill();
    if (plume) dot(g, hx - 0.4, hy - 4.2, 1, plume);
  },
  morion: (p1: string, p2: string): Hat => (g, hx, hy) => {
    g.fillStyle = '#b9bec4';
    g.beginPath();
    g.ellipse(hx, hy - 1.4, 2.9, 2.3, 0, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.moveTo(hx - 4.4, hy - 0.6);
    g.quadraticCurveTo(hx, hy + 0.4, hx + 4.4, hy - 2);
    g.lineTo(hx + 4.2, hy - 1.2);
    g.quadraticCurveTo(hx, hy + 1.4, hx - 4.2, hy + 0.3);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8ecef';
    g.fillRect(hx - 1.6, hy - 3.3, 1.2, 0.8);
    g.fillStyle = '#9aa0a6';
    g.beginPath();
    g.moveTo(hx - 1.8, hy - 3.4);
    g.quadraticCurveTo(hx, hy - 5.6, hx + 1.8, hy - 3.4);
    g.closePath();
    g.fill();
    for (const [dx, col] of [[-0.6, p1], [0.4, p2], [1.2, p1]] as [number, string][]) {
      g.strokeStyle = col;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(hx + dx, hy - 4.6);
      g.quadraticCurveTo(hx + dx - 2, hy - 8, hx + dx - 4.4, hy - 6.2);
      g.stroke();
    }
  },
  dreispitz: (c: string, trim = '#e8dcc0'): Hat => (g, hx, hy) => {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(hx - 4.4, hy - 1.4);
    g.quadraticCurveTo(hx - 1, hy - 5.4, hx + 3.8, hy - 2.4);
    g.quadraticCurveTo(hx + 1, hy - 1.2, hx - 4.4, hy - 1.4);
    g.fill();
    g.strokeStyle = trim;
    g.lineWidth = 0.45;
    g.stroke();
    dot(g, hx - 1.4, hy - 3.2, 0.7, '#c03028');
  },
  stahlhelm: (c: string): Hat => (g, hx, hy) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(hx - 0.2, hy - 1.6, 3.4, 2.7, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = shade(c, -0.25);
    g.fillRect(hx - 3.8, hy - 1.8, 7.4, 0.9);
    g.strokeStyle = 'rgba(40,40,30,0.6)';
    g.lineWidth = 0.3;
    g.beginPath();
    g.moveTo(hx - 2.6, hy - 1.2);
    g.lineTo(hx - 1.8, hy + 1.4);
    g.stroke();
  },
  exohelm: (c: string): Hat => (g, hx, hy) => {
    g.fillStyle = '#e4e9ec';
    g.beginPath();
    g.ellipse(hx + 0.1, hy - 0.8, 3.3, 3.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#18323c';
    g.beginPath();
    g.ellipse(hx + 1.3, hy - 0.4, 2.1, 1.2, 0.1, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(120,230,255,0.9)';
    g.fillRect(hx + 0.4, hy - 0.8, 2.6, 0.5);
    g.fillStyle = c;
    g.fillRect(hx - 3, hy - 3.2, 1.6, 2.2);
  },
  topfhelm: (plume: string): Hat => (g, hx, hy) => {
    g.fillStyle = '#c4c9ce';
    g.beginPath();
    g.ellipse(hx + 0.2, hy - 0.6, 3, 3.1, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2420';
    g.fillRect(hx + 0.6, hy - 1.1, 2.6, 0.7);
    g.strokeStyle = plume;
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(hx, hy - 3.4);
    g.quadraticCurveTo(hx - 3, hy - 7, hx - 6, hy - 4.6);
    g.stroke();
  },
};

const CREAM = '#efe6cc';

// ------------------------------------------------------------------ Kleidung je Partei
interface Outfit {
  body: Body;
  hat: Hat;
  sash?: 'diag' | 'kreuz';
  cuirass?: boolean;
  apron?: boolean;
}

function outfit(type: UnitType, fac: FactionId, color: string): Outfit {
  const B = (coat: string, sleeve: string, legL: string, legR: string, extra: Partial<Body> = {}): Body => ({
    coat, sleeve, legL, legR, boot: '#33261a', belt: '#3a2a1a', hair: '#6b4a2a', ...extra,
  });
  switch (type) {
    case 'arbeiter':
      if (fac === 'schwansen') return { body: B('#5f6a4a', '#cfc6aa', '#5a5446', '#5a5446'), hat: hats.stroh(color), apron: true };
      if (fac === 'friesen') return { body: B('#3e5a78', '#3e5a78', '#4a4a44', '#4a4a44', { beard: '#c8a060', hair: '#c8a060' }), hat: hats.strick(color) };
      if (fac === 'daenen') return { body: B('#7a3a2a', '#e0d6c0', '#5a5040', '#5a5040'), hat: hats.filz(color), apron: true };
      return { body: B('#7a5a3a', '#d6c9a8', '#6b6253', '#6b6253'), hat: hats.zipfel(color), apron: true };
    case 'knickwaechter':
      return { body: B('#6a4a2a', '#c8b994', '#5c5348', '#5c5348', { beard: '#6b4a2a' }), hat: hats.filz(color), sash: 'diag' };
    case 'landsknecht':
      if (fac === 'schwansen') return { body: B('#2f4a32', color, '#2f4a32', color, { puffy: true }), hat: hats.barett(color), cuirass: true };
      if (fac === 'friesen') return { body: B('#3e5a78', '#3e5a78', '#4a4a44', '#4a4a44', { beard: '#c8a060', hair: '#c8a060' }), hat: hats.kessel(color), sash: 'diag' };
      if (fac === 'daenen') return { body: B(color, CREAM, color, CREAM, { puffy: true }), hat: hats.morion(CREAM, '#c03028'), sash: 'kreuz' };
      return { body: B(color, color, color, CREAM, { coat2: CREAM, puffy: true, beard: '#7a5634', boot: '#2e2218' }), hat: hats.morion(CREAM, color) };
    case 'schuetze':
      if (fac === 'schwansen') return { body: B('#3d5a3a', '#4a6a44', '#4a4a3a', '#4a4a3a'), hat: hats.barett('#2f4a32', color), sash: 'diag' };
      if (fac === 'friesen') return { body: B('#3e5a78', '#3e5a78', '#4a4a44', '#4a4a44', { hair: '#c8a060' }), hat: hats.strick(color), sash: 'diag' };
      if (fac === 'daenen') return { body: B(color, CREAM, '#4a4238', '#4a4238'), hat: hats.kessel(), sash: 'kreuz' };
      return { body: B('#8a6a44', '#6e5a40', '#5a5a4a', '#5a5a4a', { hair: '#4a3420' }), hat: hats.barett(color), sash: 'diag' };
    case 'grabenspringer':
      return { body: B('#3e5a78', '#3e5a78', '#4a4a44', '#4a4a44', { beard: '#c8a060', hair: '#c8a060', boot: '#2a2420' }), hat: hats.strick(color), sash: 'diag' };
    case 'musketier':
      return { body: B(color, CREAM, '#3a3530', '#3a3530'), hat: hats.morion('#f2ecd8', '#c03028'), sash: 'kreuz' };
    case 'fuesilier':
      return { body: B(color, shade(color, -0.15), '#e8e2d0', '#e8e2d0', { boot: '#1e1a16', belt: '#f2ecdc' }), hat: hats.dreispitz('#22201c'), sash: 'kreuz' };
    case 'infanterist':
      return { body: B('#5f6644', '#59603f', '#565c3c', '#565c3c', { boot: '#2a241c', belt: '#3a3424', hair: '#4a3a2a' }), hat: hats.stahlhelm('#5a6040'), sash: 'diag' };
    case 'exosoldat':
      return { body: B('#d9dee2', '#c8ced3', '#b8bec4', '#b8bec4', { boot: '#4a5056', belt: color }), hat: hats.exohelm(color), cuirass: true };
    default:
      return { body: B(color, color, '#4a4238', '#4a4238'), hat: hats.breit(color) };
  }
}

function sashes(g: Ctx, o: Outfit, color: string, bob: number): void {
  if (o.cuirass) {
    const gr = g.createLinearGradient(-3, 0, 3.5, 0);
    gr.addColorStop(0, '#e2e6ea');
    gr.addColorStop(0.5, '#aeb4ba');
    gr.addColorStop(1, '#7a8086');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-3, -18 - bob);
    g.quadraticCurveTo(0.4, -19.2 - bob, 3.3, -18 - bob);
    g.lineTo(3.2, -12.2 - bob);
    g.quadraticCurveTo(0.2, -10.6 - bob, -3, -12.2 - bob);
    g.closePath();
    g.fill();
  }
  if (o.sash === 'diag') {
    g.strokeStyle = o.body.coat === color ? CREAM : color;
    g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(-2.8, -18 - bob);
    g.lineTo(3, -11 - bob);
    g.stroke();
  } else if (o.sash === 'kreuz') {
    g.strokeStyle = '#f4f0e6';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-2.8, -18 - bob);
    g.lineTo(3, -11 - bob);
    g.moveTo(3, -18 - bob);
    g.lineTo(-2.8, -11 - bob);
    g.stroke();
  }
  if (o.apron) {
    g.fillStyle = '#d0c29c';
    g.fillRect(-1.6, -12.2 - bob, 3.4, 3.2);
  }
}

// ------------------------------------------------------------------ Waffen
function pikeHead(g: Ctx, tx: number, ty: number, ang: number, kind: 'spitze' | 'hellebarde' | 'sense'): void {
  g.save();
  g.translate(tx, ty);
  g.rotate(ang);
  g.fillStyle = '#c4c9ce';
  if (kind === 'spitze') {
    g.beginPath();
    g.moveTo(0, -3.2);
    g.lineTo(0.9, 0);
    g.lineTo(-0.9, 0);
    g.closePath();
    g.fill();
  } else if (kind === 'hellebarde') {
    g.beginPath();
    g.moveTo(0, -3.4);
    g.lineTo(0.6, -0.6);
    g.lineTo(3, -1.6);
    g.lineTo(3, 1.6);
    g.lineTo(0.6, 0.6);
    g.lineTo(-1.6, 0.4);
    g.lineTo(-0.6, -0.4);
    g.closePath();
    g.fill();
  } else {
    // Kriegssense: lange, leicht gebogene Klinge
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(3.6, -1.2, 6, 1.4);
    g.quadraticCurveTo(3.2, 0.2, 0, 1.2);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function polearm(g: Ctx, bx: number, by: number, tx: number, ty: number, kind: 'spitze' | 'hellebarde' | 'sense', tassel?: string): void {
  limb(g, bx, by, tx, ty, 0.9, '#8a6a44');
  pikeHead(g, tx, ty, Math.atan2(ty - by, tx - bx) + Math.PI / 2, kind);
  if (tassel) dot(g, tx - (tx - bx) * 0.06, ty - (ty - by) * 0.06, 0.8, tassel);
}

// ------------------------------------------------------------------ Figurtypen
function worker(g: Ctx, color: string, f: number, fac: FactionId): void {
  shadowUnder(g, 5.5);
  const p = pose(f);
  const work = f >= 5;
  const o = outfit('arbeiter', fac, color);
  const axe = work
    ? undefined
    : () => {
        const by = -p.bob;
        limb(g, 6.2, -13.6 + by, -3.4, -24.5 + by, 0.9, '#7a5634');
        g.fillStyle = '#a9b0b6';
        g.beginPath();
        g.moveTo(-3.6, -24.8 + by);
        g.lineTo(-6.6, -23.4 + by);
        g.lineTo(-5.2, -21.4 + by);
        g.lineTo(-2.6, -23.2 + by);
        g.closePath();
        g.fill();
      };
  const s = figure(g, p, o.body, (hx, hy) => o.hat(g, hx, hy), axe);
  sashes(g, o, color, p.bob);
  const { sx, sy } = s;
  if (!work) frontArm(g, sx, sy, sx + 2.2, sy + 3, sx + 3.4, sy + 3.2, o.body.sleeve);
  else {
    const up = f === 5;
    const hx = up ? sx - 0.5 : sx + 5.2, hy = up ? sy - 6.5 : sy + 4.2;
    const tx = up ? hx - 3 : hx + 4.5, ty = up ? hy - 3.5 : hy + 2.2;
    limb(g, hx, hy, tx, ty, 0.9, '#7a5634');
    g.fillStyle = '#a9b0b6';
    g.save();
    g.translate(tx, ty);
    g.rotate(up ? -2.3 : 0.45);
    g.fillRect(-0.4, -1.6, 2.6, 3.2);
    g.restore();
    frontArm(g, sx, sy, up ? sx + 1.6 : sx + 3.2, up ? sy - 3 : sy + 1.5, hx, hy, o.body.sleeve);
    if (!up) {
      dot(g, tx + 2, ty - 1.5, 0.45, '#d9b878');
      dot(g, tx + 3.2, ty - 0.2, 0.35, '#d9b878');
    }
  }
}

/** Nahkämpfer mit Stangenwaffe (Spieß, Hellebarde, Sense, Speer + Schild). */
function infantry(g: Ctx, color: string, f: number, type: UnitType, fac: FactionId): void {
  shadowUnder(g, 6);
  const p = pose(f);
  const work = f >= 5;
  const o = outfit(type, fac, color);
  const kind: 'spitze' | 'hellebarde' | 'sense' = type === 'knickwaechter' ? 'sense' : fac === 'schwansen' ? 'hellebarde' : 'spitze';
  const short = type === 'knickwaechter' || fac === 'friesen';
  const len = short ? 0.62 : 1;
  const tassel = kind === 'spitze' && !short ? color : undefined;
  const carry = () => {
    if (work) return;
    const walking = f >= 1 && f <= 4;
    const bx = walking ? -6 : 4.8, byy = walking ? -21 : 0.5;
    const tx0 = walking ? 13 : 7.2, ty0 = walking ? -38 : -40;
    polearm(g, bx, byy, bx + (tx0 - bx) * len, byy + (ty0 - byy) * len, kind, tassel);
  };
  const s = figure(g, p, o.body, (hx, hy) => o.hat(g, hx, hy), carry);
  sashes(g, o, color, p.bob);
  const { sx, sy } = s;
  const puffy = !!o.body.puffy;
  if (!work) {
    const walking = f >= 1 && f <= 4;
    frontArm(g, sx, sy, sx + 1.8, sy + 3.2, walking ? sx + 0.8 : sx + 2.9, walking ? sy - 1.5 : sy + 4.8, o.body.sleeve, puffy);
  } else {
    const thrust = f === 6 ? 5 : 0;
    if (kind === 'sense') {
      // weit ausholender Sensenhieb
      const up = f === 5;
      const hx = up ? sx - 1 : sx + 5, hy = up ? sy - 5 : sy + 3;
      const tx = up ? hx - 6 : hx + 10, ty = up ? hy - 8 : hy + 1;
      polearm(g, up ? hx + 4 : hx - 5, up ? hy + 5 : hy - 0.5, tx, ty, 'sense');
      frontArm(g, sx, sy, (sx + hx) / 2 + 0.6, (sy + hy) / 2, hx, hy, o.body.sleeve);
    } else {
      const bx = -9 * len + thrust, byy = sy + 3;
      const tx = 17 * len + thrust, ty = sy - 2;
      polearm(g, bx, byy, tx, ty, kind, tassel);
      frontArm(g, sx, sy, sx + 2.4, sy + 2.2, sx + 4.5 + thrust * 0.6, sy + 1.6, o.body.sleeve, puffy);
    }
  }
  if (fac === 'friesen' && type === 'landsknecht') {
    // runder Holzschild in Spielerfarbe
    const cx = sx + 1.2, cy = sy + 4.5;
    dot(g, cx, cy, 3.6, shade(color, -0.1));
    g.strokeStyle = '#6b4a2c';
    g.lineWidth = 0.6;
    g.beginPath();
    g.arc(cx, cy, 3.6, 0, Math.PI * 2);
    g.stroke();
    dot(g, cx, cy, 1, '#b9bec4');
  }
}

function ranged(g: Ctx, color: string, f: number, type: UnitType, fac: FactionId): void {
  shadowUnder(g, 5.5);
  const p = pose(f);
  const aim = f >= 5;
  const o = outfit(type, fac, color);
  if (type === 'fuesilier' || type === 'infanterist' || type === 'exosoldat') return rifleman(g, color, f, type, o, p, aim);
  const musket = type === 'musketier';
  const back = () => {
    g.save();
    g.translate(-3.2, -15 - p.bob);
    g.rotate(-0.35);
    if (musket) {
      // Pulverhorn
      g.fillStyle = '#d8cca8';
      g.beginPath();
      g.moveTo(-1, -1);
      g.quadraticCurveTo(2, 2, 0.5, 5);
      g.lineTo(-0.6, 4.6);
      g.closePath();
      g.fill();
    } else {
      g.fillStyle = '#5a3d22';
      g.fillRect(-1.1, -2, 2.2, 7);
      for (const dx of [-0.6, 0, 0.6]) {
        limb(g, dx, -2, dx, -4, 0.35, '#d8c8a0');
        dot(g, dx, -4.2, 0.45, color);
      }
    }
    g.restore();
  };
  const s = figure(g, p, o.body, (hx, hy) => o.hat(g, hx, hy), back);
  sashes(g, o, color, p.bob);
  if (musket) {
    // Bandelier mit „Aposteln“ (Pulverfläschchen)
    for (let k = 0; k < 5; k++) dot(g, -2.2 + k * 1.2, -17 + k * 1.4 - p.bob, 0.5, '#6b4a2c');
  }
  const { sx, sy } = s;
  if (musket) {
    const walking = f >= 1 && f <= 4;
    if (!aim) {
      // geschultert
      limb(g, sx - 6, sy + 6, sx + 7, sy - 9, 1.1, '#5a3d22');
      limb(g, sx + 2, sy - 3.5, sx + 7, sy - 9, 0.7, '#4a4a4a');
      frontArm(g, sx, sy, sx + 2, sy + 2, walking ? sx + 1.5 : sx + 2.4, walking ? sy + 1 : sy + 2.6, o.body.sleeve);
    } else {
      // im Anschlag auf der Musketengabel
      const mx = sx + 1, my = sy + 0.5;
      limb(g, mx + 9, my + 0.2, mx + 10, 0, 0.5, '#6b4a2c'); // Gabel
      limb(g, mx + 8.6, my - 0.3, mx + 11.2, my - 0.3, 0.4, '#6b4a2c');
      limb(g, mx - 2, my + 0.6, mx + 5, my, 1.3, '#5a3d22');
      limb(g, mx + 5, my, mx + 14, my - 0.6, 0.75, '#4a4a4a');
      frontArm(g, sx, sy, sx + 2.6, sy + 1.6, mx + 4.6, my + 0.6, o.body.sleeve);
      if (f === 6) {
        // Mündungsfeuer und Rauch
        dot(g, mx + 15.2, my - 0.6, 1.3, '#ffd060');
        dot(g, mx + 15.8, my - 0.6, 0.7, '#fff4c0');
        ell(g, mx + 17.5, my - 1.4, 2.6, 1.8, 'rgba(220,220,215,0.85)');
        ell(g, mx + 19.5, my - 2.6, 2, 1.5, 'rgba(220,220,215,0.6)');
      }
    }
    return;
  }
  const cbx = aim ? sx + 2.5 : sx + 1.5, cby = aim ? sy - 0.3 : sy + 4;
  const ang = aim ? -0.05 : -0.55;
  g.save();
  g.translate(cbx, cby);
  g.rotate(ang);
  g.fillStyle = '#6b4a2c';
  g.fillRect(-2.5, -0.6, 9, 1.3);
  g.strokeStyle = '#3a2f26';
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(5.6, 0, 3.4, -Math.PI / 2, Math.PI / 2);
  g.stroke();
  g.strokeStyle = '#ddd5c0';
  g.lineWidth = 0.35;
  g.beginPath();
  g.moveTo(5.6, -3.4);
  g.lineTo(f === 6 ? 5.2 : 1.6, 0);
  g.lineTo(5.6, 3.4);
  g.stroke();
  limb(g, 7.6, 0, 8.6, 0, 0.6, '#5a5a5a');
  if (f === 5) limb(g, 1.6, -0.2, 6, -0.2, 0.5, '#9a8a6a');
  g.restore();
  frontArm(g, sx, sy, sx + (aim ? 2.2 : 1.6), sy + (aim ? 1 : 3.2), cbx + 1, cby + 0.6, o.body.sleeve);
}

/** Füsilier (Steinschlossflinte mit Bajonett), Infanterist (Repetiergewehr), Exo-Soldat (Strahlgewehr). */
function rifleman(g: Ctx, color: string, f: number, type: UnitType, o: Outfit, p: Pose, aim: boolean): void {
  const exo = type === 'exosoldat';
  const back = () => {
    // Tornister bzw. Energiepack
    g.fillStyle = exo ? '#aab2b8' : type === 'infanterist' ? '#4a4f34' : '#6b4a2c';
    g.fillRect(-5.4, -18.5 - p.bob, 3.2, 6);
    if (exo) dot(g, -3.8, -15.5 - p.bob, 0.9, 'rgba(120,230,255,0.95)');
  };
  const s = figure(g, p, o.body, (hx, hy) => o.hat(g, hx, hy), back);
  sashes(g, o, color, p.bob);
  if (type === 'infanterist') {
    // Armbinde in Spielerfarbe
    ell(g, 1.6, -15.4 - p.bob, 1.1, 0.8, color);
  }
  const { sx, sy } = s;
  const stock = exo ? '#e8ecee' : type === 'infanterist' ? '#4a3a26' : '#6b4a2c';
  const metal = exo ? '#5a6870' : '#4a4a4a';
  const walking = f >= 1 && f <= 4;
  if (!aim) {
    // geschultert
    limb(g, sx - 5, sy + 6, sx + 6, sy - 8, exo ? 1.6 : 1.1, stock);
    limb(g, sx + 2, sy - 3, sx + 6, sy - 8, 0.7, metal);
    if (type === 'fuesilier') limb(g, sx + 6, sy - 8, sx + 7.6, sy - 11, 0.35, '#d8dde0');
    frontArm(g, sx, sy, sx + 2, sy + 2, walking ? sx + 1.5 : sx + 2.4, walking ? sy + 1 : sy + 2.6, o.body.sleeve);
    return;
  }
  const mx = sx + 1, my = sy + 0.5;
  limb(g, mx - 2.5, my + 0.8, mx + 4.5, my, exo ? 1.9 : 1.3, stock);
  limb(g, mx + 4.5, my, mx + 12, my - 0.4, exo ? 1.2 : 0.7, metal);
  if (type === 'fuesilier') limb(g, mx + 12, my - 0.4, mx + 15, my - 0.6, 0.35, '#d8dde0');
  if (exo) dot(g, mx + 6, my - 0.9, 0.8, 'rgba(120,230,255,0.95)');
  frontArm(g, sx, sy, sx + 2.6, sy + 1.6, mx + 4.6, my + 0.6, o.body.sleeve);
  if (f === 6) {
    if (exo) {
      limb(g, mx + 12.5, my - 0.4, mx + 19, my - 0.8, 0.9, 'rgba(140,240,255,0.95)');
      dot(g, mx + 12.5, my - 0.4, 1.4, 'rgba(200,250,255,0.9)');
    } else {
      dot(g, mx + 13, my - 0.4, 1.2, '#ffd060');
      dot(g, mx + 13.5, my - 0.4, 0.6, '#fff4c0');
      ell(g, mx + 15.5, my - 1.2, type === 'fuesilier' ? 2.4 : 1.2, type === 'fuesilier' ? 1.6 : 0.9, 'rgba(220,220,215,0.8)');
    }
  }
}

// ------------------------------------------------------------------ Fahrzeuge
function wheel(g: Ctx, x: number, y: number, r: number, f: number, col: string): void {
  g.strokeStyle = col;
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  const a0 = (f % 4) * 0.4;
  g.lineWidth = 0.45;
  for (let k = 0; k < 4; k++) {
    const a = a0 + (k * Math.PI) / 4;
    g.beginPath();
    g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.stroke();
  }
  dot(g, x, y, 0.7, shade(col, -0.2));
}
function kanone(g: Ctx, color: string, f: number): void {
  ell(g, 0.5, -0.4, 10, 2.2, 'rgba(15,20,10,0.28)');
  const recoil = f === 6 ? -1.2 : 0;
  // Lafette
  limb(g, -10, -1.5, 3, -6.5, 1.8, '#6b4a2c');
  g.fillStyle = color;
  g.fillRect(-6, -5.4, 4, 1.1);
  // Rohr (Bronze)
  g.save();
  g.translate(recoil, 0);
  limb(g, -2, -8.4, 11, -10.6, 2.4, '#a8803a');
  limb(g, 9, -10.2, 11.6, -10.6, 2.8, '#8a6a2a');
  dot(g, -2.4, -8.4, 1.4, '#8a6a2a');
  g.restore();
  wheel(g, 1, -4.6, 4.4, f, '#4a3220');
  if (f === 6) {
    dot(g, 13, -10.8, 1.8, '#ffd060');
    ell(g, 16, -12, 3.6, 2.4, 'rgba(225,225,220,0.9)');
    ell(g, 19, -14, 3, 2, 'rgba(225,225,220,0.6)');
  }
}
function panzer(g: Ctx, color: string, f: number): void {
  ell(g, 0.5, -0.6, 15.5, 2.6, 'rgba(15,20,10,0.28)');
  const hull = '#5d6446';
  // Ketten
  g.fillStyle = '#2a2a26';
  g.beginPath();
  g.moveTo(-14, -2);
  g.lineTo(13, -2);
  g.quadraticCurveTo(16, -2, 15.5, -5);
  g.lineTo(14, -7.5);
  g.lineTo(-13, -7.5);
  g.quadraticCurveTo(-16.5, -5, -14, -2);
  g.fill();
  for (let k = 0; k < 6; k++) wheel(g, -10.5 + k * 4.4, -4.6, 1.6, f, '#6a6a60');
  g.strokeStyle = '#4a4a44';
  g.lineWidth = 0.4;
  for (let k = 0; k < 12; k++) {
    const x = -14 + ((k * 2.5 + (f % 4) * 0.6) % 29);
    g.beginPath();
    g.moveTo(x, -2);
    g.lineTo(x, -1.2);
    g.stroke();
  }
  // Wanne
  g.fillStyle = hull;
  g.beginPath();
  g.moveTo(-15, -7.5);
  g.lineTo(14, -7.5);
  g.lineTo(11, -12);
  g.lineTo(-13, -12);
  g.closePath();
  g.fill();
  g.fillStyle = color;
  g.fillRect(-12, -10.2, 6, 1.6);
  // Turm und Kanone
  const recoil = f === 6 ? -1 : 0;
  g.fillStyle = shade(hull, 0.08);
  g.beginPath();
  g.ellipse(-1, -14, 7, 3.6, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(-7, -16, 11, 3);
  limb(g, 3 + recoil, -15.2, 17 + recoil, -16.2, 1.3, shade(hull, -0.15));
  dot(g, -3, -17.4, 1.2, shade(hull, -0.2));
  if (f === 6) {
    dot(g, 18.5, -16.3, 1.8, '#ffd060');
    ell(g, 20, -17, 2.6, 1.8, 'rgba(225,225,220,0.85)');
  }
}
function drohne(g: Ctx, color: string, f: number): void {
  // Schatten am Boden, Drohne schwebt
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(0, 0, 8, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  const hy = -20 - Math.sin(f * 1.3) * 0.8;
  for (const [dx, dy] of [[-8, -1.5], [8, -1.5], [-5, 1.5], [5, 1.5]]) {
    limb(g, 0, hy, dx, hy + dy, 0.7, '#9aa4aa');
    g.fillStyle = 'rgba(200,215,225,0.55)';
    g.beginPath();
    g.ellipse(dx, hy + dy - 0.8, 4, 1, (f % 2) * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  ell(g, 0, hy, 4.2, 2.6, '#e2e8ec');
  ell(g, 0.8, hy + 0.8, 2.2, 1.2, '#2a3a44');
  dot(g, -2.6, hy - 0.6, 0.9, color);
  dot(g, 1.4, hy + 0.9, 0.5, 'rgba(120,230,255,0.95)');
  if (f === 6) limb(g, 2, hy + 1.6, 12, hy + 10, 0.8, 'rgba(140,240,255,0.95)');
}

/** Grabenspringer: Friese mit langem Springstock (Teller am Fuß). */
function springer(g: Ctx, color: string, f: number, fac: FactionId): void {
  shadowUnder(g, 5.5);
  const p = pose(f);
  const o = outfit('grabenspringer', fac, color);
  const work = f >= 5;
  const pole = () => {
    if (work) return;
    const walking = f >= 1 && f <= 4;
    const bx = walking ? 9 : 5.5, byy = walking ? -1 : 0.4;
    const tx = walking ? -4 : 3.6, ty = walking ? -34 : -36;
    limb(g, bx, byy, tx, ty, 1, '#9a7a4a');
    ell(g, bx, byy - 0.4, 1.6, 0.6, '#6b4a2c');
  };
  const s = figure(g, p, o.body, (hx, hy) => o.hat(g, hx, hy), pole);
  sashes(g, o, color, p.bob);
  const { sx, sy } = s;
  if (!work) frontArm(g, sx, sy, sx + 1.6, sy + 3, sx + 2.6, sy - 2, o.body.sleeve);
  else {
    const up = f === 5;
    const hx = up ? sx + 1 : sx + 4.5, hy = up ? sy - 4 : sy + 2.5;
    limb(g, up ? hx - 8 : hx - 6, up ? hy + 8 : hy - 4, up ? hx + 6 : hx + 12, up ? hy - 10 : hy + 5, 1, '#9a7a4a');
    frontArm(g, sx, sy, (sx + hx) / 2 + 0.5, (sy + hy) / 2 + 0.5, hx, hy, o.body.sleeve);
  }
}

interface HorseStyle {
  coat: string;
  mane: string;
  cloth: string;
  barding?: boolean;
}

function horseman(g: Ctx, color: string, f: number, type: UnitType, fac: FactionId): void {
  const heavy = type === 'gutsreiter';
  const hs: HorseStyle =
    heavy ? { coat: '#c8c4bc', mane: '#8a8680', cloth: color, barding: true }
    : fac === 'schwansen' ? { coat: '#b8b4ac', mane: '#6a6660', cloth: color }
    : fac === 'friesen' ? { coat: '#2a2420', mane: '#141010', cloth: color }
    : fac === 'daenen' ? { coat: '#5a3420', mane: '#20140c', cloth: color }
    : { coat: '#7a4a2a', mane: '#2e1d12', cloth: color };
  shadowUnder(g, 10);
  const gallop = f >= 1 && f <= 4;
  const ph = gallop ? ((f - 1) / 4) * Math.PI * 2 : 0;
  const lift = gallop ? Math.sin(ph) * 0.8 : 0;
  const coat = hs.coat;
  const by = -9.5 - lift;
  const legs: [number, number, number][] = [[-6.2, 0, -0.2], [-4.4, Math.PI, 0], [4.6, Math.PI * 0.5, -0.2], [6.3, Math.PI * 1.5, 0]];
  for (const [lx, off, dk] of legs) {
    const a = gallop ? Math.sin(ph + off) * 0.6 : 0;
    const kx = lx + Math.sin(a) * 2.5, ky = by + 4.5;
    const fx = kx + Math.sin(a * 1.4) * 2.2, fy = -Math.max(0, Math.cos(ph + off)) * (gallop ? 1.5 : 0);
    bent(g, lx, by + 1.5, kx, ky, fx, fy - 0.8, 1.4, shade(coat, dk - 0.1));
    ell(g, fx + 0.3, fy - 0.4, 0.9, 0.6, '#2a1d14');
    if (fac === 'friesen' && !heavy) ell(g, fx + 0.2, fy - 1.4, 1, 0.8, '#e8e4dc'); // Fesselbehang
  }
  g.strokeStyle = hs.mane;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-7.6, by - 1);
  g.quadraticCurveTo(-11, by + 1 + lift, -10, by + 6);
  g.stroke();
  const gr = g.createLinearGradient(0, by - 4, 0, by + 4);
  gr.addColorStop(0, shade(coat, 0.15));
  gr.addColorStop(1, shade(coat, -0.3));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, by, 8.2, 3.8, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(5.2, by - 2.6);
  g.lineTo(8.6, by - 9.5);
  g.lineTo(11.2, by - 9);
  g.lineTo(8.6, by + 0.6);
  g.closePath();
  g.fill();
  g.save();
  g.translate(11.2, by - 8.6);
  g.rotate(0.5);
  ell(g, 1.4, 0.5, 3.1, 1.4, shade(coat, 0.05));
  g.restore();
  g.fillStyle = shade(coat, 0.1);
  g.beginPath();
  g.moveTo(9.4, by - 10.2);
  g.lineTo(9.9, by - 12);
  g.lineTo(10.6, by - 10);
  g.fill();
  dot(g, 11.2, by - 9.2, 0.4, '#140d08');
  g.strokeStyle = hs.mane;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(5.6, by - 3.4);
  g.lineTo(9, by - 10.2);
  g.stroke();
  g.strokeStyle = '#3a2416';
  g.lineWidth = 0.4;
  g.beginPath();
  g.moveTo(12.6, by - 7.4);
  g.lineTo(9.5, by - 9.6);
  g.moveTo(12.6, by - 7.4);
  g.lineTo(3.8, by - 8.5);
  g.stroke();
  if (hs.barding) {
    // Schabracke: lange Decke in Spielerfarbe mit Borte
    g.fillStyle = hs.cloth;
    g.beginPath();
    g.moveTo(-8, by - 2.6);
    g.lineTo(6, by - 2.6);
    g.lineTo(6.6, by + 5);
    g.quadraticCurveTo(0, by + 6.4, -8.4, by + 5);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8d890';
    g.fillRect(-8.2, by + 4.3, 14.6, 0.7);
    for (let k = 0; k < 3; k++) dot(g, -5 + k * 4.5, by + 1.5, 0.9, '#e8d890');
  } else {
    g.fillStyle = hs.cloth;
    g.beginPath();
    g.moveTo(-3.8, by - 3.4);
    g.lineTo(3.4, by - 3.4);
    g.lineTo(3, by + 2.6);
    g.lineTo(-3.4, by + 2.6);
    g.closePath();
    g.fill();
    g.fillStyle = '#e8d890';
    g.fillRect(-3.4, by + 2, 6.4, 0.6);
  }
  // Reiter
  const ry = by - 3.2;
  bent(g, 0.2, ry, 1.6, ry + 3.4, 1.2, ry + 6, 1.8, heavy ? '#9aa0a6' : '#5a4a3a');
  ell(g, 1.6, ry + 6.1, 1.1, 0.6, '#2e2218');
  const cg = g.createLinearGradient(-2, 0, 2.5, 0);
  const rc = heavy ? '#b9bec4' : fac === 'friesen' ? '#3e5a78' : color;
  cg.addColorStop(0, shade(rc, 0.12));
  cg.addColorStop(1, shade(rc, -0.35));
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(-2.6, ry);
  g.lineTo(2.4, ry);
  g.lineTo(1.8, ry - 7.6);
  g.lineTo(-1.6, ry - 7.6);
  g.closePath();
  g.fill();
  g.fillStyle = shade(color, -0.35);
  g.beginPath();
  g.moveTo(-1.6, ry - 7.4);
  g.quadraticCurveTo(-5.5 - lift, ry - 4, -4.6, ry + 0.5);
  g.lineTo(-2.4, ry);
  g.closePath();
  g.fill();
  const hx = 0.3, hy = ry - 10;
  dot(g, hx, hy, 2.3, SKIN);
  dot(g, hx + 1.2, hy - 0.3, 0.35, '#2a1d14');
  const hat = heavy ? hats.topfhelm(color) : fac === 'schwansen' ? hats.barett('#2f4a32', color) : fac === 'friesen' ? hats.strick(color) : fac === 'daenen' ? hats.kessel(color) : hats.breit('#f2ecd8');
  hat(g, hx, hy);
  const armC = heavy ? '#9aa0a6' : shade(rc, -0.2);
  if (heavy) {
    // Lanze mit Wimpel
    const att = f >= 5;
    const lx0 = att ? -6 : -3, ly0 = att ? ry - 4 : ry - 2;
    const lx1 = att ? 22 : 10, ly1 = att ? ry - 6 : ry - 26;
    limb(g, lx0, ly0, lx1, ly1, 0.9, '#8a6a44');
    pikeHead(g, lx1, ly1, Math.atan2(ly1 - ly0, lx1 - lx0) + Math.PI / 2, 'spitze');
    const wx = lx0 + (lx1 - lx0) * 0.8, wy = ly0 + (ly1 - ly0) * 0.8;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(wx, wy);
    g.lineTo(wx - 4, wy + 1.2);
    g.lineTo(wx - 0.6, wy + 2.4);
    g.closePath();
    g.fill();
    bent(g, 1.6, ry - 6.4, 3, ry - 4, (lx0 + lx1) / 2 - 2, (ly0 + ly1) / 2 + 0.5, 1.6, armC);
  } else if (f >= 5) {
    const up = f === 5;
    const ex = up ? hx + 1.5 : hx + 6, ey = up ? hy - 3 : hy + 4.5;
    bent(g, 1.6, ry - 6.4, (1.6 + ex) / 2 + 0.6, (ry - 6.4 + ey) / 2, ex, ey, 1.6, armC);
    limb(g, ex, ey, ex + (up ? -1 : 6), ey + (up ? -6 : 1.5), 0.7, '#c8ccd0');
  } else {
    bent(g, 1.6, ry - 6.4, 3.4, ry - 3.6, 5.2, ry - 3.4, 1.6, armC);
    limb(g, 5.2, ry - 3.4, 12.4, by - 7.6, 0.35, '#3a2416');
  }
}

function drawUnit(g: Ctx, type: UnitType, color: string, f: number, fac: FactionId): void {
  switch (type) {
    case 'arbeiter': return worker(g, color, f, fac);
    case 'landsknecht':
    case 'knickwaechter': return infantry(g, color, f, type, fac);
    case 'schuetze':
    case 'musketier':
    case 'fuesilier':
    case 'infanterist':
    case 'exosoldat': return ranged(g, color, f, type, fac);
    case 'kanone': return kanone(g, color, f);
    case 'panzer': return panzer(g, color, f);
    case 'drohne': return drohne(g, color, f);
    case 'grabenspringer': return springer(g, color, f, fac);
    case 'spaeher':
    case 'gutsreiter': return horseman(g, color, f, type, fac);
  }
}

/** Zeichnet eine Figur und legt eine dunkle Kontur darum (klassische Sprite-Lesbarkeit). */
function renderFrame(type: UnitType, color: string, f: number, fac: FactionId): Sprite {
  const R = UNIT_RES;
  const [fig, fg] = canvas(W1 * R, H1 * R);
  fg.scale(R, R);
  fg.translate(AX, AY);
  drawUnit(fg, type, color, f, fac);
  const [out, og] = canvas(W1 * R, H1 * R);
  const [sil, sg] = canvas(W1 * R, H1 * R);
  sg.drawImage(fig, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = 'rgba(28,20,12,0.85)';
  sg.fillRect(0, 0, sil.width, sil.height);
  const o = Math.max(1, Math.round(R * 0.45));
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) og.drawImage(sil, dx, dy);
  og.drawImage(fig, 0, 0);
  return { c: out, ax: AX, ay: AY, res: R };
}

const cache = new Map<string, Sprite[]>();
export function unitSprites(type: UnitType, color: string, fac: FactionId = 'angeln'): Sprite[] {
  const k = `${type}|${color}|${fac}`;
  let arr = cache.get(k);
  if (!arr) {
    arr = [];
    for (let f = 0; f < UNIT_FRAMES; f++) arr.push(renderFrame(type, color, f, fac));
    cache.set(k, arr);
  }
  return arr;
}

/** Frame-Auswahl für Animationen (gemeinsam für beide Renderer). */
export function unitFrame(anim: number, now: number, id: number): number {
  if (anim === 1) return 1 + (Math.floor(now / 130 + id) % 4);
  if (anim === 2 || anim === 3) return 5 + (Math.floor(now / (anim === 3 ? 260 : 320) + id) % 2);
  return 0;
}
