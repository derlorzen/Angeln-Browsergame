// Client-seitiges Abbild der Partie aus Sicht eines Spielers. Wird ausschließlich aus Snapshots gespeist –
// lokal (vom eigenen World-Objekt) wie im Netzwerk (vom Host). Die Darstellung liest nur hiervon.
import { BUILDINGS, LEVEL_ROMAN, MAX_LEVEL, UPGRADES, levelDef, type BuildingType, type UnitDef, type UnitType } from '../data/defs';
import { AGES, MAX_AGE, TECHS, techUnit, type TechId } from '../data/ages';
import { FACTION_DEFS, fbdef, fudef, type ArchStyle, type FactionId } from '../data/factions';
import { generateMap, type GameMap, type MapId } from '../sim/map';
import { computeVisibility, type PlacementView, type VisionSource } from '../sim/rules';
import type { BSnap, PlayerSnap, Snapshot, USnap } from '../sim/snapshot';
import type { SimEvent } from '../sim/types';

export interface CUnit extends USnap {
  px: number;
  py: number;
  hitFlash: number;
}
export interface CBuilding extends BSnap {
  ghost?: boolean;
}

export class ClientState {
  map: GameMap;
  trees: Uint8Array;
  units = new Map<number, CUnit>();
  buildings = new Map<number, CBuilding>();
  players: PlayerSnap[] = [];
  vis: Uint8Array;
  occ: Int32Array; // Gebäude-ID je Kachel (bekannte Gebäude inkl. Erinnerung)
  fieldOcc: Uint8Array;
  tick = 0;
  snapTime = 0;
  brarup = { c: -1, x: false };
  moor = -1;
  winner = -1;
  winReason = '';
  goal = 0;
  events: SimEvent[] = [];
  visVersion = 0;
  occVersion = 0;
  ack = 0;
  private occDirty = true;
  /** Wenn gesetzt (lokaler Host), wird die Sichtbarkeit direkt übernommen statt neu berechnet. */
  externalVis: Uint8Array | null = null;

  constructor(seed: number, public me: number, mapId: MapId = 'schlei') {
    this.map = generateMap(seed, mapId);
    this.trees = this.map.trees; // eigene Kopie, da generateMap bei jedem Aufruf neu erzeugt
    const N = this.map.w * this.map.h;
    this.vis = new Uint8Array(N);
    this.occ = new Int32Array(N);
    this.fieldOcc = new Uint8Array(N);
  }

  faction(owner: number): FactionId {
    return this.players[owner]?.faction ?? 'angeln';
  }
  arch(owner: number): ArchStyle {
    return owner < 0 ? 'angeln' : FACTION_DEFS[this.faction(owner)].arch;
  }
  ud(owner: number, t: UnitType): UnitDef {
    const base = fudef(owner < 0 ? null : this.faction(owner), t);
    const techs = this.players[owner]?.techs;
    return techs?.length ? techUnit(base, techs, t) : base;
  }
  /** Zeitalter eines Spielers (1 = 17. Jh.) */
  age(owner: number): number {
    return this.players[owner]?.age ?? 1;
  }
  hasTech(id: TechId): boolean {
    return !!this.mePlayer?.techs?.includes(id);
  }
  /** Spiegel der Prüfung für den Zeitalter-Aufstieg */
  ageBlock(b: CBuilding): string | null {
    if (b.t !== 'dorfzentrum' || b.o !== this.me) return 'Nur im eigenen Dorfzentrum.';
    if (!b.b) return 'Das Dorfzentrum ist noch nicht fertig.';
    const age = this.age(this.me);
    if (age >= MAX_AGE) return 'Letztes Zeitalter erreicht.';
    if (b.u !== undefined) return 'Im Dorfzentrum läuft bereits ein Vorhaben.';
    const next = AGES[age + 1];
    const have = next.requires.filter((t) => this.bestLevel(t) > 0);
    return have.length < next.need ? `Benötigt ${next.need} dieser Gebäude (fertig): ${next.requires.map((t) => this.bd(this.me, t).name).join(', ')}.` : null;
  }
  techBlock(b: CBuilding, id: TechId): string | null {
    const t = TECHS[id];
    if (!b.b) return 'Das Gebäude ist noch nicht fertig.';
    if (this.hasTech(id)) return 'Bereits erforscht.';
    if (this.age(this.me) < t.age) return `Erst im ${AGES[t.age].name}.`;
    if (b.u !== undefined) return 'In diesem Gebäude läuft bereits ein Vorhaben.';
    for (const o of this.buildings.values()) if (o.o === this.me && o.uk === id) return 'Wird bereits erforscht.';
    return null;
  }
  bd(owner: number, t: BuildingType) {
    if (t === 'brarupmarkt') return (this.marketDef ??= { ...fbdef(null, t), name: this.map.marketName });
    return fbdef(owner < 0 ? null : this.faction(owner), t);
  }
  private marketDef: ReturnType<typeof fbdef> | undefined;

