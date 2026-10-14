// Zeitalter (17., 18., 20. und 22. Jahrhundert) und Technologien je Zeitalter.
// Der Aufstieg geschieht am Dorfzentrum; Technologien werden an bestimmten Gebäuden erforscht und gelten für die ganze Partei.
import type { BuildingType, Cost, UnitDef, UnitType } from './defs';

export const MAX_AGE = 4;

export interface AgeDef {
  n: number;
  name: string; // „18. Jahrhundert“
  short: string; // „18. Jh.“
  title: string; // „Zeitalter der Aufklärung“
  year: string;
  desc: string;
  /** Aufstieg in dieses Zeitalter */
  cost: Cost;
  time: number;
  /** mindestens `need` verschiedene dieser Gebäude müssen fertig sein */
  requires: BuildingType[];
  need: number;
  prestige: number;
}

export const AGES: AgeDef[] = [
  { n: 0, name: '', short: '', title: '', year: '', desc: '', cost: {}, time: 0, requires: [], need: 0, prestige: 0 },
  {
    n: 1, name: '17. Jahrhundert', short: '17. Jh.', title: 'Frühe Neuzeit', year: 'um 1600',
    desc: 'Bauern, Fischer, Landsknechte und Armbrustschützen.', cost: {}, time: 0, requires: [], need: 0, prestige: 0,
  },
  {
    n: 2, name: '18. Jahrhundert', short: '18. Jh.', title: 'Aufklärung und Gutswirtschaft', year: 'um 1750',
    desc: 'Manufakturen, Häfen mit Fischkuttern und Sternschanzen; Füsiliere und Feldkanonen.',
    cost: { holz: 400, getreide: 300, lehm: 250, taler: 200 }, time: 60,
    requires: ['markt', 'kaserne', 'muehle', 'raeucherei'], need: 2, prestige: 10,
  },
  {
    n: 3, name: '20. Jahrhundert', short: '20. Jh.', title: 'Eisenbahn und Industrie', year: 'um 1950',
    desc: 'Bahnhof, Konservenfabrik und Bunker; Infanteristen und Panzerwagen. Landsknechte, Armbrustschützen und Kanonen werden nicht mehr ausgebildet.',
    cost: { holz: 500, lehm: 500, waren: 250, taler: 500 }, time: 80,
    requires: ['manufaktur', 'hafen', 'schanze'], need: 2, prestige: 15,
  },
  {
    n: 4, name: '22. Jahrhundert', short: '22. Jh.', title: 'Fusionszeitalter', year: 'um 2150',
    desc: 'Vertikalfarmen, Gezeitenkraftwerke und Schildtürme; Exo-Soldaten und Kampfdrohnen.',
    cost: { holz: 600, lehm: 700, waren: 500, taler: 1000 }, time: 100,
    requires: ['bahnhof', 'fabrik', 'bunker'], need: 2, prestige: 20,
  },
];

/** Wirkung einer Technologie (multiplikativ bzw. additiv, gilt für die ganze Partei). */
export interface TechFx {
  produce?: Partial<Record<BuildingType, number>>; // Ertragsfaktor
  process?: Partial<Record<BuildingType, number>>; // Zeitfaktor (< 1 schneller)
  gather?: number; // Arbeiter: Holzschlagen und Bauen schneller
  carry?: number; // zusätzliche Traglast
  hp?: number; // Soldaten: Lebenspunktfaktor
  dmg?: number; // Soldaten: Schadensfaktor
  armor?: number; // Soldaten: zusätzliche Rüstung
  speed?: number; // alle Einheiten: Tempofaktor
}

export const TECH_IDS = [
  'fruchtwechsel', 'schubkarre', 'exerzierreglement',
  'kunstduenger', 'dampfmaschine', 'motorisierung',
  'genetik', 'nanopanzerung', 'robotik',
] as const;
export type TechId = (typeof TECH_IDS)[number];

export interface TechDef {
  id: TechId;
  name: string;
  desc: string;
  age: number;
  at: BuildingType; // wird hier erforscht
  cost: Cost;
  time: number;
  fx: TechFx;
}

