// Maßgebliche Simulation. Läuft mit festen Takten (RULES.tickRate) und kennt kein DOM.
// Alle Spieleraktionen – Mensch, KI, Netzwerkgast – laufen über queueCommand() und werden hier geprüft.
import {
  BUILDINGS, LEVEL_ROMAN, MAX_LEVEL, RES, RES_NAME, RULES, UNITS, UPGRADES, costText, isBuildingType, isUnitType, levelDef, levelFx,
  type BuildingDef, type BuildingType, type Cost, type Res, type UnitDef, type UnitType,
} from '../data/defs';
import { FACTION_DEFS, fbdef, fudef, type FactionId } from '../data/factions';
import { AGES, MAX_AGE, TECHS, isTechId, techTotals, techUnit, unitAvailable, type TechId } from '../data/ages';
import { generateMap, mapSizeFor, T, isWater, terrainCost, terrainWalkable, type GameMap, type MapId } from './map';
import { findPath, nearestPassable, type PathGrid } from './path';
import { Rng } from './rng';
import { checkPlacement, computeVisibility, type PlacementView, type VisionSource } from './rules';
import type { Building, Command, Entity, Order, PlayerState, SimEvent, Unit } from './types';

export const DT = 1 / RULES.tickRate;
const CELL = 4; // Kantenlänge der Zellen im räumlichen Index (Kacheln)

export interface PlayerSetup {
  name: string;
  color: number;
  slot: number;
  isAI: boolean;
  aiLevel?: 'leicht' | 'normal';
  faction?: FactionId;
}

export interface WorldOptions {
  seed: number;
  mapId?: MapId;
  players: PlayerSetup[];
  prestigeGoal?: number;
  richStart?: boolean;
  /** Lagergrenzen (Standard an; Tests mit großen Vorräten schalten sie ab) */
  storageLimit?: boolean;
}

const withBonus = (r: Record<Res, number>, b?: Cost): Record<Res, number> => {
  const out = { ...r };
  for (const k of RES) out[k] += b?.[k] ?? 0;
  return out;
};
const zeroRes = (): Record<Res, number> => ({ holz: 0, getreide: 0, fisch: 0, lehm: 0, waren: 0, taler: 0 });

export class World {
  readonly map: GameMap;
  readonly grid: PathGrid;
  /** Wegeraster für Einheiten, die Knicks überwinden (Grabenspringer) */
  readonly gridJump: PathGrid;
  /** Flugeinheiten: nur Gebäude versperren */
  readonly gridAir: PathGrid;
  readonly bocc: Int32Array; // Gebäude-ID je Kachel
  readonly field: Int32Array; // Bauernhof-ID je Feldkachel
  tick = 0;
  players: PlayerState[] = [];
  ents = new Map<number, Entity>();
  nextId = 1;
  vis: Uint8Array[] = [];
  events: SimEvent[] = [];
  private cmdQueue: { p: number; cmd: Command }[] = [];
  rng: Rng;
  winner = -1;
  winReason = '';
  prestigeGoal: number;
  brarup = { id: 0, controller: -1, contested: false, timer: 0 };
  moorFoundBy = -1;
  treeDirty: number[] = [];
  /** Bäume, zu denen kürzlich kein Weg gefunden wurde (Kachel → Takt, bis zu dem sie gemieden werden) */
  badTrees = new Map<number, number>();
  isBadTree(i: number): boolean {
    const until = this.badTrees.get(i);
    if (until === undefined) return false;
    if (until < this.tick) {
      this.badTrees.delete(i);
      return false;
    }
    return true;
  }
  private cells: Unit[][] = [];
  private cellsW: number;
  private attackedNote: number[] = [];
  /** letzte „Speicher voll“-Meldung je Spieler und Rohstoff (nur Meldungsdrossel) */
  private fullNote = new Map<string, number>();
  readonly opts: WorldOptions;

  constructor(opts: WorldOptions, skipSetup = false) {
    this.opts = opts;
    this.map = generateMap(opts.seed, opts.mapId ?? 'schlei', opts.players.length);
    const N = this.map.w * this.map.h;
    this.grid = { w: this.map.w, h: this.map.h, pass: new Uint8Array(N), cost: new Float32Array(N) };
    this.gridJump = { w: this.map.w, h: this.map.h, pass: new Uint8Array(N), cost: new Float32Array(N) };
    this.gridAir = { w: this.map.w, h: this.map.h, pass: new Uint8Array(N).fill(1), cost: new Float32Array(N).fill(1) };
    this.bocc = new Int32Array(N);
    this.field = new Int32Array(N);
    this.rng = new Rng(opts.seed * 7 + 13);
    this.prestigeGoal = opts.prestigeGoal ?? RULES.prestigeGoalDefault;
    this.cellsW = Math.ceil(this.map.w / CELL);
    for (let i = 0; i < this.cellsW * this.cellsW; i++) this.cells.push([]);
    for (let i = 0; i < N; i++) {
      const t = this.map.terrain[i];
      this.grid.cost[i] = terrainCost(t);
      this.gridJump.cost[i] = t === T.KNICK || t === T.GRABEN ? 1.6 : this.grid.cost[i];
      this.refreshPass(i);
    }
    if (skipSetup) return;
    const start = opts.richStart ? RULES.startResHigh : RULES.startRes;
    opts.players.forEach((ps, id) => {
      this.players.push({
        id, name: ps.name, color: ps.color, slot: ps.slot, res: withBonus(start, FACTION_DEFS[ps.faction ?? 'angeln'].startBonus), prestige: 0, defeated: false,
        isAI: ps.isAI, aiLevel: ps.aiLevel ?? 'normal', faction: ps.faction ?? 'angeln',
        stats: { gathered: zeroRes(), trained: 0, lost: 0, kills: 0, built: 0, sold: 0 }, pop: 0, popCap: 0, cap: 0,
        age: 1, techs: [],
      });
      this.vis.push(new Uint8Array(N));
      this.attackedNote.push(-1000);
      const slot = this.map.slots[ps.slot];
      const dz = this.addBuilding('dorfzentrum', id, slot.x, slot.y, true);
      // Start-Arbeiter und ein Späher
      for (let k = 0; k < 4; k++) this.spawnUnit('arbeiter', id, dz);
      this.spawnUnit('spaeher', id, dz);
    });
    const bm = this.addBuilding('brarupmarkt', -1, this.map.market.x, this.map.market.y, true);
    this.brarup.id = bm.id;
    this.updatePop();
    this.updateVisibility();
  }

