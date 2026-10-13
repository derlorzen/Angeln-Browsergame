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
] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];

export const UNIT_TYPES = ['arbeiter', 'spaeher', 'landsknecht', 'schuetze', 'knickwaechter', 'gutsreiter', 'grabenspringer', 'musketier'] as const;
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
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  dorfzentrum: {
    name: 'Dorfzentrum',
    desc: 'Herz der Siedlung. Bildet Arbeiter aus, nimmt alle Rohstoffe an und verteidigt sich mit Schützen. Wird es zerstört, ist die Partie verloren.',
    w: 3, h: 3, hp: 2000, cost: {}, buildTime: 120, placement: 'normal', buildable: false,
    popCap: 10, dropoff: ['all'], trains: ['arbeiter'], vision: 9,
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
    desc: 'Stationäre Fangvorrichtung aus trichterförmigen Flechtzäunen in der Schlei. Fängt selbstständig 1 Fisch alle 2,5 s. Nur am Ufer baubar.',
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
    trains: ['spaeher', 'landsknecht', 'schuetze'], vision: 6,
  },
  brarupmarkt: {
    name: 'Brarup-Markt',
    desc: 'Neutraler Handelsplatz in Süderbrarup. Wer ihn mit eigenen Einheiten allein besetzt, erhält bessere Preise, doppeltes Prestige je Verkauf und stetig Prestige.',
    w: 3, h: 3, hp: 99999, cost: {}, buildTime: 1, placement: 'normal', buildable: false, vision: 0,
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
    name: 'Landsknecht', desc: 'Nahkämpfer mit Spieß. Robust, stark gegen Gebäude.',
    hp: 120, speed: 1.5, dmg: 11, range: 1.2, cooldown: 1.2, vision: 6, cost: { getreide: 40, fisch: 30, taler: 20 }, trainTime: 18, pop: 1,
    vsBuilding: 1.5, armor: 2, military: true,
  },
  schuetze: {
    name: 'Armbrustschütze', desc: 'Fernkämpfer. Trifft auf 5 Kacheln, aber verwundbar im Nahkampf.',
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
    vsBuilding: 0.6, armor: 0, military: true,
  },
};

export const RULES = {
  tickRate: 10, // Simulationstakte pro Sekunde
  maxPop: 80,
  buildRadius: 11, // Kacheln um eigene fertige Gebäude
  carryCap: 10,
  chopTime: 0.9, // s pro Holz
  marketSell: { waren: 10, taler: 30, prestige: 2 },
  marketSellControlled: { waren: 10, taler: 40, prestige: 4 },
  marketBuy: { amount: 40, taler: 45 },
  brarupTrickle: { prestige: 1, every: 12 },
  brarupRadius: 6,
  moorReward: { prestige: 15, taler: 120 },
  prestigeGoalDefault: 250,
  startRes: { holz: 200, getreide: 150, fisch: 60, lehm: 100, waren: 0, taler: 60 } as Record<Res, number>,
  startResHigh: { holz: 500, getreide: 400, fisch: 200, lehm: 300, waren: 0, taler: 200 } as Record<Res, number>,
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
