// Treiber verbinden Simulation/Netzwerk mit dem ClientState.
//  - LocalDriver: Einzelspieler, Welt + KI im eigenen Browser
//  - HostDriver: Welt läuft beim Ersteller (maßgeblich), Gast erhält gefilterte Zustände
//  - GuestDriver: keine Simulation, nur Befehle senden und Zustände anzeigen
import { AI, type AIState } from '../ai/ai';
import { RULES } from '../data/defs';
import { PROTOCOL_VERSION, RateLimiter, parseGuestMsg, parseHostMsg, type HostMsg } from '../net/protocol';
import type { PeerLink } from '../net/peer';
import type { MapId } from '../sim/map';
import { Snapshotter } from '../sim/snapshot';
import type { Command } from '../sim/types';
import { World } from '../sim/world';
import { ClientState } from './client';

export interface Driver {
  kind: 'local' | 'host' | 'guest';
  client: ClientState;
  send(cmd: Command): void;
  start(): void;
  stop(): void;
  paused: boolean;
  /** Text bei Verbindungsproblemen (für die Oberfläche) */
  onNotice: (text: string, fatal: boolean) => void;
  onAfterTick: () => void;
  latencyMs: number;
}

/** Taktgeber in einem Worker, damit Hintergrund-Tabs nicht gedrosselt werden. */
class Ticker {
  private worker: Worker | null = null;
  private interval = 0;
  constructor(private cb: () => void, ms: number) {
    try {
      const src = `let t=setInterval(()=>postMessage(0),${ms});onmessage=()=>clearInterval(t);`;
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = () => this.cb();
    } catch {
      this.interval = window.setInterval(() => this.cb(), ms);
    }
  }
  stop(): void {
    this.worker?.postMessage(0);
    this.worker?.terminate();
    window.clearInterval(this.interval);
  }
}

const TICK_MS = 1000 / RULES.tickRate;

abstract class SimDriver {
  world: World;
  ais: AI[] = [];
  protected snap: Snapshotter;
  protected ticker: Ticker | null = null;
  private acc = 0;
  private lastT = 0;
  paused = false;
  onNotice: (text: string, fatal: boolean) => void = () => {};
  onAfterTick: () => void = () => {};
  latencyMs = 0;

  constructor(world: World, readonly me: number, readonly client: ClientState) {
    this.world = world;
    this.snap = new Snapshotter(me);
    client.externalVis = world.vis[me];
    for (const p of world.players) if (p.isAI) this.ais.push(new AI(p.id, p.aiLevel));
    client.apply(this.snap.make(world, true), performance.now());
  }

  start(): void {
    this.lastT = performance.now();
    this.ticker = new Ticker(() => this.pump(), 25);
  }
  stop(): void {
    this.ticker?.stop();
    this.ticker = null;
  }

  private pump(): void {
    const now = performance.now();
    let dt = now - this.lastT;
    this.lastT = now;
    if (this.paused) return;
    if (dt > 1000) dt = 1000;
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK_MS && n < 5) {
      this.acc -= TICK_MS;
      this.tick();
      n++;
    }
    if (this.acc > TICK_MS * 5) this.acc = 0;
  }

  protected tick(): void {
    const w = this.world;
    for (const ai of this.ais) ai.update(w);
    w.step();
    this.snap.collectTrees(w);
    this.client.apply(this.snap.make(w, w.tick % 100 === 0), performance.now());
    this.afterStep();
    this.onAfterTick();
  }

  protected afterStep(): void {}

  send(cmd: Command): void {
    this.world.queueCommand(this.me, cmd);
  }
}

export class LocalDriver extends SimDriver implements Driver {
  kind = 'local' as const;
  constructor(world: World, me: number, aiStates?: AIState[]) {
    super(world, me, new ClientState(world.opts.seed, me, world.opts.mapId ?? 'schlei', world.players.length));
    if (aiStates) this.ais = aiStates.map((s) => new AI(s.p, s.level, s));
    // geladene Bäume übernehmen (Spielstand)
    this.client.trees.set(world.map.trees);
    this.client.apply(this.snap.make(world, true), performance.now());
  }
}

/** Verbindung des Hosts zu einem Mitspieler (eigener gefilterter Zustand, Sequenzprüfung, Ping). */
interface GuestConn {
  id: number; // Spielernummer
  link: PeerLink;
  snap: Snapshotter;
  lastSeq: number;
  limiter: RateLimiter;
  pingN: number;
  lastPong: number;
  pingSent: Map<number, number>;
  gone: boolean;
  needFull: boolean;
  latency: number;
  /** schon eine Antwort erhalten? Davor (Laden der Karte und Grafik beim Gast) gilt eine längere Frist. */
  answered: boolean;
}

export class HostDriver extends SimDriver implements Driver {
  kind = 'host' as const;
  private guests: GuestConn[] = [];
  /** für Tests und Oberfläche: true, sobald alle Mitspieler gegangen sind */
  get guestGone(): boolean {
    return this.guests.every((g) => g.gone);
  }

  /** @param links Spielernummer → Verbindung des jeweiligen Mitspielers */
  constructor(world: World, links: Map<number, PeerLink> | PeerLink) {
    super(world, 0, new ClientState(world.opts.seed, 0, world.opts.mapId ?? 'schlei', world.players.length));
    const map = links instanceof Map ? links : new Map([[1, links]]);
    for (const [id, link] of map) {
      const g: GuestConn = {
        id, link, snap: new Snapshotter(id), lastSeq: 0, limiter: new RateLimiter(30, 60), pingN: 0,
        lastPong: performance.now(), pingSent: new Map(), gone: false, needFull: false, latency: 0, answered: false,
      };
      link.onMessage = (raw) => this.onMessage(g, raw);
      link.onClose = (reason) => this.guestLeft(g, reason);
      this.guests.push(g);
    }
  }

