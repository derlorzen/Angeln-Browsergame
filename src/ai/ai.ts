// Einfache, regelbasierte KI. Sie liest den Weltzustand und gibt ausschließlich normale Spielerbefehle
// über world.queueCommand() ab – dieselben Regeln, Kosten und Prüfungen wie für Menschen.
// Vereinfachung: Die KI kennt die Startplätze der Gegner (die Karte ist allen bekannt).
import { BUILDINGS, RULES, UNITS, type BuildingType, type UnitType } from '../data/defs';
import { FACTION_DEFS } from '../data/factions';
import { T } from '../sim/map';
import { checkPlacement } from '../sim/rules';
import type { Building, Command, Unit } from '../sim/types';
import { rectDist, type World } from '../sim/world';

export interface AIState {
  p: number;
  level: 'leicht' | 'normal';
  wave: number;
  guards: number[];
  scoutStep: number;
  lastAttackTick: number;
  attackers: number[];
}

const PLAN: [BuildingType, number][] = [
  ['holzfaeller', 1],
  ['bauernhof', 1],
  ['lehmgrube', 1],
  ['heringszaun', 1],
  ['bauernhof', 2],
  ['muehle', 1],
  ['kaserne', 1],
  ['raeucherei', 1],
  ['markt', 1],
  ['heringszaun', 2],
  ['bauernhof', 3],
  ['muehle', 2],
  ['raeucherei', 2],
  ['holzfaeller', 2],
  ['bauernhof', 4],
  ['heringszaun', 3],
  ['muehle', 3],
];

export class AI {
  s: AIState;
  private reserved = new Map<number, { k: string; t: number }>();
  private noSpot = new Map<BuildingType, number>();
  constructor(p: number, level: 'leicht' | 'normal', state?: AIState) {
    this.s = state ?? { p, level, wave: 0, guards: [], scoutStep: 0, lastAttackTick: 0, attackers: [] };
  }

  private cmd(w: World, c: Command): void {
    w.queueCommand(this.s.p, c);
  }