  // ---------------------------------------------------------------- Hilfen
  idx(x: number, y: number): number {
    return y * this.map.w + x;
  }
  inMap(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.map.w && y < this.map.h;
  }
  unit(id: number): Unit | undefined {
    const e = this.ents.get(id);
    return e && e.kind === 'u' ? e : undefined;
  }
  building(id: number): Building | undefined {
    const e = this.ents.get(id);
    return e && e.kind === 'b' ? e : undefined;
  }
  /** Einheiten-/Gebäudewerte gemäß Partei des Besitzers */
  ud(owner: number, t: UnitType): UnitDef {
    const pl = this.players[owner];
    const base = fudef(pl?.faction, t);
    if (!pl || !pl.techs?.length) return base;
    const key = `${pl.techs.length}`;
    let c = this.udCache[owner];
    if (!c || c.key !== key) c = this.udCache[owner] = { key, m: new Map() };
    let d = c.m.get(t);
    if (!d) c.m.set(t, (d = techUnit(base, pl.techs, t)));
    return d;
  }
  private udCache: { key: string; m: Map<UnitType, UnitDef> }[] = [];
  /** Gesamtwirkung der Technologien eines Spielers */
  tfx(p: number) {
    const pl = this.players[p];
    const key = pl?.techs?.length ?? 0;
    let c = this.tfxCache[p];
    if (!c || c.key !== key) c = this.tfxCache[p] = { key, v: techTotals(pl?.techs ?? []) };
    return c.v;
  }
  private tfxCache: { key: number; v: ReturnType<typeof techTotals> }[] = [];
  /** null = Aufstieg ins nächste Zeitalter möglich, sonst Begründung */
  ageBlock(b: Building): string | null {
    const pl = this.players[b.owner];
    if (!pl || b.type !== 'dorfzentrum') return 'Nur im Dorfzentrum.';
    if (!b.built) return 'Das Dorfzentrum ist noch nicht fertig.';
    if (pl.age >= MAX_AGE) return 'Letztes Zeitalter erreicht.';
    if (b.up >= 0) return 'Im Dorfzentrum läuft bereits ein Vorhaben.';
    const next = AGES[pl.age + 1];
    const have = next.requires.filter((t) => this.bestLevel(b.owner, t) > 0);
    if (have.length < next.need) return `Benötigt ${next.need} dieser Gebäude (fertig): ${next.requires.map((t) => this.bd(b.owner, t).name).join(', ')}.`;
    return null;
  }
  /** null = Technologie hier erforschbar, sonst Begründung */
  techBlock(b: Building, id: TechId): string | null {
    const pl = this.players[b.owner];
    const t = TECHS[id];
    if (!pl || !t || t.at !== b.type) return 'Hier nicht erforschbar.';
    if (!b.built) return 'Das Gebäude ist noch nicht fertig.';
    if (pl.techs.includes(id)) return 'Bereits erforscht.';
    if (pl.age < t.age) return `Erst im ${AGES[t.age].name}.`;
    if (b.up >= 0) return 'In diesem Gebäude läuft bereits ein Vorhaben.';
    for (const e of this.ents.values()) if (e.kind === 'b' && e.owner === b.owner && e.up >= 0 && e.upk === id) return 'Wird bereits erforscht.';
    return null;
  }
  /** Dauer des laufenden Vorhabens */
  projectTime(b: Building): number {
    const k = b.upk ?? 'lvl';
    if (k === 'lvl') return UPGRADES[b.type]?.[b.lvl - 1]?.time ?? 1;
    if (k === 'age') return AGES[Math.min(MAX_AGE, (this.players[b.owner]?.age ?? 1) + 1)].time;
    return TECHS[k]?.time ?? 1;
  }
  projectCost(b: Building): Cost {
    const k = b.upk ?? 'lvl';
    if (k === 'lvl') return UPGRADES[b.type]?.[b.lvl - 1]?.cost ?? {};
    if (k === 'age') return AGES[Math.min(MAX_AGE, (this.players[b.owner]?.age ?? 1) + 1)].cost;
    return TECHS[k]?.cost ?? {};
  }
  bd(owner: number, t: BuildingType) {
    return fbdef(this.players[owner]?.faction, t);
  }
  /** Werte eines konkreten Gebäudes inkl. Partei und Ausbaustufe. */
  bdl(b: Building): BuildingDef {
    return levelDef(this.bd(b.owner, b.type), b.type, b.lvl ?? 1);
  }
  trainTime(b: Building, u: UnitType): number {
    return this.ud(b.owner, u).trainTime * (levelFx(b.type, b.lvl ?? 1).train ?? 1) * (BUILDINGS[b.type].trainMul ?? 1);
  }
  /** Höchste Stufe eines fertigen Gebäudes dieses Typs (0 = keins). */
  bestLevel(p: number, t: BuildingType): number {
    let l = 0;
    for (const e of this.ents.values()) if (e.kind === 'b' && e.owner === p && e.type === t && e.built) l = Math.max(l, e.lvl ?? 1);
    return l;
  }
  /** null = Ausbau möglich, sonst Begründung. */
  upgradeBlock(b: Building): string | null {
    const ups = UPGRADES[b.type];
    if (!ups || b.owner < 0) return 'Dieses Gebäude kann nicht ausgebaut werden.';
    if (!b.built) return 'Das Gebäude ist noch nicht fertig.';
    if (b.lvl >= MAX_LEVEL) return 'Höchste Stufe erreicht.';
    if (b.up >= 0) return 'Wird bereits ausgebaut.';
    const next = b.lvl + 1;
    if (b.type === 'dorfzentrum') {
      if (next === 3 && !this.bestLevel(b.owner, 'markt')) return 'Stufe III benötigt einen fertigen Markt.';
    } else if (this.bestLevel(b.owner, 'dorfzentrum') < next) return `Benötigt zuerst ein Dorfzentrum der Stufe ${LEVEL_ROMAN[next]}.`;
    return null;
  }
  gridFor(u: Unit): PathGrid {
    return UNITS[u.type].flying ? this.gridAir : UNITS[u.type].knickJump ? this.gridJump : this.grid;
  }
  isEnemy(a: number, b: number): boolean {
    return a !== b && a >= 0 && b >= 0;
  }
  private emit(ev: SimEvent): void {
    this.events.push(ev);
  }
  err(p: number, msg: string): void {
    this.emit({ e: 'err', p, msg });
  }
  canAfford(p: number, c: Cost): boolean {
    const r = this.players[p].res;
    return RES.every((k) => (c[k] ?? 0) <= r[k]);
  }
  private pay(p: number, c: Cost, factor = 1): void {
    const r = this.players[p].res;
    for (const k of RES) r[k] -= Math.floor((c[k] ?? 0) * factor);
  }
  private refund(p: number, c: Cost, factor: number): void {
    const r = this.players[p].res;
    for (const k of RES) r[k] += Math.floor((c[k] ?? 0) * factor);
  }
  missingText(p: number, c: Cost): string {
    const r = this.players[p].res;
    const miss: Cost = {};
    for (const k of RES) if ((c[k] ?? 0) > r[k]) miss[k] = (c[k] ?? 0) - Math.floor(r[k]);
    return `Es fehlen: ${costText(miss)}.`;
  }
  hasBuilt(p: number, t: BuildingType): boolean {
    for (const e of this.ents.values()) if (e.kind === 'b' && e.owner === p && e.type === t && e.built) return true;
    return false;
  }

  placementView(p: number): PlacementView {
    const own: PlacementView['ownBuildings'] = [];
    for (const e of this.ents.values()) if (e.kind === 'b' && e.owner === p) own.push(e);
    const vis = this.vis[p];
    return {
      map: this.map,
      trees: this.map.trees,
      occupied: (i) => this.bocc[i] !== 0 || this.field[i] !== 0,
      explored: (i) => vis[i] > 0,
      ownBuildings: own,
    };
  }

  // ---------------------------------------------------------------- Erzeugen
  addBuilding(type: BuildingType, owner: number, x: number, y: number, built: boolean): Building {
    const def = this.bd(owner, type);
    const b: Building = {
      id: this.nextId++, kind: 'b', type, owner, x, y, w: def.w, h: def.h,
      hp: built ? def.hp : Math.max(1, Math.round(def.hp * 0.1)), maxHp: def.hp, built, prog: built ? def.buildTime : 0,
      queue: [], qt: 0, timer: 0, active: false, status: '', fields: [], staff: [], rally: null,
      autoSell: false, cd: 0, lvl: 1, up: -1,
    };
    this.ents.set(b.id, b);
    this.occupyBuilding(b);
    if (built) this.onBuilt(b, false);
    return b;
  }

  private occupyBuilding(b: Building): void {
    for (let dy = 0; dy < b.h; dy++)
      for (let dx = 0; dx < b.w; dx++) {
        const i = this.idx(b.x + dx, b.y + dy);
        this.bocc[i] = b.id;
        this.grid.pass[i] = 0;
        this.gridJump.pass[i] = 0;
        this.gridAir.pass[i] = 0;
      }
    // Einheiten auf der Baufläche werden herausgeschoben
    for (const e of this.ents.values()) {
      if (e.kind !== 'u') continue;
      if (e.x >= b.x && e.x < b.x + b.w && e.y >= b.y && e.y < b.y + b.h) this.ejectUnit(e);
    }
  }

  private ejectUnit(u: Unit): void {
    const t = nearestPassable(this.grid, Math.floor(u.x), Math.floor(u.y), 8);
    if (t >= 0) {
      u.x = (t % this.map.w) + 0.5;
      u.y = Math.floor(t / this.map.w) + 0.5;
      u.path = null;
    }
  }

  private refreshPass(i: number): void {
    const t = this.map.terrain[i];
    const free = !this.map.trees[i] && !this.bocc[i];
    this.grid.pass[i] = terrainWalkable(t) && free ? 1 : 0;
    this.gridJump.pass[i] = (terrainWalkable(t) || t === T.KNICK || t === T.GRABEN) && free ? 1 : 0;
    this.gridAir.pass[i] = this.bocc[i] ? 0 : 1;
  }

  spawnUnit(type: UnitType, owner: number, from: Building): Unit | null {
    // freie Kachel am Gebäuderand, bevorzugt Richtung Sammelpunkt
    const tx = from.rally ? from.rally.x : from.x + from.w + 1;
    const ty = from.rally ? from.rally.y : from.y + from.h + 1;
    let best = -1, bd = Infinity;
    for (let dy = -1; dy <= from.h; dy++)
      for (let dx = -1; dx <= from.w; dx++) {
        if (dx >= 0 && dy >= 0 && dx < from.w && dy < from.h) continue;
        const x = from.x + dx, y = from.y + dy;
        if (!this.inMap(x, y) || !this.grid.pass[this.idx(x, y)]) continue;
        let crowd = 0;
        for (const e of this.ents.values()) if (e.kind === 'u' && Math.floor(e.x) === x && Math.floor(e.y) === y) crowd++;
        const d = (x - tx) ** 2 + (y - ty) ** 2 + this.rng.next() * 2 + crowd * 6;
        if (d < bd) {
          bd = d;
          best = this.idx(x, y);
        }
      }
    if (best < 0) best = nearestPassable(this.grid, from.x + from.w, from.y + from.h, 10);
    if (best < 0) return null;
    const def = this.ud(owner, type);
    const u: Unit = {
      id: this.nextId++, kind: 'u', type, owner, x: (best % this.map.w) + 0.5, y: Math.floor(best / this.map.w) + 0.5,
      hp: def.hp, face: 1, anim: 0, order: { k: 'none' }, path: null, pathI: 0, goalTile: -1, repathT: 0,
      carry: 0, carryRes: null, cd: 0, work: 0, scanT: this.rng.next(), staffOf: 0, lastHitBy: 0, hitT: -999,
      stuckT: 0, lastX: 0, lastY: 0,
    };
    this.ents.set(u.id, u);
    return u;
  }

  private onBuilt(b: Building, notify: boolean): void {
    if (b.type === 'bauernhof') this.allocateFields(b);
    if (notify) {
      this.players[b.owner].stats.built++;
      this.emit({ e: 'built', x: b.x + b.w / 2, y: b.y + b.h / 2, o: b.owner, b: b.type });
    }
    this.updatePop();
  }

  private allocateFields(b: Building): void {
    const cand: { i: number; d: number }[] = [];
    const want = 6 + (levelFx(b.type, b.lvl ?? 1).fields ?? 0) - b.fields.length;
    if (want <= 0) return;
    const ring = want > 6 || b.fields.length ? 3 : 2;
    for (let dy = -ring; dy < b.h + ring; dy++)
      for (let dx = -ring; dx < b.w + ring; dx++) {
        if (dx >= 0 && dy >= 0 && dx < b.w && dy < b.h) continue;
        const x = b.x + dx, y = b.y + dy;
        if (!this.inMap(x, y)) continue;
        const i = this.idx(x, y);
        const t = this.map.terrain[i];
        if ((t !== T.GRAS && t !== T.LEHM) || this.map.trees[i] || this.bocc[i] || this.field[i]) continue;
        cand.push({ i, d: Math.hypot(x + 0.5 - (b.x + b.w / 2), y + 0.5 - (b.y + b.h / 2)) });
      }
    cand.sort((a, c) => a.d - c.d || a.i - c.i);
    for (const c of cand.slice(0, want)) {
      this.field[c.i] = b.id;
      b.fields.push(c.i);
    }
  }

