// Dezente Geländehinweise: Nach kurzem Verweilen der Maus über erkundetem Gelände erscheint ein kleiner Text.
import { T } from '../sim/map';
import type { ClientState } from '../game/client';

const TERRAIN: Record<number, string> = {
  [T.GRAS]: 'Wiese · bebaubar',
  [T.WASSER]: 'Tiefes Wasser · unpassierbar',
  [T.FLACH]: 'Flachwasser · unpassierbar, Fischgrund',
  [T.UFER]: 'Ufer · Platz für den Heringszaun',
  [T.MOOR]: 'Moor · langsam, nicht bebaubar',
  [T.WEG]: 'Weg · schnelles Vorankommen',
  [T.KNICK]: 'Knick (Wallhecke) · versperrt Weg und Sicht',
  [T.LEHM]: 'Lehmboden · für die Lehmgrube',
  [T.TOR]: 'Durchlass · Tor bzw. Stöpe',
  [T.HEIDE]: 'Heide · bebaubar, etwas langsamer',
  [T.WATT]: 'Watt · begehbar, aber sehr langsam',
  [T.GRABEN]: 'Graben · versperrt den Weg, nicht die Sicht',
  [T.DEICH]: 'Deich · versperrt Weg und Sicht',
  [T.WALL]: 'Danewerk · alter Grenzwall, nur Tore führen hindurch',
};

/** Kurzer Hinweistext für eine Kachel oder null (unerforscht, außerhalb). */
export function terrainHint(c: ClientState, tx: number, ty: number): string | null {
  const m = c.map;
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return null;
  const i = ty * m.w + tx;
  if (!c.vis[i]) return null;
  let text: string;
  if (c.trees[i]) text = `Wald · ${c.trees[i]} Holz`;
  else if (c.fieldOcc[i]) text = 'Acker eines Bauernhofs';
  else text = TERRAIN[m.terrain[i]] ?? '';
  if (!text) return null;
  // nächstgelegener Ortsname als dezente Ortsangabe
  let best: string | null = null, bd = 7 * 7;
  for (const l of m.labels) {
    const d = (l.x - tx) ** 2 + (l.y - ty) ** 2;
    if (d < bd) {
      bd = d;
      best = l.name;
    }
  }
  return best ? `${text} — bei ${best}` : text;
}