  update(w: World): void {
    const period = this.s.level === 'leicht' ? 20 : 10;
    if ((w.tick + this.s.p * 3) % period !== 0) return;
    const p = this.s.p;
    this.reserved.clear();
    const me = w.players[p];
    if (!me || me.defeated || w.winner >= 0) return;
    const easy = this.s.level === 'leicht';
    const fd = FACTION_DEFS[me.faction];
    const plan: [BuildingType, number][] = [...(fd.aiFirst ?? []).map((t): [BuildingType, number] => [t, 1]), ...PLAN];
    fd.aiPlan.forEach((t, k) => plan.splice(9 + k * 2, 0, [t, PLAN.filter(([x]) => x === t).length + 1 + (t === 'kaserne' ? 0 : k % 2)]));

    const units: Unit[] = [];
    const blds: Building[] = [];
    for (const e of w.ents.values()) {
      if (e.owner !== p) continue;
      if (e.kind === 'u') units.push(e);
      else blds.push(e);
    }
    const dz = blds.find((b) => b.type === 'dorfzentrum');
    if (!dz) return;
    const count = (t: BuildingType) => blds.filter((b) => b.type === t).length;
    const workers = units.filter((u) => u.type === 'arbeiter');
    const military = units.filter((u) => UNITS[u.type].military && u.type !== 'spaeher');
    const aggr = easy ? 1 : fd.aiAggression;
    const unbuilt = blds.filter((b) => !b.built);
    const queued = blds.reduce((n, b) => n + b.queue.length, 0);

    // Markt automatisch verkaufen lassen
    for (const b of blds) if (b.type === 'markt' && b.built && !b.autoSell) this.cmd(w, { c: 'auto', b: b.id, on: true });
    const markt = blds.find((b) => b.type === 'markt' && b.built);
    if (markt && me.res.taler > 160) {
      if (me.res.holz < 120) this.cmd(w, { c: 'buy', b: markt.id, r: 'holz' });
      else if (me.res.lehm < 80) this.cmd(w, { c: 'buy', b: markt.id, r: 'lehm' });
    }

    // Arbeiter ausbilden
    const wantWorkers = easy ? 11 : 17;
    if (workers.length + dz.queue.length < wantWorkers && dz.queue.length < 2 && w.canAfford(p, w.ud(p, 'arbeiter').cost))
      this.cmd(w, { c: 'train', b: dz.id, u: 'arbeiter' });

    // Wohnraum
    const houseBuilding = unbuilt.some((b) => b.type === 'wohnhaus');
    if (me.popCap - me.pop - queued <= 2 && me.popCap < RULES.maxPop && !houseBuilding)
      this.tryBuild(w, 'wohnhaus', dz, workers);
    else if (unbuilt.filter((b) => b.type !== 'wohnhaus').length === 0) {
      // Bauplan abarbeiten
      for (const [t, n] of plan) {
        if (count(t) >= n) continue;
        if (easy && n > 2) break;
        if ((this.noSpot.get(t) ?? -1) > w.tick) continue; // kürzlich kein Bauplatz gefunden
        if (!w.canAfford(p, w.bd(p, t).cost)) break; // sparen
        if (this.tryBuild(w, t, dz, workers)) break;
        this.noSpot.set(t, w.tick + 600);
      }
    }

    // Arbeiter verteilen (Vormerkungen nur innerhalb dieses Denkschritts, der Weltzustand bleibt unberührt)
    const busy = (x: Unit, k: 'build' | 'staff', id: number) => {
      const r = this.reserved.get(x.id);
      if (r) return r.k === k && r.t === id;
      return x.order.k === k && x.order.t === id;
    };
    for (const u of workers) {
      if (u.order.k !== 'none' || this.reserved.has(u.id)) continue;
      const site = unbuilt.find((b) => workers.filter((x) => busy(x, 'build', b.id)).length < 2);
      if (site) {
        this.cmd(w, { c: 'build', ids: [u.id], t: site.id });
        this.reserved.set(u.id, { k: 'build', t: site.id });
        continue;
      }
      const job = blds.find((b) => {
        if (!b.built) return false;
        const slots = BUILDINGS[b.type].staffSlots ?? 0;
        const want = b.type === 'lehmgrube' ? (me.res.lehm > 300 ? 1 : 2) : slots;
        return slots > 0 && workers.filter((x) => busy(x, 'staff', b.id)).length < want;
      });
      if (job) {
        this.cmd(w, { c: 'staff', ids: [u.id], t: job.id });
        this.reserved.set(u.id, { k: 'staff', t: job.id });
        continue;
      }
      const drop = blds.find((b) => b.type === 'holzfaeller' && b.built) ?? dz;
      const tree = nearestTree(w, drop.x + 1, drop.y + 1, 18);
      if (tree >= 0) {
        this.cmd(w, { c: 'gather', ids: [u.id], x: (tree % w.map.w) + 0.5, y: Math.floor(tree / w.map.w) + 0.5 });
        this.reserved.set(u.id, { k: 'gather', t: tree });
      }
    }

    // Militär ausbilden
    const kaserne = blds.find((b) => b.type === 'kaserne' && b.built);
    const maxArmy = easy ? 12 : 30;
    if (kaserne && kaserne.queue.length < 2 && workers.length >= (easy ? 8 : 12) && military.length < maxArmy) {
      const mix = fd.aiArmy;
      const ut: UnitType = mix[(military.length + this.s.wave) % mix.length];
      if (w.canAfford(p, w.ud(p, ut).cost)) this.cmd(w, { c: 'train', b: kaserne.id, u: ut });
    }

    // Späher: erst das Moor erkunden, dann den Markt beobachten
    const scout = units.find((u) => u.type === 'spaeher');
    if (scout && scout.order.k === 'none') {
      if (this.s.scoutStep === 0 && w.moorFoundBy < 0) {
        this.cmd(w, { c: 'move', ids: [scout.id], x: w.map.moor.x + 0.5, y: w.map.moor.y + 0.5 });
        this.s.scoutStep = 1;
      } else if (this.s.scoutStep <= 1) {
        const m = w.map.market;
        this.cmd(w, { c: 'move', ids: [scout.id], x: m.x - 2, y: m.y + 1.5 });
        this.s.scoutStep = 2;
      }
    }

    // Wachen für den Brarup-Markt
    const alive = new Set(units.map((u) => u.id));
    this.s.guards = this.s.guards.filter((id) => alive.has(id));
    this.s.attackers = this.s.attackers.filter((id) => alive.has(id));
    const wantGuards = easy ? 2 : 3;
    const free = military.filter((u) => !this.s.guards.includes(u.id) && !this.s.attackers.includes(u.id));
    while (this.s.guards.length < wantGuards && free.length > 2) {
      const g = free.shift()!;
      this.s.guards.push(g.id);
    }
    const m = w.map.market;
    for (const id of this.s.guards) {
      const g = w.unit(id)!;
      if (g.order.k === 'none' && Math.hypot(g.x - (m.x + 1.5), g.y - (m.y + 1.5)) > 4)
        this.cmd(w, { c: 'move', ids: [id], x: m.x + 1.5 + ((id % 3) - 1) * 2, y: m.y + 4.5, am: true });
    }

    // Verteidigung: Feinde nahe eigener Gebäude
    let threat: { x: number; y: number } | null = null;
    for (const e of w.ents.values()) {
      if (e.kind !== 'u' || !w.isEnemy(p, e.owner)) continue;
      if (blds.some((b) => rectDist(e.x, e.y, b) < 9)) {
        threat = { x: e.x, y: e.y };
        break;
      }
    }
    if (threat) {
      const def = free.filter((u) => u.order.k === 'none' || (u.order.k === 'move' && !u.order.am));
      if (def.length) this.cmd(w, { c: 'move', ids: def.map((u) => u.id), x: threat.x, y: threat.y, am: true });
    }

    // Angriff
    const firstAttack = ((easy ? 12 : 7) / aggr) * 60 * RULES.tickRate;
    const waveSize = Math.round(((easy ? 9 : 7) + this.s.wave * 2) / aggr);
    const available = free.filter((u) => u.order.k === 'none');
    if (!threat && w.tick > firstAttack && available.length >= waveSize && w.tick - this.s.lastAttackTick > 900) {
      const enemy = w.players.find((q) => q.id !== p && !q.defeated);
      if (enemy) {
        let target: { x: number; y: number } | null = null;
        for (const e of w.ents.values())
          if (e.kind === 'b' && e.owner === enemy.id && e.type === 'dorfzentrum') target = { x: e.x + 1.5, y: e.y + 1.5 };
        if (!target) {
          const sl = w.map.slots[enemy.slot];
          target = { x: sl.x + 1.5, y: sl.y + 1.5 };
        }
        this.cmd(w, { c: 'move', ids: available.map((u) => u.id), x: target.x, y: target.y, am: true });
        this.s.attackers.push(...available.map((u) => u.id));
        this.s.wave++;
        this.s.lastAttackTick = w.tick;
      }
    }
    // Angreifer, die untätig herumstehen, ziehen weiter zum Dorfzentrum
    if (this.s.attackers.length && w.tick % 50 === 0) {
      const idle = this.s.attackers.map((id) => w.unit(id)!).filter((u) => u.order.k === 'none');
      const enemyDZ = [...w.ents.values()].find((e) => e.kind === 'b' && e.type === 'dorfzentrum' && w.isEnemy(p, e.owner)) as Building | undefined;
      if (idle.length && enemyDZ) this.cmd(w, { c: 'attack', ids: idle.map((u) => u.id), t: enemyDZ.id });
    }
  }

