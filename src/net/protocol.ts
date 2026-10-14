// Nachrichtenformat zwischen Host und Gast (JSON über DataChannel) und strikte Prüfung eingehender Daten.
import { isBuildingType, isUnitType } from '../data/defs';
import { isFaction, type FactionId } from '../data/factions';
import { MAP_H, MAP_W, isMapId, type MapId } from '../sim/map';
import type { Snapshot } from '../sim/snapshot';
import type { Command } from '../sim/types';

export const PROTOCOL_VERSION = 2; // 2: Kartenwahl

export interface LobbyPlayer {
  name: string;
  color: number;
  slot: number;
  ready: boolean;
  faction: FactionId;
}
export interface LobbyState {
  players: LobbyPlayer[]; // [0] = Host, [1] = Gast
  goal: number;
  rich: boolean;
  map: MapId;
}

export type GuestMsg =
  | { t: 'hello'; v: number; name: string; faction: FactionId }
  | { t: 'lset'; name: string; color: number; slot: number; ready: boolean; faction: FactionId }
  | { t: 'cmd'; s: number; c: Command }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }
  | { t: 'chat'; text: string }
  | { t: 'bye' };

export type HostMsg =
  | { t: 'welcome'; v: number }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; st: LobbyState }
  | { t: 'start'; seed: number; goal: number; rich: boolean; me: number; players: LobbyPlayer[]; map: MapId }
  | { t: 'snap'; s: Snapshot }
  | { t: 'ping'; n: number }
  | { t: 'pong'; n: number }
  | { t: 'chat'; text: string }
  | { t: 'bye'; reason: string };

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isIds = (v: unknown): v is number[] => Array.isArray(v) && v.length <= 200 && v.every((x) => isInt(x, 1, 1e9));

export function cleanName(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  return s || fallback;
}

/** Prüft einen Spielbefehl strukturell. Inhaltliche Prüfung (Besitz, Kosten, Bauplatz) erfolgt in der Simulation. */
export function validateCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const xy = () => isNum(c.x, 0, MAP_W) && isNum(c.y, 0, MAP_H);
  switch (c.c) {
    case 'smart':
      if (!isIds(c.ids) || !xy() || (c.t !== undefined && !isInt(c.t, 1, 1e9))) return null;
      return { c: 'smart', ids: c.ids, x: c.x as number, y: c.y as number, t: c.t as number | undefined };
    case 'move':
      if (!isIds(c.ids) || !xy()) return null;
      return { c: 'move', ids: c.ids, x: c.x as number, y: c.y as number, am: c.am === true };
    case 'attack':
    case 'build':
    case 'staff':
      if (!isIds(c.ids) || !isInt(c.t, 1, 1e9)) return null;
      return { c: c.c, ids: c.ids, t: c.t };
    case 'gather':
      if (!isIds(c.ids) || !xy()) return null;
      return { c: 'gather', ids: c.ids, x: c.x as number, y: c.y as number };
    case 'stop':
      if (!isIds(c.ids)) return null;
      return { c: 'stop', ids: c.ids };
    case 'place':
      if (!isIds(c.ids) || !isBuildingType(c.b) || !isInt(c.x, 0, MAP_W) || !isInt(c.y, 0, MAP_H)) return null;
      return { c: 'place', ids: c.ids, b: c.b, x: c.x, y: c.y };
    case 'train':
      if (!isInt(c.b, 1, 1e9) || !isUnitType(c.u)) return null;
      return { c: 'train', b: c.b, u: c.u };
    case 'cancel':
    case 'sell':
      if (!isInt(c.b, 1, 1e9)) return null;
      return { c: c.c, b: c.b };
    case 'buy':
      if (!isInt(c.b, 1, 1e9) || (c.r !== 'holz' && c.r !== 'lehm')) return null;
      return { c: 'buy', b: c.b, r: c.r };
    case 'auto':
      if (!isInt(c.b, 1, 1e9) || typeof c.on !== 'boolean') return null;
      return { c: 'auto', b: c.b, on: c.on };
    case 'rally':
      if (!isInt(c.b, 1, 1e9) || !xy()) return null;
      return { c: 'rally', b: c.b, x: c.x as number, y: c.y as number };
    case 'resign':
      return { c: 'resign' };
  }
  return null;
}

