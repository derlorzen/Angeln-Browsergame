// Kartengenerator: spielerische, vereinfachte Interpretationen echter Landschaften zwischen Rendsburg und Esbjerg.
// Ausrichtung: Norden oben. Kachel (0,0) ist die Nordspitze der isometrischen Raute; "Ost" = x − y, "Süd" = x + y.
// Ablauf: Kartenmaler (je Karte) → Ufer → Lehm/Wald → Wege → Knicks/Gräben → Deiche/Wälle → Fairnessausgleich.
import { Rng, makeNoise } from './rng';
import { MinHeap } from './heap';

export const T = {
  GRAS: 0,
  WASSER: 1,
  FLACH: 2,
  UFER: 3,
  MOOR: 4,
  WEG: 5,
  KNICK: 6,
  LEHM: 7,
  TOR: 8,
  HEIDE: 9,
  WATT: 10,
  GRABEN: 11,
  DEICH: 12,
  WALL: 13,
} as const;
export type Terrain = (typeof T)[keyof typeof T];

export interface Slot {
  name: string;
  x: number; // Dorfzentrum oben-links
  y: number;
}

export interface MapSite {
  x: number;
  y: number;
  name: string;
  text: string;
}

export interface GameMap {
  id: MapId;
  name: string;
  w: number;
  h: number;
  seed: number;
  terrain: Uint8Array;
  trees: Uint8Array; // Holzmenge je Kachel, 0 = kein Baum
  variant: Uint8Array; // Zufallsvariante für Grafik
  slots: Slot[];
  market: { x: number; y: number };
  marketName: string;
  site: MapSite;
  labels: { name: string; x: number; y: number }[];
}

/** Kartengröße (Kacheln je Kante) für zwei Spieler; drei oder vier Spieler bekommen eine größere Karte. */
export const MAP_W = 128;
export const MAP_H = 128;
/** größte mögliche Karte (Grenze für die Prüfung von Koordinaten in Netzwerkbefehlen) */
export const MAP_MAX = 160;
export function mapSizeFor(players: number): number {
  return players > 2 ? MAP_MAX : MAP_W;
}

export function isWater(t: number): boolean {
  return t === T.WASSER || t === T.FLACH;
}
/** Grundsätzlich begehbares Gelände (ohne Bäume und Gebäude). */
export function terrainWalkable(t: number): boolean {
  return t !== T.WASSER && t !== T.FLACH && t !== T.KNICK && t !== T.GRABEN && t !== T.DEICH && t !== T.WALL;
}
/** Sichtsperren: Knicks, Deiche und Wälle. */
export function blocksSight(t: number): boolean {
  return t === T.KNICK || t === T.DEICH || t === T.WALL;
}
/** Linienhindernisse, die als Objekte (mit Höhe) gezeichnet werden. */
export function isBarrier(t: number): boolean {
  return t === T.KNICK || t === T.DEICH || t === T.WALL;
}
/** Bewegungskosten (1 = normal). */
export function terrainCost(t: number): number {
  switch (t) {
    case T.WEG:
    case T.TOR:
      return 0.75;
    case T.MOOR:
      return 1.8;
    case T.WATT:
      return 2.4;
    case T.HEIDE:
      return 1.1;
    default:
      return 1;
  }
}

// ------------------------------------------------------------------ Kartenkatalog
export const MAP_IDS = ['schlei', 'foerde', 'danewerk', 'eider', 'marsch', 'ribe', 'random'] as const;
/** Karten nach echter Geografie (ohne die erzeugte Zufallskarte) */
export const REAL_MAP_IDS = ['schlei', 'foerde', 'danewerk', 'eider', 'marsch', 'ribe'] as const;
export type MapId = (typeof MAP_IDS)[number];
export function isMapId(v: unknown): v is MapId {
  return typeof v === 'string' && (MAP_IDS as readonly string[]).includes(v);
}

export interface MapInfo {
  id: MapId;
  name: string;
  region: string;
  desc: string;
  liberties: string;
  slotNames: [string, string, string, string];
  marketName: string;
  siteName: string;
  siteText: string;
}

export const MAP_INFO: Record<MapId, MapInfo> = {
  schlei: {
    id: 'schlei', name: 'Die Schlei', region: 'Angeln',
    desc: 'Kappeln und Arnis am Meeresarm der Schlei, dazwischen Knicklandschaft. Im Westen Süderbrarup mit dem Brarup-Markt und das Thorsberger Moor.',
    liberties: 'Arnis wurde erst 1667 gegründet; die Moorfunde wurden erst im 19. Jahrhundert ausgegraben.',
    slotNames: ['Kappeln', 'Arnis', 'Steinberg', 'Boren'],
    marketName: 'Brarup-Markt', siteName: 'Thorsberger Moor',
    siteText: 'Torfstecher zeigen alte Funde aus dem Moor – Bericht an den Landesherrn',
  },
  foerde: {
    id: 'foerde', name: 'Flensburger Förde', region: 'Angeln und Sundewitt',
    desc: 'Husby im Angelner Hinterland südlich und Gravenstein am Nordufer der Förde. Zu Lande führt der Weg um die Fördespitze bei Flensburg, wo der Markt liegt; Glücksburg mit seinem Wasserschloss liegt dazwischen am Südufer.',
    liberties: 'Das Wasserschloss Glücksburg entstand 1582–1587 und passt in die Zeit; Lage und Breite der Förde sind stark vereinfacht.',
    slotNames: ['Husby', 'Gravenstein', 'Harrislee', 'Glücksburg'],
    marketName: 'Flensburger Markt', siteName: 'Findling am Fördeufer',
    siteText: 'Steinmetze vermessen einen gewaltigen eiszeitlichen Findling – ein Wahrzeichen für das Land',
  },
  danewerk: {
    id: 'danewerk', name: 'Danewerk', region: 'Schleswig und Haithabu',
    desc: 'Der uralte Grenzwall Danewerk teilt die Karte in Nord (Schuby) und Süd (Kropp). Nur wenige Tore führen hindurch – am wichtigsten das Tor am Ochsenweg mit seinem Viehmarkt. Im Osten liegen Schleswig, die Schlei und das Haddebyer Noor mit Haithabu.',
    liberties: 'Um 1600 war das Danewerk längst ein überwachsener Wall; die Tore und der Viehmarkt am Ochsenweg sind spielerisch vereinfacht. Haithabu war seit dem 11. Jahrhundert verlassen und wurde erst ab 1900 ausgegraben.',
    slotNames: ['Schuby', 'Kropp', 'Jagel', 'Lürschau'],
    marketName: 'Viehmarkt am Ochsenweg', siteName: 'Haithabu',
    siteText: 'Am Haddebyer Noor finden Bauern Spuren des alten Handelsplatzes Haithabu – Bericht nach Gottorf',
  },
  eider: {
    id: 'eider', name: 'Eider und Rendsburg', region: 'Eider-Treene-Niederung',
    desc: 'Die Eider – lange die Grenze zwischen Schleswig und Holstein – zieht sich durch nasse Niederungen und Moore. Owschlag im Norden und Jevenstedt im Süden ringen um Rendsburg auf seiner Eiderinsel; im Westen gibt es nur eine Furt.',
    liberties: 'Die Festung Rendsburg wurde erst ab 1690 ausgebaut; Flusslauf und Moore sind vereinfacht.',
    slotNames: ['Owschlag', 'Jevenstedt', 'Hohn', 'Schacht-Audorf'],
    marketName: 'Rendsburger Markt', siteName: 'Grenzstein an der Eider',
    siteText: 'Am alten Grenzstein an der Eider wird ein Vertrag beurkundet – Zeugnis der Grenze zwischen Schleswig und Holstein',
  },
  marsch: {
    id: 'marsch', name: 'Nordfriesische Marsch', region: 'Husum und Eiderstedt',
    desc: 'Bredstedt im Norden und Tönning an der Eider im Süden, Husum mit seinem Ochsenmarkt dazwischen: grüne Marsch mit Gräben statt Knicks, Deiche mit Stöpen, das Watt mit Prielen und Inseln; draußen im Watt liegen Spuren Rungholts.',
    liberties: 'Rungholt ging 1362 unter; Funde im Watt sind erst seit dem 20. Jahrhundert dokumentiert. Küstenlinie und Inseln sind stark vereinfacht (die Burchardiflut von 1634 veränderte Nordstrand grundlegend). Husum war tatsächlich ein bedeutender Ochsenmarkt; Bredstedt und Tönning liegen der Fairness wegen gleich weit davon entfernt, Entfernungen sind verkürzt.',
    slotNames: ['Bredstedt', 'Tönning', 'Oldenswort', 'Friedrichstadt'],
    marketName: 'Husumer Ochsenmarkt', siteName: 'Rungholt-Spuren',
    siteText: 'Bei Ebbe zeigen sich im Watt Brunnenringe und Scherben des untergegangenen Rungholt',
  },
  random: {
    id: 'random', name: 'Zufallskarte', region: 'jedes Mal neu',
    desc: 'Eine bei jedem Start neu erzeugte Landschaft zwischen Eider und Kongeå: mal Küste mit Watt und Deich, mal Fluss mit Furten, Seen, Moore, Heide, Knicks oder Gräben – mit zufälligen Ortsnamen aus der Region. Die Startplätze werden wie auf allen Karten ausgeglichen.',
    liberties: 'Frei erfundene Landschaft; die Ortsnamen stammen aus Angeln, Schwansen, Nordfriesland und Sønderjylland, ihre Lage zueinander ist zufällig.',
    slotNames: ['Startplatz A', 'Startplatz B', 'C', 'D'],
    marketName: 'Marktflecken', siteName: 'Fundstelle',
    siteText: 'Bauern stoßen auf alte Funde',
  },
  ribe: {
    id: 'ribe', name: 'Ribe und Kongeå', region: 'Südwestjütland',
    desc: 'Weite Heide, Marsch und Wattenmeer mit Fanø. Die Kongeå trennt den Norden (Varde) vom Süden (Tønder); dazwischen Ribe mit seinem großen Ochsenmarkt. Im Nordwesten liegt die Bucht, an der später Esbjerg entstand.',
    liberties: 'Esbjerg wurde erst 1868 gegründet und erscheint nur als Ortsangabe. Entfernungen sind stark verkürzt; die Heide war um 1600 noch weiter ausgedehnt.',
    slotNames: ['Varde', 'Tønder', 'Gram', 'Bramming'],
    marketName: 'Ochsenmarkt Ribe', siteName: 'Grabhügel auf der Heide',
    siteText: 'Hirten zeigen bronzezeitliche Grabhügel auf der Heide – der Pastor schreibt einen Bericht an die Krone',
  },
};