  /** Erste Verbindung (für Tests mit einem Mitspieler) */
  get link(): PeerLink {
    return this.guests[0].link;
  }

  start(): void {
    super.start();
    for (const g of this.guests) g.lastPong = performance.now();
    for (const g of this.guests) g.link.send({ t: 'snap', s: g.snap.make(this.world, true) } satisfies HostMsg);
  }

  private onMessage(g: GuestConn, raw: unknown): void {
    const m = parseGuestMsg(raw);
    if (!m || g.gone) return;
    const now = performance.now();
    switch (m.t) {
      case 'cmd':
        // doppelte oder veraltete Befehle verwerfen, Fluten begrenzen
        if (m.s <= g.lastSeq) return;
        g.lastSeq = m.s;
        if (!g.limiter.take(now)) return;
        this.world.queueCommand(g.id, m.c);
        break;
      case 'ping':
        g.link.send({ t: 'pong', n: m.n } satisfies HostMsg);
        break;
      case 'pong': {
        g.lastPong = now;
        g.answered = true;
        const sent = g.pingSent.get(m.n);
        if (sent) g.latency = now - sent;
        g.pingSent.delete(m.n);
        this.latencyMs = Math.max(...this.guests.filter((x) => !x.gone).map((x) => x.latency), 0);
        break;
      }
      case 'bye':
        this.guestLeft(g, 'hat die Partie verlassen.');
        break;
    }
  }

  private guestLeft(g: GuestConn, reason: string): void {
    if (g.gone) return;
    g.gone = true;
    const p = this.world.players[g.id];
    const who = p?.name ?? 'Ein Mitspieler';
    this.onNotice(`${who}: ${reason} Die Partie läuft weiter – die KI übernimmt die Siedlung.`, false);
    if (p && !p.defeated) {
      p.isAI = true;
      this.ais.push(new AI(g.id, 'normal'));
    }
  }

  protected afterStep(): void {
    const w = this.world;
    for (const g of this.guests) {
      if (g.gone) continue;
      g.snap.collectTrees(w);
      // Rückstau: keine Deltas stapeln, stattdessen später vollständigen Zustand senden
      if (g.link.buffered > 512 * 1024) {
        g.needFull = true;
        continue;
      }
      const full = g.needFull || w.tick % 30 === 0;
      g.needFull = false;
      const s = g.snap.make(w, full);
      s.ack = g.lastSeq;
      g.link.send({ t: 'snap', s } satisfies HostMsg);
      if (w.tick % 10 === 0) {
        g.pingN++;
        g.pingSent.set(g.pingN, performance.now());
        if (g.pingSent.size > 20) g.pingSent.delete(g.pingSent.keys().next().value!);
        g.link.send({ t: 'ping', n: g.pingN } satisfies HostMsg);
        if (performance.now() - g.lastPong > (g.answered ? 30000 : 60000)) this.guestLeft(g, 'antwortet nicht mehr (Zeitüberschreitung).');
      }
    }
  }

  stop(): void {
    super.stop();
    for (const g of this.guests) {
      g.link.send({ t: 'bye', reason: 'Der Host hat die Partie beendet.' } satisfies HostMsg);
      const l = g.link;
      window.setTimeout(() => l.close(), 300);
    }
  }
}

export class GuestDriver implements Driver {
  kind = 'guest' as const;
  client: ClientState;
  paused = false;
  onNotice: (text: string, fatal: boolean) => void = () => {};
  onAfterTick: () => void = () => {};
  latencyMs = 0;
  private seq = 0;
  private timer = 0;
  private lastMsg = performance.now();
  private pingN = 0;
  private pingSent = new Map<number, number>();
  private ended = false;

  constructor(seed: number, me: number, readonly link: PeerLink, mapId: MapId = 'schlei', players = 2) {
    this.client = new ClientState(seed, me, mapId, players);
    link.onMessage = (raw) => this.onMessage(raw);
    link.onClose = (reason) => this.end(`Verbindung zum Host verloren: ${reason}`);
  }

  private onMessage(raw: unknown): void {
    const m = parseHostMsg(raw);
    if (!m) return;
    this.lastMsg = performance.now();
    switch (m.t) {
      case 'snap':
        try {
          this.client.apply(m.s, performance.now());
        } catch {
          return;
        }
        this.onAfterTick();
        break;
      case 'ping':
        this.link.send({ t: 'pong', n: m.n });
        break;
      case 'pong': {
        const s = this.pingSent.get(m.n);
        if (s) this.latencyMs = performance.now() - s;
        this.pingSent.delete(m.n);
        break;
      }
      case 'bye':
        this.end(m.reason);
        break;
    }
  }

  private end(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.onNotice(`${reason} Die Sitzung ist beendet (keine automatische Hostmigration).`, true);
  }

  start(): void {
    this.timer = window.setInterval(() => {
      if (this.ended) return;
      this.pingN++;
      this.pingSent.set(this.pingN, performance.now());
      if (this.pingSent.size > 20) this.pingSent.delete(this.pingSent.keys().next().value!);
      this.link.send({ t: 'ping', n: this.pingN });
      if (performance.now() - this.lastMsg > 30000) this.end('Der Host antwortet nicht mehr.');
    }, 1000);
  }
  stop(): void {
    window.clearInterval(this.timer);
    this.link.send({ t: 'bye' });
    window.setTimeout(() => this.link.close(), 300);
  }
  send(cmd: Command): void {
    this.seq++;
    this.link.send({ t: 'cmd', s: this.seq, c: cmd });
  }
}

export { PROTOCOL_VERSION };