/** Prüft eine Gast-Nachricht. Unbekanntes wird verworfen (null). */
export function parseGuestMsg(raw: unknown): GuestMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      if (!isInt(m.v, 0, 1000)) return null;
      return { t: 'hello', v: m.v, name: cleanName(m.name, 'Gast'), faction: isFaction(m.faction) ? m.faction : 'angeln' };
    case 'lset':
      if (!isInt(m.color, 0, 3) || !isInt(m.slot, 0, 1) || typeof m.ready !== 'boolean' || !isFaction(m.faction)) return null;
      return { t: 'lset', name: cleanName(m.name, 'Gast'), color: m.color, slot: m.slot, ready: m.ready, faction: m.faction };
    case 'cmd': {
      if (!isInt(m.s, 1, 1e12)) return null;
      const c = validateCommand(m.c);
      return c ? { t: 'cmd', s: m.s, c } : null;
    }
    case 'ping':
    case 'pong':
      return isInt(m.n, 0, 1e15) ? { t: m.t, n: m.n } : null;
    case 'chat':
      return typeof m.text === 'string' ? { t: 'chat', text: m.text.replace(/[\u0000-\u001f]/g, '').slice(0, 200) } : null;
    case 'bye':
      return { t: 'bye' };
  }
  return null;
}

/** Leichte Plausibilitätsprüfung für Host-Nachrichten beim Gast (der Host ist maßgeblich, aber Daten bleiben extern). */
export function parseHostMsg(raw: unknown): HostMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'welcome':
      return isInt(m.v, 0, 1000) ? { t: 'welcome', v: m.v } : null;
    case 'reject':
    case 'bye':
      return { t: m.t, reason: typeof m.reason === 'string' ? m.reason.slice(0, 300) : 'Verbindung beendet.' } as HostMsg;
    case 'lobby': {
      const st = m.st as LobbyState;
      if (!st || !Array.isArray(st.players) || st.players.length > 4 || !isMapId(st.map)) return null;
      for (const p of st.players) if (!p || !isInt(p.color, 0, 3) || !isInt(p.slot, 0, 3) || !isFaction(p.faction)) return null;
      return { t: 'lobby', st: { players: st.players.map((p) => ({ ...p, name: cleanName(p.name, '?'), ready: !!p.ready })), goal: Number(st.goal) || 250, rich: !!st.rich, map: st.map } };
    }
    case 'start':
      if (!isInt(m.seed, 0, 2 ** 31) || !isInt(m.me, 0, 3) || !Array.isArray(m.players) || !isMapId(m.map)) return null;
      return { t: 'start', seed: m.seed, goal: Number(m.goal) || 250, rich: !!m.rich, me: m.me, players: m.players as LobbyPlayer[], map: m.map };
    case 'snap': {
      const s = m.s as Snapshot;
      if (!s || !Array.isArray(s.ents) || !Array.isArray(s.hid) || !Array.isArray(s.gone) || !Array.isArray(s.trees) || !Array.isArray(s.ev)) return null;
      return { t: 'snap', s };
    }
    case 'ping':
    case 'pong':
      return isInt(m.n, 0, 1e15) ? { t: m.t, n: m.n } : null;
    case 'chat':
      return typeof m.text === 'string' ? { t: 'chat', text: m.text.slice(0, 200) } : null;
  }
  return null;
}

/** Token-Bucket gegen Befehlsfluten. */
export class RateLimiter {
  private tokens: number;
  private last = 0;
  constructor(private rate: number, private burst: number) {
    this.tokens = burst;
  }
  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
