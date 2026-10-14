// Gemeinsame, rendererunabhängige Darstellungslogik: Kamera, Koordinaten, Effekte, Auswahl (Picking), Nebelbild.
// Konkrete Renderer: CanvasRenderer (Canvas 2D, Rückfallebene) und PixiRenderer (WebGL via PixiJS).
import { RULES, UNITS, type BuildingType } from '../data/defs';
import type { CBuilding, ClientState } from '../game/client';
import { T, isWater } from '../sim/map';
import { TH, TW } from './draw';
import { NEUTRAL_COLOR, PLAYER_COLORS } from './sprites';

export interface Camera {
  x: number; // Bildmitte in Iso-Pixeln (Zoom 1)
  y: number;
  z: number;
}

export interface Placement {
  type: BuildingType;
  x: number;
  y: number;
  valid: boolean;
}

export interface UIOverlay {
  selected: Set<number>;
  placement: Placement | null;
  drag: { x0: number; y0: number; x1: number; y1: number } | null;
  hover: number;
}

export interface Effect {
  k: 'shot' | 'ring' | 'die' | 'text' | 'dust';
  x: number;
  y: number;
  tx?: number;
  ty?: number;
  t0: number;
  dur: number;
  color?: string;
  text?: string;
  r?: number;
}

export const enum OK {
  Tree,
  Knick,
  Gate,
  Building,
  Unit,
  MoorSite,
}

export const UNIT_SCALE = 1.25;

export function playerColor(c: ClientState, owner: number): string {
  if (owner < 0) return NEUTRAL_COLOR;
  const p = c.players[owner];
  return PLAYER_COLORS[(p?.color ?? owner) % PLAYER_COLORS.length];
}


export abstract class BaseRenderer {
  cam: Camera = { x: 0, y: 0, z: 1 };
  vw = 0;
  vh = 0;
  playTop = 0;
  playBottom: number | null = null;
  get centerY(): number { return (this.playTop + (this.playBottom ?? this.vh)) / 2; }
  setPlayArea(top: number, bottom: number): void {
    this.playTop = Math.max(0, top);
    this.playBottom = Math.max(this.playTop, Math.min(this.vh, bottom));
  }
  dpr = 1;
  protected effects: Effect[] = [];
  protected fenceCache = new Map<number, [number, number, number, number][]>();
  readonly fog: HTMLCanvasElement;
  private fogG: CanvasRenderingContext2D;
  private fogImg: ImageData;
  protected fogVersion = -1;
  stats = { frameMs: 0, drawn: 0, sceneMs: 0, submitMs: 0 };
  abstract readonly kind: 'canvas' | 'webgl';

  constructor(readonly canvas: HTMLCanvasElement, readonly c: ClientState) {
    const { w, h } = c.map;
    this.fog = document.createElement('canvas');
    this.fog.width = w;
    this.fog.height = h;
    this.fogG = this.fog.getContext('2d')!;
    this.fogImg = this.fogG.createImageData(w, h);
  }

  abstract resize(w: number, h: number): void;
  abstract frame(now: number, ui: UIOverlay): void;
  destroy(): void {}

  // ---------------------------------------------------------------- Koordinaten
  toScreen(tx: number, ty: number): [number, number] {
    const ix = (tx - ty) * (TW / 2), iy = (tx + ty) * (TH / 2);
    return [(ix - this.cam.x) * this.cam.z + this.vw / 2, (iy - this.cam.y) * this.cam.z + this.centerY];
  }
  toTile(sx: number, sy: number): [number, number] {
    const ix = (sx - this.vw / 2) / this.cam.z + this.cam.x;
    const iy = (sy - this.centerY) / this.cam.z + this.cam.y;
    return [(ix / (TW / 2) + iy / (TH / 2)) / 2, (iy / (TH / 2) - ix / (TW / 2)) / 2];
  }
  centerOn(tx: number, ty: number): void {
    this.cam.x = (tx - ty) * (TW / 2);
    this.cam.y = (tx + ty) * (TH / 2);
    this.clampCam();
  }
  clampCam(): void {
    const { w, h } = this.c.map;
    this.cam.x = Math.max(-h * (TW / 2), Math.min(w * (TW / 2), this.cam.x));
    this.cam.y = Math.max(0, Math.min((w + h) * (TH / 2), this.cam.y));
  }
  zoomAt(sx: number, sy: number, factor: number): void {
    const [tx, ty] = this.toTile(sx, sy);
    this.cam.z = Math.max(0.5, Math.min(2, this.cam.z * factor));
    const [nx, ny] = this.toTile(sx, sy);
    this.cam.x += ((tx - ty) - (nx - ny)) * (TW / 2);
    this.cam.y += ((tx + ty) - (nx + ny)) * (TH / 2);
    this.clampCam();
  }

  // ---------------------------------------------------------------- Effekte
  addEffect(e: Effect): void {
    if (this.effects.length < 400) this.effects.push(e);
  }
  marker(x: number, y: number, color: string, now: number): void {
    this.addEffect({ k: 'ring', x, y, t0: now, dur: 600, color });
  }
  floatText(x: number, y: number, text: string, color: string, now: number): void {
    this.addEffect({ k: 'text', x, y, t0: now, dur: 1800, text, color });
  }
  shot(x: number, y: number, tx: number, ty: number, now: number, kind: 0 | 1 | 2 | 3 | 4): void {
    const d = Math.hypot(tx - x, ty - y);
    const dur = kind === 2 ? 60 + d * 12 : kind === 4 ? 160 : kind === 3 ? 200 + d * 40 : 120 + d * 60;
    this.addEffect({ k: 'shot', x, y, tx, ty, t0: now, dur, r: kind });
    if (kind === 3) this.addEffect({ k: 'dust', x: tx, y: ty, t0: now + dur, dur: 1400 });
    if (kind === 2 || kind === 3) this.addEffect({ k: 'dust', x: x + (tx - x) * 0.08, y: y + (ty - y) * 0.08, t0: now, dur: 1200, r: 2 });
  }
  death(x: number, y: number, unit: boolean, now: number): void {
    this.addEffect({ k: unit ? 'die' : 'dust', x, y, t0: now, dur: unit ? 3500 : 2500 });
  }


