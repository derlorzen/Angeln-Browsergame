// Detaillierte Einheiten-Sprites: hoch aufgelöst gezeichnet, mit Kontur, Schattierung und Gehzyklus.
// Koordinaten in 1x-Pixeln, Fußpunkt (0,0); Figuren blicken nach rechts (Spiegelung im Renderer).
import type { UnitType } from '../data/defs';
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

// ------------------------------------------------------------------ einzelne Einheiten
function worker(g: Ctx, color: string, f: number): void {
  shadowUnder(g, 5.5);
  const p = pose(f);
  const work = f >= 5;
  const b: Body = { coat: '#7a5a3a', sleeve: '#d6c9a8', legL: '#6b6253', legR: '#6b6253', boot: '#3b2a1c', belt: '#4a3420', hair: '#6b4a2a' };
  // geschulterte Axt hinter dem Körper
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
  const s = figure(g, p, b, (hx, hy) => {
    // Zipfelmütze in Spielerfarbe
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(hx - 2.8, hy - 0.4);
    g.quadraticCurveTo(hx - 0.5, hy - 4.6, hx + 2.7, hy - 0.8);
    g.quadraticCurveTo(hx - 1.5, hy - 2.6, hx - 4.6, hy + 1.6);
    g.closePath();
    g.fill();
    g.fillStyle = shade(color, -0.3);
    g.fillRect(hx - 2.8, hy - 1.1, 5.6, 1);
    dot(g, hx - 4.6, hy + 1.6, 0.7, shade(color, 0.3));
  }, axe);
  // Schürze/Kittelsaum
  g.fillStyle = '#c8b994';
  g.fillRect(-1.6, -12.2 - p.bob, 3.4, 3.2);
  const { sx, sy } = s;
  if (!work) {
    // Hand hält den Axtstiel vor der Brust
    frontArm(g, sx, sy, sx + 2.2, sy + 3, sx + 3.4, sy + 3.2, b.sleeve);
  } else {
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
    frontArm(g, sx, sy, up ? sx + 1.6 : sx + 3.2, up ? sy - 3 : sy + 1.5, hx, hy, b.sleeve);
    if (!up) {
      // Späne
      dot(g, tx + 2, ty - 1.5, 0.45, '#d9b878');
      dot(g, tx + 3.2, ty - 0.2, 0.35, '#d9b878');
    }
  }
}

function landsknecht(g: Ctx, color: string, f: number): void {
  shadowUnder(g, 6);
  const p = pose(f);
  const work = f >= 5;
  const cream = '#efe6cc';
  const b: Body = { coat: color, coat2: cream, sleeve: color, legL: color, legR: cream, boot: '#2e2218', belt: '#2a2018', puffy: true, beard: '#7a5634', hair: '#7a5634' };
  // Spieß hinter dem Körper beim Gehen/Stehen
  const pikeIdle = () => {
    if (work) return;
    const walking = f >= 1 && f <= 4;
    const bx = walking ? -6 : 4.8, byy = walking ? -21 : 0.5;
    const tx = walking ? 13 : 7.2, ty = walking ? -38 : -40;
    limb(g, bx, byy, tx, ty, 0.9, '#8a6a44');
    g.fillStyle = '#c4c9ce';
    g.save();
    g.translate(tx, ty);
    g.rotate(Math.atan2(ty - byy, tx - bx) + Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -3.2);
    g.lineTo(0.9, 0);
    g.lineTo(-0.9, 0);
    g.closePath();
    g.fill();
    g.restore();
    dot(g, tx - (tx - bx) * 0.06, ty - (ty - byy) * 0.06, 0.8, color); // Quaste
  };
  const s = figure(g, p, b, (hx, hy) => {
    // Morion mit Kamm und Federbusch
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
    // Federn
    for (const [dx, col] of [[-0.6, cream], [0.4, color], [1.2, cream]] as [number, string][]) {
      g.strokeStyle = col;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(hx + dx, hy - 4.6);
      g.quadraticCurveTo(hx + dx - 2, hy - 8, hx + dx - 4.4, hy - 6.2);
      g.stroke();
    }
  }, pikeIdle);
  const { sx, sy } = s;
  if (!work) {
    const walking = f >= 1 && f <= 4;
    frontArm(g, sx, sy, sx + 1.8, sy + 3.2, walking ? sx + 0.8 : sx + 2.9, walking ? sy - 1.5 : sy + 4.8, b.sleeve, true);
  } else {
    // Stoß mit dem Spieß: Ausholen (5) und Stechen (6)
    const thrust = f === 6 ? 5 : 0;
    const bx = -9 + thrust, byy = sy + 3;
    const tx = 17 + thrust, ty = sy - 2;
    limb(g, bx, byy, tx, ty, 0.9, '#8a6a44');
    g.fillStyle = '#c4c9ce';
    g.beginPath();
    g.moveTo(tx + 3.4, ty - 0.7);
    g.lineTo(tx, ty - 1);
    g.lineTo(tx, ty + 0.8);
    g.closePath();
    g.fill();
    dot(g, tx - 1, ty, 0.8, color);
    frontArm(g, sx, sy, sx + 2.4, sy + 2.2, sx + 4.5 + thrust * 0.6, sy + 1.6, b.sleeve, true);
  }
}