// ------------------------------------------------------------------ Malwerkzeug
type Hedge = 'knick' | 'graben' | null;
type P2 = { x: number; y: number };

interface PaintResult {
  slots: P2[]; // Mittelpunkte der Dorfzentren (4)
  market: P2;
  site: P2;
  labels: { name: string; x: number; y: number }[];
  roads?: [P2, P2][];
  /** Deiche und Wälle als Linienzüge; Wegekreuzungen werden zu Toren */
  lines?: { kind: 'deich' | 'wall'; pts: P2[]; gates?: (P2 & { r?: number })[] }[];
  hedge: (x: number, y: number) => Hedge;
  hedgeDensity: number;
  forest: number; // Schwelle für Rauschwald (höher = weniger)
  clay: number; // Schwelle für Lehmflecken (höher = weniger)
  forestOn?: number[];
  /** Vier Spieler: Der Maler hat alle vier Startplätze selbst festgelegt */
  fixed4?: boolean;
  /** Vier Spieler: Namen der Startplätze 3 und 4 (bei selbst festgelegten Plätzen) */
  names4?: [string, string];
  /** Vier Spieler: Orte der Gegend (Name, Länge, Breite) – die frei gewählten Plätze heißen nach dem nächstgelegenen */
  places?: [string, number, number][];
  /** nur Zufallskarte: erzeugte Namen statt der Katalogwerte */
  names?: { name: string; slotNames: string[]; marketName: string; siteName: string; siteText: string };
}

class Painter {
  readonly w: number;
  readonly h: number;
  /** Maßstab gegenüber der ursprünglichen 96er-Karte: alle Kartenmaler sind in diesen Einheiten entworfen. */
  readonly SC: number;
  /** Halbdiagonale der Raute in Kacheln */
  readonly D: number;
  readonly terrain: Uint8Array;
  readonly trees: Uint8Array;
  readonly rng: Rng;
  readonly n1: (x: number, y: number) => number;
  readonly n2: (x: number, y: number) => number;
  readonly n3: (x: number, y: number) => number;
  /** Geografischer Bezug: Mittelpunkt und Kacheln je Breitengrad (maßstabstreu, Norden oben). */
  geo: { lon: number; lat: number; k: number; cos: number } | null = null;
  /** Maßstab für Radien und Breiten: beim Malen der Landschaft SC, für die Ausgleichsschritte danach 1 (in Kacheln abgestimmt). */
  sc: number;

  constructor(seed: number, size: number, readonly players: number) {
    this.w = this.h = size;
    this.SC = this.sc = (size - 1) / 95;
    this.D = 95 * this.SC;
    this.terrain = new Uint8Array(size * size);
    this.trees = new Uint8Array(size * size);
    this.rng = new Rng(seed);
    this.n1 = makeNoise(this.rng, this.w, this.h, 9 * this.SC);
    this.n2 = makeNoise(this.rng, this.w, this.h, 5 * this.SC);
    this.n3 = makeNoise(this.rng, this.w, this.h, 4);
  }
  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): number {
    return this.inside(x, y) ? this.terrain[this.idx(x, y)] : -1;
  }
  set(x: number, y: number, t: number): void {
    if (this.inside(x, y)) this.terrain[this.idx(x, y)] = t;
  }
  /** Raute: u −1 (West) … +1 (Ost), v 0 (Nord) … 1 (Süd) → Kachel */
  at(u: number, v: number): P2 {
    const e = u * this.D, s = v * 2 * this.D;
    return { x: Math.round((s + e) / 2), y: Math.round((s - e) / 2) };
  }
  uv(x: number, y: number): { u: number; v: number } {
    return { u: (x - y) / this.D, v: (x + y) / (2 * this.D) };
  }
  /**
   * Passt die Orte maßstabstreu in die Spielraute ein: Die begehbare Fläche ist ein auf der Spitze stehendes Quadrat
   * (Norden oben). margin < 1 lässt Rand frei, damit kein Startplatz an der Kante klebt.
   */
  fit(pts: [number, number][], margin = 0.72): void {
    const lat = pts.reduce((a, q) => a + q[1], 0) / pts.length;
    const cos = Math.cos((lat * Math.PI) / 180);
    const A = pts.map(([lo, la]) => lo * cos + la), B = pts.map(([lo, la]) => lo * cos - la);
    const ca = (Math.max(...A) + Math.min(...A)) / 2, cb = (Math.max(...B) + Math.min(...B)) / 2;
    const R = Math.max((Math.max(...A) - Math.min(...A)) / 2, (Math.max(...B) - Math.min(...B)) / 2, 0.02);
    this.geo = { lon: (ca + cb) / 2 / cos, lat: (ca - cb) / 2, k: (this.D * margin) / R, cos };
  }
  /** Länge/Breite → Kachel. */
  ll(lon: number, lat: number): P2 {
    const g = this.geo!;
    const e = (lon - g.lon) * g.cos * g.k, s = this.D - (lat - g.lat) * g.k;
    return { x: Math.round((s + e) / 2), y: Math.round((s - e) / 2) };
  }
  lonlat(x: number, y: number): { lon: number; lat: number } {
    const g = this.geo!;
    const e = x - y, s = x + y;
    return { lon: g.lon + e / g.k / g.cos, lat: g.lat + (this.D - s) / g.k };
  }
  each(fn: (x: number, y: number, u: number, v: number, i: number) => void): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const { u, v } = this.uv(x, y);
        fn(x, y, u, v, this.idx(x, y));
      }
  }
  blob(cx: number, cy: number, r0: number, fn: (x: number, y: number) => void, rough = 1.5): void {
    const r = r0 * this.sc;
    for (let y = -Math.ceil(r) - 1; y <= r + 1; y++)
      for (let x = -Math.ceil(r) - 1; x <= r + 1; x++) {
        const px = Math.round(cx) + x, py = Math.round(cy) + y;
        if (this.inside(px, py) && Math.hypot(x, y) + (this.n2(px * 3, py * 3) - 0.5) * rough < r) fn(px, py);
      }
  }
  paintBlob(cx: number, cy: number, r: number, t: number, onlyOn?: number[]): void {
    this.blob(cx, cy, r, (x, y) => {
      if (!onlyOn || onlyOn.includes(this.get(x, y))) this.set(x, y, t);
    });
  }
  forestBlob(cx: number, cy: number, r: number): void {
    this.blob(cx, cy, r, (x, y) => {
      const i = this.idx(x, y);
      if (this.terrain[i] === T.GRAS || this.terrain[i] === T.HEIDE) this.trees[i] = 50 + this.rng.int(40);
    });
  }
  /** Fluss/Kanal entlang eines Linienzugs mit Breite und leichter Schlängelung. */
  river(pts: P2[], width: number, t: number = T.WASSER, wobble = 1.2): void {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
      for (let j = 0; j <= n; j++) {
        const f = j / n;
        const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        const wob = (this.n1(x * 2, y * 2) - 0.5) * wobble * 2;
        const r = (width * this.sc) / 2 + (this.n3(x * 3 + 7, y * 3) - 0.5) * 0.6;
        for (let dy = -Math.ceil(r) - 1; dy <= r + 1; dy++)
          for (let dx = -Math.ceil(r) - 1; dx <= r + 1; dx++)
            if (Math.hypot(dx, dy) <= r) this.set(Math.round(x + dx + wob * 0.5), Math.round(y + dy - wob * 0.5), t);
      }
    }
  }
  /** Linie im 4er-Nachbarschaftsraster (lückenlos für Deiche/Wälle). */
  line4(a: P2, b: P2, fn: (x: number, y: number) => void): void {
    let x = a.x, y = a.y;
    fn(x, y);
    let guard = 0;
    while ((x !== b.x || y !== b.y) && guard++ < 1000) {
      const dx = b.x - x, dy = b.y - y;
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx);
      else y += Math.sign(dy);
      fn(x, y);
    }
  }
  /** Furt/Brücke: begehbarer Streifen quer über Wasser. */
  ford(a0: P2, b0: P2): void {
    // auf den Maßstab verlängert, damit die Furt auch die breiteren Flüsse quert
    const mx = (a0.x + b0.x) / 2, my = (a0.y + b0.y) / 2;
    const a = { x: Math.round(mx + (a0.x - mx) * this.sc), y: Math.round(my + (a0.y - my) * this.sc) };
    const b = { x: Math.round(mx + (b0.x - mx) * this.sc), y: Math.round(my + (b0.y - my) * this.sc) };
    this.line4(a, b, (x, y) => {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const t = this.get(x + dx, y + dy);
        if (t === T.WASSER || t === T.FLACH || t === T.UFER || t === T.MOOR || t === T.GRABEN) this.set(x + dx, y + dy, T.WEG);
      }
    });
  }
}

const inPoly = (lon: number, lat: number, poly: [number, number][]) => {
  let c = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const [xa, ya] = poly[a], [xb, yb] = poly[b];
    if (ya > lat !== yb > lat && lon < ((xb - xa) * (lat - ya)) / (yb - ya) + xa) c = !c;
  }
  return c;
};

// Namen für die Zufallskarte (echte Orte der Region, zufällig angeordnet)
const TOWNS = [
  'Sörup', 'Satrup', 'Sterup', 'Gelting', 'Steinbergkirche', 'Grundhof', 'Husby', 'Hürup', 'Tolk', 'Böel', 'Mohrkirch',
  'Rabenkirchen', 'Toestrup', 'Brodersby', 'Rieseby', 'Damp', 'Waabs', 'Karby', 'Thumby', 'Bredstedt', 'Niebüll',
  'Viöl', 'Ockholm', 'Garding', 'Tating', 'Witzwort', 'Hattstedt', 'Mildstedt', 'Schwabstedt', 'Tinglev', 'Løgumkloster',
  'Bredebro', 'Agerskov', 'Rødding', 'Gram', 'Toftlund', 'Hohn', 'Erfde', 'Bergenhusen', 'Treia', 'Silberstedt',
] as const;
const RIVERS = ['Treene', 'Sorge', 'Arlau', 'Lecker Au', 'Wiedau', 'Bondenau', 'Oxbek', 'Loiter Au', 'Füsinger Au', 'Gram Å'] as const;
const LAKES = ['Langsee', 'Bültsee', 'Winderatter See', 'Arenholzer See', 'Wittensee', 'Holmer See', 'Sankelmarker See'] as const;
const SITES: readonly [string, string][] = [
  ['Hünengrab', 'Hirten zeigen ein steinzeitliches Hünengrab – der Pastor schreibt einen Bericht an den Landesherrn'],
  ['Runenstein', 'Bauern legen einen alten Runenstein frei – Gelehrte reisen an'],
  ['Opfermoor', 'Torfstecher stoßen auf eisenzeitliche Opfergaben im Moor'],
  ['Alte Burgwallstelle', 'Auf einem Hügel finden sich Reste eines frühmittelalterlichen Burgwalls'],
  ['Grabhügelfeld', 'Auf der Heide liegen bronzezeitliche Grabhügel – ein Bericht geht an die Krone'],
];