  /** Himmelsrichtung von der eigenen Siedlung zu einem Ort (Norden ist auf allen Karten oben). */
  dirTo(x: number, y: number): string {
    const dz = [...this.buildings.values()].find((b) => b.o === this.me && b.t === 'dorfzentrum');
    const hx = dz ? dz.x + 1.5 : this.map.w / 2, hy = dz ? dz.y + 1.5 : this.map.h / 2;
    const dx = x - hx, dy = y - hy;
    const sx = dx - dy, sy = (dx + dy) / 2; // Bildschirmrichtung
    if (Math.hypot(sx, sy) < 6) return 'ganz in der Nähe';
    const a = Math.round((Math.atan2(sx, -sy) / (Math.PI / 4)) + 8) % 8;
    return ['im Norden', 'im Nordosten', 'im Osten', 'im Südosten', 'im Süden', 'im Südwesten', 'im Westen', 'im Nordwesten'][a];
  }

  get mePlayer(): PlayerSnap | undefined {
    return this.players[this.me];
  }

  apply(s: Snapshot, now: number): void {
    this.tick = s.tick;
    this.snapTime = now;
    if (s.ack !== undefined) this.ack = s.ack;
    const inFull = new Set<number>();
    // vorherige Positionen für Interpolation sichern
    for (const u of this.units.values()) {
      u.px = u.x;
      u.py = u.y;
    }
    for (const e of s.ents) {
      inFull.add(e.i);
      if (e.k === 0) {
        const old = this.units.get(e.i);
        if (old) {
          const px = old.x, py = old.y;
          const hit = e.h < old.h ? 1 : old.hitFlash;
          Object.assign(old, e);
          if (e.c === undefined) delete old.c;
          if (e.w === undefined) delete old.w;
          old.px = px;
          old.py = py;
          old.hitFlash = hit;
        } else this.units.set(e.i, { ...e, px: e.x, py: e.y, hitFlash: 0 });
      } else {
        const old = this.buildings.get(e.i);
        if (!old || old.x !== e.x || old.y !== e.y || old.ghost || (old.f?.length ?? 0) !== (e.f?.length ?? 0)) this.occDirty = true;
        this.buildings.set(e.i, { ...e });
      }
    }
    const hide = (id: number) => {
      if (this.units.delete(id)) return;
      const b = this.buildings.get(id);
      if (b && b.o !== this.me && b.o >= 0) b.ghost = true;
      else if (b) {
        this.buildings.delete(id);
        this.occDirty = true;
      }
    };
    for (const id of s.hid) hide(id);
    for (const id of s.gone) {
      this.units.delete(id);
      if (this.buildings.delete(id)) this.occDirty = true;
    }
    if (s.full) {
      for (const id of [...this.units.keys()]) if (!inFull.has(id)) hide(id);
      for (const [id, b] of this.buildings) if (!inFull.has(id) && !b.ghost) hide(id);
    }
    for (let k = 0; k < s.trees.length; k += 2) {
      const i = s.trees[k];
      if (i >= 0 && i < this.trees.length) this.trees[i] = s.trees[k + 1];
    }
    this.players = s.players;
    this.brarup = s.brarup;
    this.moor = s.moor;
    this.winner = s.winner;
    this.winReason = s.winReason;
    this.goal = s.goal;
    for (const ev of s.ev) this.events.push(ev);
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
    this.updateVisibility();
    // Erinnerte Gebäude entfernen, wenn ihr Platz wieder sichtbar ist und sie nicht mehr gemeldet werden
    for (const [id, b] of this.buildings) {
      if (!b.ghost) continue;
      const def = BUILDINGS[b.t];
      const c = (b.y + Math.floor(def.h / 2)) * this.map.w + b.x + Math.floor(def.w / 2);
      if (this.vis[c] === 2) {
        this.buildings.delete(id);
        this.occDirty = true;
      }
    }
    if (this.occDirty) this.rebuildOcc();
  }