function schuetze(g: Ctx, color: string, f: number): void {
  shadowUnder(g, 5.5);
  const p = pose(f);
  const aim = f >= 5;
  const b: Body = { coat: '#8a6a44', sleeve: '#6e5a40', legL: '#5a5a4a', legR: '#5a5a4a', boot: '#33261a', belt: '#3a2a1a', hair: '#4a3420' };
  const quiver = () => {
    // Köcher mit Bolzen auf dem Rücken
    g.save();
    g.translate(-3.2, -15 - p.bob);
    g.rotate(-0.35);
    g.fillStyle = '#5a3d22';
    g.fillRect(-1.1, -2, 2.2, 7);
    for (const dx of [-0.6, 0, 0.6]) {
      limb(g, dx, -2, dx, -4, 0.35, '#d8c8a0');
      dot(g, dx, -4.2, 0.45, color);
    }
    g.restore();
  };
  const s = figure(g, p, b, (hx, hy) => {
    // Barett mit Feder in Spielerfarbe
    ell(g, hx - 0.2, hy - 2, 3.8, 1.4, color, -0.12);
    ell(g, hx - 0.2, hy - 2.8, 2.6, 1.3, shade(color, -0.15));
    g.strokeStyle = '#f2ecd8';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(hx - 1.5, hy - 3.2);
    g.quadraticCurveTo(hx - 4.8, hy - 6.5, hx - 6.2, hy - 3.6);
    g.stroke();
  }, quiver);
  // Schärpe in Spielerfarbe
  g.strokeStyle = color;
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(-2.8, -18 - p.bob);
  g.lineTo(3, -11 - p.bob);
  g.stroke();
  const { sx, sy } = s;
  // Armbrust
  const cbx = aim ? sx + 2.5 : sx + 1.5, cby = aim ? sy - 0.3 : sy + 4;
  const ang = aim ? -0.05 : -0.55;
  g.save();
  g.translate(cbx, cby);
  g.rotate(ang);
  g.fillStyle = '#6b4a2c';
  g.fillRect(-2.5, -0.6, 9, 1.3); // Säule
  g.strokeStyle = '#3a2f26';
  g.lineWidth = 0.9;
  g.beginPath();
  g.arc(5.6, 0, 3.4, -Math.PI / 2, Math.PI / 2); // Bogen
  g.stroke();
  g.strokeStyle = '#ddd5c0';
  g.lineWidth = 0.35;
  g.beginPath();
  g.moveTo(5.6, -3.4);
  g.lineTo(f === 6 ? 5.2 : 1.6, 0);
  g.lineTo(5.6, 3.4);
  g.stroke();
  limb(g, 7.6, 0, 8.6, 0, 0.6, '#5a5a5a'); // Spannbügel
  if (f === 5) limb(g, 1.6, -0.2, 6, -0.2, 0.5, '#9a8a6a'); // eingelegter Bolzen
  g.restore();
  frontArm(g, sx, sy, sx + (aim ? 2.2 : 1.6), sy + (aim ? 1 : 3.2), cbx + 1, cby + 0.6, b.sleeve);
}