  // ---------------------------------------------------------------- Befehle
  queueCommand(p: number, cmd: Command): void {
    if (this.cmdQueue.length > 400) return; // Schutz vor Überflutung
    this.cmdQueue.push({ p, cmd });
  }

  private ownedUnits(p: number, ids: unknown): Unit[] {
    if (!Array.isArray(ids)) return [];
    const out: Unit[] = [];
    const seen = new Set<number>();
    for (const id of ids.slice(0, 200)) {
      if (typeof id !== 'number' || seen.has(id)) continue;
      seen.add(id);
      const u = this.unit(id);
      if (u && u.owner === p) out.push(u);
    }
    return out;
  }
  private ownedBuilding(p: number, id: unknown): Building | undefined {
    if (typeof id !== 'number') return undefined;
    const b = this.building(id);
    return b && b.owner === p ? b : undefined;
  }
  private validXY(x: unknown, y: unknown): boolean {
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && this.inMap(Math.floor(x), Math.floor(y));
  }

  applyCommand(p: number, cmd: Command): void {
    const pl = this.players[p];
    if (!pl || pl.defeated || this.winner >= 0 || !cmd || typeof cmd !== 'object') return;
    switch (cmd.c) {
      case 'smart': {
        if (!this.validXY(cmd.x, cmd.y)) return;
        const us = this.ownedUnits(p, cmd.ids);
        if (!us.length) return;
        const t = typeof cmd.t === 'number' ? this.ents.get(cmd.t) : undefined;
        this.smart(p, us, cmd.x, cmd.y, t);
        break;
      }
      case 'move': {
        if (!this.validXY(cmd.x, cmd.y)) return;
        this.groupMove(this.ownedUnits(p, cmd.ids), cmd.x, cmd.y, !!cmd.am);
        break;
      }
      case 'attack': {
        const t = typeof cmd.t === 'number' ? this.ents.get(cmd.t) : undefined;
        if (!t || !this.isEnemy(p, t.owner)) return this.err(p, 'Kein gültiges Angriffsziel.');
        for (const u of this.ownedUnits(p, cmd.ids)) this.setOrder(u, { k: 'attack', t: t.id });
        break;
      }
      case 'gather': {
        if (!this.validXY(cmd.x, cmd.y)) return;
        const tile = this.idx(Math.floor(cmd.x), Math.floor(cmd.y));
        const ws = this.ownedUnits(p, cmd.ids).filter((u) => u.type === 'arbeiter');
        if (!this.map.trees[tile]) return this.err(p, 'Dort steht kein Baum.');
        for (const u of ws) this.setOrder(u, { k: 'gather', tile });
        break;
      }
      case 'build': {
        const b = this.ownedBuilding(p, cmd.t);
        if (!b || b.built) return;
        for (const u of this.ownedUnits(p, cmd.ids)) if (u.type === 'arbeiter') this.setOrder(u, { k: 'build', t: b.id });
        break;
      }
      case 'repair': {
        const b = this.ownedBuilding(p, cmd.t);
        if (!b || !b.built || b.hp >= b.maxHp) return;
        for (const u of this.ownedUnits(p, cmd.ids)) if (u.type === 'arbeiter') this.setOrder(u, { k: 'repair', t: b.id });
        break;
      }
      case 'staff': {
        const b = this.ownedBuilding(p, cmd.t);
        if (!b || !this.bdl(b).staffSlots) return;
        for (const u of this.ownedUnits(p, cmd.ids)) if (u.type === 'arbeiter') this.setOrder(u, { k: 'staff', t: b.id });
        break;
      }
      case 'stop':
        for (const u of this.ownedUnits(p, cmd.ids)) this.setOrder(u, { k: 'none' });
        break;
      case 'place': {
        if (!isBuildingType(cmd.b) || typeof cmd.x !== 'number' || typeof cmd.y !== 'number') return;
        const x = Math.floor(cmd.x), y = Math.floor(cmd.y);
        const def = this.bd(p, cmd.b);
        if ((def.age ?? 1) > pl.age) return this.err(p, `${def.name}: erst im ${AGES[def.age ?? 1].name}.`);
        if (def.faction && def.faction !== pl.faction) return this.err(p, `${def.name}: nur für ${FACTION_DEFS[def.faction].name}.`);
        const why = checkPlacement(this.placementView(p), cmd.b, x, y);
        if (why) return this.err(p, why);
        if (!this.canAfford(p, def.cost)) return this.err(p, `${def.name}: ${this.missingText(p, def.cost)}`);
        // Belegung durch Einheiten ist erlaubt (sie weichen aus), durch Felder/Gebäude nicht – geprüft.
        this.pay(p, def.cost);
        const b = this.addBuilding(cmd.b, p, x, y, false);
        for (const u of this.ownedUnits(p, cmd.ids)) if (u.type === 'arbeiter') this.setOrder(u, { k: 'build', t: b.id });
        break;
      }
      case 'train': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b || !isUnitType(cmd.u)) return;
        const def = this.bd(p, b.type);
        if (!b.built) return this.err(p, 'Das Gebäude ist noch nicht fertig.');
        if (!def.trains?.includes(cmd.u)) return this.err(p, `${UNITS[cmd.u].name}: nur für ${this.uniqueOwnerName(cmd.u)}.`);
        if (b.queue.length >= 5) return this.err(p, 'Die Warteschlange ist voll (max. 5).');
        const ud = this.ud(p, cmd.u);
        if (!unitAvailable(ud, pl.age)) return this.err(p, `${ud.name}: ${(ud.age ?? 1) > pl.age ? `erst im ${AGES[ud.age ?? 1].name}` : 'in diesem Zeitalter nicht mehr ausgebildet'}.`);
        if (!this.canAfford(p, ud.cost)) return this.err(p, `${ud.name}: ${this.missingText(p, ud.cost)}`);
        this.pay(p, ud.cost);
        b.queue.push(cmd.u);
        break;
      }
      case 'upgrade': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b) return;
        const why = this.upgradeBlock(b);
        if (why) return this.err(p, why);
        const up = UPGRADES[b.type]![b.lvl - 1];
        if (!this.canAfford(p, up.cost)) return this.err(p, `${up.name}: ${this.missingText(p, up.cost)}`);
        this.pay(p, up.cost);
        b.up = 0;
        b.upk = 'lvl';
        break;
      }
      case 'age': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b) return;
        const why = this.ageBlock(b);
        if (why) return this.err(p, why);
        const next = AGES[pl.age + 1];
        if (!this.canAfford(p, next.cost)) return this.err(p, `${next.name}: ${this.missingText(p, next.cost)}`);
        this.pay(p, next.cost);
        b.up = 0;
        b.upk = 'age';
        break;
      }
      case 'research': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b || !isTechId(cmd.t)) return;
        const why = this.techBlock(b, cmd.t);
        if (why) return this.err(p, why);
        const t = TECHS[cmd.t];
        if (!this.canAfford(p, t.cost)) return this.err(p, `${t.name}: ${this.missingText(p, t.cost)}`);
        this.pay(p, t.cost);
        b.up = 0;
        b.upk = cmd.t;
        break;
      }
      case 'upcancel': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b || b.up < 0) return;
        this.refund(p, this.projectCost(b), 1);
        b.up = -1;
        b.upk = undefined;
        break;
      }
      case 'cancel': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b) return;
        if (!b.built) {
          this.refund(p, this.bd(p, b.type).cost, 0.75);
          this.removeBuilding(b, false);
          this.emit({ e: 'info', p, msg: `Bau abgebrochen – 75 % erstattet.` });
        } else if (b.queue.length) {
          const u = b.queue.pop()!;
          if (!b.queue.length) b.qt = 0;
          this.refund(p, this.ud(p, u).cost, 1);
        }
        break;
      }
      case 'demolish': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b) return;
        if (!b.built) return this.applyCommand(p, { c: 'cancel', b: b.id });
        if (b.type === 'dorfzentrum') return this.err(p, 'Das Dorfzentrum kann nicht abgerissen werden.');
        if (b.up >= 0) return this.err(p, 'Erst das laufende Vorhaben abbrechen.');
        for (const u of b.queue) this.refund(p, this.ud(p, u).cost, 1);
        b.queue = [];
        const f = RULES.demolishRefund * Math.max(0, b.hp / b.maxHp);
        this.refund(p, this.bd(p, b.type).cost, f);
        this.emit({ e: 'die', x: b.x + b.w / 2, y: b.y + b.h / 2, u: 0, o: p });
        this.removeBuilding(b, false);
        this.emit({ e: 'info', p, msg: `${this.bd(p, b.type).name} abgerissen – ${Math.round(f * 100)} % der Baukosten erstattet.` });
        break;
      }
      case 'sell': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b || b.type !== 'markt' || !b.built) return;
        if (!this.sell(p)) this.err(p, `Zu wenig Waren – mindestens ${RULES.marketSell.waren} nötig.`);
        break;
      }
      case 'buy': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b || b.type !== 'markt' || !b.built || (cmd.r !== 'holz' && cmd.r !== 'lehm' && cmd.r !== 'getreide')) return;
        const price = this.buyPrice(p);
        if (pl.res.taler < price) return this.err(p, `Zu wenig Taler (${price} nötig).`);
        if (this.isFull(p, cmd.r)) return this.err(p, `Speicher voll: ${RES_NAME[cmd.r]}.`);
        pl.res.taler -= price;
        pl.res[cmd.r] += RULES.marketBuy.amount;
        break;
      }
      case 'auto': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b) return;
        if (b.type === 'markt') b.autoSell = !!cmd.on;
        else if (BUILDINGS[b.type].process) b.halt = !cmd.on;
        break;
      }
      case 'rally': {
        const b = this.ownedBuilding(p, cmd.b);
        if (!b || !this.validXY(cmd.x, cmd.y)) return;
        b.rally = { x: Math.floor(cmd.x), y: Math.floor(cmd.y) };
        break;
      }
      case 'resign':
        this.defeat(p, 'aufgegeben');
        break;
    }
  }

  buyPrice(p: number): number {
    return Math.round(RULES.marketBuy.taler * (FACTION_DEFS[this.players[p].faction].marketBuyMul ?? 1) * this.tfx(p).buy);
  }

  private uniqueOwnerName(t: UnitType): string {
    const f = Object.values(FACTION_DEFS).find((d) => d.unique === t);
    return f ? `die ${f.name}` : 'andere Parteien';
  }

  private sell(p: number): boolean {
    const pl = this.players[p];
    const ctrl = this.brarup.controller === p;
    const s = ctrl ? RULES.marketSellControlled : RULES.marketSell;
    if (pl.res.waren < s.waren) return false;
    const lv = levelFx('markt', Math.max(1, this.bestLevel(p, 'markt'))).taler ?? 1;
    const bahn = this.bestLevel(p, 'bahnhof') ? (BUILDINGS.bahnhof.talerMul ?? 1) : 1;
    const taler = Math.round(s.taler * (FACTION_DEFS[pl.faction].marketTalerMul ?? 1) * lv * bahn * this.tfx(p).taler);
    pl.res.waren -= s.waren;
    pl.res.taler += taler;
    const prestige = s.prestige * (FACTION_DEFS[pl.faction].marketPrestigeMul ?? 1);
    pl.prestige += prestige;
    pl.stats.sold += s.waren;
    this.emit({ e: 'sold', p, taler, prestige });
    return true;
  }

  private smart(p: number, us: Unit[], x: number, y: number, t: Entity | undefined): void {
    if (t && t.kind === 'u' && t.owner === p) t = undefined; // eigene Einheit -> einfach hingehen
    if (t && this.isEnemy(p, t.owner)) {
      for (const u of us) this.setOrder(u, { k: 'attack', t: t.id });
      return;
    }
    const movers: Unit[] = [];
    if (t && t.kind === 'b' && t.owner === p) {
      const def = this.bdl(t);
      for (const u of us) {
        if (u.type === 'arbeiter' && !t.built) this.setOrder(u, { k: 'build', t: t.id });
        else if (u.type === 'arbeiter' && t.hp < t.maxHp) this.setOrder(u, { k: 'repair', t: t.id });
        else if (u.type === 'arbeiter' && def.staffSlots) this.setOrder(u, { k: 'staff', t: t.id });
        else movers.push(u);
      }
      if (movers.length) this.groupMove(movers, t.x + t.w / 2, t.y + t.h / 2, false);
      return;
    }
    if (t && t.kind === 'b' && t.type === 'brarupmarkt') {
      // neutralen Markt besetzen: Einheiten verteilen sich im Umkreis
      this.groupMove(us, t.x + t.w / 2, t.y + t.h + 0.5, false);
      this.emit({ e: 'info', p, msg: `Eure Einheiten besetzen den Markt. Er gehört euch, solange nur eure Einheiten im Umkreis von ${RULES.brarupRadius} Kacheln stehen.` });
      return;
    }
    const tile = this.idx(Math.floor(x), Math.floor(y));
    const tree = this.map.trees[tile] > 0;
    for (const u of us) {
      if (tree && u.type === 'arbeiter') this.setOrder(u, { k: 'gather', tile });
      else movers.push(u);
    }
    if (movers.length) this.groupMove(movers, x, y, false);
  }

  /** Verteilt eine Gruppe auf freie Kacheln rund um das Ziel. */
  groupMove(us: Unit[], x: number, y: number, am: boolean): void {
    if (!us.length) return;
    // Flugeinheiten getrennt verteilen (sie dürfen auch über Wasser stehen)
    const air = us.filter((u) => UNITS[u.type].flying);
    if (air.length && air.length < us.length) {
      this.groupMove(air, x, y, am);
      us = us.filter((u) => !UNITS[u.type].flying);
    }
    const grid = air.length === us.length ? this.gridAir : this.grid;
    const start = nearestPassable(grid, Math.floor(x), Math.floor(y), 10);
    if (start < 0) {
      this.err(us[0].owner, 'Dieser Ort ist nicht erreichbar.');
      return;
    }
    const spots: number[] = [];
    if (us.length === 1) spots.push(start);
    else {
      const seen = new Set<number>([start]);
      const q = [start];
      while (q.length && spots.length < us.length) {
        const c = q.shift()!;
        spots.push(c);
        const cx = c % this.map.w, cy = Math.floor(c / this.map.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!this.inMap(nx, ny)) continue;
          const ni = this.idx(nx, ny);
          if (!seen.has(ni) && grid.pass[ni]) {
            seen.add(ni);
            q.push(ni);
          }
        }
      }
    }
    us.forEach((u, k) => {
      const s = spots[k % spots.length];
      const tx = us.length === 1 && Math.floor(x) === s % this.map.w && Math.floor(y) === Math.floor(s / this.map.w) ? x : (s % this.map.w) + 0.5;
      const ty = us.length === 1 && Math.floor(x) === s % this.map.w && Math.floor(y) === Math.floor(s / this.map.w) ? y : Math.floor(s / this.map.w) + 0.5;
      this.setOrder(u, { k: 'move', x: tx, y: ty, am });
    });
  }

  setOrder(u: Unit, o: Order): void {
    if (u.staffOf) {
      const b = this.building(u.staffOf);
      if (b) b.staff = b.staff.filter((id) => id !== u.id);
      u.staffOf = 0;
    }
    if (u.carryRes && u.carryRes !== 'holz') {
      u.carry = 0;
      u.carryRes = null;
    }
    u.order = o;
    u.path = null;
    u.goalTile = -1;
    u.work = 0;
    u.stuckT = 0;
    if (o.k === 'none') u.anim = 0;
  }

  // ---------------------------------------------------------------- Takt
  step(): void {
    this.events.length = 0;
    this.treeDirty.length = 0;
    if (this.winner >= 0) {
      this.tick++;
      return;
    }
    const q = this.cmdQueue;
    this.cmdQueue = [];
    for (const { p, cmd } of q) {
      try {
        this.applyCommand(p, cmd);
      } catch {
        /* fehlerhafte Befehle werden verworfen */
      }
    }
    this.rebuildCells();
    for (const e of this.ents.values()) if (e.kind === 'b') this.updateBuilding(e);
    for (const e of this.ents.values()) if (e.kind === 'u') this.updateUnit(e);
    this.separate();
    this.cleanupDead();
    this.updatePop();
    this.clampStorage();
    if (this.tick % 5 === 0) this.updateBrarup();
    if (this.tick % 5 === 2) this.checkMoor();
    if (this.tick % 2 === 0) this.updateVisibility();
    this.checkVictory();
    this.tick++;
  }

  /** Lagerplatz für Rohstoff r; Taler sind unbegrenzt. */
  capOf(p: number, r: Res): number {
    return r === 'taler' || this.opts.storageLimit === false ? Infinity : this.players[p].cap;
  }
  isFull(p: number, r: Res): boolean {
    return this.players[p].res[r] >= this.capOf(p, r);
  }
  /** Überschuss über den Lagerplatz verfällt; der Spieler erhält höchstens alle 30 s eine Meldung je Rohstoff. */
  private clampStorage(): void {
    if (this.opts.storageLimit === false) return;
    for (const pl of this.players) {
      if (pl.defeated) continue;
      for (const r of RES) {
        if (r === 'taler' || pl.res[r] <= pl.cap) continue;
        pl.res[r] = pl.cap;
        const k = `${pl.id}:${r}`;
        if (this.tick - (this.fullNote.get(k) ?? -1e9) > 300) {
          this.fullNote.set(k, this.tick);
          this.emit({ e: 'info', p: pl.id, msg: `Speicher voll: ${RES_NAME[r]} (${pl.cap}). Speicher bauen, das Dorfzentrum ausbauen oder Vorräte verbrauchen.` });
        }
      }
    }
  }

  updatePop(): void {
    for (const p of this.players) {
      p.pop = 0;
      p.popCap = 0;
      p.cap = 0;
    }
    for (const e of this.ents.values()) {
      if (e.owner < 0) continue;
      const p = this.players[e.owner];
      if (e.kind === 'u') p.pop += UNITS[e.type].pop;
      else if (e.built) {
        const d = this.bdl(e);
        p.popCap += (d.popCap ?? 0) + (e.type === 'wohnhaus' ? this.tfx(e.owner).popPer : 0);
        p.cap += d.storage ?? 0;
      }
    }
    for (const p of this.players) p.popCap = Math.min(p.popCap, RULES.maxPop);
  }

  updateVisibility(): void {
    this.players.forEach((p, pid) => {
      const src: VisionSource[] = [];
      for (const e of this.ents.values()) {
        if (e.owner !== pid) continue;
        if (e.kind === 'u') src.push({ x: e.x, y: e.y, r: this.ud(e.owner, e.type).vision });
        else src.push({ x: e.x + e.w / 2, y: e.y + e.h / 2, r: e.built ? this.bdl(e).vision : 3 });
      }
      if (p.defeated) {
        // Besiegte sehen alles (Zuschauer)
        this.vis[pid].fill(2);
        return;
      }
      computeVisibility(this.map, src, this.vis[pid]);
    });
  }

  private rebuildCells(): void {
    for (const c of this.cells) c.length = 0;
    for (const e of this.ents.values()) {
      if (e.kind !== 'u' || e.hp <= 0) continue;
      const cx = Math.min(this.cellsW - 1, Math.max(0, Math.floor(e.x / CELL)));
      const cy = Math.min(this.cellsW - 1, Math.max(0, Math.floor(e.y / CELL)));
      this.cells[cy * this.cellsW + cx].push(e);
    }
  }

  /** Nächste feindliche Einheit (oder Gebäude) im Radius. */
  findEnemy(u: { x: number; y: number; owner: number }, r: number, buildings: boolean): Entity | null {
    let best: Entity | null = null, bd = r * r;
    const c0x = Math.max(0, Math.floor((u.x - r) / CELL)), c1x = Math.min(this.cellsW - 1, Math.floor((u.x + r) / CELL));
    const c0y = Math.max(0, Math.floor((u.y - r) / CELL)), c1y = Math.min(this.cellsW - 1, Math.floor((u.y + r) / CELL));
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cx = c0x; cx <= c1x; cx++)
        for (const o of this.cells[cy * this.cellsW + cx]) {
          if (!this.isEnemy(u.owner, o.owner) || o.hp <= 0) continue;
          const d = (o.x - u.x) ** 2 + (o.y - u.y) ** 2;
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
    if (best || !buildings) return best;
    let bdb = r;
    for (const e of this.ents.values()) {
      if (e.kind !== 'b' || !this.isEnemy(u.owner, e.owner) || e.hp <= 0) continue;
      const d = rectDist(u.x, u.y, e);
      if (d < bdb) {
        bdb = d;
        best = e;
      }
    }
    return best;
  }

  private updateBuilding(b: Building): void {
    if (b.owner < 0 || !b.built) return;
    const def = this.bdl(b);
    const pl = this.players[b.owner];
    // Vorhaben: Ausbau, Zeitalter, Technologie
    if (b.up >= 0) {
      const k = b.upk ?? 'lvl';
      b.up += DT;
      if (b.up >= this.projectTime(b)) {
        b.up = -1;
        b.upk = undefined;
        if (k === 'lvl') {
          if (UPGRADES[b.type]?.[b.lvl - 1]) {
            b.lvl++;
            const nd = this.bdl(b);
            b.hp += nd.hp - b.maxHp;
            b.maxHp = nd.hp;
            if (b.type === 'bauernhof') this.allocateFields(b);
            this.emit({ e: 'upgraded', x: b.x + b.w / 2, y: b.y + b.h / 2, o: b.owner, b: b.type, l: b.lvl });
            this.updatePop();
          }
        } else if (k === 'age') {
          if (pl.age < MAX_AGE) {
            pl.age++;
            pl.prestige += AGES[pl.age].prestige;
            this.emit({ e: 'age', p: b.owner, age: pl.age });
          }
        } else if (!pl.techs.includes(k)) {
          const hp0 = new Map<UnitType, number>();
          for (const e of this.ents.values()) if (e.kind === 'u' && e.owner === b.owner && !hp0.has(e.type)) hp0.set(e.type, this.ud(b.owner, e.type).hp);
          pl.techs.push(k);
          // Lebenspunkt-Boni wirken auch auf vorhandene Einheiten
          for (const e of this.ents.values())
            if (e.kind === 'u' && e.owner === b.owner) {
              const before = hp0.get(e.type) ?? 0, after = this.ud(b.owner, e.type).hp;
              if (after > before) e.hp += after - before;
            }
          this.emit({ e: 'tech', p: b.owner, t: k });
        }
      }
    }
    // Ausbildung
    if (b.queue.length) {
      const ut = b.queue[0];
      const utd = this.ud(b.owner, ut);
      if (pl.pop + utd.pop > pl.popCap) {
        b.status = pl.popCap >= RULES.maxPop ? 'Bevölkerungsmaximum erreicht' : 'Wartet: Wohnhaus bauen!';
      } else {
        b.status = '';
        b.qt += DT;
        if (b.qt >= this.trainTime(b, ut)) {
          const u = this.spawnUnit(ut, b.owner, b);
          if (u) {
            b.queue.shift();
            b.qt = 0;
            pl.pop += utd.pop;
            pl.stats.trained++;
            this.emit({ e: 'trained', x: u.x, y: u.y, o: b.owner, u: ut });
            if (b.rally) {
              const ri = this.idx(b.rally.x, b.rally.y);
              if (u.type === 'arbeiter' && this.map.trees[ri]) this.setOrder(u, { k: 'gather', tile: ri });
              else {
                const rb = this.building(this.bocc[ri]);
                if (u.type === 'arbeiter' && rb && rb.owner === u.owner && this.bdl(rb).staffSlots && rb.built)
                  this.setOrder(u, { k: 'staff', t: rb.id });
                else this.setOrder(u, { k: 'move', x: b.rally.x + 0.5, y: b.rally.y + 0.5, am: false });
              }
            }
          }
        }
      }
    }
    // Rohstoffgewinnung
    if (def.produce) {
      let rate = 1;
      if (def.produce.perWorker) {
        const working = b.staff.filter((id) => this.unit(id)?.anim === 2).length;
        rate = working;
        if (b.type === 'bauernhof') rate *= Math.min(1, Math.max(0.34, b.fields.length / 3));
        b.status = b.staff.length ? `${b.staff.length}/${def.staffSlots} Arbeiter` : 'Keine Arbeiter – Arbeiter per Rechtsklick zuweisen';
      } else b.status = 'Fängt Fisch';
      if (this.isFull(b.owner, def.produce.res)) {
        rate = 0;
        b.status = `Speicher voll (${RES_NAME[def.produce.res]})`;
      }
      b.active = rate > 0;
      b.timer += DT * rate * (this.tfx(b.owner).produce[b.type] ?? 1);
      if (b.timer >= def.produce.time) {
        b.timer -= def.produce.time;
        pl.res[def.produce.res] += def.produce.amount;
        pl.stats.gathered[def.produce.res] += def.produce.amount;
      }
    }
    // Verarbeitung
    if (def.process) {
      if (!b.active) {
        const res = pl.res;
        // Die KI hält ihre Reserven selbst zurück (ai.ts, leaves()); die feste Reserve gilt nur für Menschen.
        const keep = pl.isAI ? undefined : (Object.keys(def.process.input) as Res[]).find((r) => res[r] - (def.process!.input[r] ?? 0) < (RULES.processReserve[r] ?? 0));
        const full = (Object.keys(def.process.output) as Res[]).find((r) => this.isFull(b.owner, r));
        if (b.halt) b.status = 'Angehalten – verbraucht nichts';
        else if (full) b.status = `Speicher voll (${RES_NAME[full]})`;
        else if (keep && this.canAfford(b.owner, def.process.input))
          b.status = `Wartet: hält ${RULES.processReserve[keep]} ${RES_NAME[keep]} als Reserve zurück`;
        else if (this.canAfford(b.owner, def.process.input)) {
          this.pay(b.owner, def.process.input);
          b.active = true;
          b.timer = 0;
          b.status = 'Produziert';
        } else b.status = `Wartet auf ${costText(def.process.input)}`;
      } else {
        b.timer += DT;
        if (b.timer >= def.process.time * (this.tfx(b.owner).process[b.type] ?? 1)) {
          this.refund(b.owner, def.process.output, 1);
          pl.stats.gathered.waren += def.process.output.waren ?? 0;
          b.active = false;
          b.timer = 0;
        }
      }
    }
    // Markt: automatischer Verkauf
    if (b.type === 'markt' && b.autoSell && this.tick % 20 === 0) this.sell(b.owner);
    // Verteidigung
    if (def.attack) {
      b.cd -= DT;
      if (b.cd <= 0) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const t = this.findEnemy({ x: cx, y: cy, owner: b.owner }, def.attack.range, false);
        if (t && t.kind === 'u') {
          b.cd = def.attack.cooldown;
          this.damage(t, Math.max(1, def.attack.dmg * this.tfx(b.owner).tower - this.ud(t.owner, t.type).armor), b.owner, b.id);
          this.emit({ e: 'shot', x: cx, y: cy, tx: t.x, ty: t.y, r: def.shot ?? 1 });
        }
      }
    }
  }

  /** Knickwächter neben einem Knick erleiden deutlich weniger Schaden. */
  private nearKnick(x: number, y: number): boolean {
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (this.inMap(nx, ny) && this.map.terrain[this.idx(nx, ny)] === T.KNICK) return true;
      }
    return false;
  }

  private damage(t: Entity, dmg: number, attacker: number, attackerId: number): void {
    if (t.kind === 'u' && t.type === 'knickwaechter' && this.nearKnick(t.x, t.y)) dmg = Math.max(1, Math.round(dmg * 0.55));
    t.hp -= dmg;
    if (t.kind === 'u') {
      t.lastHitBy = attackerId;
      t.hitT = this.tick;
    }
    if (t.owner >= 0 && this.tick - this.attackedNote[t.owner] > 150) {
      this.attackedNote[t.owner] = this.tick;
      const x = t.kind === 'u' ? t.x : t.x + t.w / 2, y = t.kind === 'u' ? t.y : t.y + t.h / 2;
      this.emit({ e: 'attacked', p: t.owner, x, y });
    }
    if (t.hp <= 0 && t.hp + dmg > 0 && attacker >= 0) this.players[attacker].stats.kills++;
  }

  // ---------------------------------------------------------------- Einheiten
  private updateUnit(u: Unit): void {
    if (u.hp <= 0) return;
    const def = this.ud(u.owner, u.type);
    u.cd -= DT;
    const o = u.order;
    // Automatische Zielerfassung
    u.scanT -= DT;
    if (u.scanT <= 0) {
      u.scanT = 0.5;
      const idle = o.k === 'none';
      const amove = o.k === 'move' && o.am;
      if (def.military && (idle || amove)) {
        const t = this.findEnemy(u, def.vision, true);
        if (t) this.setOrder(u, { k: 'attack', t: t.id, leashX: u.x, leashY: u.y, resume: amove ? { x: o.x, y: o.y } : undefined });
      } else if (idle && u.lastHitBy && this.tick - u.hitT < 30) {
        const a = this.ents.get(u.lastHitBy);
        if (a && a.hp > 0) this.setOrder(u, { k: 'attack', t: a.id, leashX: u.x, leashY: u.y });
      }
    }
    switch (u.order.k) {
      case 'none':
        u.anim = 0;
        break;
      case 'move': {
        const r = this.follow(u, u.order.x, u.order.y, -2, () => false, 0.15);
        if (r !== 'moving') this.setOrder(u, { k: 'none' });
        break;
      }
      case 'attack':
        this.doAttack(u, u.order);
        break;
      case 'gather':
        this.doGather(u, u.order);
        break;
      case 'build':
        this.doBuild(u, u.order.t);
        break;
      case 'repair':
        this.doRepair(u, u.order.t);
        break;
      case 'staff':
        this.doStaff(u, u.order.t);
        break;
    }
  }

  /**
   * Bewegt die Einheit Richtung Ziel. key identifiziert das aktuelle Wegziel, damit Wege nur bei Bedarf neu
   * berechnet werden. isGoal bestimmt Zielkacheln (bei key -2: Kachel des Punkts).
   */
  private follow(u: Unit, gx: number, gy: number, key: number, isGoal: (i: number) => boolean, arriveR: number): 'moving' | 'arrived' | 'fail' {
    const w = this.map.w;
    const grid = this.gridFor(u);
    if (key === -2 && Math.hypot(u.x - gx, u.y - gy) <= arriveR) return 'arrived';
    const cur = this.idx(Math.floor(u.x), Math.floor(u.y));
    if (key !== -2 && isGoal(cur)) {
      u.path = null;
      return 'arrived';
    }
    u.repathT -= DT;
    if (!u.path || u.goalTile !== key) {
      if (u.repathT > 0 && u.goalTile === key) {
        u.anim = 0;
        return 'moving';
      }
      const gTile = this.idx(Math.floor(gx), Math.floor(gy));
      const goal = key === -2 ? (i: number) => i === gTile : isGoal;
      let sx = Math.floor(u.x), sy = Math.floor(u.y);
      if (!grid.pass[cur]) {
        const np = nearestPassable(grid, sx, sy, 4);
        if (np >= 0) {
          sx = np % w;
          sy = Math.floor(np / w);
        }
      }
      const p = findPath(grid, sx, sy, goal, Math.floor(gx), Math.floor(gy));
      u.goalTile = key;
      u.repathT = 1;
      if (!p) {
        u.path = null;
        return 'fail';
      }
      u.path = p;
      u.pathI = 0;
      u.stuckT = 0;
    }
    const path = u.path;
    if (u.pathI >= path.length) {
      // Wegende erreicht: beim Punktziel zum exakten Punkt laufen, sonst fertig/Fehlschlag
      u.path = null;
      if (key === -2) {
        const gt = this.idx(Math.floor(gx), Math.floor(gy));
        if (cur === gt) return this.stepTo(u, gx, gy) ? 'arrived' : 'moving';
        return Math.hypot(u.x - gx, u.y - gy) < 1.6 ? 'arrived' : 'fail';
      }
      return isGoal(cur) ? 'arrived' : 'fail';
    }
    const next = path[u.pathI];
    if (!grid.pass[next]) {
      u.path = null;
      u.repathT = 0;
      u.goalTile = -1;
      return 'moving';
    }
    const last = u.pathI === path.length - 1;
    const nx = last && key === -2 && next === this.idx(Math.floor(gx), Math.floor(gy)) ? gx : (next % w) + 0.5;
    const ny = last && key === -2 && next === this.idx(Math.floor(gx), Math.floor(gy)) ? gy : Math.floor(next / w) + 0.5;
    if (this.stepTo(u, nx, ny)) u.pathI++;
    // Feststecken erkennen
    if (this.tick % 10 === 0) {
      if (Math.hypot(u.x - u.lastX, u.y - u.lastY) < 0.15) {
        u.stuckT += 1;
        if (u.stuckT >= 3) {
          u.stuckT = 0;
          u.path = null;
          u.goalTile = -1;
          if (key === -2 && Math.hypot(u.x - gx, u.y - gy) < 2) return 'arrived';
        }
      } else u.stuckT = 0;
      u.lastX = u.x;
      u.lastY = u.y;
    }
    return 'moving';
  }

  /** Ein Bewegungsschritt; true wenn Punkt erreicht. */
  private stepTo(u: Unit, tx: number, ty: number): boolean {
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    const cur = this.idx(Math.floor(u.x), Math.floor(u.y));
    const sp = (this.ud(u.owner, u.type).speed / this.gridFor(u).cost[cur]) * DT;
    u.anim = 1;
    if (Math.abs(dx - dy) > 0.01) u.face = dx - dy > 0 ? 1 : -1;
    if (d <= sp) {
      u.x = tx;
      u.y = ty;
      return true;
    }
    u.x += (dx / d) * sp;
    u.y += (dy / d) * sp;
    return false;
  }

  private faceTo(u: Unit, x: number, y: number): void {
    const s = x - u.x - (y - u.y);
    if (Math.abs(s) > 0.01) u.face = s > 0 ? 1 : -1;
  }

  private doAttack(u: Unit, o: Extract<Order, { k: 'attack' }>): void {
    const def = this.ud(u.owner, u.type);
    const t = this.ents.get(o.t);
    const done = () => {
      if (o.resume) this.setOrder(u, { k: 'move', x: o.resume.x, y: o.resume.y, am: true });
      else this.setOrder(u, { k: 'none' });
    };
    if (!t || t.hp <= 0 || !this.isEnemy(u.owner, t.owner)) return done();
    // Ziel im Nebel verloren?
    const tx = t.kind === 'u' ? t.x : t.x + t.w / 2, ty = t.kind === 'u' ? t.y : t.y + t.h / 2;
    if (t.kind === 'u' && this.vis[u.owner][this.idx(Math.floor(t.x), Math.floor(t.y))] !== 2) return done();
    // Leine: automatisch erfasste Ziele nicht ewig verfolgen
    if (o.leashX !== undefined && Math.hypot(u.x - o.leashX, u.y - (o.leashY ?? 0)) > 12) {
      if (o.resume) return done();
      return this.setOrder(u, { k: 'move', x: o.leashX, y: o.leashY ?? u.y, am: false });
    }
    const dist = t.kind === 'u' ? Math.hypot(t.x - u.x, t.y - u.y) : rectDist(u.x, u.y, t);
    if (dist <= def.range + (t.kind === 'u' ? 0.25 : 0.1)) {
      u.path = null;
      u.goalTile = -1;
      u.anim = 3;
      this.faceTo(u, tx, ty);
      if (u.cd <= 0) {
        u.cd = def.cooldown;
        let dmg: number;
        if (t.kind === 'u') dmg = Math.max(1, def.dmg - this.ud(t.owner, t.type).armor);
        else dmg = def.dmg * def.vsBuilding;
        this.damage(t, dmg, u.owner, u.id);
        if (def.range > 2) this.emit({ e: 'shot', x: u.x, y: u.y, tx, ty, r: def.shot ?? 0 });
        else this.emit({ e: 'hit', x: tx, y: ty, m: 1 });
      }
      return;
    }
    // Annähern: Ziel in Reichweite bringen
    const range = def.range;
    const w = this.map.w;
    const key = 1_000_000 + t.id * 4 + (t.kind === 'u' ? Math.floor(this.tick / 10) % 4 : 0);
    const isGoal =
      t.kind === 'u'
        ? (i: number) => Math.hypot((i % w) + 0.5 - t.x, Math.floor(i / w) + 0.5 - t.y) <= Math.max(range, 1) + 0.2
        : (i: number) => rectDist((i % w) + 0.5, Math.floor(i / w) + 0.5, t) <= Math.max(range - 0.1, 0.75);
    const r = this.follow(u, tx, ty, key, isGoal, 0);
    if (r === 'fail') {
      // Unerreichbar
      if (o.leashX !== undefined) done();
      else {
        this.err(u.owner, 'Ziel ist nicht erreichbar.');
        this.setOrder(u, { k: 'none' });
      }
    }
  }

  private dropoffFor(u: Unit): Building | null {
    let best: Building | null = null, bd = Infinity;
    for (const e of this.ents.values()) {
      if (e.kind !== 'b' || e.owner !== u.owner || !e.built) continue;
      const dof = BUILDINGS[e.type].dropoff;
      if (!dof) continue;
      if (!dof.includes('all') && !(u.carryRes === 'holz' && dof.includes('holz'))) continue;
      const d = rectDist(u.x, u.y, e);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private nearestTree(x: number, y: number, maxR: number): number {
    const w = this.map.w;
    let best = -1, bd = Infinity;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    for (let dy = -maxR; dy <= maxR; dy++)
      for (let dx = -maxR; dx <= maxR; dx++) {
        const px = x0 + dx, py = y0 + dy;
        if (!this.inMap(px, py)) continue;
        const i = py * w + px;
        if (!this.map.trees[i] || this.isBadTree(i)) continue;
        // nur Bäume mit freiem Nachbarn
        let free = false;
        for (let k = 0; k < 8 && !free; k++) {
          const qx = px + [1, -1, 0, 0, 1, 1, -1, -1][k], qy = py + [0, 0, 1, -1, 1, -1, 1, -1][k];
          if (this.inMap(qx, qy) && this.grid.pass[qy * w + qx]) free = true;
        }
        if (!free) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    return best;
  }

  private doGather(u: Unit, o: Extract<Order, { k: 'gather' }>): void {
    const w = this.map.w;
    if (u.carryRes && u.carryRes !== 'holz') {
      u.carry = 0;
      u.carryRes = null;
    }
    const cap = RULES.carryCap + this.tfx(u.owner).carry;
    if (u.carry >= cap) {
      const d = this.dropoffFor(u);
      if (!d) {
        this.err(u.owner, 'Kein Abladeplatz für Holz – Holzfällerlager oder Dorfzentrum fehlt.');
        return this.setOrder(u, { k: 'none' });
      }
      const r = this.follow(u, d.x + d.w / 2, d.y + d.h / 2, 2_000_000 + d.id, (i) => rectDist((i % w) + 0.5, Math.floor(i / w) + 0.5, d) <= 0.8, 0);
      if (r === 'arrived') {
        const pl = this.players[u.owner];
        pl.res.holz += u.carry;
        pl.stats.gathered.holz += u.carry;
        u.carry = 0;
        u.carryRes = null;
        u.path = null;
        u.goalTile = -1;
      } else if (r === 'fail') this.setOrder(u, { k: 'none' });
      return;
    }
    if (!this.map.trees[o.tile]) {
      const nt = this.nearestTree((o.tile % w) + 0.5, Math.floor(o.tile / w) + 0.5, 9);
      if (nt < 0) {
        if (u.carry > 0) u.carry = cap; // Rest abliefern
        else {
          this.emit({ e: 'info', p: u.owner, msg: 'Ein Arbeiter findet hier keine Bäume mehr.' });
          this.setOrder(u, { k: 'none' });
        }
        return;
      }
      o.tile = nt;
      u.path = null;
      u.goalTile = -1;
    }
    const tx = o.tile % w, ty = Math.floor(o.tile / w);
    const r = this.follow(u, tx + 0.5, ty + 0.5, 3_000_000 + o.tile, (i) => Math.max(Math.abs((i % w) - tx), Math.abs(Math.floor(i / w) - ty)) === 1, 0);
    if (r === 'arrived') {
      u.anim = 2;
      this.faceTo(u, tx + 0.5, ty + 0.5);
      u.work += DT * this.tfx(u.owner).gather;
      if (u.work >= RULES.chopTime) {
        u.work = 0;
        u.carry++;
        u.carryRes = 'holz';
        if (u.carry % 3 === 0) this.emit({ e: 'chop', x: tx + 0.5, y: ty + 0.5 });
        this.map.trees[o.tile]--;
        if (!this.map.trees[o.tile]) {
          this.refreshPass(o.tile);
          this.treeDirty.push(o.tile);
        } else if (this.map.trees[o.tile] % 5 === 0) this.treeDirty.push(o.tile);
      }
    } else if (r === 'fail') {
      // Baum liegt z. B. in einer von Knicks umschlossenen Koppel: merken und einen anderen suchen
      this.badTrees.set(o.tile, this.tick + 3000);
      const nt = this.nearestTree(u.x, u.y, 10);
      if (nt >= 0) {
        o.tile = nt;
        u.path = null;
        u.goalTile = -1;
      } else {
        this.err(u.owner, 'Hier ist kein Baum erreichbar.');
        this.setOrder(u, { k: 'none' });
      }
    }
  }

  private doBuild(u: Unit, id: number): void {
    const b = this.building(id);
    const w = this.map.w;
    if (!b || b.owner !== u.owner) return this.setOrder(u, { k: 'none' });
    if (b.built) return this.afterBuild(u, b);
    const r = this.follow(u, b.x + b.w / 2, b.y + b.h / 2, 4_000_000 + b.id, (i) => rectDist((i % w) + 0.5, Math.floor(i / w) + 0.5, b) <= 0.8, 0);
    if (r === 'arrived') {
      u.anim = 2;
      this.faceTo(u, b.x + b.w / 2, b.y + b.h / 2);
      const def = BUILDINGS[b.type];
      const bs = DT * this.tfx(u.owner).gather;
      b.prog += bs;
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp * 0.9 * bs) / def.buildTime);
      if (b.prog >= def.buildTime) {
        b.built = true;
        b.prog = def.buildTime;
        this.onBuilt(b, true);
        this.afterBuild(u, b);
      }
    } else if (r === 'fail') {
      this.err(u.owner, 'Baustelle ist nicht erreichbar.');
      this.setOrder(u, { k: 'none' });
    }
  }

  /** Reparieren: Arbeiter stellen Lebenspunkte wieder her; volle Reparatur kostet etwa ein Drittel des Holzpreises. */
  private doRepair(u: Unit, id: number): void {
    const b = this.building(id);
    const w = this.map.w;
    if (!b || b.owner !== u.owner || !b.built) return this.setOrder(u, { k: 'none' });
    if (b.hp >= b.maxHp) return this.afterBuild(u, b);
    const r = this.follow(u, b.x + b.w / 2, b.y + b.h / 2, 4_000_000 + b.id, (i) => rectDist((i % w) + 0.5, Math.floor(i / w) + 0.5, b) <= 0.8, 0);
    if (r === 'arrived') {
      u.anim = 2;
      this.faceTo(u, b.x + b.w / 2, b.y + b.h / 2);
      const def = BUILDINGS[b.type];
      const hp = Math.min(b.maxHp - b.hp, ((b.maxHp * 0.6) / Math.max(10, def.buildTime)) * DT * this.tfx(u.owner).gather * this.tfx(u.owner).repair);
      const wood = Math.max(10, def.cost.holz ?? def.cost.lehm ?? 30) / 3;
      b.rd = (b.rd ?? 0) + (hp / b.maxHp) * wood;
      const pl = this.players[u.owner];
      if (b.rd >= 1) {
        if (pl.res.holz < 1) {
          this.err(u.owner, 'Reparatur unterbrochen: kein Holz.');
          return this.setOrder(u, { k: 'none' });
        }
        const pay = Math.floor(b.rd);
        pl.res.holz -= Math.min(pay, pl.res.holz);
        b.rd -= pay;
      }
      b.hp += hp;
      if (this.tick % 15 === 0) this.emit({ e: 'chop', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    } else if (r === 'fail') {
      this.err(u.owner, 'Gebäude ist nicht erreichbar.');
      this.setOrder(u, { k: 'none' });
    }
  }

  private afterBuild(u: Unit, b: Building): void {
    const def = this.bdl(b);
    if (def.staffSlots && b.staff.length < def.staffSlots) return this.setOrder(u, { k: 'staff', t: b.id });
    if (b.type === 'holzfaeller') {
      const t = this.nearestTree(b.x + 1, b.y + 1, 10);
      if (t >= 0) return this.setOrder(u, { k: 'gather', tile: t });
    }
    // weitere eigene Baustelle in der Nähe?
    for (const e of this.ents.values())
      if (e.kind === 'b' && e.owner === u.owner && !e.built && rectDist(u.x, u.y, e) < 10) return this.setOrder(u, { k: 'build', t: e.id });
    this.setOrder(u, { k: 'none' });
  }

  private doStaff(u: Unit, id: number): void {
    const b = this.building(id);
    const w = this.map.w;
    const def = b ? this.bdl(b) : null;
    if (!b || !def || b.owner !== u.owner || !def.staffSlots) return this.setOrder(u, { k: 'none' });
    if (!b.built) return this.setOrder(u, { k: 'build', t: b.id });
    if (!u.staffOf) {
      const r = this.follow(u, b.x + b.w / 2, b.y + b.h / 2, 5_000_000 + b.id, (i) => rectDist((i % w) + 0.5, Math.floor(i / w) + 0.5, b) <= 0.8, 0);
      if (r === 'arrived') {
        if (b.staff.length >= def.staffSlots) {
          this.err(u.owner, `${def.name}: alle ${def.staffSlots} Arbeitsplätze sind besetzt.`);
          return this.setOrder(u, { k: 'none' });
        }
        b.staff.push(u.id);
        u.staffOf = b.id;
        u.work = 0;
        u.goalTile = -1;
        u.path = null;
      } else if (r === 'fail') this.setOrder(u, { k: 'none' });
      return;
    }
    // Arbeitet: zu einem Arbeitsplatz (Feld bzw. Grubenrand) gehen und dort werken
    if (u.goalTile < 6_000_000) {
      let spot: number;
      if (b.fields.length) spot = b.fields[(u.id + Math.floor(this.tick / 80)) % b.fields.length];
      else {
        const ring: number[] = [];
        for (let dy = -1; dy <= b.h; dy++)
          for (let dx = -1; dx <= b.w; dx++) {
            const x = b.x + dx, y = b.y + dy;
            if ((dx < 0 || dy < 0 || dx >= b.w || dy >= b.h) && this.inMap(x, y) && this.grid.pass[this.idx(x, y)]) ring.push(this.idx(x, y));
          }
        spot = ring.length ? ring[u.id % ring.length] : this.idx(Math.floor(u.x), Math.floor(u.y));
      }
      u.goalTile = 6_000_000 + spot;
      u.work = 0;
    }
    const spot = u.goalTile - 6_000_000;
    const sx = (spot % w) + 0.5 + ((u.id % 3) - 1) * 0.2, sy = Math.floor(spot / w) + 0.5;
    if (Math.hypot(u.x - sx, u.y - sy) > 0.2) {
      if (!u.path) {
        const p = findPath(this.grid, Math.floor(u.x), Math.floor(u.y), (i) => i === spot, spot % w, Math.floor(spot / w), 600);
        u.path = p ?? [];
        u.pathI = 0;
      }
      if (u.pathI < u.path.length) {
        const n = u.path[u.pathI];
        if (this.stepTo(u, (n % w) + 0.5, Math.floor(n / w) + 0.5)) u.pathI++;
      } else if (this.stepTo(u, sx, sy)) u.path = null;
      return;
    }
    u.anim = 2;
    this.faceTo(u, b.x + b.w / 2, b.y + b.h / 2);
    u.work += DT;
    if (u.work > 8 && b.fields.length > 1) {
      u.goalTile = -1; // nächstes Feld
      u.path = null;
    }
  }

  private separate(): void {
    const w = this.map.w;
    for (const c of this.cells) {
      for (let a = 0; a < c.length; a++) {
        const u = c[a];
        if (u.anim === 2 && u.staffOf) continue;
        for (let b = a + 1; b < c.length; b++) {
          const v = c[b];
          const dx = v.x - u.x, dy = v.y - u.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.16) continue;
          if (d2 < 1e-6) {
            // exakt übereinander: deterministisch auseinanderschieben
            v.x += ((v.id % 7) - 3) * 0.02 + 0.01;
            v.y += ((v.id % 5) - 2) * 0.02;
            continue;
          }
          const d = Math.sqrt(d2);
          const push = (0.4 - d) * 0.25;
          const ux = u.x - (dx / d) * push, uy = u.y - (dy / d) * push;
          const vx = v.x + (dx / d) * push, vy = v.y + (dy / d) * push;
          if (this.gridFor(u).pass[Math.floor(uy) * w + Math.floor(ux)] && u.anim !== 3) {
            u.x = ux;
            u.y = uy;
          }
          if (this.gridFor(v).pass[Math.floor(vy) * w + Math.floor(vx)] && v.anim !== 3) {
            v.x = vx;
            v.y = vy;
          }
        }
      }
    }
  }

  private cleanupDead(): void {
    for (const e of [...this.ents.values()]) {
      if (e.hp > 0) continue;
      if (e.kind === 'u') {
        this.setOrder(e, { k: 'none' });
        this.ents.delete(e.id);
        this.players[e.owner].stats.lost++;
        this.emit({ e: 'die', x: e.x, y: e.y, u: 1, o: e.owner });
      } else if (e.owner >= 0) {
        this.emit({ e: 'die', x: e.x + e.w / 2, y: e.y + e.h / 2, u: 0, o: e.owner });
        const wasDZ = e.type === 'dorfzentrum';
        this.removeBuilding(e, true);
        if (wasDZ) this.defeat(e.owner, 'Dorfzentrum zerstört');
      }
    }
  }

  removeBuilding(b: Building, destroyed: boolean): void {
    for (let dy = 0; dy < b.h; dy++)
      for (let dx = 0; dx < b.w; dx++) {
        const i = this.idx(b.x + dx, b.y + dy);
        this.bocc[i] = 0;
        this.refreshPass(i);
      }
    for (const f of b.fields) this.field[f] = 0;
    for (const id of b.staff) {
      const u = this.unit(id);
      if (u) {
        u.staffOf = 0;
        this.setOrder(u, { k: 'none' });
      }
    }
    b.staff = [];
    this.ents.delete(b.id);
    if (destroyed && b.owner >= 0) this.players[b.owner].stats.lost++;
    this.updatePop();
  }

  private defeat(p: number, reason: string): void {
    const pl = this.players[p];
    if (pl.defeated) return;
    pl.defeated = true;
    for (const e of [...this.ents.values()]) {
      if (e.owner !== p) continue;
      if (e.kind === 'u') {
        this.emit({ e: 'die', x: e.x, y: e.y, u: 1, o: p });
        this.ents.delete(e.id);
      } else {
        this.emit({ e: 'die', x: e.x + e.w / 2, y: e.y + e.h / 2, u: 0, o: p });
        this.removeBuilding(e, false);
      }
    }
    this.emit({ e: 'defeat', p });
    this.emit({ e: 'info', p, msg: `Niederlage: ${reason}.` });
    for (const q of this.players) if (q.id !== p) this.emit({ e: 'info', p: q.id, msg: `${pl.name} ist besiegt (${reason}).` });
  }

  private updateBrarup(): void {
    const b = this.building(this.brarup.id);
    if (!b) return;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const present = new Set<number>();
    for (const e of this.ents.values())
      if (e.kind === 'u' && Math.hypot(e.x - cx, e.y - cy) <= RULES.brarupRadius) present.add(e.owner);
    const prev = this.brarup.controller;
    this.brarup.contested = present.size > 1;
    this.brarup.controller = present.size === 1 ? [...present][0] : -1;
    if (this.brarup.controller !== prev && this.brarup.controller >= 0) {
      this.emit({ e: 'brarup', p: this.brarup.controller });
      this.brarup.timer = 0;
    }
    if (this.brarup.controller >= 0) {
      this.brarup.timer += 0.5;
      if (this.brarup.timer >= RULES.brarupTrickle.every) {
        this.brarup.timer = 0;
        this.players[this.brarup.controller].prestige += RULES.brarupTrickle.prestige;
      }
    }
  }

  private checkMoor(): void {
    if (this.moorFoundBy >= 0) return;
    const { x, y } = this.map.site;
    for (const e of this.ents.values()) {
      if (e.kind !== 'u') continue;
      if (Math.hypot(e.x - (x + 0.5), e.y - (y + 0.5)) <= 1.8) {
        this.moorFoundBy = e.owner;
        const pl = this.players[e.owner];
        pl.prestige += RULES.moorReward.prestige;
        pl.res.taler += RULES.moorReward.taler;
        this.emit({ e: 'moor', p: e.owner });
        return;
      }
    }
  }

  private checkVictory(): void {
    if (this.winner >= 0) return;
    for (const p of this.players)
      if (this.prestigeGoal > 0 && !p.defeated && p.prestige >= this.prestigeGoal) {
        this.winner = p.id;
        this.winReason = `Wirtschaftlicher Sieg: ${this.prestigeGoal} Prestige durch Handel erreicht`;
        this.emit({ e: 'win', p: p.id, reason: this.winReason });
        return;
      }
    const alive = this.players.filter((p) => !p.defeated);
    if (alive.length === 1 && this.players.length > 1) {
      this.winner = alive[0].id;
      this.winReason = 'Militärischer Sieg: Alle gegnerischen Dorfzentren sind zerstört';
      this.emit({ e: 'win', p: alive[0].id, reason: this.winReason });
    }
  }

  // ---------------------------------------------------------------- Speichern
  serialize(): string {
    const b64 = (a: Uint8Array) => {
      let s = '';
      for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
      return btoa(s);
    };
    return JSON.stringify({
      v: 1, mw: this.map.w, opts: this.opts, tick: this.tick, nextId: this.nextId, players: this.players,
      ents: [...this.ents.values()], trees: b64(this.map.trees), vis: this.vis.map(b64), rng: this.rng.state,
      winner: this.winner, winReason: this.winReason, prestigeGoal: this.prestigeGoal, brarup: this.brarup,
      moorFoundBy: this.moorFoundBy,
    });
  }

  static deserialize(json: string): World {
    const d = JSON.parse(json);
    if (!d || d.v !== 1) throw new Error('Unbekanntes Spielstandformat.');
    if ((d.mw ?? 96) !== mapSizeFor(d.opts?.players?.length ?? 2)) throw new Error('Der Spielstand stammt aus einer älteren Version mit kleineren Karten und passt nicht mehr.');
    const ub = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const w = new World(d.opts, true);
    w.tick = d.tick;
    w.nextId = d.nextId;
    w.players = d.players;
    for (const p of w.players) {
      p.faction ??= 'angeln';
      p.age ??= 1;
      p.techs ??= [];
      p.cap ??= 0;
    }
    w.map.trees.set(ub(d.trees));
    w.vis = d.vis.map(ub);
    w.attackedNote = w.players.map(() => -1000);
    w.rng.state = d.rng;
    w.winner = d.winner;
    w.winReason = d.winReason;
    w.prestigeGoal = d.prestigeGoal;
    w.brarup = d.brarup;
    w.moorFoundBy = d.moorFoundBy;
    for (let i = 0; i < w.map.trees.length; i++) w.refreshPass(i);
    for (const e of d.ents as Entity[]) {
      w.ents.set(e.id, e);
      if (e.kind === 'b') {
        for (let dy = 0; dy < e.h; dy++)
          for (let dx = 0; dx < e.w; dx++) {
            const i = w.idx(e.x + dx, e.y + dy);
            w.bocc[i] = e.id;
            w.grid.pass[i] = 0;
            w.gridJump.pass[i] = 0;
            w.gridAir.pass[i] = 0;
          }
        for (const f of e.fields) w.field[f] = e.id;
        e.lvl ??= 1;
        e.up ??= -1;
      }
    }
    w.updatePop();
    return w;
  }
}

export function rectDist(x: number, y: number, b: { x: number; y: number; w: number; h: number }): number {
  const cx = Math.max(b.x, Math.min(x, b.x + b.w)), cy = Math.max(b.y, Math.min(y, b.y + b.h));
  return Math.hypot(x - cx, y - cy);
}

export { isWater };
