// Parteien: Angeliter, Schwansener, Nordfriesen, Dänen – mit eigenem Fokus, Boni, Namen und Spezialeinheit.
// Bewusst etwas klischeehaft; die Simulation fragt Werte ausschließlich über fdef()/fbdef()/fudef() ab.
import {
  BUILDINGS, BUILDING_TYPES, RES, UNITS, UNIT_TYPES, type BuildingDef, type BuildingType, type Cost, type UnitDef, type UnitType,
} from './defs';

export const FACTIONS = ['angeln', 'schwansen', 'friesen', 'daenen'] as const;
export type FactionId = (typeof FACTIONS)[number];

export type ArchStyle = 'angeln' | 'schwansen' | 'friesen' | 'daenen';

export interface FactionDef {
  id: FactionId;
  name: string; // Volk, Plural
  adj: string; // Adjektiv
  motto: string;
  focus: string;
  desc: string;
  bonuses: string[];
  unique: UnitType;
  arch: ArchStyle;
  buildingNames: Partial<Record<BuildingType, string>>;
  unitNames: Partial<Record<UnitType, string>>;
  /** Kostenfaktoren je Gebäude/Einheit (Standard 1) */
  bCostMul?: Partial<Record<BuildingType, number>>;
  uCostMul?: Partial<Record<UnitType, number>>;
  uCostOverride?: Partial<Record<UnitType, Cost>>;
  /** Ertragsfaktor für produzierende Gebäude, Zeitfaktor für Verarbeitung */
  produceMul?: Partial<Record<BuildingType, number>>;
  processTimeMul?: Partial<Record<BuildingType, number>>;
  bHpMul?: Partial<Record<BuildingType, number>>;
  trainTimeMul?: Partial<Record<BuildingType, number>>;
  uStat?: Partial<Record<UnitType, Partial<Pick<UnitDef, 'hp' | 'dmg' | 'speed' | 'armor' | 'vision'>>>>;
  dzAttackMul?: number;
  marketTalerMul?: number;
  marketBuyMul?: number;
  /** Prestigefaktor je Verkauf (Standard 1) */
  marketPrestigeMul?: number;
  aiPlan: BuildingType[]; // bevorzugte Zusatzgebäude der KI
  aiFirst?: BuildingType[]; // baut die KI vor allem anderen
  startBonus?: Cost; // zusätzliche Startrohstoffe
  aiArmy: UnitType[]; // Einheitenmix der KI
  aiAggression: number; // 0.7 (vorsichtig) … 1.4 (angriffslustig)
}

export const FACTION_DEFS: Record<FactionId, FactionDef> = {
  angeln: {
    id: 'angeln', name: 'Angeliter', adj: 'angelitische', motto: '„Wat mutt, dat mutt.“',
    focus: 'Landwirtschaft und zähe Verteidigung',
    desc: 'Wortkarge, sture Bauern zwischen Knicks und Apfelbäumen. Ihr Rotvieh ist ihr Stolz, ihr Acker ihr Reichtum – und den verteidigen sie Knick für Knick.',
    bonuses: ['Bauernhof +30 % Getreide', 'Bockmühle mahlt 20 % schneller', 'Wohnhäuser 20 % billiger', 'Spezialeinheit: Knickwächter'],
    unique: 'knickwaechter', arch: 'angeln',
    buildingNames: { dorfzentrum: 'Bauernvogtei', wohnhaus: 'Katen', bauernhof: 'Angler Hof' },
    unitNames: { arbeiter: 'Knecht' },
    bCostMul: { wohnhaus: 0.8 },
    produceMul: { bauernhof: 1.3 },
    processTimeMul: { muehle: 0.8 },
    aiPlan: ['bauernhof', 'muehle'],
    aiArmy: ['knickwaechter', 'landsknecht', 'schuetze', 'knickwaechter'],
    aiAggression: 0.9,
  },
  schwansen: {
    id: 'schwansen', name: 'Schwansener', adj: 'schwansener', motto: '„Wer reitet, der regiert.“',
    focus: 'Handel und Reiterei',
    desc: 'Die Gutsherren vom anderen Schleiufer: weiß getünchte Herrenhäuser, Alleen, edle Pferde – und ein feines Gespür für gute Preise.',
    bonuses: ['Markt: +25 % Taler und +50 % Prestige je Verkauf', 'Zukauf am Markt 20 % billiger', 'Späher +30 % Lebenspunkte', 'Wohnhäuser 10 % teurer', 'Spezialeinheit: Gutsreiter'],
    unique: 'gutsreiter', arch: 'schwansen',
    buildingNames: { dorfzentrum: 'Herrenhaus', wohnhaus: 'Gutskate', bauernhof: 'Meierhof', markt: 'Gutsmarkt', kaserne: 'Reitstall und Wache' },
    unitNames: { arbeiter: 'Gutsarbeiter', spaeher: 'Jagdreiter' },
    bCostMul: { wohnhaus: 1.1 },
    marketPrestigeMul: 1.5,
    uStat: { spaeher: { hp: 91 } },
    marketTalerMul: 1.25,
    marketBuyMul: 0.8,
    aiPlan: ['markt', 'muehle'],
    aiArmy: ['gutsreiter', 'schuetze', 'landsknecht'],
    aiAggression: 1.0,
  },
  friesen: {
    id: 'friesen', name: 'Nordfriesen', adj: 'nordfriesische', motto: '„Lewwer duad üs Slaav!“',
    focus: 'Fischerei und Küste',
    desc: 'Unbeugsame Küstenleute aus den Uthlanden: Haubarge unter gewaltigen Reetdächern, Heringe in jeder Lebenslage, und kein Graben ist ihnen zu breit.',
    bonuses: ['Heringszaun +50 % Fisch', 'Räucherei 25 % schneller', 'Arbeiter kosten 30 Fisch statt Getreide', '+120 Fisch zum Start', 'Bauernhof −20 % Getreide', 'Spezialeinheit: Grabenspringer (überspringt Knicks)'],
    unique: 'grabenspringer', arch: 'friesen',
    buildingNames: { dorfzentrum: 'Haubarg', wohnhaus: 'Friesenhaus', heringszaun: 'Fischzaun', kaserne: 'Wehrhof' },
    unitNames: { arbeiter: 'Fischer', landsknecht: 'Friesenkrieger' },
    uCostOverride: { arbeiter: { fisch: 30 } },
    startBonus: { fisch: 120 },
    aiFirst: ['heringszaun'],
    produceMul: { heringszaun: 1.5, bauernhof: 0.8 },
    processTimeMul: { raeucherei: 0.75 },
    aiPlan: ['heringszaun', 'raeucherei', 'heringszaun'],
    aiArmy: ['grabenspringer', 'landsknecht', 'schuetze'],
    aiAggression: 1.1,
  },
  daenen: {
    id: 'daenen', name: 'Dänen', adj: 'dänische', motto: '„For Konge og Fædreland!“',
    focus: 'Militär und Verwaltung',
    desc: 'Die Amtsleute der Krone mit rot-weißen Fahnen, Backsteinpracht und grünen Kupferhelmen. Sie bringen Ordnung, Zoll – und Musketen.',
    bonuses: ['Soldaten 15 % billiger', 'Kaserne bildet 25 % schneller aus', 'Amtshaus +30 % Lebenspunkte und stärkere Schützen', 'Spezialeinheit: Musketier'],
    unique: 'musketier', arch: 'daenen',
    buildingNames: { dorfzentrum: 'Amtshaus', wohnhaus: 'Bürgerhaus', markt: 'Zollmarkt', kaserne: 'Garnison' },
    unitNames: { landsknecht: 'Pikenier', schuetze: 'Armbruster', spaeher: 'Dragoner' },
    uCostMul: { landsknecht: 0.85, schuetze: 0.85, spaeher: 0.85, musketier: 0.85 },
    trainTimeMul: { kaserne: 0.75 },
    bHpMul: { dorfzentrum: 1.3 },
    dzAttackMul: 1.4,
    aiPlan: ['kaserne', 'wohnhaus'],
    aiArmy: ['musketier', 'landsknecht', 'landsknecht', 'schuetze'],
    aiAggression: 1.4,
  },
};