function spaeher(g: Ctx, color: string, f: number): void {
  shadowUnder(g, 10);
  const gallop = f >= 1 && f <= 4;
  const ph = gallop ? ((f - 1) / 4) * Math.PI * 2 : 0;
  const lift = gallop ? Math.sin(ph) * 0.8 : 0;
  const coat = '#7a4a2a';
  const by = -9.5 - lift;
  // Beine (hinten dunkler)
  const legs: [number, number, number][] = [
    [-6.2, 0, -0.2], [-4.4, Math.PI, 0], [4.6, Math.PI * 0.5, -0.2], [6.3, Math.PI * 1.5, 0],
  ];
  for (const [lx, off, dk] of legs) {
    const a = gallop ? Math.sin(ph + off) * 0.6 : 0;
    const kx = lx + Math.sin(a) * 2.5, ky = by + 4.5;
    const fx = kx + Math.sin(a * 1.4) * 2.2, fy = -Math.max(0, Math.cos(ph + off)) * (gallop ? 1.5 : 0);
    bent(g, lx, by + 1.5, kx, ky, fx, fy - 0.8, 1.4, shade(coat, dk - 0.1));
    ell(g, fx + 0.3, fy - 0.4, 0.9, 0.6, '#2a1d14');
  }
  // Schweif
  g.strokeStyle = '#2e1d12';
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(-7.6, by - 1);
  g.quadraticCurveTo(-11, by + 1 + lift, -10, by + 6);
  g.stroke();
  // Rumpf
  const gr = g.createLinearGradient(0, by - 4, 0, by + 4);
  gr.addColorStop(0, shade(coat, 0.15));
  gr.addColorStop(1, shade(coat, -0.3));
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(0, by, 8.2, 3.8, 0, 0, Math.PI * 2);
  g.fill();
  // Hals und Kopf
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
  dot(g, 11.2, by - 9.2, 0.4, '#140d08'); // Auge
  // Mähne
  g.strokeStyle = '#2e1d12';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(5.6, by - 3.4);
  g.lineTo(9, by - 10.2);
  g.stroke();
  // Zaumzeug
  g.strokeStyle = '#3a2416';
  g.lineWidth = 0.4;
  g.beginPath();
  g.moveTo(12.6, by - 7.4);
  g.lineTo(9.5, by - 9.6);
  g.moveTo(12.6, by - 7.4);
  g.lineTo(3.8, by - 8.5);
  g.stroke();
  // Satteldecke in Spielerfarbe mit Borte
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(-3.8, by - 3.4);
  g.lineTo(3.4, by - 3.4);
  g.lineTo(3, by + 2.6);
  g.lineTo(-3.4, by + 2.6);
  g.closePath();
  g.fill();
  g.fillStyle = '#e8d890';
  g.fillRect(-3.4, by + 2, 6.4, 0.6);
  // Reiter
  const ry = by - 3.2;
  bent(g, 0.2, ry, 1.6, ry + 3.4, 1.2, ry + 6, 1.8, '#5a4a3a'); // Bein
  ell(g, 1.6, ry + 6.1, 1.1, 0.6, '#2e2218');
  const cg = g.createLinearGradient(-2, 0, 2.5, 0);
  cg.addColorStop(0, shade(color, 0.1));
  cg.addColorStop(1, shade(color, -0.35));
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(-2.6, ry);
  g.lineTo(2.4, ry);
  g.lineTo(1.8, ry - 7.6);
  g.lineTo(-1.6, ry - 7.6);
  g.closePath();
  g.fill();
  // Umhang
  g.fillStyle = shade(color, -0.4);
  g.beginPath();
  g.moveTo(-1.6, ry - 7.4);
  g.quadraticCurveTo(-5.5 - lift, ry - 4, -4.6, ry + 0.5);
  g.lineTo(-2.4, ry);
  g.closePath();
  g.fill();
  const hx = 0.3, hy = ry - 10;
  dot(g, hx, hy, 2.3, SKIN);
  dot(g, hx + 1.2, hy - 0.3, 0.35, '#2a1d14');
  // Hut mit breiter Krempe und Feder
  ell(g, hx, hy - 1.6, 3.8, 1.1, '#2e2a26');
  ell(g, hx - 0.1, hy - 2.6, 2.2, 1.4, '#3a3530');
  g.strokeStyle = '#f2ecd8';
  g.lineWidth = 0.7;
  g.beginPath();
  g.moveTo(hx - 1.6, hy - 3);
  g.quadraticCurveTo(hx - 4.5, hy - 6, hx - 5.4, hy - 2.6);
  g.stroke();
  // Arm mit Zügeln bzw. Säbel
  if (f >= 5) {
    const up = f === 5;
    const ex = up ? hx + 1.5 : hx + 6, ey = up ? hy - 3 : hy + 4.5;
    bent(g, 1.6, ry - 6.4, (1.6 + ex) / 2 + 0.6, (ry - 6.4 + ey) / 2, ex, ey, 1.6, shade(color, -0.2));
    limb(g, ex, ey, ex + (up ? -1 : 6), ey + (up ? -6 : 1.5), 0.7, '#c8ccd0');
  } else {
    bent(g, 1.6, ry - 6.4, 3.4, ry - 3.6, 5.2, ry - 3.4, 1.6, shade(color, -0.2));
    limb(g, 5.2, ry - 3.4, 12.4, by - 7.6, 0.35, '#3a2416');
  }
}

const DRAW: Record<UnitType, (g: Ctx, color: string, f: number) => void> = {
  arbeiter: worker,
  landsknecht,
  schuetze,
  spaeher,
};

/** Zeichnet eine Figur und legt eine dunkle Kontur darum (klassische Sprite-Lesbarkeit). */
function renderFrame(type: UnitType, color: string, f: number): Sprite {
  const R = UNIT_RES;
  const [fig, fg] = canvas(W1 * R, H1 * R);
  fg.scale(R, R);
  fg.translate(AX, AY);
  DRAW[type](fg, color, f);
  const [out, og] = canvas(W1 * R, H1 * R);
  // Kontur: Silhouette eingefärbt und versetzt
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
export function unitSprites(type: UnitType, color: string): Sprite[] {
  const k = type + color;
  let arr = cache.get(k);
  if (!arr) {
    arr = [];
    for (let f = 0; f < UNIT_FRAMES; f++) arr.push(renderFrame(type, color, f));
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
