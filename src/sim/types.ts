import type { BuildingType, Res, UnitType } from '../data/defs';

export type Order =
  | { k: 'none' }
  | { k: 'move'; x: number; y: number; am: boolean }
  | { k: 'attack'; t: number; leashX?: number; leashY?: number; resume?: { x: number; y: number } }
  | { k: 'gather'; tile: number }
  | { k: 'build'; t: number }
  | { k: 'staff'; t: number };

export type Anim = 0 | 1 | 2 | 3; // ruhend, gehend, arbeitend, kämpfend

export interface Unit {
  id: number;
  kind: 'u';
  type: UnitType;
  owner: number;
  x: number;
  y: number;
  hp: number;
  face: 1 | -1;
  anim: Anim;
  order: Order;
  path: number[] | null;
  pathI: number;
  goalTile: number;
  repathT: number;
  carry: number;
  carryRes: Res | null;
  cd: number;
  work: number;
  scanT: number;
  staffOf: number;
  lastHitBy: number;
  hitT: number;
  stuckT: number;
  lastX: number;
  lastY: number;
}

export interface Building {
  id: number;
  kind: 'b';
  type: BuildingType;
  owner: number; // -1 = neutral
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  built: boolean;
  prog: number; // geleistete Bauarbeit in Sekunden
  queue: UnitType[];
  qt: number;
  timer: number;
  active: boolean;
  status: string;
  fields: number[];
  staff: number[];
  rally: { x: number; y: number } | null;
  autoSell: boolean;
  cd: number;
}

export type Entity = Unit | Building;

export interface PlayerStats {
  gathered: Record<Res, number>;
  trained: number;
  lost: number;
  kills: number;
  built: number;
  sold: number;
}

export interface PlayerState {
  id: number;
  name: string;
  color: number;
  slot: number;
  res: Record<Res, number>;
  prestige: number;
  defeated: boolean;
  isAI: boolean;
  aiLevel: 'leicht' | 'normal';
  stats: PlayerStats;
  pop: number;
  popCap: number;
}

export type SimEvent =
  | { e: 'shot'; x: number; y: number; tx: number; ty: number; r: 0 | 1 } // r: 0 Bolzen, 1 Pfeil vom Dorfzentrum
  | { e: 'hit'; x: number; y: number; m: 0 | 1 } // m: 1 Nahkampf
  | { e: 'die'; x: number; y: number; u: 0 | 1; o: number }
  | { e: 'built'; x: number; y: number; o: number; b: BuildingType }
  | { e: 'trained'; x: number; y: number; o: number; u: UnitType }
  | { e: 'chop'; x: number; y: number }
  | { e: 'err'; p: number; msg: string }
  | { e: 'info'; p: number; msg: string }
  | { e: 'attacked'; p: number; x: number; y: number }
  | { e: 'sold'; p: number; taler: number; prestige: number }
  | { e: 'moor'; p: number }
  | { e: 'brarup'; p: number }
  | { e: 'defeat'; p: number }
  | { e: 'win'; p: number; reason: string };

export type Command =
  | { c: 'smart'; ids: number[]; x: number; y: number; t?: number; q?: boolean }
  | { c: 'move'; ids: number[]; x: number; y: number; am?: boolean }
  | { c: 'attack'; ids: number[]; t: number }
  | { c: 'gather'; ids: number[]; x: number; y: number }
  | { c: 'build'; ids: number[]; t: number }
  | { c: 'staff'; ids: number[]; t: number }
  | { c: 'stop'; ids: number[] }
  | { c: 'place'; ids: number[]; b: BuildingType; x: number; y: number }
  | { c: 'train'; b: number; u: UnitType }
  | { c: 'cancel'; b: number }
  | { c: 'sell'; b: number }
  | { c: 'buy'; b: number; r: 'holz' | 'lehm' }
  | { c: 'auto'; b: number; on: boolean }
  | { c: 'rally'; b: number; x: number; y: number }
  | { c: 'resign' };