  private tryBuild(w: World, t: BuildingType, dz: Building, workers: Unit[]): boolean {
    const spot = findSpot(w, this.s.p, t, dz);
    if (!spot) return false;
    const builders = workers
      .filter((u) => !this.reserved.has(u.id) && (u.order.k === 'none' || u.order.k === 'gather'))
      .sort((a, b) => Math.hypot(a.x - spot.x, a.y - spot.y) - Math.hypot(b.x - spot.x, b.y - spot.y))
      .slice(0, t === 'wohnhaus' ? 1 : 2);
    this.cmd(w, { c: 'place', ids: builders.map((u) => u.id), b: t, x: spot.x, y: spot.y });
    for (const u of builders) this.reserved.set(u.id, { k: 'build', t: -1 });
    return true;
  }
}

function nearestTree(w: World, x: number, y: number, r: number): number {
  let best = -1, bd = Infinity;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const px = Math.floor(x) + dx, py = Math.floor(y) + dy;
      if (!w.inMap(px, py)) continue;
      const i = w.idx(px, py);
      if (!w.map.trees[i] || w.isBadTree(i)) continue;
      let free = false;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (w.inMap(px + ax, py + ay) && w.grid.pass[w.idx(px + ax, py + ay)]) free = true;
      if (!free) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  return best;
}

/** Sucht einen gültigen Bauplatz in Spiralen um einen sinnvollen Ankerpunkt. */
export function findSpot(w: World, p: number, t: BuildingType, dz: Building): { x: number; y: number } | null {
  const def = BUILDINGS[t];
  const view = w.placementView(p);
  let ax = dz.x + 1, ay = dz.y + 1;
  const W = w.map.w;
  const nearestTile = (pred: (i: number) => boolean, r: number) => {
    let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = ax + dx, y = ay + dy;
        if (!w.inMap(x, y)) continue;
        const i = w.idx(x, y);
        if (pred(i) && dx * dx + dy * dy < bd) {
          bd = dx * dx + dy * dy;
          best = i;
        }
      }
    return best;
  };
  if (t === 'holzfaeller') {
    const tr = nearestTile((i) => w.map.trees[i] > 0, 12);
    if (tr >= 0) {
      ax = tr % W;
      ay = Math.floor(tr / W);
    }
  } else if (t === 'heringszaun') {
    const sh = nearestTile((i) => w.map.terrain[i] === T.UFER && !w.bocc[i], 12);
    if (sh >= 0) {
      ax = sh % W;
      ay = Math.floor(sh / W);
    }
  } else if (t === 'lehmgrube') {
    const cl = nearestTile((i) => w.map.terrain[i] === T.LEHM && !w.bocc[i], 12);
    if (cl >= 0) {
      ax = cl % W;
      ay = Math.floor(cl / W);
    }
  }
  const margin = t === 'bauernhof' ? 2 : 1;
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ax + dx - Math.floor(def.w / 2), y = ay + dy - Math.floor(def.h / 2);
        if (checkPlacement(view, t, x, y)) continue;
        // etwas Abstand zu anderen Gebäuden lassen, damit Wege frei bleiben
        let ok = true;
        for (let yy = y - margin; yy < y + def.h + margin && ok; yy++)
          for (let xx = x - margin; xx < x + def.w + margin && ok; xx++) {
            if (!w.inMap(xx, yy)) continue;
            const i = w.idx(xx, yy);
            if (w.bocc[i] || (margin > 1 && w.field[i])) ok = false;
          }
        if (ok) return { x, y };
      }
  }
  return null;
}