export const TECHS: Record<TechId, TechDef> = {
  fruchtwechsel: {
    id: 'fruchtwechsel', name: 'Fruchtwechsel', age: 2, at: 'bauernhof', cost: { holz: 150, taler: 100 }, time: 40,
    desc: 'Klee und Brache im Wechsel: Bauernhöfe +25 % Getreide.', fx: { produce: { bauernhof: 1.25 } },
  },
  schubkarre: {
    id: 'schubkarre', name: 'Schubkarren und Sägen', age: 2, at: 'holzfaeller', cost: { holz: 100, taler: 80 }, time: 30,
    desc: 'Arbeiter schlagen Holz 25 % schneller und tragen 5 mehr.', fx: { gather: 1.25, carry: 5 },
  },
  exerzierreglement: {
    id: 'exerzierreglement', name: 'Exerzierreglement', age: 2, at: 'kaserne', cost: { getreide: 150, taler: 150 }, time: 40,
    desc: 'Drill und Disziplin: Soldaten +15 % Lebenspunkte.', fx: { hp: 1.15 },
  },
  kunstduenger: {
    id: 'kunstduenger', name: 'Kunstdünger', age: 3, at: 'bauernhof', cost: { waren: 100, taler: 200 }, time: 45,
    desc: 'Bauernhöfe +40 % Getreide.', fx: { produce: { bauernhof: 1.4 } },
  },
  dampfmaschine: {
    id: 'dampfmaschine', name: 'Dampfmaschine', age: 3, at: 'muehle', cost: { holz: 200, lehm: 150, taler: 200 }, time: 50,
    desc: 'Mühle, Räucherei, Manufaktur und Fabrik arbeiten 30 % schneller.',
    fx: { process: { muehle: 0.7, raeucherei: 0.7, manufaktur: 0.7, fabrik: 0.7 } },
  },
  motorisierung: {
    id: 'motorisierung', name: 'Motorisierung', age: 3, at: 'kaserne', cost: { waren: 150, taler: 250 }, time: 50,
    desc: 'Lastwagen und Fahrräder: alle Einheiten +15 % Tempo.', fx: { speed: 1.15 },
  },
  genetik: {
    id: 'genetik', name: 'Pflanzengenetik', age: 4, at: 'vertikalfarm', cost: { waren: 200, taler: 300 }, time: 50,
    desc: 'Bauernhöfe und Vertikalfarmen +40 % Getreide.', fx: { produce: { bauernhof: 1.4, vertikalfarm: 1.4 } },
  },
  nanopanzerung: {
    id: 'nanopanzerung', name: 'Nanopanzerung', age: 4, at: 'kaserne', cost: { waren: 250, taler: 400 }, time: 60,
    desc: 'Soldaten +2 Rüstung und +15 % Schaden.', fx: { armor: 2, dmg: 1.15 },
  },
  robotik: {
    id: 'robotik', name: 'Robotik', age: 4, at: 'dorfzentrum', cost: { waren: 200, taler: 350 }, time: 50,
    desc: 'Arbeitsroboter helfen: Arbeiter bauen und schlagen Holz 40 % schneller.', fx: { gather: 1.4 },
  },
};

export function isTechId(v: unknown): v is TechId {
  return typeof v === 'string' && (TECH_IDS as readonly string[]).includes(v);
}

/** Ist die Einheit in diesem Zeitalter ausbildbar? */
export function unitAvailable(d: Pick<UnitDef, 'age' | 'obsolete'>, age: number): boolean {
  return (d.age ?? 1) <= age && (d.obsolete === undefined || age < d.obsolete);
}

/** Gesamtwirkung der erforschten Technologien. */
export function techTotals(techs: readonly TechId[]): Required<Omit<TechFx, 'produce' | 'process'>> & { produce: Partial<Record<BuildingType, number>>; process: Partial<Record<BuildingType, number>> } {
  const t = { gather: 1, carry: 0, hp: 1, dmg: 1, armor: 0, speed: 1, produce: {} as Partial<Record<BuildingType, number>>, process: {} as Partial<Record<BuildingType, number>> };
  for (const id of techs) {
    const fx = TECHS[id]?.fx;
    if (!fx) continue;
    t.gather *= fx.gather ?? 1;
    t.carry += fx.carry ?? 0;
    t.hp *= fx.hp ?? 1;
    t.dmg *= fx.dmg ?? 1;
    t.armor += fx.armor ?? 0;
    t.speed *= fx.speed ?? 1;
    for (const [k, v] of Object.entries(fx.produce ?? {})) t.produce[k as BuildingType] = (t.produce[k as BuildingType] ?? 1) * (v as number);
    for (const [k, v] of Object.entries(fx.process ?? {})) t.process[k as BuildingType] = (t.process[k as BuildingType] ?? 1) * (v as number);
  }
  return t;
}

/** Angepasste Einheitenwerte (für Simulation und Anzeige identisch). */
export function techUnit(d: UnitDef, techs: readonly TechId[], _type?: UnitType): UnitDef {
  if (!techs.length) return d;
  const t = techTotals(techs);
  if (!d.military) return { ...d, speed: d.speed * t.speed };
  return { ...d, hp: Math.round(d.hp * t.hp), dmg: Math.round(d.dmg * t.dmg * 10) / 10, armor: d.armor + t.armor, speed: d.speed * t.speed };
}
