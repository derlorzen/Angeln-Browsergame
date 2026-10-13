// Gemeinsame Regeln, die Simulation UND Bauvorschau im Client verwenden.
import { BUILDINGS, RULES, type BuildingType } from '../data/defs';
import { T, isWater, type GameMap } from './map';

export interface PlacementView {
  map: GameMap;
  trees: Uint8Array;
  /** Kachel durch Gebäude oder Feld belegt (soweit bekannt) */
  occupied(i: number): boolean;
  explored(i: number): boolean;
  ownBuildings: { x: number; y: number; w: number; h: number; type: BuildingType; built: boolean }[];
}

const BUILDABLE = new Set<number>([T.GRAS, T.LEHM, T.UFER]);

/** Liefert null bei gültigem Bauplatz, sonst eine verständliche Begründung. */
export function checkPlacement(v: PlacementView, type: BuildingType, x: number, y: number): string | null {
  const def = BUILDINGS[type];
  if (!def.buildable) return 'Dieses Gebäude kann nicht gebaut werden.';
  const { map } = v;
  if (x < 1 || y < 1 || x + def.w > map.w - 1 || y + def.h > map.h - 1) return 'Außerhalb der Karte.';
  for (const r of def.requires ?? [])
    if (!v.ownBuildings.some((b) => b.type === r && b.built)) return `Benötigt zuerst: ${BUILDINGS[r].name}.`;
  let lehm = 0;
  for (let dy = 0; dy < def.h; dy++)
    for (let dx = 0; dx < def.w; dx++) {
      const i = (y + dy) * map.w + x + dx;
      if (!v.explored(i)) return 'Gelände ist noch unerforscht.';
      const t = map.terrain[i];
      if (t === T.WEG || t === T.TOR) return 'Nicht auf Wegen bauen.';
      if (t === T.MOOR) return 'Im Moor kann nicht gebaut werden.';
      if (t === T.KNICK) return 'Ein Knick versperrt den Platz.';
      if (isWater(t)) return type === 'heringszaun' ? 'Der Heringszaun steht am Ufer, nicht im tiefen Wasser.' : 'Nicht im Wasser bauen.';
      if (!BUILDABLE.has(t)) return 'Ungeeigneter Boden.';
      if (v.trees[i]) return 'Bäume im Weg – erst Holz schlagen.';
      if (v.occupied(i)) return 'Platz ist belegt.';
      if (t === T.LEHM) lehm++;
    }
  if (def.placement === 'lehm' && lehm < 2) return 'Benötigt Lehmboden (braune Flächen).';
  if (def.placement === 'ufer') {
    let water = 0;
    for (let dy = -1; dy <= def.h; dy++)
      for (let dx = -1; dx <= def.w; dx++) {
        const px = x + dx, py = y + dy;
        if (px < 0 || py < 0 || px >= map.w || py >= map.h) continue;
        if (isWater(map.terrain[py * map.w + px])) water++;
      }
    if (water < 3) return 'Nur direkt am Ufer der Schlei baubar.';
  }
  const cx = x + def.w / 2, cy = y + def.h / 2;
  const near = v.ownBuildings.some((b) => {
    if (!b.built) return false;
    const bx = Math.max(b.x, Math.min(cx, b.x + b.w)), by = Math.max(b.y, Math.min(cy, b.y + b.h));
    return Math.hypot(cx - bx, cy - by) <= RULES.buildRadius;
  });
  if (!near) return `Zu weit von der eigenen Siedlung (max. ${RULES.buildRadius} Kacheln von fertigen Gebäuden).`;
  return null;
}

export interface VisionSource {
  x: number;
  y: number;
  r: number;
}

/**
 * Berechnet Sichtbarkeit: 0 unerforscht, 1 erforscht, 2 sichtbar.
 * Knicks sind Sichtbarrieren: Kacheln hinter einem Knick bleiben verborgen.
 */
export function computeVisibility(map: GameMap, sources: VisionSource[], vis: Uint8Array): void {
  for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
  const { w, h, terrain } = map;
  for (const s of sources) {
    const sx = Math.floor(s.x), sy = Math.floor(s.y);
    const r = s.r, r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      const ty = sy + dy;
      if (ty < 0 || ty >= h) continue;
      for (let dx = -r; dx <= r; dx++) {
        const tx = sx + dx;
        if (tx < 0 || tx >= w) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = ty * w + tx;
        if (vis[i] === 2) continue;
        if (losClear(terrain, w, sx, sy, tx, ty)) vis[i] = 2;
      }
    }
  }
}

function losClear(terrain: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): boolean {
  // Bresenham; Start- und Zielkachel zählen nicht als Hindernis
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  for (;;) {
    if (x === x1 && y === y1) return true;
    if ((x !== x0 || y !== y0) && terrain[y * w + x] === T.KNICK) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}
