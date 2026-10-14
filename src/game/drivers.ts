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
    super(world, me, new ClientState(world.opts.seed, me, world.opts.mapId ?? 'schlei'));
    if (aiStates) this.ais = aiStates.map((s) => new AI(s.p, s.level, s));
    // geladene Bäume übernehmen (Spielstand)
    this.client.trees.set(world.map.trees);
    this.client.apply(this.snap.make(world, true), performance.now());
  }
}

export class HostDriver extends SimDriver implements Driver {
  kind = 'host' as const;
  private guestSnap: Snapshotter;
  private lastSeq = 0;
  private limiter = new RateLimiter(30, 60);
  private pingN = 0;
  private lastPong = performance.now();
  private pingSent = new Map<number, number>();
  guestGone = false;
  readonly guestId = 1;

  constructor(world: World, readonly link: PeerLink) {
    super(world, 0, new ClientState(world.opts.seed, 0, world.opts.mapId ?? 'schlei'));
    this.guestSnap = new Snapshotter(this.guestId);
    link.onMessage = (raw) => this.onMessage(raw);
    link.onClose = (reason) => this.guestLeft(reason);
  }

  start(): void {
    super.start();
    this.link.send({ t: 'snap', s: this.guestSnap.make(this.world, true) } satisfies HostMsg);
  }

  private onMessage(raw: unknown): void {
    const m = parseGuestMsg(raw);
    if (!m) return;
    const now = performance.now();
    switch (m.t) {
      case 'cmd':
        // doppelte oder veraltete Befehle verwerfen, Fluten begrenzen
        if (m.s <= this.lastSeq) return;
        this.lastSeq = m.s;
        if (!this.limiter.take(now)) return;
        this.world.queueCommand(this.guestId, m.c);
        break;
      case 'ping':
        this.link.send({ t: 'pong', n: m.n } satisfies HostMsg);
        break;
      case 'pong': {
        this.lastPong = now;
        const sent = this.pingSent.get(m.n);
        if (sent) this.latencyMs = now - sent;
        this.pingSent.delete(m.n);
        break;
      }
      case 'bye':
        this.guestLeft('Der Mitspieler hat die Partie verlassen.');
        break;
    }
  }

  private guestLeft(reason: string): void {
    if (this.guestGone) return;
    this.guestGone = true;
    this.onNotice(`${reason} Die Partie läuft weiter – die KI übernimmt seine Siedlung.`, false);
    const p = this.world.players[this.guestId];
    if (p && !p.defeated) {
      p.isAI = true;
      this.ais.push(new AI(this.guestId, 'normal'));
    }
  }

  protected afterStep(): void {
    if (this.guestGone) return;
    const w = this.world;
    this.guestSnap.collectTrees(w);
    // Rückstau: keine Deltas stapeln, stattdessen später vollständigen Zustand senden
    const congested = this.link.buffered > 512 * 1024;
    if (congested) {
      this.needFull = true;
      return;
    }
    const full = this.needFull || w.tick % 30 === 0;
    this.needFull = false;
    const s = this.guestSnap.make(w, full);
    s.ack = this.lastSeq;
    this.link.send({ t: 'snap', s } satisfies HostMsg);
    if (w.tick % 10 === 0) {
      this.pingN++;
      this.pingSent.set(this.pingN, performance.now());
      if (this.pingSent.size > 20) this.pingSent.delete(this.pingSent.keys().next().value!);
      this.link.send({ t: 'ping', n: this.pingN } satisfies HostMsg);
      if (performance.now() - this.lastPong > 15000) this.guestLeft('Der Mitspieler antwortet nicht mehr (Zeitüberschreitung).');
    }
  }
  private needFull = false;

  stop(): void {
    super.stop();
    this.link.send({ t: 'bye', reason: 'Der Host hat die Partie beendet.' } satisfies HostMsg);
    window.setTimeout(() => this.link.close(), 300);
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

  constructor(seed: number, me: number, readonly link: PeerLink, mapId: MapId = 'schlei') {
    this.client = new ClientState(seed, me, mapId);
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
      if (performance.now() - this.lastMsg > 12000) this.end('Der Host antwortet nicht mehr.');
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