// ------------------------------------------------------------------ Kartenmaler
// Ortslagen nach bekannten Koordinaten (Länge/Breite, ca. ±0,02°), auf die Spielraute projiziert.
type MapPainter = (p: Painter) => PaintResult;

const PAINTERS: Record<MapId, MapPainter> = {
  // ---------------------------------------------------------------- Schlei (Angeln)
  schlei: (p) => {
    const { n1, n2 } = p;
    // vier Spieler: die Schlei rückt etwas nach Westen, damit Schwansen im Osten Platz für eine Siedlung bietet
    const four = p.players > 2;
    const geo = (e: number, s: number) => ({ x: Math.round((p.SC * (s + e)) / 2), y: Math.round((p.SC * (s - e)) / 2) });
    p.each((x, y, _u, _v, i) => {
      const e = (x - y) / p.SC, s = (x + y) / p.SC;
      const wob = Math.sin(s * 0.075) * 5 + (n1(x, y) - 0.5) * 6;
      const thr = (four ? 40 : 49) + wob - Math.max(0, 50 - s) * 0.35;
      let water = e > thr;
      const eastBank = (four ? 64 : 80) + Math.sin(s * 0.11) * 4 + (n2(x, y) - 0.5) * 5;
      if (e > eastBank && s > 70 && s < 140) water = false;
      p.terrain[i] = water ? T.WASSER : T.GRAS;
    });
    const noor = geo(four ? 36 : 44, 96);
    p.blob(noor.x, noor.y, 3.6, (x, y) => p.set(x, y, T.WASSER), 2);
    const moor = four ? geo(-28, 128) : geo(-62, 95);
    p.blob(moor.x, moor.y, 5.2, (x, y) => p.get(x, y) === T.GRAS && p.set(x, y, T.MOOR), 4);
    // Kappeln im Norden, Arnis im Süden – weit auseinander (Entfernungen bewusst gestreckt)
    const s0 = geo(four ? 18 : 26, 40), s1 = geo(four ? 18 : 26, 150);
    const mir = (dx0: number, dy0: number, si: number) => {
      const dx = Math.round(dx0 * p.SC), dy = Math.round(dy0 * p.SC);
      return si === 0 ? { dx, dy } : { dx: -dy, dy: -dx };
    };
    [s0, s1].forEach((c, si) => {
      const a = mir(-3, 10, si), b = mir(-11, -4, si);
      p.forestBlob(c.x + a.dx, c.y + a.dy, 3.2);
      p.forestBlob(c.x + b.dx, c.y + b.dy, 2.6);
    });
    const m = four ? geo(16, 95) : geo(-41, 95);
    p.forestBlob(m.x + Math.round(9 * p.SC), m.y - Math.round(5 * p.SC), 3);
    p.forestBlob(m.x - Math.round(4 * p.SC), m.y + Math.round(9 * p.SC), 2.5);
    if (four) {
      // Brücken nach Schwansen bei Missunde und Lindaunis, Wälder für die West- und Ostsiedlung
      p.ford(geo(30, 84), geo(70, 84));
      p.ford(geo(30, 116), geo(70, 116));
      for (const [e, s2] of [[-52, 80], [-50, 112], [82, 82], [80, 110]] as const) p.forestBlob(geo(e, s2).x, geo(e, s2).y, 3);
    }
    return {
      slots: four ? [s0, s1, geo(-40, 95), geo(76, 95)] : [s0, s1, geo(-18, 40), geo(-18, 150)],
      fixed4: four, names4: ['Satrup', 'Rieseby'],
      market: m, site: moor,
      labels: [{ name: 'Die Schlei', ...geo(62, 80) }, { name: 'Ostsee', ...geo(72, 40) }, { name: 'Schwansen', ...geo(87, 105) }],
      hedge: () => 'knick', hedgeDensity: 0.62, forest: 0.66, clay: 0.78,
    };
  },

  // ---------------------------------------------------------------- Flensburger Förde
  foerde: (p) => {
    // Koordinaten per TomTom-Geocoding geprüft (Glücksburg, Gråsten, Flensburg); Husby nach bekannten Koordinaten
    const S0: [number, number] = [9.581, 54.763], S1: [number, number] = [9.6, 54.93], M: [number, number] = [9.433, 54.785], F: [number, number] = [9.36, 54.84];
    p.fit([S0, S1, M, F, [9.7, 54.86]]);
    const L = (lon: number, lat: number) => p.ll(lon, lat);
    p.each((x, y, _u, _v, i) => {
      const { lon } = p.lonlat(x, y);
      p.terrain[i] = lon > 9.76 + (p.n1(x, y) - 0.5) * 0.05 ? T.WASSER : T.GRAS;
    });
    // Förde: von Flensburg (Spitze) nach Norden, dann nach Osten aufweitend
    // Innenförde nach Nordost, nördlich um Holnis herum, dann die breite Außenförde nach Osten
    // (Wasser-/Landpunkte per TomTom-Rückwärtssuche geprüft: Holnis ist Land, die Rinne liegt bei 54,88° N)
    p.river([L(9.435, 54.795), L(9.455, 54.815), L(9.48, 54.84), L(9.525, 54.862)], 3, T.WASSER, 0.8);
    p.river([L(9.525, 54.862), L(9.57, 54.878), L(9.61, 54.885)], 3.6, T.WASSER, 0.6);
    p.river([L(9.61, 54.885), L(9.64, 54.865), L(9.7, 54.852), L(9.8, 54.85), L(9.9, 54.85)], 6.5, T.WASSER, 1.5);
    const holnis = L(9.592, 54.864);
    p.blob(holnis.x, holnis.y, 2, (x, y) => p.set(x, y, T.GRAS), 0.5);
    // vier Spieler: Fährweg Holnis–Brunsnæs und eine Furt an der Innenförde, damit alle den Markt ähnlich weit haben
    if (p.players > 2) {
      p.ford(L(9.588, 54.862), L(9.58, 54.9));
      p.ford(L(9.5, 54.835), L(9.47, 54.86));
    }
    for (const [lon, lat, r] of [[9.52, 54.815, 3], [9.47, 54.865, 3], [9.65, 54.905, 2.6], [9.63, 54.82, 2.8], [9.38, 54.78, 2.6], [9.42, 54.88, 2.4]] as const)
      p.forestBlob(L(lon, lat).x, L(lon, lat).y, r);
    return {
      places: [['Harrislee', 9.39, 54.8], ['Glücksburg', 9.547, 54.834], ['Kruså', 9.4, 54.85], ['Broager', 9.68, 54.89], ['Langballig', 9.66, 54.82], ['Munkbrarup', 9.57, 54.8], ['Handewitt', 9.33, 54.76], ['Rinkenæs', 9.55, 54.89], ['Quern', 9.72, 54.77], ['Sörup', 9.66, 54.72], ['Tarp', 9.4, 54.66], ['Nybøl', 9.72, 54.93], ['Bov', 9.38, 54.84]],
      slots: [L(...S0), L(...S1), L(9.38, 54.87), L(9.547, 54.834)],
      market: L(...M), site: L(...F),
      labels: [
        { name: 'Flensburger Förde', ...L(9.66, 54.875) }, { name: 'Ostsee', ...L(9.8, 54.84) },
        { name: 'Sundewitt', ...L(9.68, 54.93) }, { name: 'Angeln', ...L(9.6, 54.77) }, { name: 'Holnis', ...L(9.585, 54.855) },
      ],
      hedge: () => 'knick', hedgeDensity: 0.55, forest: 0.7, clay: 0.8,
    };
  },

  // ---------------------------------------------------------------- Danewerk / Schleswig
  danewerk: (p) => {
    // Koordinaten per TomTom-Geocoding geprüft (Schuby, Kropp, Haddeby, Hollingstedt, Dannewerk)
    const S0: [number, number] = [9.48, 54.518], S1: [number, number] = [9.513, 54.411], M: [number, number] = [9.47, 54.474], H: [number, number] = [9.565, 54.493];
    p.fit([S0, S1, M, H, [9.36, 54.46]]);
    const L = (lon: number, lat: number) => p.ll(lon, lat);
    p.each((x, y, _u, _v, i) => {
      const { lon } = p.lonlat(x, y);
      const geest = lon < 9.43 + (p.n1(x, y) - 0.5) * 0.06;
      p.terrain[i] = geest && p.n2(x, y) > 0.45 ? T.HEIDE : T.GRAS;
    });
    // Schlei bei Schleswig, Haddebyer Noor, Selker Noor
    p.river([L(9.75, 54.52), L(9.68, 54.515), L(9.62, 54.51), L(9.585, 54.505)], 3.4, T.WASSER, 1);
    const noor = L(9.578, 54.49);
    p.blob(noor.x, noor.y, 2.6, (x, y) => p.set(x, y, T.WASSER), 1.5);
    p.river([L(9.585, 54.505), L(9.58, 54.494)], 2, T.WASSER, 0.3);
    // Rheider Au im Westen mit Furten
    p.river([L(9.37, 54.56), L(9.38, 54.5), L(9.39, 54.44), L(9.38, 54.38)], 1.8, T.WASSER, 0.8);
    p.ford(L(9.355, 54.505), L(9.405, 54.505));
    p.ford(L(9.36, 54.425), L(9.415, 54.425));
    for (const [lon, lat, r] of [[9.42, 54.55, 3], [9.42, 54.41, 3]] as const) p.paintBlob(L(lon, lat).x, L(lon, lat).y, r, T.MOOR, [T.GRAS, T.HEIDE]);
    for (const [lon, lat, r] of [[9.6, 54.43, 3.6], [9.64, 54.46, 2.6], [9.53, 54.55, 2.6], [9.45, 54.42, 2.6], [9.43, 54.56, 2.4], [9.57, 54.41, 2.4]] as const)
      p.forestBlob(L(lon, lat).x, L(lon, lat).y, r);
    const wallPts = [L(9.336, 54.457), L(9.4, 54.465), L(9.47, 54.474), L(9.51, 54.482), L(9.558, 54.488)];
    return {
      places: [['Jagel', 9.54, 54.45], ['Hollingstedt', 9.34, 54.46], ['Busdorf', 9.58, 54.5], ['Fahrdorf', 9.61, 54.5], ['Jübek', 9.4, 54.55], ['Selk', 9.56, 54.47], ['Groß Rheide', 9.44, 54.44], ['Silberstedt', 9.37, 54.52], ['Fleckeby', 9.7, 54.48], ['Brekendorf', 9.62, 54.42], ['Lürschau', 9.5, 54.5], ['Owschlag', 9.6, 54.39]],
      slots: [L(...S0), L(...S1), L(9.6, 54.56), L(9.38, 54.39)],
      market: L(...M), site: L(...H),
      labels: [
        { name: 'Schleswig', ...L(9.585, 54.522) }, { name: 'Hollingstedt', ...L(9.34, 54.45) }, { name: 'Schlei', ...L(9.68, 54.525) },
        { name: 'Danewerk', ...L(9.41, 54.478) }, { name: 'Hüttener Berge', ...L(9.62, 54.42) }, { name: 'Rheider Au', ...L(9.37, 54.53) },
      ],
      lines: [{ kind: 'wall', pts: wallPts, gates: [L(9.4, 54.468), { ...L(9.47, 54.474), r: 3 }] }],
      hedge: (x, y) => (p.get(x, y) === T.HEIDE ? null : 'knick'), hedgeDensity: 0.5, forest: 0.72, clay: 0.8, forestOn: [T.GRAS],
    };
  },

  // ---------------------------------------------------------------- Eider und Rendsburg
  eider: (p) => {
    // Koordinaten per TomTom-Geocoding geprüft (Owschlag, Jevenstedt, Rendsburg, Hohn, Hohner und Audorfer See)
    const S0: [number, number] = [9.601, 54.392], S1: [number, number] = [9.664, 54.232], R: [number, number] = [9.664, 54.303], G: [number, number] = [9.45, 54.296];
    p.fit([S0, S1, R, G]);
    const L = (lon: number, lat: number) => p.ll(lon, lat);
    const lowland = (x: number, y: number) => Math.abs(p.lonlat(x, y).lat - 54.303) < 0.022 + (p.n1(x, y) - 0.5) * 0.014;
    p.each((x, y, _u, _v, i) => {
      const low = lowland(x, y);
      p.terrain[i] = low && p.n2(x, y) > 0.55 ? T.MOOR : !low && p.n1(x + 31, y) > 0.68 ? T.HEIDE : T.GRAS;
    });
    const eider = [L(9.9, 54.31), L(9.78, 54.305), L(9.7, 54.3), L(9.64, 54.305), L(9.56, 54.3), L(9.48, 54.308), L(9.4, 54.3), L(9.3, 54.305)];
    p.river(eider, 3, T.WASSER, 1.4);
    const hs = L(9.47, 54.307), as = L(9.705, 54.317);
    p.blob(hs.x, hs.y, 2.6, (x, y) => p.set(x, y, T.WASSER), 1.5);
    p.blob(as.x, as.y, 2, (x, y) => p.set(x, y, T.WASSER), 1.2);
    // Rendsburg: Insel mit Brücken nach Nord und Süd
    const rb = L(...R);
    p.blob(rb.x, rb.y, 2.6, (x, y) => p.set(x, y, T.GRAS), 0.3);
    p.ford({ x: rb.x - 6, y: rb.y - 6 }, { x: rb.x + 6, y: rb.y + 6 });
    // Furt im Westen
    const fw = L(9.5, 54.305);
    p.ford({ x: fw.x - 5, y: fw.y - 5 }, { x: fw.x + 5, y: fw.y + 5 });
    if (p.players > 2) {
      // vier Spieler: zusätzliche Furten im Osten und Westen
      for (const lon of [9.8, 9.38]) {
        const f = L(lon, 54.304);
        p.ford({ x: f.x - 5, y: f.y - 5 }, { x: f.x + 5, y: f.y + 5 });
      }
    }
    for (const [lon, lat, r] of [[9.56, 54.37, 3], [9.6, 54.24, 3], [9.72, 54.37, 2.6], [9.72, 54.24, 2.6], [9.5, 54.36, 2.2], [9.53, 54.255, 2.2]] as const)
      p.forestBlob(L(lon, lat).x, L(lon, lat).y, r);
    return {
      places: [['Hohn', 9.495, 54.3], ['Schacht-Audorf', 9.71, 54.31], ['Fockbek', 9.6, 54.3], ['Nübbel', 9.62, 54.27], ['Hamdorf', 9.5, 54.22], ['Borgstedt', 9.72, 54.34], ['Alt Duvenstedt', 9.65, 54.37], ['Bünsdorf', 9.74, 54.37], ['Brekendorf', 9.62, 54.42], ['Elsdorf-Westermühlen', 9.52, 54.27], ['Schülp', 9.65, 54.24], ['Osterrönfeld', 9.7, 54.29], ['Breiholz', 9.53, 54.2], ['Sehestedt', 9.82, 54.36], ['Nortorf', 9.85, 54.17]],
      slots: [L(...S0), L(...S1), L(9.48, 54.39), L(9.8, 54.24)],
      market: rb, site: L(...G),
      labels: [
        { name: 'Eider', ...L(9.56, 54.312) }, { name: 'Rendsburg', ...L(9.665, 54.316) }, { name: 'Hohner See', ...L(9.47, 54.318) }, { name: 'Audorfer See', ...L(9.71, 54.33) },
        { name: 'Schleswig', ...L(9.68, 54.37) }, { name: 'Holstein', ...L(9.6, 54.26) },
      ],
      hedge: (x, y) => (p.get(x, y) === T.HEIDE ? null : lowland(x, y) ? 'graben' : 'knick'),
      hedgeDensity: 0.5, forest: 0.74, clay: 0.8, forestOn: [T.GRAS],
    };
  },

  // ---------------------------------------------------------------- Nordfriesische Marsch
  marsch: (p) => {
    // Koordinaten per TomTom-Geocoding geprüft; Küstenverlauf per Rückwärtssuche (Watt gehört zu keiner Gemeinde)
    const S0: [number, number] = [8.966, 54.619], S1: [number, number] = [9.0, 54.345], M: [number, number] = [9.05, 54.478], Rh: [number, number] = [8.775, 54.432];
    p.fit([S0, S1, M, Rh, [8.79, 54.33], [8.7, 54.46]]);
    const L = (lon: number, lat: number) => p.ll(lon, lat);
    const land: [number, number][] = [
      [9.3, 54.7], [8.9, 54.7], [8.9, 54.56], [8.87, 54.53], [8.95, 54.505], [9.03, 54.49], [8.97, 54.455], [8.93, 54.43], [8.75, 54.415], [8.69, 54.39], [8.685, 54.365],
      [8.61, 54.33], [8.62, 54.3], [8.66, 54.285], [8.8, 54.3], [8.92, 54.3], [8.98, 54.31], [9.05, 54.29], [9.3, 54.27],
    ];
    const nordstrand: [number, number][] = [[8.78, 54.53], [8.9, 54.53], [8.93, 54.49], [8.84, 54.465], [8.76, 54.48]];
    const pellworm: [number, number][] = [[8.6, 54.55], [8.69, 54.55], [8.7, 54.5], [8.62, 54.49]];
    p.each((x, y, _u, _v, i) => {
      const { lon, lat } = p.lonlat(x, y);
      if (inPoly(lon, lat, land) || inPoly(lon, lat, nordstrand) || inPoly(lon, lat, pellworm)) {
        const geest = lon > 9.05 + (p.n1(x, y) - 0.5) * 0.05;
        p.terrain[i] = geest && p.n2(x, y) > 0.58 ? T.HEIDE : T.GRAS;
        return;
      }
      const deep = lon < 8.58 || (lat < 54.285 && lon < 8.85) || p.n1(x * 1.5, y * 1.5) > 0.76;
      p.terrain[i] = deep ? T.WASSER : T.WATT;
    });
    // Priele (Hever, Eidermündung), Eider ins Hinterland, Husumer Au
    p.river([L(8.97, 54.462), L(8.85, 54.445), L(8.7, 54.44), L(8.5, 54.45)], 1.6, T.WASSER, 2);
    p.river([L(9.0, 54.302), L(8.9, 54.288), L(8.75, 54.28), L(8.5, 54.27)], 2.4, T.WASSER, 1.5);
    p.river([L(9.3, 54.285), L(9.08, 54.292), L(9.0, 54.302)], 2.2, T.WASSER, 0.8);
    p.river([L(9.2, 54.466), L(9.1, 54.468), L(9.035, 54.472)], 1.3, T.WASSER, 0.5);
    for (const [lon, lat, r] of [[9.1, 54.5, 3], [9.06, 54.36, 3], [9.12, 54.42, 2.6], [9.1, 54.55, 2.4], [8.88, 54.37, 2], [9.0, 54.4, 2]] as const)
      p.forestBlob(L(lon, lat).x, L(lon, lat).y, r);
    const dike = (pts: [number, number][]) => ({ kind: 'deich' as const, pts: pts.map(([lo, la]) => L(lo, la)) });
    return {
      places: [['Husum', 9.058, 54.484], ['Friedrichstadt', 9.09, 54.375], ['Oldenswort', 8.93, 54.37], ['Garding', 8.78, 54.33], ['Hattstedt', 9.03, 54.53], ['Mildstedt', 9.08, 54.47], ['Viöl', 9.18, 54.57], ['Schwabstedt', 9.18, 54.4], ['Witzwort', 8.99, 54.4], ['Ostenfeld', 9.24, 54.47], ['Lunden', 9.03, 54.33], ['Drage', 9.16, 54.36], ['Bordelum', 8.93, 54.65], ['Tating', 8.7, 54.33]],
      slots: [L(...S0), L(...S1), L(8.93, 54.37), L(9.13, 54.4)],
      market: L(...M), site: L(...Rh),
      labels: [
        { name: 'Garding', ...L(8.79, 54.33) }, { name: 'Eiderstedt', ...L(8.72, 54.36) }, { name: 'Wattenmeer', ...L(8.62, 54.42) }, { name: 'Nordstrand', ...L(8.84, 54.505) },
        { name: 'Pellworm', ...L(8.65, 54.525) }, { name: 'Eider', ...L(8.9, 54.283) }, { name: 'Hever', ...L(8.85, 54.45) },
      ],
      lines: [
        { ...dike([[8.94, 54.515], [9.0, 54.483], [8.95, 54.443], [8.8, 54.42], [8.7, 54.394], [8.672, 54.362], [8.63, 54.33], [8.67, 54.3], [8.85, 54.311], [8.97, 54.322], [9.06, 54.31]]), gates: [L(8.79, 54.415), L(8.94, 54.448), ...(p.players > 2 ? [L(8.9, 54.316), L(8.67, 54.36), L(8.99, 54.47)] : [])] },
        { ...dike([[8.95, 54.43], [8.92, 54.38], [8.9, 54.335]]), gates: p.players > 2 ? [L(8.92, 54.38)] : undefined },
      ],
      hedge: (x, y) => (p.get(x, y) === T.HEIDE ? null : p.lonlat(x, y).lon < 9.03 ? 'graben' : 'knick'),
      hedgeDensity: 0.6, forest: 0.8, clay: 0.82, forestOn: [T.GRAS],
    };
  },

  // ---------------------------------------------------------------- Ribe und Kongeå (Südwestjütland)
  ribe: (p) => {
    // Koordinaten per TomTom-Geocoding geprüft (Varde, Tønder, Ribe, Esbjerg, Fanø, Rømø, Mandø, Højer)
    const S0: [number, number] = [8.49, 55.65], S1: [number, number] = [8.867, 54.958], M: [number, number] = [8.765, 55.342], G: [number, number] = [9.0, 55.28];
    // vier Spieler: Ausschnitt weiter nach Osten in die Heide, damit vier Siedlungen auf das Festland passen
    p.fit(p.players > 2 ? [S0, S1, M, G, [9.45, 55.3]] : [S0, S1, M, G]);
    const L = (lon: number, lat: number) => p.ll(lon, lat);
    // Küstenlinie (Länge je Breite) und Marschsaum
    const CO: [number, number][] = [[55.8, 8.3], [55.65, 8.36], [55.55, 8.42], [55.47, 8.46], [55.4, 8.58], [55.3, 8.64], [55.15, 8.64], [55.0, 8.66], [54.8, 8.66]];
    const coast = (lat: number) => {
      for (let k = 0; k < CO.length - 1; k++) {
        const [a, la] = CO[k], [b, lb] = CO[k + 1];
        if (lat <= a && lat >= b) return la + ((lat - a) / (b - a)) * (lb - la);
      }
      return lat > CO[0][0] ? CO[0][1] : CO[CO.length - 1][1];
    };
    const marsh = (x: number, y: number) => {
      const { lon, lat } = p.lonlat(x, y);
      return lon < coast(lat) + 0.09 + (p.n1(x, y) - 0.5) * 0.04;
    };
    p.each((x, y, _u, _v, i) => {
      const { lon, lat } = p.lonlat(x, y);
      const c = coast(lat) + (p.n1(x, y) - 0.5) * 0.03;
      const heath = lon > 8.74 + (p.n1(x, y) - 0.5) * 0.12;
      let t: number = heath && p.n2(x, y) > 0.35 ? T.HEIDE : T.GRAS;
      if (lon < c) t = lon < c - 0.1 ? T.WASSER : T.WATT;
      p.terrain[i] = t;
    });
    const isle = (lon: number, lat: number, r: number) => {
      const c = L(lon, lat);
      p.blob(c.x, c.y, r, (x, y) => p.set(x, y, T.GRAS), 1);
    };
    isle(8.41, 55.42, 3);
    isle(8.545, 55.12, 3);
    isle(8.54, 55.275, 1.4);
    // Varde Å, Kongeå (Grenzfluss), Ribe Å, Vidå
    p.river([L(8.7, 55.62), L(8.58, 55.625), L(8.5, 55.62), L(8.4, 55.6)], 1.6, T.WASSER, 1);
    p.river([L(9.2, 55.42), L(8.95, 55.41), L(8.8, 55.4), L(8.66, 55.39), L(8.55, 55.39)], 2.2, T.WASSER, 1.2);
    p.river([L(8.95, 55.325), L(8.8, 55.33), L(8.7, 55.33), L(8.58, 55.32)], 1.5, T.WASSER, 1);
    p.river([L(9.05, 54.926), L(8.9, 54.926), L(8.75, 54.932), L(8.6, 54.94)], 1.5, T.WASSER, 1);
    for (const [lon, lat] of [[8.74, 55.395], [8.98, 55.41]] as const) {
      const f = L(lon, lat);
      p.ford({ x: f.x - 4, y: f.y - 4 }, { x: f.x + 4, y: f.y + 4 });
    }
    for (const [lon, lat] of [[8.77, 55.33], [8.86, 54.928], [8.5, 55.62]] as const) {
      const f = L(lon, lat);
      p.ford({ x: f.x - 3, y: f.y - 3 }, { x: f.x + 3, y: f.y + 3 });
    }
    for (const [lon, lat, r] of [[8.95, 55.55, 3], [8.95, 55.1, 3]] as const) p.paintBlob(L(lon, lat).x, L(lon, lat).y, r, T.MOOR, [T.HEIDE, T.GRAS]);
    for (const [lon, lat, r] of [[8.62, 55.68, 3], [8.7, 55.56, 2.6], [9.0, 55.47, 2.6], [8.95, 55.2, 2.6], [8.97, 55.0, 3], [8.78, 55.04, 2.6], [8.7, 55.47, 2.4]] as const)
      p.forestBlob(L(lon, lat).x, L(lon, lat).y, r);
    const dike = (pts: [number, number][]) => ({ kind: 'deich' as const, pts: pts.map(([lo, la]) => L(lo, la)) });
    return {
      places: [['Gram', 9.05, 55.29], ['Bramming', 8.7, 55.47], ['Holsted', 8.92, 55.51], ['Vejen', 9.15, 55.48], ['Rødding', 9.06, 55.37], ['Skærbæk', 8.76, 55.16], ['Toftlund', 9.07, 55.19], ['Løgumkloster', 8.95, 55.06], ['Brørup', 9.02, 55.48], ['Gredstedbro', 8.74, 55.4], ['Agerbæk', 8.81, 55.6], ['Esbjerg', 8.45, 55.47], ['Bredebro', 8.83, 55.06]],
      slots: [L(...S0), L(...S1), L(9.05, 55.6), L(9.05, 55.05)],
      market: L(...M), site: L(...G),
      labels: [
        { name: 'Kongeå', ...L(8.87, 55.415) }, { name: 'Fanø', ...L(8.41, 55.45) }, { name: 'Esbjerg (Grådyb)', ...L(8.47, 55.48) },
        { name: 'Rømø', ...L(8.53, 55.16) }, { name: 'Vesterhavet', ...L(8.4, 55.3) }, { name: 'Hede', ...L(9.0, 55.22) },
        { name: 'Varde Å', ...L(8.62, 55.61) },
      ],
      lines: [dike([[8.71, 55.06], [8.7, 54.99], [8.7, 54.9]])],
      hedge: (x, y) => (p.get(x, y) === T.HEIDE ? null : marsh(x, y) ? 'graben' : 'knick'),
      hedgeDensity: 0.35, forest: 0.82, clay: 0.82, forestOn: [T.GRAS],
    };
  },

  // ---------------------------------------------------------------- Zufallskarte (bei jedem Seed neu)
  random: (p) => {
    const R = new Rng((p.rng.state ^ 0x51ed270b) >>> 0);
    const pick = <X,>(a: readonly X[]): X => a[R.int(a.length)];
    // Achse der Startplätze (gegenüberliegende Ecken oder Kantenmitten der Raute)
    const z = (v: number) => Math.round(v * p.SC);
    const AXES: [P2, P2][] = ([
      [{ x: 15, y: 15 }, { x: 80, y: 80 }], // Nord – Süd
      [{ x: 80, y: 15 }, { x: 15, y: 80 }], // Ost – West
      [{ x: 48, y: 12 }, { x: 47, y: 83 }], // Nordost – Südwest
      [{ x: 12, y: 48 }, { x: 83, y: 47 }], // Nordwest – Südost
    ] as [P2, P2][]).map(([a, b]) => [{ x: z(a.x), y: z(a.y) }, { x: z(b.x), y: z(b.y) }]);
    let [a, b] = pick(AXES);
    if (R.next() < 0.5) [a, b] = [b, a];
    const ax = (b.x - a.x) / Math.hypot(b.x - a.x, b.y - a.y), ay = (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
    const nx = -ay, ny = ax; // quer zur Achse
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const along = (x: number, y: number) => (x - cx) * ax + (y - cy) * ay; // −… Spieler A, + Spieler B
    const across = (x: number, y: number) => (x - cx) * nx + (y - cy) * ny;
    const theme = pick(['angeln', 'angeln', 'marsch', 'geest', 'fluss'] as const);
    const coast0 = R.next() < (theme === 'marsch' ? 1 : 0.55) ? (R.next() < 0.5 ? -1 : 1) : 0;
    const coastSide = p.players > 2 ? 0 : coast0; // vier Spieler: Startplätze ringsum, daher ohne Küste
    const heath = theme === 'geest' ? 0.45 : theme === 'marsch' ? 0.75 : R.range(0.62, 0.8);
    // Grundfläche, Küste parallel zur Achse (beide Seiten gleich nah am Meer)
    const coastAt = (30 + R.range(-3, 4)) * p.SC;
    p.each((x, y, _u, _v, i) => {
      let t: number = p.n1(x + 17, y + 5) > heath ? T.HEIDE : T.GRAS;
      if (coastSide) {
        const d = across(x, y) * coastSide - coastAt - (p.n1(x * 1.3, y * 1.3) - 0.5) * 9 * p.SC;
        if (d > 0) t = theme === 'marsch' && d < 9 * p.SC ? T.WATT : T.WASSER;
      }
      p.terrain[i] = t;
    });
    const labels: { name: string; x: number; y: number }[] = [];
    const used = new Set<string>();
    const fresh = (list: readonly string[]) => {
      for (let k = 0; k < 40; k++) {
        const n = pick(list);
        if (!used.has(n)) {
          used.add(n);
          return n;
        }
      }
      return pick(list);
    };
    if (coastSide) labels.push({ name: theme === 'marsch' ? 'Wattenmeer' : pick(['Ostsee', 'Förde', 'Noor', 'Nordsee']), x: Math.round(cx + nx * coastSide * 40 * p.SC), y: Math.round(cy + ny * coastSide * 40 * p.SC) });
    // Fluss quer zwischen den Spielern mit Furten
    const roads: [P2, P2][] = [];
    if (p.players <= 2 && (theme === 'fluss' || R.next() < 0.45)) {
      const off = R.range(-4, 4) * p.SC;
      const pts: P2[] = [];
      for (let k0 = -60; k0 <= 60; k0 += 10) {
        const k = k0 * p.SC;
        pts.push({ x: Math.round(cx + nx * k + ax * (off + Math.sin(k0 / 13 + R.next()) * 4 * p.SC)), y: Math.round(cy + ny * k + ay * (off + Math.sin(k0 / 13) * 4 * p.SC)) });
      }
      p.river(pts, R.range(2.2, 3.4), T.WASSER, 1.4);
      const fords = [R.range(-26, -12), R.range(12, 26)];
      if (R.next() < 0.6) fords.push(R.range(-4, 4));
      for (const f0 of fords) {
        const f = f0 * p.SC;
        const fx = Math.round(cx + nx * f + ax * off), fy = Math.round(cy + ny * f + ay * off);
        p.ford({ x: Math.round(fx - ax * 6), y: Math.round(fy - ay * 6) }, { x: Math.round(fx + ax * 6), y: Math.round(fy + ay * 6) });
      }
      labels.push({ name: fresh(RIVERS), x: Math.round(cx + nx * 30 * p.SC + ax * (off + 3)), y: Math.round(cy + ny * 30 * p.SC + ay * (off + 3)) });
    }
    // Seen und Moore, gespiegelt verteilt (je Seite gleich viele)
    const nLakes = R.int(3), nMoors = 1 + R.int(3);
    for (let k = 0; k < nLakes + nMoors; k++) {
      const lake = k < nLakes;
      const s = R.range(8, 26) * p.SC * (R.next() < 0.5 ? -1 : 1), q = R.range(-24, 24) * p.SC;
      for (const sign of [-1, 1]) {
        const x = Math.round(cx + ax * s * sign + nx * q * sign), y = Math.round(cy + ay * s * sign + ny * q * sign);
        const r = lake ? R.range(2, 3.4) : R.range(2.6, 4.5);
        if (lake) p.paintBlob(x, y, r, T.WASSER, [T.GRAS, T.HEIDE]);
        else p.paintBlob(x, y, r, T.MOOR, [T.GRAS, T.HEIDE]);
        if (lake && sign === 1 && R.next() < 0.6) labels.push({ name: fresh(LAKES), x, y: y + 3 });
      }
    }
    // Wälder je Seite
    for (let k = 0; k < 3 + R.int(3); k++) {
      const s = R.range(6, 30) * p.SC, q = R.range(-26, 26) * p.SC, r = R.range(2.2, 3.6);
      for (const sign of [-1, 1]) p.forestBlob(Math.round(cx + ax * s * sign + nx * q * sign), Math.round(cy + ay * s * sign + ny * q * sign), r);
    }
    // Deich an der Marschküste
    const lines: NonNullable<PaintResult['lines']> = [];
    if (theme === 'marsch' && coastSide) {
      const pts: P2[] = [];
      for (let k0 = -70; k0 <= 70; k0 += 10) {
        const k = k0 * p.SC;
        pts.push({ x: Math.round(cx + ax * k + nx * coastSide * (coastAt - 3)), y: Math.round(cy + ay * k + ny * coastSide * (coastAt - 3)) });
      }
      lines.push({ kind: 'deich', pts, gates: [-30, 0, 30].map((k0) => k0 * p.SC).map((k) => ({ x: Math.round(cx + ax * k + nx * coastSide * (coastAt - 3)), y: Math.round(cy + ay * k + ny * coastSide * (coastAt - 3)) })) });
    }
    const hedgeKind: Hedge = theme === 'marsch' ? 'graben' : theme === 'geest' && R.next() < 0.5 ? null : 'knick';
    const towns = [fresh(TOWNS), fresh(TOWNS), fresh(TOWNS), fresh(TOWNS)];
    const marketTown = fresh(TOWNS);
    const site = pick(SITES);
    const q = (R.next() < 0.5 ? -1 : 1) * R.range(14, 22) * p.SC;
    // Fundstelle quer zur Achse, aber nicht in der Küste
    const sq = coastSide ? -coastSide * Math.abs(q) : q;
    void along;
    return {
      slots: p.players > 2
        ? (() => {
          const half = Math.hypot(b.x - a.x, b.y - a.y) / 2;
          return [a, b, { x: Math.round(cx + nx * half), y: Math.round(cy + ny * half) }, { x: Math.round(cx - nx * half), y: Math.round(cy - ny * half) }];
        })()
        : [a, b, { x: Math.round(cx + nx * 34 * p.SC), y: Math.round(cy + ny * 34 * p.SC) }, { x: Math.round(cx - nx * 34 * p.SC), y: Math.round(cy - ny * 34 * p.SC) }],
      market: { x: Math.round(cx + nx * R.range(-6, 6) * p.SC), y: Math.round(cy + ny * R.range(-6, 6) * p.SC) },
      site: { x: Math.round(cx + nx * sq), y: Math.round(cy + ny * sq) },
      labels, roads, lines,
      hedge: (x, y) => (p.get(x, y) === T.HEIDE ? null : hedgeKind),
      hedgeDensity: R.range(0.35, 0.65), forest: R.range(0.66, 0.76), clay: R.range(0.77, 0.81), forestOn: [T.GRAS],
      names: {
        name: `Zufallskarte: ${towns[0]} gegen ${towns[1]}`,
        slotNames: towns, marketName: `Markt in ${marketTown}`, siteName: site[0], siteText: site[1],
      },
    };
  },
};

// ------------------------------------------------------------------ gemeinsame Pipeline
export function generateMap(seed: number, mapId: MapId = 'schlei', players = 2): GameMap {
  const NS = players > 2 ? 4 : 2; // aktive Startplätze
  const p = new Painter(seed, mapSizeFor(players), NS);
  const { w, h, terrain, trees, rng } = p;
  const variant = new Uint8Array(w * h);
  for (let i = 0; i < variant.length; i++) variant[i] = rng.int(256);
  const info = MAP_INFO[mapId];
  const r = PAINTERS[mapId](p);
  p.sc = 1;
  const idx = (x: number, y: number) => y * w + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  // Vier Spieler: die beiden weiteren Plätze ergänzen die ersten zwei zu einem Quadrat (gleiche Abstände),
  // notfalls zur Mitte hin auf festes Land gerückt; der neutrale Markt rückt in die Mitte
  if (NS > 2 && mapId !== 'random' && !r.fixed4) {
    const solid = (t: number) => t === T.GRAS || t === T.HEIDE || t === T.LEHM || t === T.KNICK;
    const landScore = (cx: number, cy: number) => {
      let n = 0;
      for (let dy = -6; dy <= 6; dy++)
        for (let dx = -6; dx <= 6; dx++) if (inside(cx + dx, cy + dy) && solid(p.terrain[idx(cx + dx, cy + dy)])) n++;
      return n / 169;
    };
    // Kandidaten: festes Land mit freiem Kern für Dorfzentrum und Startfeld
    const cand: P2[] = [];
    for (let y = 12; y < h - 12; y += 3)
      for (let x = 12; x < w - 12; x += 3) {
        let core = true;
        for (let yy = -3; yy <= 5 && core; yy++)
          for (let xx = -3; xx <= 3 && core; xx++) if (!solid(p.terrain[idx(x + xx, y + yy)])) core = false;
        if (core && landScore(x, y) >= 0.8) cand.push({ x, y });
      }
    // die beiden Plätze, die den kleinsten Abstand aller vier Siedlungen am größten machen
    const a = r.slots[0], b = r.slots[1];
    const dist = (p1: P2, p2: P2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const dab = dist(a, b);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, R = dab / 2;
    // Abweichung vom gemeinsamen Abstand zur Mitte wird bestraft: alle vier sollen ähnlich weit vom Markt entfernt sein
    const off = cand.map((c) => Math.abs(dist(c, mid) - R) * 0.8);
    const pre = cand.map((c, i) => Math.min(dist(c, a), dist(c, b)) - off[i]);
    let best: [P2, P2] | null = null, bs = -Infinity;
    for (let i = 0; i < cand.length; i++) {
      if (pre[i] <= bs) continue;
      for (let j = i + 1; j < cand.length; j++) {
        const sc = Math.min(dab, pre[i], pre[j], dist(cand[i], cand[j]) - off[i] - off[j]) - (off[i] + off[j]) * 0.5;
        if (sc > bs) {
          bs = sc;
          best = [cand[i], cand[j]];
        }
      }
    }
    r.slots = [...r.slots];
    if (best) {
      // Platz 3 auf der Seite von Platz 1 (Reihenfolge stabil), Markt in die Mitte der vier
      [r.slots[2], r.slots[3]] = best;
      const q = r.slots.slice(0, 4);
      r.market = { x: Math.round(q.reduce((s2, c) => s2 + c.x, 0) / 4), y: Math.round(q.reduce((s2, c) => s2 + c.y, 0) / 4) };
    }
  }
  const near = (x: number, y: number, pred: (t: number) => boolean) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && inside(nx, ny) && pred(terrain[idx(nx, ny)])) return true;
      }
    return false;
  };

  // Ufer und Flachwasser
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = terrain[idx(x, y)];
      if ((t === T.GRAS || t === T.HEIDE) && near(x, y, (q) => q === T.WASSER)) {
        terrain[idx(x, y)] = T.UFER;
        trees[idx(x, y)] = 0;
      }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (terrain[idx(x, y)] === T.WASSER && near(x, y, (q) => q === T.UFER)) terrain[idx(x, y)] = T.FLACH;

  const slotC = r.slots;
  const act = Array.from({ length: NS }, (_, k) => k); // aktive Startplätze
  /** Schwerpunkt der übrigen aktiven Startplätze (bei zwei Spielern: der Gegner) */
  const othersC = (si: number): P2 => {
    const o = act.filter((k) => k !== si);
    return { x: o.reduce((a, k) => a + slotC[k].x, 0) / o.length, y: o.reduce((a, k) => a + slotC[k].y, 0) / o.length };
  };
  const clearZones = [...slotC.slice(0, NS).map((s) => ({ x: s.x, y: s.y, r: 7 })), { x: r.market.x, y: r.market.y, r: 6 }, { x: r.site.x, y: r.site.y, r: 4 }];
  const inClear = (x: number, y: number, extra = 0) => clearZones.some((z) => Math.hypot(x - z.x, y - z.y) < z.r + extra);

  // Lehm (Grundmoräne) und Rauschwald
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (terrain[i] === T.GRAS && p.n3(x + 50, y + 50) > r.clay && !inClear(x, y)) terrain[i] = T.LEHM;
    }
  const forestOn = r.forestOn ?? [T.GRAS];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      const v = p.n2(x, y) * 0.6 + p.n1(x + 13, y + 7) * 0.4;
      if (v > r.forest && forestOn.includes(terrain[i]) && !inClear(x, y, 1)) trees[i] = 50 + rng.int(40);
    }
  for (const z of clearZones.slice(0, 2)) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (inside(z.x + x, z.y + y)) trees[idx(z.x + x, z.y + y)] = 0;

  // Wege per A* (Wasser und Watt nur über Furten/Brücken)
  const carveRoad = (a: P2, bp: P2) => {
    const N = w * h;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const open = new MinHeap();
    const ax = Math.max(0, Math.min(w - 1, a.x)), ay = Math.max(0, Math.min(h - 1, a.y));
    const bx = Math.max(0, Math.min(w - 1, bp.x)), by = Math.max(0, Math.min(h - 1, bp.y));
    const s0 = idx(ax, ay), goal = idx(bx, by);
    g[s0] = 0;
    open.push(s0, 0);
    const done = new Uint8Array(N);
    let reached = false;
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) {
        reached = true;
        break;
      }
      if (done[cur]) continue;
      done[cur] = 1;
      const cx = cur % w, cy = Math.floor(cur / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inside(nx, ny)) continue;
        const ni = idx(nx, ny);
        const t = terrain[ni];
        if (isWater(t) || t === T.WATT) continue;
        let c = 1 + p.n3(nx * 2, ny * 2) * 0.6;
        if (trees[ni]) c += 6;
        if (t === T.MOOR) c += 3;
        if (t === T.UFER) c += 1.5;
        if (t === T.WEG) c = 0.4;
        if (g[cur] + c < g[ni]) {
          g[ni] = g[cur] + c;
          from[ni] = cur;
          open.push(ni, g[ni] + Math.abs(nx - bx) + Math.abs(ny - by) * 0.9);
        }
      }
    }
    if (!reached) return;
    let cur = goal;
    let guard = 0;
    while (cur !== -1 && guard++ < N) {
      if (terrain[cur] !== T.MOOR) terrain[cur] = T.WEG;
      trees[cur] = 0;
      cur = from[cur];
    }
  };
  const below = (c: P2, dy: number) => ({ x: c.x, y: Math.min(h - 1, c.y + dy) });
  carveRoad(below(slotC[0], 2), below(r.market, 2));
  carveRoad(below(slotC[1], 2), below(r.market, 2));
  carveRoad(below(slotC[0], 2), below(slotC[1], 2));
  carveRoad(below(r.market, -2), r.site);
  if (NS > 2) {
    for (const k of [2, 3]) carveRoad(below(slotC[k], 2), below(r.market, 2));
    // Ring zwischen benachbarten Startplätzen
    carveRoad(below(slotC[0], 2), below(slotC[2], 2));
    carveRoad(below(slotC[1], 2), below(slotC[3], 2));
  } else {
    carveRoad(slotC[2], r.market);
    carveRoad(slotC[3], r.market);
  }
  for (const [a, b] of r.roads ?? []) carveRoad(a, b);

  // Feldgrenzen: Knicks bzw. Gräben auf einem Raster, Tore an Wegen
  const segRng = new Rng(seed ^ 0x5eed);
  const isLine = (x: number, y: number) => (x + 2) % 10 === 0 || (y + 6) % 10 === 0;
  const canHedge = (x: number, y: number) => {
    const t = terrain[idx(x, y)];
    return (t === T.GRAS || t === T.LEHM) && !trees[idx(x, y)] && !inClear(x, y, 2) && !near(x, y, (q) => q === T.UFER || isWater(q) || q === T.WATT);
  };
  const placeSegment = (tiles: [number, number][]) => {
    if (segRng.next() > r.hedgeDensity) return;
    const mid = tiles[Math.floor(tiles.length / 2)];
    const kind = r.hedge(mid[0], mid[1]);
    if (!kind) return;
    const gap = tiles.length > 4 && segRng.next() < 0.45 ? 1 + segRng.int(tiles.length - 2) : -1;
    tiles.forEach(([x, y], k) => {
      const i = idx(x, y);
      if (terrain[i] === T.WEG) {
        if (kind === 'knick') terrain[i] = T.TOR;
        return;
      }
      if (k === gap) return;
      if (canHedge(x, y)) terrain[i] = kind === 'knick' ? T.KNICK : T.GRABEN;
    });
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if ((x + 2) % 10 === 0 && (y + 6) % 10 === 1) {
        const seg: [number, number][] = [];
        for (let k = 0; k < 9 && y + k < h; k++) seg.push([x, y + k]);
        placeSegment(seg);
      }
      if ((y + 6) % 10 === 0 && (x + 2) % 10 === 1) {
        const seg: [number, number][] = [];
        for (let k = 0; k < 9 && x + k < w; k++) seg.push([x + k, y]);
        placeSegment(seg);
      }
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (terrain[i] === T.TOR && (!near(x, y, (q) => q === T.KNICK) || !isLine(x, y))) terrain[i] = T.WEG;
    }

  // Deiche und Wälle: lückenlose Linien, Wege werden zu Toren (Stöpen)
  for (const ln of r.lines ?? []) {
    const t = ln.kind === 'deich' ? T.DEICH : T.WALL;
    for (let k = 0; k < ln.pts.length - 1; k++)
      p.line4(ln.pts[k], ln.pts[k + 1], (x, y) => {
        if (!inside(x, y)) return;
        const i = idx(x, y);
        const cur = terrain[i];
        if (cur === T.WEG || cur === T.TOR) terrain[i] = T.TOR;
        else if (!isWater(cur)) {
          terrain[i] = t;
          trees[i] = 0;
        }
      });
    for (const gt of ln.gates ?? []) {
      const gr = gt.r ?? 1;
      for (let dy = -gr; dy <= gr; dy++)
        for (let dx = -gr; dx <= gr; dx++) {
          const x = gt.x + dx, y = gt.y + dy;
          if (inside(x, y) && terrain[idx(x, y)] === t) terrain[idx(x, y)] = T.TOR;
        }
    }
  }

  const clearArea = (cx: number, cy: number, rad: number) => {
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++) {
        const px = cx + x, py = cy + y;
        if (!inside(px, py)) continue;
        const i = idx(px, py);
        trees[i] = 0;
        const t = terrain[i];
        if (t !== T.WEG && t !== T.TOR && !isWater(t) && t !== T.WATT) terrain[i] = T.GRAS;
      }
  };
  for (const s of slotC.slice(0, NS)) clearArea(s.x, s.y, 3);

  // Fischgründe: Startplätze ohne Ufer in Baureichweite erhalten einen Fischteich
  const shoreSpots = (c: P2) => {
    let n = 0;
    for (let y = c.y - 10; y <= c.y + 9; y++)
      for (let x = c.x - 10; x <= c.x + 9; x++) {
        if (!inside(x, y) || !inside(x + 1, y + 1)) continue;
        let ok = true;
        for (let k = 0; k < 4 && ok; k++) {
          const i = idx(x + (k & 1), y + (k >> 1));
          const t = terrain[i];
          if (trees[i] || !(t === T.GRAS || t === T.UFER || t === T.LEHM || t === T.HEIDE)) ok = false;
        }
        if (!ok) continue;
        let water = 0;
        for (let yy = y - 1; yy <= y + 2; yy++)
          for (let xx = x - 1; xx <= x + 2; xx++) if (inside(xx, yy) && (isWater(terrain[idx(xx, yy)]) || terrain[idx(xx, yy)] === T.WATT)) water++;
        if (water >= 3) n++;
      }
    return n;
  };
  for (const si of act) {
    const c = slotC[si], o = othersC(si);
    const need = Math.max(10, Math.round(Math.max(...act.filter((k) => k !== si).map((k) => shoreSpots(slotC[k]))) * 0.35));
    if (shoreSpots(c) >= need) continue;
    const away = Math.atan2(c.y - o.y, c.x - o.x);
    let dug = false;
    for (let k = 0; k < 16 && !dug; k++) {
      const ang = away + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 8;
      const px = Math.round(c.x + Math.cos(ang) * 9.5), py = Math.round(c.y + Math.sin(ang) * 9.5);
      let free = true;
      for (let y = py - 3; y <= py + 3 && free; y++)
        for (let x = px - 3; x <= px + 3 && free; x++) {
          if (!inside(x, y)) free = false;
          else {
            const t = terrain[idx(x, y)];
            if (t === T.WEG || t === T.TOR || t === T.WALL || t === T.DEICH || Math.hypot(x - c.x, y - c.y) < 3) free = false;
          }
        }
      if (!free) continue;
      p.blob(px, py, 2.2, (x, y) => {
        terrain[idx(x, y)] = T.WASSER;
        trees[idx(x, y)] = 0;
      }, 0.8);
      for (let y = py - 4; y <= py + 4; y++)
        for (let x = px - 4; x <= px + 4; x++) {
          if (!inside(x, y)) continue;
          const i = idx(x, y);
          const t = terrain[i];
          if (t !== T.WASSER && near(x, y, (q) => q === T.WASSER)) {
            if (t === T.KNICK || t === T.GRABEN || t === T.GRAS || t === T.HEIDE || t === T.LEHM || t === T.MOOR) terrain[i] = T.UFER;
            trees[i] = 0;
          }
        }
      dug = shoreSpots(c) >= need;
    }
  }

  // ---------------------------------------------------------------- Fairnessausgleich
  const passable = (i: number) => terrainWalkable(terrain[i]) && !trees[i];
  const bfs = (start: P2) => {
    const d = new Int32Array(w * h).fill(-1);
    const q: number[] = [];
    const s = idx(start.x, start.y);
    d[s] = 0;
    q.push(s);
    for (let qi = 0; qi < q.length; qi++) {
      const c = q[qi];
      const cx = c % w, cy = Math.floor(c / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inside(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (d[ni] >= 0 || !passable(ni)) continue;
        d[ni] = d[c] + 1;
        q.push(ni);
      }
    }
    return d;
  };
  const starts = act.map((k) => below(slotC[k], 2));
  let ds = starts.map((st) => bfs(st));
  const rebfs = () => (ds = starts.map((st) => bfs(st)));
  /** Spannweite der Wegelängen aller Startplätze zu Kachel i (−1: nicht von allen erreichbar) */
  const spread = (i: number): { lo: number; hi: number } => {
    let lo = Infinity, hi = -1;
    for (const d of ds) {
      if (d[i] < 0) return { lo: -1, hi: -1 };
      lo = Math.min(lo, d[i]);
      hi = Math.max(hi, d[i]);
    }
    return { lo, hi };
  };
  /** Ort nahe dem Wunschpunkt, von beiden Startplätzen gleich weit entfernt und erreichbar. */
  const fairSpot = (want: P2, rad: number, needLand3: boolean) => {
    let best = want, bs = Infinity;
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const x = want.x + dx, y = want.y + dy;
        if (x < 3 || y < 3 || x > w - 4 || y > h - 4) continue;
        const i = idx(x, y);
        const { lo: a, hi: b } = spread(i);
        if (a < 0) continue;
        if (needLand3) {
          let ok = true;
          for (let yy = -1; yy <= 1 && ok; yy++)
            for (let xx = -1; xx <= 1 && ok; xx++) {
              const t = terrain[idx(x + xx, y + yy)];
              if (isWater(t) || t === T.WATT || t === T.WALL || t === T.DEICH) ok = false;
            }
          if (!ok) continue;
        }
        const score = Math.abs(a - b) * 3 + Math.hypot(dx, dy) * (NS > 2 ? 0.15 : 0.6);
        if (score < bs) {
          bs = score;
          best = { x, y };
        }
      }
    return best;
  };
  const balanced = (q: P2) => {
    const { lo, hi } = spread(idx(q.x, q.y));
    return lo >= 0 && hi - lo <= Math.max(3, (NS > 2 ? 0.12 : 0.08) * hi);
  };
  let market = fairSpot(r.market, 9, true);
  if (!balanced(market)) market = fairSpot(r.market, 18, true);
  if (!balanced(market)) market = fairSpot(r.market, 30, true);
  if (NS > 2 && !balanced(market)) market = fairSpot(r.market, w, true); // vier Spieler: ganze Karte absuchen
  clearArea(market.x, market.y, 2);
  rebfs();
  let site = fairSpot(r.site, 9, false);
  if (!balanced(site)) site = fairSpot(r.site, 16, false);
  if (!terrainWalkable(terrain[idx(site.x, site.y)])) terrain[idx(site.x, site.y)] = T.GRAS;
  trees[idx(site.x, site.y)] = 0;

  // Lehm-Garantie: freie 3x3-Fläche in Baureichweite jedes Startplatzes
  for (const si of act) {
    const { x: cx, y: cy } = slotC[si];
    for (let rr = 5, done = false; rr <= 9 && !done; rr++)
      for (let k = 0; k < 16 && !done; k++) {
        const x0 = cx + Math.round(Math.cos((k * Math.PI) / 8) * rr) - 1, y0 = cy + Math.round(Math.sin((k * Math.PI) / 8) * rr) - 1;
        let ok = true;
        for (let y = y0 - 1; y <= y0 + 3 && ok; y++)
          for (let x = x0 - 1; x <= x0 + 3 && ok; x++) {
            if (!inside(x, y)) ok = false;
            else {
              const t = terrain[idx(x, y)];
              if (t !== T.GRAS && t !== T.LEHM && t !== T.HEIDE) ok = false;
            }
          }
        if (!ok) continue;
        for (let y = y0; y < y0 + 3; y++)
          for (let x = x0; x < x0 + 3; x++) {
            terrain[idx(x, y)] = T.LEHM;
            trees[idx(x, y)] = 0;
          }
        done = true;
      }
  }

  // Holz in Reichweite angleichen
  const woodNear = (c: P2) => {
    let n = 0;
    for (let dy = -15; dy <= 15; dy++)
      for (let dx = -15; dx <= 15; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (inside(x, y) && Math.hypot(dx, dy) <= 15 && trees[idx(x, y)]) n++;
      }
    return n;
  };
  for (let guard = 0; guard < 24; guard++) {
    const wd = act.map((k) => woodNear(slotC[k]));
    const lo = Math.min(...wd), hi = Math.max(...wd);
    const poor = act[wd.indexOf(lo)];
    if (lo >= 45 && lo >= hi * 0.85) break;
    const s = slotC[poor], o = othersC(poor);
    const ang0 = Math.atan2(s.y - o.y, s.x - o.x);
    let placed = false;
    for (let j = 0; j < 8 && !placed; j++) {
      const dist = 7 + ((guard + j) % 7);
      for (let k = 0; k < 16 && !placed; k++) {
        const ang = ang0 + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI) / 8;
        const fx = Math.round(s.x + Math.cos(ang) * dist), fy = Math.round(s.y + Math.sin(ang) * dist);
        if (!inside(fx, fy) || inClear(fx, fy)) continue;
        const t = terrain[idx(fx, fy)];
        if ((t !== T.GRAS && t !== T.HEIDE) || trees[idx(fx, fy)]) continue;
        p.forestBlob(fx, fy, 2.6);
        placed = true;
      }
    }
    if (!placed) break;
  }

  // Zu viel Holz auf einer Seite: äußere Bäume des reicheren Startplatzes lichten
  {
    const wd = act.map((k) => woodNear(slotC[k]));
    const lo = Math.min(...wd);
    for (const k of act) {
      if (lo >= wd[k] * 0.88) continue;
      const rich = slotC[k];
      let excess = wd[k] - Math.ceil(lo / 0.9);
      const cand: { i: number; d: number }[] = [];
      for (let dy = -15; dy <= 15; dy++)
        for (let dx = -15; dx <= 15; dx++) {
          const x = rich.x + dx, y = rich.y + dy, d = Math.hypot(dx, dy);
          if (inside(x, y) && d <= 15 && trees[idx(x, y)]) cand.push({ i: idx(x, y), d });
        }
      cand.sort((p1, p2) => p2.d - p1.d);
      for (const c of cand) {
        if (excess-- <= 0) break;
        trees[c.i] = 0;
      }
    }
  }

  // Ackerland in Reichweite angleichen (Heide/Moor nahe dem ärmeren Startplatz urbar machen)
  const farmNear = (c: P2) => {
    let n = 0;
    for (let dy = -10; dy <= 10; dy++)
      for (let dx = -10; dx <= 10; dx++) {
        const x = c.x + dx, y = c.y + dy;
        if (!inside(x, y) || Math.hypot(dx, dy) > 10) continue;
        const t = terrain[idx(x, y)];
        if ((t === T.GRAS || t === T.LEHM) && !trees[idx(x, y)]) n++;
      }
    return n;
  };
  const farmBest = (poor: number) => Math.max(...act.filter((k) => k !== poor).map((k) => farmNear(slotC[k])));
  for (const poor of act) {
    const a = farmNear(slotC[poor]), b = farmBest(poor);
    // Ausgleich zum reicheren Platz und Mindestfläche (Heide-/Moorkarten)
    let deficit = Math.max(b * 0.92 - a, 200 - a);
    const s = slotC[poor];
    for (let rad = 2; rad <= 10 && deficit > 0; rad++)
      for (let dy = -rad; dy <= rad && deficit > 0; dy++)
        for (let dx = -rad; dx <= rad && deficit > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const x = s.x + dx, y = s.y + dy;
          if (!inside(x, y)) continue;
          const i = idx(x, y);
          if ((terrain[i] === T.HEIDE || terrain[i] === T.MOOR) && !trees[i]) {
            terrain[i] = T.GRAS;
            deficit--;
          }
        }
  }
  // Reicht das nicht (Küsten- und Waldplätze), Wald nahe dem Startplatz roden – solange genug Holz in Reichweite bleibt
  for (const poor of act) {
    const a = farmNear(slotC[poor]), b = farmBest(poor);
    let deficit = Math.max(b * 0.8 - a, 140 - a);
    if (deficit <= 0) continue;
    const s = slotC[poor];
    let spare = woodNear(s) - Math.max(55, Math.max(...act.filter((k) => k !== poor).map((k) => woodNear(slotC[k]))) * 0.85);
    for (let rad = 3; rad <= 10 && deficit > 0 && spare > 0; rad++)
      for (let dy = -rad; dy <= rad && deficit > 0 && spare > 0; dy++)
        for (let dx = -rad; dx <= rad && deficit > 0 && spare > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          const x = s.x + dx, y = s.y + dy;
          if (!inside(x, y)) continue;
          const i = idx(x, y);
          if ((terrain[i] === T.GRAS || terrain[i] === T.LEHM) && trees[i]) {
            trees[i] = 0;
            deficit--;
            spare--;
          }
        }
  }

  // Nachkontrolle: Wälder und Teiche können Wege verlängert haben – Markt und Fundstelle ggf. erneut ausrichten
  rebfs();
  for (let pass = 0; pass < 4 && !balanced(market); pass++) {
    // Freiräumen kann Gräben/Knicks öffnen und Wege verkürzen – daher mehrfach prüfen
    for (const rad of NS > 2 ? [6, 12, 20, 30, w] : [6, 12, 20, 30]) {
      const m2 = fairSpot(market, rad, true);
      if (balanced(m2)) {
        market = m2;
        break;
      }
    }
    clearArea(market.x, market.y, 2);
    rebfs();
  }
  for (const rad of [8, 14, 22, 48]) {
    if (balanced(site)) break;
    site = fairSpot(r.site, rad, false);
  }
  if (!terrainWalkable(terrain[idx(site.x, site.y)])) terrain[idx(site.x, site.y)] = T.GRAS;
  trees[idx(site.x, site.y)] = 0;

  const nm = r.names ?? info;
  const names = [...nm.slotNames];
  if (NS > 2 && r.names4) [names[2], names[3]] = r.names4;
  else if (NS > 2 && r.places && p.geo) {
    const used = new Set(names.slice(0, 2));
    for (const k of [2, 3]) {
      let bn = names[k], bd = Infinity;
      for (const [n, lon, lat] of r.places) {
        if (used.has(n)) continue;
        const q = p.ll(lon, lat);
        const d = Math.hypot(q.x - slotC[k].x, q.y - slotC[k].y);
        if (d < bd) {
          bd = d;
          bn = n;
        }
      }
      names[k] = bn;
      used.add(bn);
    }
  }
  const slots: Slot[] = slotC.map((c, k) => ({ name: names[k], x: c.x - 1, y: c.y - 1 }));
  const labels = [
    ...slots.slice(0, NS).map((s) => ({ name: s.name, x: s.x + 1, y: s.y - 3 })),
    { name: nm.marketName, x: market.x, y: market.y - 4 },
    { name: nm.siteName, x: site.x, y: site.y + 4 },
    ...r.labels,
  ].map((l) => ({ ...l, x: Math.max(1, Math.min(w - 2, l.x)), y: Math.max(1, Math.min(h - 2, l.y)) }));

  return {
    id: mapId, name: r.names?.name ?? info.name, w, h, seed, terrain, trees, variant, slots,
    market: { x: market.x - 1, y: market.y - 1 }, marketName: nm.marketName,
    site: { x: site.x, y: site.y, name: nm.siteName, text: nm.siteText }, labels,
  };
}