export function isFaction(v: unknown): v is FactionId {
  return typeof v === 'string' && (FACTIONS as readonly string[]).includes(v);
}

const mulCost = (c: Cost, m: number): Cost => {
  const out: Cost = {};
  for (const r of RES) if (c[r]) out[r] = Math.round((c[r] ?? 0) * m);
  return out;
};

export interface MergedDefs {
  units: Record<UnitType, UnitDef>;
  buildings: Record<BuildingType, BuildingDef>;
}

function merge(f: FactionDef): MergedDefs {
  const units = {} as Record<UnitType, UnitDef>;
  for (const t of UNIT_TYPES) {
    const b = UNITS[t];
    const cost = f.uCostOverride?.[t] ?? mulCost(b.cost, f.uCostMul?.[t] ?? 1);
    units[t] = { ...b, ...(f.uStat?.[t] ?? {}), cost, name: f.unitNames[t] ?? b.name };
  }
  const buildings = {} as Record<BuildingType, BuildingDef>;
  for (const t of BUILDING_TYPES) {
    const b = BUILDINGS[t];
    const d: BuildingDef = { ...b, name: f.buildingNames[t] ?? b.name, cost: mulCost(b.cost, f.bCostMul?.[t] ?? 1), hp: Math.round(b.hp * (f.bHpMul?.[t] ?? 1)) };
    if (b.produce) d.produce = { ...b.produce, time: b.produce.time / (f.produceMul?.[t] ?? 1) };
    if (b.process) d.process = { ...b.process, time: b.process.time * (f.processTimeMul?.[t] ?? 1) };
    if (b.attack) d.attack = { ...b.attack, dmg: Math.round(b.attack.dmg * (f.dzAttackMul ?? 1)) };
    if (t === 'kaserne') d.trains = [...(b.trains ?? []), f.unique];
    buildings[t] = d;
  }
  // Ausbildungszeiten je Gebäude
  for (const bt of BUILDING_TYPES) {
    const m = f.trainTimeMul?.[bt];
    if (!m) continue;
    for (const ut of buildings[bt].trains ?? []) units[ut] = { ...units[ut], trainTime: Math.round(units[ut].trainTime * m) };
  }
  return { units, buildings };
}

const MERGED = Object.fromEntries(FACTIONS.map((f) => [f, merge(FACTION_DEFS[f])])) as Record<FactionId, MergedDefs>;
const NEUTRAL: MergedDefs = { units: UNITS, buildings: BUILDINGS };

/** Werte einer Partei (undefined/neutral → Grundwerte). */
export function fdefs(f: FactionId | undefined | null): MergedDefs {
  return f ? MERGED[f] : NEUTRAL;
}
export function fudef(f: FactionId | undefined | null, t: UnitType): UnitDef {
  return fdefs(f).units[t];
}
export function fbdef(f: FactionId | undefined | null, t: BuildingType): BuildingDef {
  return fdefs(f).buildings[t];
}
