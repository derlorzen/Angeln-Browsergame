// Spieldaten: Ressourcen, Gebäude, Einheiten. Alle Zeiten in Sekunden, Raten pro Sekunde.

export const RES = ['holz', 'getreide', 'fisch', 'lehm', 'waren', 'taler'] as const;
export type Res = (typeof RES)[number];
export type Cost = Partial<Record<Res, number>>;

export const RES_NAME: Record<Res, string> = {
  holz: 'Holz',
  getreide: 'Getreide',
  fisch: 'Fisch',
  lehm: 'Lehm',
  waren: 'Waren',
  taler: 'Taler',
};

export const BUILDING_TYPES = [
  'dorfzentrum',
  'wohnhaus',
  'holzfaeller',
  'bauernhof',
  'muehle',
  'heringszaun',
  'raeucherei',
  'lehmgrube',
  'markt',
  'kaserne',
  'brarupmarkt',
  // 18. Jahrhundert
  'manufaktur',
  'hafen',
  'schanze',
  // 20. Jahrhundert
  'bahnhof',
  'fabrik',
  'bunker',
  // 22. Jahrhundert
  'vertikalfarm',
  'gezeitenwerk',
  'schildturm',
  // Parteigebäude (nur für eine Partei)
  'meierei',
  'gestuet',
  'salzsiederei',
  'zollhaus',
  // Lager
  'speicher',
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export const UNIT_TYPES = [
  'arbeiter', 'spaeher', 'landsknecht', 'schuetze', 'knickwaechter', 'gutsreiter', 'grabenspringer', 'musketier',
  'fuesilier', 'kanone', 'infanterist', 'panzer', 'exosoldat', 'drohne',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export type Placement = 'normal' | 'ufer' | 'lehm';

export interface BuildingDef {
  name: string;
  desc: string;
  w: number;
  h: number;
  hp: number;
  cost: Cost;
  buildTime: number; // Arbeiter-Sekunden
  placement: Placement;
  requires?: BuildingType[];
  buildable: boolean;
  popCap?: number;
  dropoff?: ('holz' | 'all')[];
  staffSlots?: number; // Arbeiter, die hier zugewiesen werden können
  trains?: UnitType[];
  vision: number;
  /** Verarbeitung: Eingang -> Ausgang pro Zyklus */
  process?: { input: Cost; output: Cost; time: number };
  /** Rohstoffgewinnung pro zugewiesenem Arbeiter bzw. automatisch */
  produce?: { res: Res; amount: number; time: number; perWorker: boolean };
  attack?: { dmg: number; range: number; cooldown: number };
  /** ab diesem Zeitalter baubar (Standard 1) */
  age?: number;
  /** Bahnhof: Talerfaktor für alle Verkäufe des Besitzers */
  talerMul?: number;
  /** Schusseffekt der Verteidigung: 1 Pfeil, 3 Granate, 4 Energiestrahl */
  shot?: 1 | 3 | 4;
  /** nur für diese Partei baubar */
  faction?: 'angeln' | 'schwansen' | 'friesen' | 'daenen';
  /** Zeitfaktor für die Ausbildung in diesem Gebäude */
  trainMul?: number;
  /** Lagerplatz je Rohstoff (außer Talern) */
  storage?: number;
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  dorfzentrum: {
    name: 'Dorfzentrum',
    desc: 'Herz der Siedlung. Bildet Arbeiter aus, nimmt alle Rohstoffe an und verteidigt sich mit Schützen. Wird es zerstört, ist die Partie verloren.',
    w: 3, h: 3, hp: 2000, cost: {}, buildTime: 120, placement: 'normal', buildable: false,
    popCap: 10, dropoff: ['all'], trains: ['arbeiter'], vision: 9, storage: 400,
    attack: { dmg: 7, range: 7, cooldown: 2 },
  },
  wohnhaus: {
    name: 'Wohnhaus',
    desc: 'Reetgedecktes Katenhaus. Erhöht die Bevölkerungsgrenze um 5.',
    w: 2, h: 2, hp: 300, cost: { holz: 30, lehm: 20 }, buildTime: 18, placement: 'normal', buildable: true,
    popCap: 5, vision: 4,
  },
  holzfaeller: {
    name: 'Holzfällerlager',
    desc: 'Arbeiter liefern hier geschlagenes Holz ab. Nah am Wald bauen, um Wege zu sparen.',
    w: 2, h: 2, hp: 350, cost: { holz: 50 }, buildTime: 15, placement: 'normal', buildable: true,
    dropoff: ['holz'], vision: 5,
  },
  bauernhof: {
    name: 'Bauernhof',
    desc: 'Legt Felder an. Bis zu 3 zugewiesene Arbeiter ernten je 1 Getreide alle 3 s (mit mind. 3 Feldern).',
    w: 2, h: 2, hp: 400, cost: { holz: 60, lehm: 20 }, buildTime: 22, placement: 'normal', buildable: true,
    staffSlots: 3, vision: 5, produce: { res: 'getreide', amount: 1, time: 3, perWorker: true },
  },
  muehle: {
    name: 'Bockmühle',
    desc: 'Hölzerne Bockwindmühle. Mahlt 4 Getreide zu 3 Waren (Mehl) alle 8 s.',
    w: 2, h: 2, hp: 400, cost: { holz: 80, lehm: 40 }, buildTime: 28, placement: 'normal', buildable: true,
    requires: ['bauernhof'], vision: 6, process: { input: { getreide: 4 }, output: { waren: 3 }, time: 8 },
  },
  heringszaun: {
    name: 'Heringszaun',
    desc: 'Stationäre Fangvorrichtung aus trichterförmigen Flechtzäunen im Uferwasser – berühmt ist der Kappelner Heringszaun in der Schlei. Fängt selbstständig 1 Fisch alle 2,5 s. Nur am Ufer baubar.',
    w: 2, h: 2, hp: 300, cost: { holz: 60 }, buildTime: 20, placement: 'ufer', buildable: true,
    vision: 5, produce: { res: 'fisch', amount: 1, time: 2.5, perWorker: false },
  },
  raeucherei: {
    name: 'Räucherei',
    desc: 'Räuchert 3 Fisch mit 1 Holz zu 2 Waren (Bückling) alle 8 s.',
    w: 2, h: 2, hp: 400, cost: { holz: 50, lehm: 50 }, buildTime: 24, placement: 'normal', buildable: true,
    requires: ['heringszaun'], vision: 5, process: { input: { fisch: 3, holz: 1 }, output: { waren: 2 }, time: 8 },
  },
  lehmgrube: {
    name: 'Lehmgrube',
    desc: 'Nur auf Lehmboden. Bis zu 3 zugewiesene Arbeiter stechen je 1 Lehm alle 3 s.',
    w: 2, h: 2, hp: 350, cost: { holz: 60 }, buildTime: 18, placement: 'lehm', buildable: true,
    staffSlots: 3, vision: 5, produce: { res: 'lehm', amount: 1, time: 3, perWorker: true },
  },
  markt: {
    name: 'Markt',
    desc: 'Verkauft Waren gegen Taler und Prestige, kauft Holz und Lehm.',
    w: 3, h: 3, hp: 600, cost: { holz: 100, lehm: 60 }, buildTime: 32, placement: 'normal', buildable: true,
    requires: ['muehle'], vision: 6,
  },
  kaserne: {
    name: 'Kaserne',
    desc: 'Bildet Späher, Landsknechte und Armbrustschützen aus.',
    w: 3, h: 3, hp: 700, cost: { holz: 120, lehm: 80 }, buildTime: 36, placement: 'normal', buildable: true,
    trains: ['spaeher', 'landsknecht', 'schuetze', 'fuesilier', 'kanone', 'infanterist', 'panzer', 'exosoldat', 'drohne'], vision: 6,
  },
  brarupmarkt: {
    name: 'Brarup-Markt',
    desc: 'Neutraler Handelsplatz. Wer ihn mit eigenen Einheiten allein besetzt, erhält bessere Preise, doppeltes Prestige je Verkauf und stetig Prestige.',
    w: 3, h: 3, hp: 99999, cost: {}, buildTime: 1, placement: 'normal', buildable: false, vision: 0,
  },
  // ---------------------------------------------------------------- 18. Jahrhundert
  manufaktur: {
    name: 'Leinenmanufaktur', age: 2,
    desc: 'Webt aus Flachs (Getreide) und Holz Leinen: 3 Getreide + 1 Holz → 4 Waren. Arbeitet selbstständig.',
    w: 3, h: 3, hp: 800, cost: { holz: 150, lehm: 120, taler: 50 }, buildTime: 40, placement: 'normal', buildable: true,
    requires: ['muehle'], vision: 6, process: { input: { getreide: 3, holz: 1 }, output: { waren: 4 }, time: 7 },
  },
  hafen: {
    name: 'Hafen', age: 2,
    desc: 'Steg mit Fischkuttern. Fängt selbstständig 1 Fisch alle 1,1 s – mehr als doppelt so viel wie ein Heringszaun. Nur am Ufer.',
    w: 2, h: 2, hp: 650, cost: { holz: 180, lehm: 60 }, buildTime: 35, placement: 'ufer', buildable: true, vision: 7,
    produce: { res: 'fisch', amount: 1, time: 1.1, perWorker: false }, dropoff: ['all'],
  },
  schanze: {
    name: 'Sternschanze', age: 2,
    desc: 'Erdwerk mit Geschützen. Beschießt Feinde auf 7 Kacheln.',
    w: 2, h: 2, hp: 1500, cost: { lehm: 180, holz: 80 }, buildTime: 40, placement: 'normal', buildable: true, vision: 8,
    attack: { dmg: 14, range: 7, cooldown: 2 }, shot: 3,
  },
  // ---------------------------------------------------------------- 20. Jahrhundert
  bahnhof: {
    name: 'Bahnhof', age: 3,
    desc: 'Anschluss an die Eisenbahn: nimmt alle Rohstoffe an und bringt +25 % Taler bei jedem Warenverkauf.',
    w: 3, h: 3, hp: 1200, cost: { holz: 200, lehm: 250, taler: 150 }, buildTime: 50, placement: 'normal', buildable: true,
    requires: ['markt'], vision: 7, dropoff: ['all'], talerMul: 1.25,
  },
  fabrik: {
    name: 'Konservenfabrik', age: 3,
    desc: 'Verarbeitet Fisch und Getreide in großen Mengen: 3 Fisch + 2 Getreide → 8 Waren.',
    w: 3, h: 3, hp: 1100, cost: { holz: 150, lehm: 300, taler: 150 }, buildTime: 55, placement: 'normal', buildable: true,
    requires: ['raeucherei'], vision: 6, process: { input: { fisch: 3, getreide: 2 }, output: { waren: 8 }, time: 8 },
  },
  bunker: {
    name: 'Bunker', age: 3,
    desc: 'Betonstellung mit Maschinengewehr. Beschießt Feinde auf 8 Kacheln.',
    w: 2, h: 2, hp: 2600, cost: { lehm: 350, taler: 80 }, buildTime: 50, placement: 'normal', buildable: true, vision: 9,
    attack: { dmg: 22, range: 8, cooldown: 2.2 }, shot: 3,
  },
  // ---------------------------------------------------------------- 22. Jahrhundert
  vertikalfarm: {
    name: 'Vertikalfarm', age: 4,
    desc: 'Gewächsturm mit Kunstlicht: erzeugt selbstständig 2 Getreide alle 1,5 s, ohne Felder und Arbeiter.',
    w: 2, h: 2, hp: 1200, cost: { lehm: 300, waren: 80, taler: 200 }, buildTime: 50, placement: 'normal', buildable: true, vision: 6,
    produce: { res: 'getreide', amount: 2, time: 1.5, perWorker: false },
  },
  gezeitenwerk: {
    name: 'Gezeitenkraftwerk', age: 4,
    desc: 'Nutzt Ebbe und Flut. Verkauft Strom: 1 Ware alle 2 s, selbstständig. Nur am Ufer.',
    w: 2, h: 2, hp: 1200, cost: { lehm: 300, taler: 300 }, buildTime: 50, placement: 'ufer', buildable: true, vision: 7,
    produce: { res: 'waren', amount: 1, time: 2, perWorker: false },
  },
  schildturm: {
    name: 'Schildturm', age: 4,
    desc: 'Energieschild mit Strahlwaffe. Beschießt Feinde auf 9 Kacheln.',
    w: 2, h: 2, hp: 3600, cost: { lehm: 400, taler: 250 }, buildTime: 55, placement: 'normal', buildable: true, vision: 10,
    attack: { dmg: 34, range: 9, cooldown: 2.2 }, shot: 4,
  },
  // ---------------------------------------------------------------- Parteigebäude
  meierei: {
    name: 'Meierei', faction: 'angeln',
    desc: 'Angler Rotvieh gibt Milch für Butter und Käse: 2 Getreide (Futter) → 3 Waren alle 5 s, selbstständig. Nur für Angeliter.',
    w: 2, h: 2, hp: 500, cost: { holz: 100, lehm: 50 }, buildTime: 25, placement: 'normal', buildable: true,
    requires: ['bauernhof'], vision: 5, process: { input: { getreide: 2 }, output: { waren: 3 }, time: 5 },
  },
  gestuet: {
    name: 'Gestüt', faction: 'schwansen',
    desc: 'Pferdezucht des Guts: bildet Jagdreiter und Gutsreiter 30 % schneller aus als die Kaserne. Nur für Schwansener.',
    w: 3, h: 3, hp: 700, cost: { holz: 140, lehm: 60 }, buildTime: 35, placement: 'normal', buildable: true,
    requires: ['kaserne'], vision: 6, trains: ['spaeher', 'gutsreiter'], trainMul: 0.7,
  },
  salzsiederei: {
    name: 'Salzsiederei', faction: 'friesen',
    desc: 'Salztorf aus dem Watt wird verbrannt und die Asche zu Salz gesiedet: 1 Ware alle 3 s, selbstständig. Nur am Ufer, nur für Nordfriesen.',
    w: 2, h: 2, hp: 450, cost: { holz: 120 }, buildTime: 25, placement: 'ufer', buildable: true, vision: 5,
    produce: { res: 'waren', amount: 1, time: 3, perWorker: false },
  },
  zollhaus: {
    name: 'Zollhaus', faction: 'daenen',
    desc: 'Königlicher Zoll auf Ochsen und Waren: 1 Taler alle 4 s, selbstständig. Nur für Dänen.',
    w: 2, h: 2, hp: 700, cost: { holz: 80, lehm: 120 }, buildTime: 30, placement: 'normal', buildable: true, vision: 6,
    produce: { res: 'taler', amount: 1, time: 4, perWorker: false },
  },
  speicher: {
    name: 'Speicher',
    desc: 'Kornboden und Lagerschuppen: +250 Lagerplatz je Rohstoff (Taler ausgenommen). Arbeiter können hier alle Rohstoffe abgeben.',
    w: 2, h: 2, hp: 500, cost: { holz: 70, lehm: 30 }, buildTime: 22, placement: 'normal', buildable: true, vision: 5,
    dropoff: ['all'], storage: 250,
  },
};

export interface UnitDef {
  name: string;
  desc: string;
  hp: number;
  speed: number; // Kacheln pro Sekunde
  dmg: number;
  range: number; // Kacheln
  cooldown: number;
  vision: number;
  cost: Cost;
  trainTime: number;
  pop: number;
  vsBuilding: number; // Schadensfaktor gegen Gebäude
  armor: number;
  military: boolean;
  mounted?: boolean; // beritten (Darstellung, Auswahlrahmen)
  knickJump?: boolean; // kann Knicks überwinden
  /** ab diesem Zeitalter ausbildbar (Standard 1) */
  age?: number;
  /** ab diesem Zeitalter nicht mehr ausbildbar (vorhandene bleiben) */
  obsolete?: number;
  vehicle?: boolean; // Fahrzeug/Geschütz (Darstellung)
  flying?: boolean; // fliegt über Wasser, Knicks und Wälle
  /** Schusseffekt: 0 Bolzen, 2 Musketenkugel, 3 Granate, 4 Energiestrahl */
  shot?: 0 | 2 | 3 | 4;
}

export const UNITS: Record<UnitType, UnitDef> = {
  arbeiter: {
    name: 'Arbeiter', desc: 'Schlägt Holz, errichtet Gebäude, arbeitet auf Höfen und in Lehmgruben.',
    hp: 40, speed: 1.7, dmg: 3, range: 1.1, cooldown: 1.5, vision: 6, cost: { getreide: 40 }, trainTime: 12, pop: 1,
    vsBuilding: 0.5, armor: 0, military: false,
  },
  spaeher: {
    name: 'Späher', desc: 'Schneller Reiter mit großer Sicht. Gut zum Erkunden, schwach im Kampf.',
    hp: 70, speed: 3.2, dmg: 4, range: 1.2, cooldown: 1.2, vision: 11, cost: { fisch: 40, taler: 25 }, trainTime: 14, pop: 1,
    vsBuilding: 0.3, armor: 0, military: true, mounted: true,
  },
  landsknecht: {
    name: 'Landsknecht', desc: 'Nahkämpfer mit Spieß. Robust, stark gegen Gebäude.', obsolete: 3,
    hp: 120, speed: 1.5, dmg: 11, range: 1.2, cooldown: 1.2, vision: 6, cost: { getreide: 40, fisch: 30, taler: 20 }, trainTime: 18, pop: 1,
    vsBuilding: 1.5, armor: 2, military: true,
  },
  schuetze: {
    name: 'Armbrustschütze', desc: 'Fernkämpfer. Trifft auf 5 Kacheln, aber verwundbar im Nahkampf.', obsolete: 3,
    hp: 60, speed: 1.5, dmg: 8, range: 5, cooldown: 1.7, vision: 8, cost: { getreide: 30, holz: 40, taler: 30 }, trainTime: 20, pop: 1,
    vsBuilding: 0.4, armor: 0, military: true,
  },
  // Spezialeinheiten der Parteien (nur in der eigenen Kaserne)
  knickwaechter: {
    name: 'Knickwächter', desc: 'Angeliter Bauernwehr mit Sense. Billig und schnell ausgebildet; neben einem Knick halbiert sich erlittener Schaden fast.',
    hp: 85, speed: 1.6, dmg: 8, range: 1.2, cooldown: 1.1, vision: 6, cost: { getreide: 35, holz: 10 }, trainTime: 11, pop: 1,
    vsBuilding: 1.0, armor: 1, military: true,
  },
  gutsreiter: {
    name: 'Gutsreiter', desc: 'Schwer gepanzerter Reiter der Schwansener Güter mit Lanze. Teuer, schnell und schlagkräftig.',
    hp: 170, speed: 2.6, dmg: 14, range: 1.3, cooldown: 1.3, vision: 8, cost: { getreide: 40, fisch: 40, taler: 70 }, trainTime: 24, pop: 1,
    vsBuilding: 0.8, armor: 3, military: true, mounted: true,
  },
  grabenspringer: {
    name: 'Grabenspringer', desc: 'Nordfriese mit Springstock: setzt über Knicks und Gräben hinweg, wo andere den Umweg über Tore nehmen müssen.',
    hp: 75, speed: 2.1, dmg: 8, range: 1.2, cooldown: 1.0, vision: 8, cost: { fisch: 40, holz: 15, taler: 10 }, trainTime: 14, pop: 1,
    vsBuilding: 0.8, armor: 0, military: true, knickJump: true,
  },
  musketier: {
    name: 'Musketier', desc: 'Königlich dänischer Musketier. Größte Reichweite und hoher Schaden, aber langes Nachladen.',
    hp: 65, speed: 1.4, dmg: 19, range: 6.2, cooldown: 3.4, vision: 8, cost: { getreide: 30, holz: 30, taler: 50 }, trainTime: 22, pop: 1,
    vsBuilding: 0.6, armor: 0, military: true, shot: 2,
  },
  // ---------------------------------------------------------------- spätere Zeitalter (Kaserne)
  fuesilier: {
    name: 'Füsilier', desc: 'Linieninfanterie des 18. Jahrhunderts mit Steinschlossflinte und Bajonett.', age: 2, obsolete: 4,
    hp: 95, speed: 1.5, dmg: 14, range: 5.2, cooldown: 2.4, vision: 8, cost: { getreide: 40, holz: 20, taler: 40 }, trainTime: 20, pop: 1,
    vsBuilding: 0.6, armor: 1, military: true, shot: 2,
  },
  kanone: {
    name: 'Feldkanone', desc: 'Langsames Geschütz mit großer Reichweite. Verheerend gegen Gebäude.', age: 2, obsolete: 3,
    hp: 140, speed: 0.9, dmg: 40, range: 7.5, cooldown: 4.5, vision: 8, cost: { holz: 120, lehm: 40, taler: 90 }, trainTime: 30, pop: 1,
    vsBuilding: 2.5, armor: 1, military: true, vehicle: true, shot: 3,
  },
  infanterist: {
    name: 'Infanterist', desc: 'Soldat des 20. Jahrhunderts mit Repetiergewehr: schnell nachgeladen, gute Reichweite.', age: 3, obsolete: 4,
    hp: 120, speed: 1.8, dmg: 15, range: 6, cooldown: 1.6, vision: 8, cost: { getreide: 50, waren: 20, taler: 50 }, trainTime: 18, pop: 1,
    vsBuilding: 0.7, armor: 2, military: true, shot: 2,
  },
  panzer: {
    name: 'Panzerwagen', desc: 'Gepanzertes Kettenfahrzeug mit Kanone. Sehr robust, stark gegen Gebäude.', age: 3,
    hp: 450, speed: 1.7, dmg: 38, range: 5.5, cooldown: 3, vision: 8, cost: { lehm: 150, waren: 80, taler: 150 }, trainTime: 35, pop: 1,
    vsBuilding: 2.2, armor: 6, military: true, vehicle: true, shot: 3,
  },
  exosoldat: {
    name: 'Exo-Soldat', desc: 'Soldat im Kraftanzug mit Strahlgewehr (22. Jahrhundert).', age: 4,
    hp: 240, speed: 2.0, dmg: 26, range: 5.5, cooldown: 1.6, vision: 9, cost: { getreide: 40, waren: 80, taler: 120 }, trainTime: 24, pop: 1,
    vsBuilding: 1.2, armor: 5, military: true, shot: 4,
  },
  drohne: {
    name: 'Kampfdrohne', desc: 'Fliegt über Wasser, Knicks, Deiche und Wälle hinweg. Schnell, weite Sicht, leicht gepanzert.', age: 4,
    hp: 90, speed: 3.4, dmg: 12, range: 4.5, cooldown: 1.0, vision: 11, cost: { waren: 60, taler: 90 }, trainTime: 18, pop: 1,
    vsBuilding: 0.6, armor: 1, military: true, flying: true, vehicle: true, shot: 4,
  },
};

// ------------------------------------------------------------------ Ausbaustufen
/** Wirkung einer Ausbaustufe (absolut gegenüber Stufe I, nicht kumulativ). */
export interface LevelFx {
  produce?: number; // Ertragsfaktor (Rohstoffgewinnung)
  process?: number; // Zeitfaktor Verarbeitung (< 1 = schneller)
  train?: number; // Zeitfaktor Ausbildung
  hp?: number; // Lebenspunktfaktor
  dmg?: number; // Schadensfaktor Verteidigung
  range?: number; // zusätzliche Reichweite Verteidigung
  pop?: number; // zusätzlicher Wohnraum
  staff?: number; // zusätzliche Arbeitsplätze
  fields?: number; // zusätzliche Felder (Bauernhof)
  taler?: number; // Talerfaktor beim Verkauf
  vision?: number; // zusätzliche Sicht
  storage?: number; // zusätzlicher Lagerplatz je Rohstoff
}
export interface UpgradeDef {
  name: string; // Name der erreichten Stufe
  desc: string;
  cost: Cost;
  time: number; // Sekunden
  fx: LevelFx;
}
export const MAX_LEVEL = 3;
/** UPGRADES[t][0] führt zu Stufe II, [1] zu Stufe III. Andere Gebäude als das Dorfzentrum brauchen ein
 * Dorfzentrum mindestens derselben Stufe; Stufe III des Dorfzentrums verlangt einen fertigen Markt. */
export const UPGRADES: Partial<Record<BuildingType, UpgradeDef[]>> = {
  dorfzentrum: [
    { name: 'Kirchspielort', desc: 'Steinsockel und Glockenturm: +50 % Lebenspunkte, +40 % Schaden, +5 Wohnraum, +150 Lager je Rohstoff, weitere Sicht. Schaltet Stufe II aller Gebäude frei.', cost: { holz: 200, lehm: 150, taler: 60 }, time: 45, fx: { hp: 1.5, dmg: 1.4, pop: 5, vision: 1, storage: 150 } },
    { name: 'Marktflecken', desc: 'Backsteinbau mit Wehrgang: doppelte Lebenspunkte, +80 % Schaden, +1 Reichweite, +10 Wohnraum, +300 Lager je Rohstoff. Benötigt einen fertigen Markt; schaltet Stufe III frei.', cost: { holz: 300, lehm: 250, taler: 180 }, time: 70, fx: { hp: 2, dmg: 1.8, range: 1, pop: 10, vision: 2, storage: 300 } },
  ],
  wohnhaus: [
    { name: 'Doppelkate', desc: 'Anbau unter dem Reetdach: +3 Wohnraum.', cost: { holz: 50, lehm: 30 }, time: 15, fx: { pop: 3, hp: 1.3 } },
    { name: 'Bürgerhaus', desc: 'Zweigeschossig: +6 Wohnraum.', cost: { holz: 80, lehm: 60, taler: 20 }, time: 22, fx: { pop: 6, hp: 1.6 } },
  ],
  bauernhof: [
    { name: 'Großer Hof', desc: 'Neue Scheune: +30 % Getreide, 2 zusätzliche Felder.', cost: { holz: 90, lehm: 40 }, time: 25, fx: { produce: 1.3, fields: 2, hp: 1.3 } },
    { name: 'Gutshof', desc: 'Mergeln und Fruchtwechsel: +60 % Getreide, 4 zusätzliche Felder, 1 weiterer Arbeitsplatz.', cost: { holz: 140, lehm: 80, taler: 40 }, time: 35, fx: { produce: 1.6, fields: 4, staff: 1, hp: 1.6 } },
  ],
  lehmgrube: [
    { name: 'Ziegelei', desc: 'Formtische und Trockenschuppen: +30 % Lehm.', cost: { holz: 80 }, time: 20, fx: { produce: 1.3 } },
    { name: 'Ringofen-Ziegelei', desc: '+60 % Lehm, 1 weiterer Arbeitsplatz.', cost: { holz: 120, taler: 40 }, time: 30, fx: { produce: 1.6, staff: 1 } },
  ],
  heringszaun: [
    { name: 'Doppelzaun', desc: 'Zweiter Fangtrichter: +30 % Fisch.', cost: { holz: 70 }, time: 18, fx: { produce: 1.3 } },
    { name: 'Fischerhütte mit Zaun', desc: 'Netze und Boot: +60 % Fisch.', cost: { holz: 110, taler: 30 }, time: 26, fx: { produce: 1.6, hp: 1.3 } },
  ],
  muehle: [
    { name: 'Kornmühle mit Galerie', desc: 'Größere Flügel: mahlt 25 % schneller.', cost: { holz: 100, lehm: 40 }, time: 25, fx: { process: 0.75, hp: 1.3 } },
    { name: 'Holländermühle', desc: 'Drehbare Kappe: mahlt 40 % schneller.', cost: { holz: 150, lehm: 80, taler: 50 }, time: 35, fx: { process: 0.6, hp: 1.6 } },
  ],
  raeucherei: [
    { name: 'Große Räucherkate', desc: 'Zweiter Ofen: räuchert 25 % schneller.', cost: { holz: 90, lehm: 40 }, time: 22, fx: { process: 0.75 } },
    { name: 'Räucherhaus', desc: 'Räuchert 40 % schneller.', cost: { holz: 130, lehm: 70, taler: 40 }, time: 32, fx: { process: 0.6, hp: 1.4 } },
  ],
  kaserne: [
    { name: 'Exerzierplatz', desc: 'Drillmeister: Ausbildung 20 % schneller, +30 % Lebenspunkte des Gebäudes.', cost: { holz: 120, lehm: 80, taler: 40 }, time: 30, fx: { train: 0.8, hp: 1.3 } },
    { name: 'Zeughaus', desc: 'Waffenkammer: Ausbildung 35 % schneller.', cost: { holz: 180, lehm: 120, taler: 90 }, time: 45, fx: { train: 0.65, hp: 1.6 } },
  ],
  markt: [
    { name: 'Kontor', desc: 'Kaufmannsstube: +15 % Taler je Verkauf.', cost: { holz: 100, lehm: 60, taler: 40 }, time: 28, fx: { taler: 1.15, hp: 1.3 } },
    { name: 'Handelshaus', desc: 'Lagerhaus und Waage: +30 % Taler je Verkauf.', cost: { holz: 160, lehm: 100, taler: 100 }, time: 40, fx: { taler: 1.3, hp: 1.6 } },
  ],
  // Gebäude späterer Zeitalter
  manufaktur: [
    { name: 'Große Manufaktur', desc: 'Mehr Webstühle: arbeitet 25 % schneller.', cost: { holz: 150, lehm: 100, taler: 80 }, time: 30, fx: { process: 0.75, hp: 1.3 } },
    { name: 'Textilfabrik', desc: 'Mechanische Webstühle: arbeitet 40 % schneller.', cost: { holz: 200, lehm: 160, taler: 150 }, time: 40, fx: { process: 0.6, hp: 1.6 } },
  ],
  hafen: [
    { name: 'Fischereihafen', desc: 'Weitere Kutter: +30 % Fisch.', cost: { holz: 150, taler: 80 }, time: 28, fx: { produce: 1.3, hp: 1.3 } },
    { name: 'Hochseehafen', desc: 'Große Fangflotte: +60 % Fisch.', cost: { holz: 220, lehm: 100, taler: 160 }, time: 38, fx: { produce: 1.6, hp: 1.6 } },
  ],
  schanze: [
    { name: 'Bastion', desc: 'Mauerwerk statt Erde: +40 % Lebenspunkte und Schaden.', cost: { lehm: 200, taler: 80 }, time: 30, fx: { hp: 1.4, dmg: 1.4 } },
    { name: 'Festung', desc: '+80 % Lebenspunkte und Schaden, +1 Reichweite.', cost: { lehm: 300, taler: 160 }, time: 40, fx: { hp: 1.8, dmg: 1.8, range: 1 } },
  ],
  bahnhof: [
    { name: 'Güterbahnhof', desc: 'Verladeanlagen: mehr Lebenspunkte und Sicht.', cost: { lehm: 200, taler: 150 }, time: 30, fx: { hp: 1.5, vision: 2 } },
    { name: 'Knotenbahnhof', desc: 'Doppelte Lebenspunkte, weite Sicht.', cost: { lehm: 300, taler: 250 }, time: 40, fx: { hp: 2, vision: 4 } },
  ],
  fabrik: [
    { name: 'Fließbandfabrik', desc: 'Arbeitet 25 % schneller.', cost: { lehm: 200, taler: 200 }, time: 35, fx: { process: 0.75, hp: 1.3 } },
    { name: 'Automatisierte Fabrik', desc: 'Arbeitet 40 % schneller.', cost: { lehm: 300, waren: 100, taler: 300 }, time: 45, fx: { process: 0.6, hp: 1.6 } },
  ],
  bunker: [
    { name: 'Verstärkter Bunker', desc: '+40 % Lebenspunkte und Schaden.', cost: { lehm: 250, taler: 150 }, time: 35, fx: { hp: 1.4, dmg: 1.4 } },
    { name: 'Festungswerk', desc: '+80 % Lebenspunkte und Schaden, +1 Reichweite.', cost: { lehm: 350, taler: 250 }, time: 45, fx: { hp: 1.8, dmg: 1.8, range: 1 } },
  ],
  vertikalfarm: [
    { name: 'Doppelturm', desc: '+30 % Getreide.', cost: { lehm: 200, taler: 250 }, time: 35, fx: { produce: 1.3, hp: 1.3 } },
    { name: 'Agrarkomplex', desc: '+60 % Getreide.', cost: { lehm: 300, waren: 100, taler: 350 }, time: 45, fx: { produce: 1.6, hp: 1.6 } },
  ],
  gezeitenwerk: [
    { name: 'Zweite Turbine', desc: '+30 % Ertrag.', cost: { lehm: 200, taler: 250 }, time: 35, fx: { produce: 1.3, hp: 1.3 } },
    { name: 'Gezeitenpark', desc: '+60 % Ertrag.', cost: { lehm: 300, taler: 400 }, time: 45, fx: { produce: 1.6, hp: 1.6 } },
  ],
  meierei: [
    { name: 'Große Meierei', desc: 'Mehr Kühe: 25 % schneller.', cost: { holz: 100, lehm: 60 }, time: 25, fx: { process: 0.75, hp: 1.3 } },
    { name: 'Molkerei', desc: '40 % schneller.', cost: { holz: 150, lehm: 100, taler: 60 }, time: 35, fx: { process: 0.6, hp: 1.6 } },
  ],
  gestuet: [
    { name: 'Landgestüt', desc: 'Ausbildung weitere 15 % schneller.', cost: { holz: 120, taler: 80 }, time: 30, fx: { train: 0.85, hp: 1.3 } },
    { name: 'Hauptgestüt', desc: 'Ausbildung weitere 30 % schneller.', cost: { holz: 180, lehm: 80, taler: 150 }, time: 40, fx: { train: 0.7, hp: 1.6 } },
  ],
  salzsiederei: [
    { name: 'Große Siedepfannen', desc: '+30 % Salz.', cost: { holz: 120 }, time: 25, fx: { produce: 1.3 } },
    { name: 'Saline', desc: '+60 % Salz.', cost: { holz: 160, lehm: 80, taler: 60 }, time: 35, fx: { produce: 1.6, hp: 1.4 } },
  ],
  speicher: [
    { name: 'Großer Speicher', desc: 'Zweiter Boden: 400 statt 250 Lager je Rohstoff.', cost: { holz: 100, lehm: 60 }, time: 25, fx: { storage: 150, hp: 1.3 } },
    { name: 'Lagerhaus', desc: 'Backsteinlager mit Kran: 600 Lager je Rohstoff.', cost: { holz: 150, lehm: 120, taler: 40 }, time: 35, fx: { storage: 350, hp: 1.6 } },
  ],
  zollhaus: [
    { name: 'Zollamt', desc: '+30 % Zolleinnahmen.', cost: { lehm: 120, taler: 60 }, time: 25, fx: { produce: 1.3, hp: 1.3 } },
    { name: 'Oberzollamt', desc: '+60 % Zolleinnahmen.', cost: { lehm: 180, taler: 120 }, time: 35, fx: { produce: 1.6, hp: 1.6 } },
  ],
  schildturm: [
    { name: 'Verstärkter Schild', desc: '+40 % Lebenspunkte und Schaden.', cost: { lehm: 250, taler: 250 }, time: 35, fx: { hp: 1.4, dmg: 1.4 } },
    { name: 'Plasmaschild', desc: '+80 % Lebenspunkte und Schaden, +1 Reichweite.', cost: { lehm: 350, taler: 400 }, time: 45, fx: { hp: 1.8, dmg: 1.8, range: 1 } },
  ],
};
export const LEVEL_ROMAN = ['', 'I', 'II', 'III'];
const levelCache = new WeakMap<BuildingDef, BuildingDef[]>();
/** Gebäudewerte einer Ausbaustufe (aus den bereits parteiabhängigen Werten). */
export function levelDef(def: BuildingDef, t: BuildingType, lvl: number): BuildingDef {
  if (lvl <= 1) return def;
  let arr = levelCache.get(def);
  if (!arr) levelCache.set(def, (arr = []));
  if (arr[lvl]) return arr[lvl];
  const fx = levelFx(t, lvl);
  const d: BuildingDef = { ...def, hp: Math.round(def.hp * (fx.hp ?? 1)), vision: def.vision + (fx.vision ?? 0) };
  if (def.popCap) d.popCap = def.popCap + (fx.pop ?? 0);
  if (def.storage) d.storage = def.storage + (fx.storage ?? 0);
  if (def.staffSlots) d.staffSlots = def.staffSlots + (fx.staff ?? 0);
  if (def.produce) d.produce = { ...def.produce, time: def.produce.time / (fx.produce ?? 1) };
  if (def.process) d.process = { ...def.process, time: def.process.time * (fx.process ?? 1) };
  if (def.attack) d.attack = { ...def.attack, dmg: Math.round(def.attack.dmg * (fx.dmg ?? 1)), range: def.attack.range + (fx.range ?? 0) };
  return (arr[lvl] = d);
}
/** Wirkung der Stufe lvl (1 = Grundstufe). */
export function levelFx(t: BuildingType, lvl: number): LevelFx {
  return lvl > 1 ? (UPGRADES[t]?.[lvl - 2]?.fx ?? {}) : {};
}

export const RULES = {
  tickRate: 10, // Simulationstakte pro Sekunde
  maxPop: 80,
  buildRadius: 11, // Kacheln um eigene fertige Gebäude
  carryCap: 10,
  chopTime: 0.9, // s pro Holz
  marketSell: { waren: 10, taler: 30, prestige: 1 },
  marketSellControlled: { waren: 10, taler: 40, prestige: 2 },
  marketBuy: { amount: 40, taler: 45 },
  /** Verarbeitungsgebäude lassen so viel übrig, damit immer noch ein Arbeiter ausgebildet werden kann */
  processReserve: { getreide: 40, fisch: 30 } as Partial<Record<Res, number>>,
  /** Anteil der Baukosten, den das Abreißen eines fertigen, unbeschädigten Gebäudes erstattet */
  demolishRefund: 0.5,
  brarupTrickle: { prestige: 1, every: 20 },
  brarupRadius: 6,
  moorReward: { prestige: 15, taler: 120 },
  prestigeGoalDefault: 400,
  /** Wählbare Prestigeziele; 0 = kein wirtschaftlicher Sieg */
  prestigeGoals: [250, 400, 600, 0],
  startRes: { holz: 200, getreide: 150, fisch: 60, lehm: 100, waren: 0, taler: 60 } as Record<Res, number>,
  startResHigh: { holz: 400, getreide: 400, fisch: 200, lehm: 300, waren: 0, taler: 200 } as Record<Res, number>,
};

export function costText(c: Cost): string {
  const parts: string[] = [];
  for (const r of RES) if (c[r]) parts.push(`${c[r]} ${RES_NAME[r]}`);
  return parts.length ? parts.join(', ') : 'kostenlos';
}

export function isBuildingType(s: unknown): s is BuildingType {
  return typeof s === 'string' && (BUILDING_TYPES as readonly string[]).includes(s);
}
export function isUnitType(s: unknown): s is UnitType {
  return typeof s === 'string' && (UNIT_TYPES as readonly string[]).includes(s);
}
