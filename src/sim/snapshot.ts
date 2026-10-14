// Erzeugt pro Empfänger gefilterte Zustandsbilder. Der Empfänger erhält nur, was er sehen darf:
// eigene Objekte, sichtbare fremde Objekte, sichtbare Baumänderungen und sichtbare Ereignisse.
import { UPGRADES, type BuildingType, type Res, type UnitType } from '../data/defs';
import type { FactionId } from '../data/factions';
import type { SimEvent } from './types';
import type { World } from './world';

export interface USnap {
  i: number;
  k: 0;
  t: UnitType;
  o: number;
  x: number;
  y: number;
  h: number;
  a: number; // Animation
  f: 1 | -1;
  c?: number; // getragenes Holz
  w?: 1; // arbeitet in Gebäude
}
export interface BSnap {
  i: number;
  k: 1;
  t: BuildingType;
  o: number;
  x: number;
  y: number;
  h: number;
  m: number;
  b: 0 | 1;
  p: number; // Baufortschritt 0..100
  q?: UnitType[];
  qp?: number;
  s?: string;
  f?: number[];
  st?: number[];
  ac?: 1;
  as?: 1;
  r?: [number, number];
  l?: number; // Ausbaustufe (ab II)
  u?: number; // Ausbaufortschritt 0..100 (nur eigene)
}
export type EntSnap = USnap | BSnap;

export interface PlayerSnap {
  id: number;
  name: string;
  color: number;
  faction: FactionId;
  prestige: number;
  defeated: boolean;
  res?: Record<Res, number>;
  pop?: number;
  popCap?: number;
}

export interface Snapshot {
  tick: number;
  full: boolean;
  me: number;
  ents: EntSnap[];
  hid: number[]; // aus dem Sichtfeld verschwunden (Gebäude bleiben als Erinnerung)
  gone: number[]; // zerstört bzw. entfernt
  players: PlayerSnap[];
  trees: number[]; // Paare: Kachel, Holzmenge
  ev: SimEvent[];
  brarup: { c: number; x: boolean };
  moor: number;
  winner: number;
  winReason: string;
  goal: number;
  ack?: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export class Snapshotter {
  private last = new Map<number, string>();
  private pendingTrees = new Set<number>();
  constructor(readonly player: number) {}

  /** Muss jeden Takt nach world.step() aufgerufen werden, damit keine Baumänderung verloren geht. */
  collectTrees(world: World): void {
    for (const t of world.treeDirty) this.pendingTrees.add(t);
  }

  make(world: World, full: boolean): Snapshot {
    const p = this.player;
    const vis = world.vis[p];
    const W = world.map.w;
    const visible = (x: number, y: number) => vis[Math.floor(y) * W + Math.floor(x)] === 2;
    const ents: EntSnap[] = [];
    const seen = new Set<number>();
    for (const e of world.ents.values()) {
      let snap: EntSnap;
      if (e.kind === 'u') {
        if (e.owner !== p && !visible(e.x, e.y)) continue;
        snap = { i: e.id, k: 0, t: e.type, o: e.owner, x: r2(e.x), y: r2(e.y), h: Math.ceil(e.hp), a: e.anim, f: e.face };
        if (e.carry) snap.c = e.carry;
        if (e.staffOf) snap.w = 1;
      } else {
        if (e.owner !== p && e.owner >= 0) {
          let any = false;
          for (let dy = 0; dy < e.h && !any; dy++) for (let dx = 0; dx < e.w && !any; dx++) any = vis[(e.y + dy) * W + e.x + dx] === 2;
          if (!any) continue;
        }
        snap = {
          i: e.id, k: 1, t: e.type, o: e.owner, x: e.x, y: e.y, h: Math.ceil(e.hp), m: e.maxHp, b: e.built ? 1 : 0,
          p: e.built ? 100 : Math.floor((e.prog / world.bd(e.owner, e.type).buildTime) * 100),
        };
        if (e.fields.length) snap.f = e.fields;
        if (e.lvl > 1) snap.l = e.lvl;
        if (e.active) snap.ac = 1;
        if (e.owner === p) {
          if (e.queue.length) {
            snap.q = e.queue;
            snap.qp = Math.floor((e.qt / world.trainTime(e, e.queue[0])) * 100);
          }
          if (e.status) snap.s = e.status;
          if (e.staff.length) snap.st = e.staff;
          if (e.autoSell) snap.as = 1;
          if (e.rally) snap.r = [e.rally.x, e.rally.y];
          if (e.up >= 0) snap.u = Math.floor((e.up / (UPGRADES[e.type]?.[e.lvl - 1]?.time ?? 1)) * 100);
        }
      }
      seen.add(e.id);
      const json = JSON.stringify(snap);
      if (full || this.last.get(e.id) !== json) {
        ents.push(snap);
        this.last.set(e.id, json);
      }
    }
    const hid: number[] = [];
    const gone: number[] = [];
    for (const id of [...this.last.keys()]) {
      if (seen.has(id)) continue;
      this.last.delete(id);
      if (world.ents.has(id)) hid.push(id);
      else gone.push(id);
    }
    const trees: number[] = [];
    for (const t of this.pendingTrees) {
      if (vis[t] === 2) {
        trees.push(t, world.map.trees[t]);
        this.pendingTrees.delete(t);
      }
    }
    const ev = world.events.filter((e) => eventVisible(e, p, visible));
    const players: PlayerSnap[] = world.players.map((pl) => {
      const ps: PlayerSnap = { id: pl.id, name: pl.name, color: pl.color, faction: pl.faction, prestige: Math.floor(pl.prestige), defeated: pl.defeated };
      if (pl.id === p) {
        ps.res = { ...pl.res };
        ps.pop = pl.pop;
        ps.popCap = pl.popCap;
      }
      return ps;
    });
    return {
      tick: world.tick, full, me: p, ents, hid, gone, players, trees, ev,
      brarup: { c: world.brarup.controller, x: world.brarup.contested }, moor: world.moorFoundBy,
      winner: world.winner, winReason: world.winReason, goal: world.prestigeGoal,
    };
  }
}


function eventVisible(e: SimEvent, p: number, visible: (x: number, y: number) => boolean): boolean {
  switch (e.e) {
    case 'err':
    case 'info':
    case 'attacked':
    case 'sold':
    case 'brarup':
      return e.p === p || e.e === 'brarup';
    case 'moor':
    case 'defeat':
    case 'win':
      return true;
    case 'built':
    case 'upgraded':
    case 'trained':
      return e.o === p || visible(e.x, e.y);
    case 'die':
      return e.o === p || visible(e.x, e.y);
    case 'shot':
      return visible(e.x, e.y) || visible(e.tx, e.ty);
    case 'hit':
    case 'chop':
      return visible(e.x, e.y);
  }
  return false;
}