  private updateVisibility(): void {
    if (this.externalVis) {
      this.vis.set(this.externalVis);
    } else {
      const src: VisionSource[] = [];
      for (const u of this.units.values()) if (u.o === this.me) src.push({ x: u.x, y: u.y, r: this.ud(u.o, u.t).vision });
      for (const b of this.buildings.values())
        if (b.o === this.me) {
          const d = BUILDINGS[b.t];
          src.push({ x: b.x + d.w / 2, y: b.y + d.h / 2, r: b.b ? d.vision : 3 });
        }
      if (this.mePlayer?.defeated) this.vis.fill(2);
      else computeVisibility(this.map, src, this.vis);
    }
    this.visVersion++;
  }

  private rebuildOcc(): void {
    this.occ.fill(0);
    this.fieldOcc.fill(0);
    for (const b of this.buildings.values()) {
      const d = BUILDINGS[b.t];
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) this.occ[(b.y + dy) * this.map.w + b.x + dx] = b.i;
      for (const f of b.f ?? []) if (f >= 0 && f < this.fieldOcc.length) this.fieldOcc[f] = 1;
    }
    this.occDirty = false;
    this.occVersion++;
  }

  placementView(): PlacementView {
    const own = [...this.buildings.values()]
      .filter((b) => b.o === this.me)
      .map((b) => ({ x: b.x, y: b.y, w: BUILDINGS[b.t].w, h: BUILDINGS[b.t].h, type: b.t, built: !!b.b }));
    return {
      map: this.map,
      trees: this.trees,
      occupied: (i) => this.occ[i] !== 0 || this.fieldOcc[i] !== 0,
      explored: (i) => this.vis[i] > 0,
      ownBuildings: own,
    };
  }

  /** Werte eines sichtbaren Gebäudes inkl. Ausbaustufe. */
  bdl(b: CBuilding) {
    return levelDef(this.bd(b.o, b.t), b.t, b.l ?? 1);
  }
  /** Anzeigename inkl. Stufe, z. B. „Kirchspielort (Stufe II)“. */
  bname(b: CBuilding): string {
    const l = b.l ?? 1;
    return l > 1 ? `${UPGRADES[b.t]?.[l - 2]?.name ?? this.bd(b.o, b.t).name} (Stufe ${LEVEL_ROMAN[l]})` : this.bd(b.o, b.t).name;
  }
  bestLevel(t: BuildingType): number {
    let l = 0;
    for (const b of this.buildings.values()) if (b.o === this.me && b.t === t && b.b) l = Math.max(l, b.l ?? 1);
    return l;
  }
  /** Spiegel der Ausbauprüfung der Simulation (für Knopfzustand und Tooltip). */
  upgradeBlock(b: CBuilding): string | null {
    if (!UPGRADES[b.t] || b.o !== this.me) return 'Nicht ausbaubar.';
    if (!b.b) return 'Das Gebäude ist noch nicht fertig.';
    const l = b.l ?? 1;
    if (l >= MAX_LEVEL) return 'Höchste Stufe erreicht.';
    if (b.u !== undefined) return 'Wird bereits ausgebaut.';
    if (b.t === 'dorfzentrum') return l + 1 === 3 && !this.bestLevel('markt') ? 'Stufe III benötigt einen fertigen Markt.' : null;
    return this.bestLevel('dorfzentrum') < l + 1 ? `Benötigt zuerst ein Dorfzentrum der Stufe ${LEVEL_ROMAN[l + 1]}.` : null;
  }

  hasBuilt(t: BuildingType): boolean {
    for (const b of this.buildings.values()) if (b.o === this.me && b.t === t && b.b) return true;
    return false;
  }
}