  /** Grabenspringer schweben beim Sprung über einen Knick (Pixel nach oben). */
  protected hop(u: { t: string; x: number; y: number }, now: number): number {
    if (u.t !== 'grabenspringer') return 0;
    const m = this.c.map;
    const i = Math.floor(u.y) * m.w + Math.floor(u.x);
    if (m.terrain[i] !== T.KNICK) return 0;
    const fx = u.x - Math.floor(u.x), fy = u.y - Math.floor(u.y);
    void now;
    return 14 * Math.sin(Math.PI * Math.min(1, Math.max(0, (fx + fy) / 2)));
  }

  protected pruneEffects(now: number): void {
    this.effects = this.effects.filter((e) => now - e.t0 < e.dur);
  }

  /** Nebelbild (1 Pixel je Kachel) aus der Sichtbarkeit aktualisieren; true wenn neu. */
  protected refreshFog(): boolean {
    if (this.fogVersion === this.c.visVersion) return false;
    const v = this.c.vis;
    const d = this.fogImg.data;
    for (let i = 0; i < v.length; i++) {
      d[i * 4] = 11;
      d[i * 4 + 1] = 13;
      d[i * 4 + 2] = 8;
      d[i * 4 + 3] = v[i] === 0 ? 255 : v[i] === 1 ? 120 : 0;
    }
    this.fogG.putImageData(this.fogImg, 0, 0);
    this.fogVersion = this.c.visVersion;
    return true;
  }

  /** Trichterförmige Flechtzäune des Heringszauns, vom Ufer ins Wasser (Kachelkoordinaten). */
  protected fences(b: CBuilding): [number, number, number, number][] {
    let fences = this.fenceCache.get(b.i);
    if (fences) return fences;
    const m = this.c.map;
    let wx = 0, wy = 0;
    for (let dy = -2; dy <= 3; dy++)
      for (let dx = -2; dx <= 3; dx++) {
        const x = b.x + dx, y = b.y + dy;
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        if (isWater(m.terrain[y * m.w + x])) {
          wx += dx - 0.5;
          wy += dy - 0.5;
        }
      }
    const l = Math.hypot(wx, wy) || 1;
    wx /= l;
    wy /= l;
    const cx = b.x + 1 + wx * 1.1, cy = b.y + 1 + wy * 1.1;
    const px = -wy, py = wx;
    const tipX = cx + wx * 2.6, tipY = cy + wy * 2.6;
    fences = [
      [cx + px * 1.4, cy + py * 1.4, tipX, tipY],
      [cx - px * 1.4, cy - py * 1.4, tipX, tipY],
      [tipX, tipY, tipX + wx * 1.2 + px * 0.6, tipY + wy * 1.2 + py * 0.6],
      [tipX, tipY, tipX + wx * 1.2 - px * 0.6, tipY + wy * 1.2 - py * 0.6],
    ];
    this.fenceCache.set(b.i, fences);
    return fences;
  }

  /** Objekt unter dem Mauszeiger: Einheit (nach Sprite-Box) oder Gebäude (nach Kachel). */
  pick(sx: number, sy: number, now: number, tolerance = 0): number {
    const c = this.c, z = this.cam.z;
    const alpha = Math.min(1, Math.max(0, (now - c.snapTime) / (1000 / RULES.tickRate)));
    let best = 0, bd = Infinity;
    for (const u of c.units.values()) {
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      const [px, py] = this.toScreen(ux, uy);
      const hw = ((UNITS[u.t].mounted || UNITS[u.t].vehicle) ? 14 : 9) * z * UNIT_SCALE, hh = ((UNITS[u.t].mounted || UNITS[u.t].vehicle) ? 30 : 26) * z * UNIT_SCALE;
      if (sx >= px - hw - tolerance && sx <= px + hw + tolerance && sy >= py - hh - tolerance && sy <= py + 4 * z + tolerance) {
        const d = Math.abs(sx - px) + Math.abs(sy - (py - hh / 2));
        if (d < bd) {
          bd = d;
          best = u.i;
        }
      }
    }
    if (best) return best;
    const [tx, ty] = this.toTile(sx, sy);
    const x = Math.floor(tx), y = Math.floor(ty);
    if (x >= 0 && y >= 0 && x < c.map.w && y < c.map.h) {
      const id = c.occ[y * c.map.w + x];
      if (id) return id;
    }
    // Gebäude auch über ihre Höhe anklickbar (Kachel unterhalb prüfen)
    for (let k = 1; k <= 2; k++) {
      const xx = Math.floor(tx + k * 0.7), yy = Math.floor(ty + k * 0.7);
      if (xx >= 0 && yy >= 0 && xx < c.map.w && yy < c.map.h) {
        const id = c.occ[yy * c.map.w + xx];
        if (id) return id;
      }
    }
    return 0;
  }
}
