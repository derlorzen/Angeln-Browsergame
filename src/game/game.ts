// Spielbildschirm: verbindet Treiber, Darstellung, HUD und Eingabe. Darstellung via requestAnimationFrame,
// Simulation im Treiber mit festen Takten.
import { sound } from '../audio/sound';
import { BUILDINGS, LEVEL_ROMAN, RULES, UNITS, UPGRADES, type BuildingType } from '../data/defs';
import { FACTION_DEFS } from '../data/factions';
import { createRenderer, freshCanvas, type RendererPref } from '../render/factory';
import { CanvasRenderer, Minimap, playerColor, type Placement } from '../render/renderer';
import { getArtStyle, setArtStyle, type ArtStyle } from '../render/artstyles';
import { loadSettings, saveSettings } from '../storage/save';
import type { BaseRenderer } from '../render/view';
import { checkPlacement } from '../sim/rules';
import type { Command, SimEvent } from '../sim/types';
import { Hud } from '../ui/hud';
import { Tutorial } from '../ui/tutorial';
import type { ClientState } from './client';
import type { Driver } from './drivers';
import { terrainHint } from '../ui/terrainhint';
import { AGES, TECHS } from '../data/ages';
import { TouchInput, type TouchMode } from './touch';

export interface GameOptions {
  tutorial: boolean;
  onExit: () => void;
  onSave?: () => string | null;
  onResign?: () => void;
  /** Automatische Sicherung (Einzelspiel und Host); wird regelmäßig und beim Verlassen der Seite aufgerufen. */
  autosave?: () => void;
  /** Partie entschieden – automatische Sicherung verwerfen. */
  onFinished?: () => void;
  /** dezente Geländehinweise beim Verweilen mit der Maus */
  hints?: boolean;
}


export class Game {
  readonly client: ClientState;
  renderer: BaseRenderer;
  readonly minimap: Minimap;
  readonly hud: Hud;
  readonly tutorial: Tutorial;
  selected = new Set<number>();
  placement: Placement | null = null;
  attackMove = false;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private mouse = { x: -1, y: -1, inside: false };
  private pan: { x: number; y: number; cx: number; cy: number } | null = null;
  private keys = new Set<string>();
  private groups = new Map<string, number[]>();
  private lastClick = { t: 0, id: 0 };
  private lastAlert: { x: number; y: number } | null = null;
  private raf = 0;
  private lastFrame = performance.now();
  private ended = false;
  private hover = 0;
  private miniDrag = false;
  private frameTimes: number[] = [];
  private showPerf = false;
  private lastErrSound = 0;
  private cleanup: (() => void)[] = [];
  private inputCleanup: (() => void)[] = [];
  private switchingArt = false;
  private canvas: HTMLCanvasElement;
  private dialogEl = document.getElementById('dialog')!;
  private idleIdx = 0;
  private touch!: TouchInput;
  private touchActive = false;
  private touchBar = document.getElementById('touch-controls')!;
  private touchStatus = '';
  private miniPointer: number | null = null;

  get touchUI(): boolean {
    return this.touchActive || window.matchMedia('(pointer: coarse), (max-width: 820px)').matches;
  }

  /** Baut Darstellung (WebGL/PixiJS oder Canvas 2D) asynchron auf und startet dann die Partie. */
  static async create(driver: Driver, opts: GameOptions, pref: RendererPref = 'auto'): Promise<Game> {
    document.getElementById('screen-game')!.classList.remove('hidden', 'hud-collapsed');
    const canvas = freshCanvas(document.getElementById('view') as HTMLCanvasElement);
    const renderer = await createRenderer(canvas, driver.client, pref);
    return new Game(driver, opts, renderer);
  }

  private constructor(readonly driver: Driver, readonly opts: GameOptions, renderer: BaseRenderer) {
    this.client = driver.client;
    this.renderer = renderer;
    this.canvas = renderer.canvas;
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, this.client);
    this.hud = new Hud(this);
    this.tutorial = new Tutorial(this, opts.tutorial);
    this.resize();
    this.centerHome();
    driver.onNotice = (text, fatal) => this.notice(text, fatal);
    driver.onAfterTick = () => undefined;
    this.bindInput();
    driver.start();
    this.raf = requestAnimationFrame((t) => this.loop(t));
    this.guardPage();
  }

  // ---------------------------------------------------------------- dezente Geländehinweise
  private hintEl = document.getElementById('terrainhint')!;
  private hintSince = performance.now();
  private hintShown = false;
  private hideHint(): void {
    this.hintSince = performance.now();
    if (this.hintShown) {
      this.hintEl.classList.add('hidden');
      this.hintShown = false;
    }
  }
  private updateHint(now: number): void {
    if (this.hintShown || !this.opts.hints || now - this.hintSince < 700) return;
    if (!this.mouse.inside || this.drag || this.pan || this.placement || this.hover || this.dialogEl.offsetParent) return;
    const r = this.canvas.getBoundingClientRect();
    if (this.mouse.x < r.left || this.mouse.y < r.top || this.mouse.x > r.right || this.mouse.y > r.bottom) return;
    if (document.elementFromPoint(this.mouse.x, this.mouse.y) !== this.canvas) return;
    const [tx, ty] = this.renderer.toTile(this.mouse.x, this.mouse.y);
    const text = terrainHint(this.client, Math.floor(tx), Math.floor(ty));
    if (!text) return;
    this.hintEl.textContent = text;
    this.hintEl.style.left = `${Math.min(window.innerWidth - 260, this.mouse.x + 14)}px`;
    this.hintEl.style.top = `${this.mouse.y + 18}px`;
    this.hintEl.classList.remove('hidden');
    this.hintShown = true;
  }

  /** Untätige eigene Arbeiter (stehen still, arbeiten nicht in einem Gebäude). */
  idleWorkers() {
    return [...this.client.units.values()].filter((u) => u.o === this.client.me && u.t === 'arbeiter' && u.a === 0 && !u.w);
  }
  /** Abreißen mit Rückfrage: der erste Klick schärft, ein zweiter innerhalb von 4 s reißt ab. */
  private demolish: { id: number; until: number } | null = null;
  demolishArmed(id: number): boolean {
    return !!this.demolish && this.demolish.id === id && performance.now() < this.demolish.until;
  }
  requestDemolish(id: number): void {
    const b = this.client.buildings.get(id);
    if (!b || b.o !== this.client.me) return;
    if (this.demolishArmed(id)) {
      this.demolish = null;
      this.issue({ c: 'demolish', b: id });
    } else {
      this.demolish = { id, until: performance.now() + 4000 };
      this.hud.message(`${this.client.bname(b)} abreißen? Nochmals klicken (oder Entf) zum Bestätigen.`);
      setTimeout(() => this.hud.update(true), 4100);
    }
    this.hud.update(true);
  }

  selectIdleWorker(): void {
    const idle = this.idleWorkers();
    if (!idle.length) {
      this.hud.message('Keine untätigen Arbeiter.');
      return;
    }
    const u = idle[this.idleIdx++ % idle.length];
    this.selected = new Set([u.i]);
    this.renderer.centerOn(u.x, u.y);
    this.renderer.marker(u.x, u.y, '#f5e7a0', performance.now());
    this.hud.update(true);
  }

  private lastAutosave = performance.now();
  private autosaveNow(): void {
    if (this.ended || !this.opts.autosave) return;
    this.lastAutosave = performance.now();
    this.opts.autosave();
  }

  /** Schutz vor versehentlichem Verlassen: Zurück-Taste öffnet das Menü, Schließen fragt nach, beides sichert. */
  private guardPage(): void {
    history.pushState({ angeln: 'game' }, '');
    const onPop = () => {
      if (this.ended) return;
      this.autosaveNow();
      history.pushState({ angeln: 'game' }, '');
      this.showMenu();
      this.hud.message('Zurück-Taste: Die Partie wurde gesichert. Über „Zum Hauptmenü“ verlasst ihr sie.', 'alert');
    };
    const onHide = () => this.autosaveNow();
    const onVis = () => document.visibilityState === 'hidden' && this.autosaveNow();
    const onBefore = (e: BeforeUnloadEvent) => {
      this.autosaveNow();
      if (this.ended) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBefore);
    document.addEventListener('visibilitychange', onVis);
    this.cleanup.push(() => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBefore);
      document.removeEventListener('visibilitychange', onVis);
      if (history.state?.angeln === 'game') history.back();
    });
  }

  private centered = false;
  /** Kamera auf das eigene Dorfzentrum setzen, sobald es bekannt ist (beim Gast erst nach dem ersten Zustand). */
  private centerHome(): void {
    if (this.centered) return;
    const dz = [...this.client.buildings.values()].find((b) => b.o === this.client.me && b.t === 'dorfzentrum');
    if (!dz) return;
    this.renderer.centerOn(dz.x + 1.5, dz.y + 1.5);
    this.centered = true;
    const fd = FACTION_DEFS[this.client.faction(this.client.me)];
    this.hud.message(`Willkommen, ${this.client.mePlayer?.name ?? ''}! Ihr führt die ${fd.name} in ${this.client.map.slots[this.mySlot()]?.name ?? ''}. ${fd.motto}`, 'good');
    const foes = this.client.players.filter((p) => p.id !== this.client.me).map((p) => `${p.name} (${FACTION_DEFS[p.faction].name})`);
    if (foes.length) this.hud.message(`Gegner: ${foes.join(', ')}.`);
    const m = this.client.map;
    this.hud.message(`Karte: ${m.name}. Der neutrale ${m.marketName} liegt ${this.client.dirTo(m.market.x + 1.5, m.market.y + 1.5)}.`);
  }

  private mySlot(): number {
    const dz = [...this.client.buildings.values()].find((b) => b.o === this.client.me && b.t === 'dorfzentrum');
    if (!dz) return 0;
    return this.client.map.slots.findIndex((s) => s.x === dz.x && s.y === dz.y);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.driver.stop();
    this.renderer.destroy();
    for (const f of this.inputCleanup) f();
    this.inputCleanup = [];
    for (const f of this.cleanup) f();
    this.cleanup = [];
    document.getElementById('screen-game')!.classList.add('hidden');
    this.dialogEl.classList.add('hidden');
    document.getElementById('tooltip')!.classList.add('hidden');
    document.getElementById('msglog')!.innerHTML = '';
    this.hintEl.classList.add('hidden');
  }

  // ---------------------------------------------------------------- Befehle
  issue(cmd: Command): void {
    if (this.ended && this.client.winner >= 0) return;
    this.driver.send(cmd);
    if (cmd.c === 'gather') this.tutorial.flag('gather');
    if (cmd.c === 'smart') {
      const tile = Math.floor(cmd.y) * this.client.map.w + Math.floor(cmd.x);
      if (this.client.trees[tile] && cmd.ids.some((id) => this.client.units.get(id)?.t === 'arbeiter')) this.tutorial.flag('gather');
    }
  }

  feedback(msg: string): void {
    this.hud.message(msg, 'err');
    const now = performance.now();
    if (now - this.lastErrSound > 400) {
      sound.play('error');
      this.lastErrSound = now;
    }
  }

  beginPlacement(t: BuildingType): void {
    const c = this.client;
    const d = c.bd(c.me, t);
    if (d.requires?.some((r) => !this.client.hasBuilt(r))) {
      this.feedback(`${d.name}: benötigt zuerst ${d.requires.map((r) => c.bd(c.me, r).name).join(', ')}.`);
      return;
    }
    if (!this.hud.canAfford(d.cost)) {
      this.feedback(`${d.name}: nicht genug Rohstoffe.`);
      return;
    }
    this.attackMove = false;
    this.touch.mode = 'select';
    this.placement = { type: t, x: 0, y: 0, valid: false };
    if (this.touchUI) {
      this.mouse.x = this.renderer.vw / 2;
      this.mouse.y = this.renderer.centerY;
    }
    this.updatePlacement();
    sound.play('click');
  }

  armAttackMove(): void {
    this.placement = null;
    this.touch.mode = 'select';
    this.attackMove = true;
    this.canvas.style.cursor = 'crosshair';
    sound.play('click');
  }

  private updatePlacement(): void {
    const p = this.placement;
    if (!p) return;
    const d = BUILDINGS[p.type];
    const [tx, ty] = this.renderer.toTile(this.mouse.x, this.mouse.y);
    p.x = Math.floor(tx - d.w / 2 + 0.5);
    p.y = Math.floor(ty - d.h / 2 + 0.5);
    p.valid = checkPlacement(this.client.placementView(), p.type, p.x, p.y) === null;
  }

  uiAction(a: string): void {
    sound.unlock();
    if (a === 'help') this.showHelp();
    else if (a === 'tut') this.tutorial.toggle();
    else if (a === 'hud') {
      document.getElementById('screen-game')!.classList.toggle('hud-collapsed');
      this.resize();
    }
    else if (a === 'mute') {
      sound.setMuted(!sound.muted);
      this.hud.message(sound.muted ? 'Ton aus.' : 'Ton an.');
    } else if (a === 'menu') this.showMenu();
  }

  // ---------------------------------------------------------------- Hauptschleife
  private loop(t: number): void {
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    // Beim Wechsel der Sprite-Pakete keine zerstörte WebGL-Szene zeichnen.
    if (this.switchingArt) return;
    this.centerHome();
    if (t - this.lastAutosave > 20000 && this.opts.autosave) this.autosaveNow();
    this.updateHint(t);
    this.scrollCamera(dt);
    this.processEvents(t);
    // Auswahl bereinigen
    for (const id of this.selected) if (!this.client.units.has(id) && !this.client.buildings.has(id)) this.selected.delete(id);
    if (this.placement) this.updatePlacement();
    const t0 = performance.now();
    this.renderer.frame(t, { selected: this.selected, placement: this.placement, drag: this.drag, hover: this.hover });
    if ((this.client.tick & 1) === 0 || !this.minimapDrawn) {
      this.minimap.draw(this.renderer);
      this.minimapDrawn = true;
    }
    this.hud.updateTop();
    this.hud.update();
    this.updateTouchControls();
    this.tutorial.update();
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    if (this.showPerf) {
      const ft = this.frameTimes;
      const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
      const max = Math.max(...ft);
      document.getElementById('perf')!.textContent =
        `${this.renderer.kind === 'webgl' ? 'WebGL/PixiJS' : 'Canvas 2D'} · Frame ${avg.toFixed(1)} ms (max ${max.toFixed(1)}) · ${(1000 / Math.max(1, dt * 1000)).toFixed(0)} fps · Einheiten ${this.client.units.size} · Kacheln ${this.renderer.stats.drawn}`;
    }
    if (this.client.winner >= 0 && !this.ended) this.showEnd();
  }
  private minimapDrawn = false;

  /** Messwerte für Leistungstests (über window zugänglich). */
  perfStats(): { avg: number; max: number; p95: number; units: number } {
    const ft = [...this.frameTimes].sort((a, b) => a - b);
    return {
      avg: ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length),
      max: ft[ft.length - 1] ?? 0,
      p95: ft[Math.floor(ft.length * 0.95)] ?? 0,
      units: this.client.units.size,
    };
  }

  private scrollCamera(dt: number): void {
    const r = this.renderer;
    let dx = 0, dy = 0;
    const sp = 900 / r.cam.z;
    if (this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('ArrowRight')) dx += 1;
    if (this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('ArrowDown')) dy += 1;
    if (!this.touchActive && this.mouse.inside && this.mouse.x >= 0 && !this.drag && !this.pan && document.hasFocus()) {
      const m = 6;
      if (this.mouse.x <= m) dx -= 1;
      if (this.mouse.x >= r.vw - m) dx += 1;
      if (this.mouse.y <= m) dy -= 1;
      if (this.mouse.y >= r.vh - m) dy += 1;
    }
    if (dx || dy) {
      r.cam.x += dx * sp * dt;
      r.cam.y += dy * sp * dt * 0.75;
      r.clampCam();
      this.tutorial.flag('cam');
    }
  }

  private onScreen(x: number, y: number): boolean {
    const [sx, sy] = this.renderer.toScreen(x, y);
    return sx > -50 && sy > -50 && sx < this.renderer.vw + 50 && sy < this.renderer.vh + 50;
  }

  private processEvents(now: number): void {
    const c = this.client;
    const evs = c.events.splice(0);
    for (const e of evs) this.handleEvent(e, now);
  }

  private handleEvent(e: SimEvent, now: number): void {
    const c = this.client;
    const me = c.me;
    const r = this.renderer;
    switch (e.e) {
      case 'err':
        if (e.p === me) this.feedback(e.msg);
        break;
      case 'info':
        if (e.p === me) this.hud.message(e.msg);
        break;
      case 'attacked':
        if (e.p === me) {
          this.hud.message('Eure Siedlung wird angegriffen! (Leertaste: hinspringen)', 'alert');
          this.lastAlert = { x: e.x, y: e.y };
          sound.play('alarm', 4000);
          r.marker(e.x, e.y, '#ff5040', now);
        }
        break;
      case 'sold':
        if (e.p === me) {
          sound.play('coin', 300);
          const m = [...c.buildings.values()].find((b) => b.o === me && b.t === 'markt');
          if (m) r.floatText(m.x + 1.5, m.y + 1.5, `+${e.taler} Taler  +${e.prestige} Prestige`, '#f5d878', now);
          this.tutorial.flag('sold');
        }
        break;
      case 'moor':
        sound.play('discover');
        if (e.p === me)
          this.hud.message(`${c.map.site.name} erkundet: ${c.map.site.text}: +${RULES.moorReward.prestige} Prestige, +${RULES.moorReward.taler} Taler.`, 'good');
        else this.hud.message(`${c.players[e.p]?.name ?? 'Der Gegner'} hat die Fundstelle „${c.map.site.name}“ zuerst erkundet.`, 'alert');
        break;
      case 'brarup':
        if (e.p === me) this.hud.message(`Ihr kontrolliert den ${c.map.marketName}: bessere Preise und mehr Prestige.`, 'good');
        else this.hud.message(`${c.players[e.p]?.name ?? 'Der Gegner'} kontrolliert jetzt den ${c.map.marketName}!`, 'alert');
        break;
      case 'built':
        if (e.o === me) {
          this.hud.message(`${c.bd(me, e.b).name} ist fertig.`, 'good');
          sound.play('built', 500);
        }
        break;
      case 'age':
        sound.play('age');
        if (e.p === me) this.hud.message(`Eure Siedlung erreicht das ${AGES[e.age].name} (${AGES[e.age].title})! Neue Gebäude, Einheiten und Forschungen sind verfügbar.`, 'good');
        else this.hud.message(`${c.players[e.p]?.name ?? 'Der Gegner'} erreicht das ${AGES[e.age].name}.`, 'alert');
        break;
      case 'tech':
        if (e.p === me) {
          this.hud.message(`Erforscht: ${TECHS[e.t].name} – ${TECHS[e.t].desc}`, 'good');
          sound.play('built', 500);
        }
        break;
      case 'upgraded':
        if (e.o === me) {
          this.hud.message(`Ausbau fertig: ${UPGRADES[e.b]?.[e.l - 2]?.name ?? c.bd(me, e.b).name} (Stufe ${LEVEL_ROMAN[e.l]}).`, 'good');
          sound.play('built', 500);
        }
        break;
      case 'trained':
        if (e.o === me) sound.play('trained', 300);
        break;
      case 'shot':
        r.shot(e.x, e.y, e.tx, e.ty, now, e.r);
        if (this.onScreen(e.x, e.y)) sound.play(e.r === 2 ? 'musket' : e.r === 3 ? 'cannon' : e.r === 4 ? 'laser' : 'shot', 120);
        break;
      case 'hit':
        if (this.onScreen(e.x, e.y)) sound.play('hit', 90);
        break;
      case 'die':
        r.death(e.x, e.y, e.u === 1, now);
        if (this.onScreen(e.x, e.y)) sound.play('die', 150);
        break;
      case 'chop':
        if (this.onScreen(e.x, e.y)) sound.play('chop', 250);
        break;
      case 'defeat':
        if (e.p !== me) this.hud.message(`${c.players[e.p]?.name ?? '?'} wurde besiegt.`, 'good');
        else if (c.players.filter((p) => !p.defeated && p.id !== me).length > 1) this.showOut();
        break;
      case 'win':
        break;
    }
  }

  // ---------------------------------------------------------------- Eingabe
  private resize(): void {
    const screen = document.getElementById('screen-game')!;
    this.touch?.reset();
    const mini = this.minimap.canvas;
    if (this.miniPointer !== null && mini.hasPointerCapture(this.miniPointer)) mini.releasePointerCapture(this.miniPointer);
    this.miniPointer = null;
    this.hud.hideTip();
    this.renderer.resize(screen.clientWidth, screen.clientHeight);
    const top = document.getElementById('topbar')!.getBoundingClientRect().bottom;
    const bottom = document.getElementById('bottom')!;
    const controls = this.touchBar;
    const edge = controls.offsetHeight ? controls.getBoundingClientRect().top : bottom.getBoundingClientRect().top;
    this.renderer.setPlayArea(top, edge);
  }

  private on<K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions): void {
    t.addEventListener(type, fn as EventListener, opts);
    this.inputCleanup.push(() => t.removeEventListener(type, fn as EventListener, opts));
  }

  private bindInput(): void {
    const cv = this.canvas;
    this.on(window, 'resize', () => this.resize());
    if (window.visualViewport) this.on(window.visualViewport, 'resize', () => this.resize());
    this.bindTouch();
    // Beim Schließen der Seite die Gegenseite sauber informieren
    this.on(window, 'pagehide', () => this.driver.stop());
    this.on(cv, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    this.on(document, 'mouseleave', () => (this.mouse.inside = false));
    this.on(window, 'mousemove', (e: MouseEvent) => {
      if (this.syntheticTouchMouse(e)) return;
      this.touchActive = false;
      if (Math.abs(e.clientX - this.mouse.x) + Math.abs(e.clientY - this.mouse.y) > 2) this.hideHint();
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
      if (this.drag) {
        this.drag.x1 = e.clientX;
        this.drag.y1 = e.clientY;
      }
      if (this.pan) {
        const z = this.renderer.cam.z;
        this.renderer.cam.x = this.pan.cx - (e.clientX - this.pan.x) / z;
        this.renderer.cam.y = this.pan.cy - (e.clientY - this.pan.y) / z;
        this.renderer.clampCam();
        this.tutorial.flag('cam');
      }
      if (e.target === cv) this.hover = this.renderer.pick(e.clientX, e.clientY, performance.now());
      else this.hover = 0;
      if (this.miniDrag) this.miniMove(e);
    });
    this.on(cv, 'mousedown', (e: MouseEvent) => {
      if (this.syntheticTouchMouse(e)) return;
      this.touchActive = false;
      sound.unlock();
      if (e.button === 1) {
        e.preventDefault();
        this.pan = { x: e.clientX, y: e.clientY, cx: this.renderer.cam.x, cy: this.renderer.cam.y };
        return;
      }
      if (e.button === 0) {
        if (this.placement) {
          this.place(e.shiftKey);
          return;
        }
        if (this.attackMove) {
          this.doAttackMove(e.clientX, e.clientY);
          return;
        }
        this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      }
      if (e.button === 2) this.rightClick(e.clientX, e.clientY);
    });
    this.on(window, 'mouseup', (e: MouseEvent) => {
      if (this.syntheticTouchMouse(e)) return;
      if (e.button === 1) this.pan = null;
      if (e.button === 0) {
        this.miniDrag = false;
        if (this.drag) {
          this.finishDrag(e.shiftKey, e.ctrlKey);
          this.drag = null;
        }
      }
    });
    this.on(cv, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      this.tutorial.flag('cam');
    }, { passive: false });
    const mini = this.minimap.canvas;
    this.on(mini, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    this.on(mini, 'mousedown', (e: MouseEvent) => {
      if (this.syntheticTouchMouse(e)) return;
      sound.unlock();
      if (e.button === 0) {
        this.miniDrag = true;
        this.miniMove(e);
      } else if (e.button === 2) {
        const [tx, ty] = this.miniTile(e);
        const ids = this.ownSelectedUnits();
        if (ids.length) {
          this.issue({ c: 'smart', ids, x: tx, y: ty });
          this.renderer.marker(tx, ty, '#a8e070', performance.now());
          sound.play('order');
        }
      }
    });
    this.on(window, 'keydown', (e: KeyboardEvent) => this.keyDown(e));
    this.on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key));
    this.on(window, 'blur', () => this.keys.clear());
  }

  private syntheticTouchMouse(e: MouseEvent): boolean {
    return !!(e as MouseEvent & { sourceCapabilities?: { firesTouchEvents: boolean } }).sourceCapabilities?.firesTouchEvents;
  }

  private bindTouch(): void {
    const screen = document.getElementById('screen-game')!;
    screen.classList.remove('hud-collapsed');
    const point = (x: number, y: number) => {
      this.touchActive = true;
      this.mouse = { x, y, inside: false };
      this.hover = this.renderer.pick(x, y, performance.now(), 12);
      this.hideHint();
      this.hud.hideTip();
      if (this.placement) this.updatePlacement();
    };
    this.touch = new TouchInput(this.canvas, {
      enabled: () => this.dialogEl.classList.contains('hidden'),
      point,
      pan: (dx, dy) => {
        this.touchActive = true;
        this.renderer.cam.x -= dx / this.renderer.cam.z;
        this.renderer.cam.y -= dy / this.renderer.cam.z;
        this.renderer.clampCam();
        this.tutorial.flag('cam');
      },
      zoom: (x, y, factor) => {
        this.touchActive = true;
        this.renderer.zoomAt(x, y, factor);
        this.tutorial.flag('cam');
      },
      tap: (x, y, mode) => {
        sound.unlock();
        point(x, y);
        if (this.placement) return; // Vorschau setzen; „Bauen ✓“ bestätigt.
        if (this.attackMove) return this.doAttackMove(x, y);
        if (mode === 'order') return this.rightClick(x, y);
        this.drag = { x0: x, y0: y, x1: x, y1: y };
        this.finishDrag(false, false, 12);
        this.drag = null;
      },
      box: (start, end) => {
        this.drag = end ? { x0: start.x, y0: start.y, x1: end.x, y1: end.y } : null;
      },
      selectBox: (start, end) => {
        this.drag = { x0: start.x, y0: start.y, x1: end.x, y1: end.y };
        this.finishDrag(false, false);
        this.touch.mode = 'select';
      },
    });
    this.cleanup.push(() => this.touch.destroy());
    this.on(document.getElementById('tooltip')!, 'click', () => this.hud.hideTip());
    this.touch.mode = 'select';
    this.touchBar.querySelectorAll<HTMLButtonElement>('[data-touch]').forEach((btn) => {
      this.on(btn, 'click', () => {
        this.touchActive = true;
        this.hud.hideTip();
        sound.unlock();
        const a = btn.dataset.touch!;
        if (a === 'place') {
          if (this.placement) this.place(false);
        } else if (a === 'cancel') {
          this.placement = null;
          this.attackMove = false;
          this.touch.mode = 'select';
          this.canvas.style.cursor = 'default';
        } else if (a === 'home') this.keyDown(new KeyboardEvent('keydown', { key: 'h' }));
        else if (a === 'in' || a === 'out') {
          this.renderer.zoomAt(this.renderer.vw / 2, this.renderer.centerY, a === 'in' ? 1.2 : 1 / 1.2);
          this.tutorial.flag('cam');
        } else {
          this.placement = null;
          this.attackMove = false;
          this.canvas.style.cursor = 'default';
          this.touch.mode = a as TouchMode;
        }
        this.updateTouchControls();
      });
    });
    // Minikarte: Tippen und Ziehen bewegen die Kamera, ohne Maus-Rechtsklick.
    const mini = this.minimap.canvas;
    this.on(mini, 'pointerdown', (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || this.miniPointer !== null) return;
      e.preventDefault();
      sound.unlock();
      this.touchActive = true;
      this.miniPointer = e.pointerId;
      mini.setPointerCapture(e.pointerId);
      this.miniMove(e);
    }, { passive: false });
    this.on(mini, 'pointermove', (e: PointerEvent) => {
      if (this.miniPointer !== e.pointerId) return;
      e.preventDefault();
      this.miniMove(e);
    }, { passive: false });
    const endMini = (e: PointerEvent) => {
      if (this.miniPointer !== e.pointerId) return;
      this.miniPointer = null;
      if (mini.hasPointerCapture(e.pointerId)) mini.releasePointerCapture(e.pointerId);
    };
    this.on(mini, 'pointerup', endMini);
    this.on(mini, 'pointercancel', endMini);
    this.on(mini, 'lostpointercapture', endMini);
    this.on(window, 'blur', () => this.touch.reset());
  }

  private updateTouchControls(): void {
    const placing = !!this.placement;
    const armed = placing || this.attackMove;
    for (const el of this.touchBar.querySelectorAll<HTMLButtonElement>('[data-touch]')) {
      const a = el.dataset.touch!;
      if (a === 'select' || a === 'order' || a === 'box') {
        el.classList.toggle('hidden', armed);
        el.setAttribute('aria-pressed', String(this.touch.mode === a));
      }
      if (a === 'place') {
        el.classList.toggle('hidden', !placing);
        el.disabled = !this.placement?.valid;
      }
      if (a === 'cancel') el.classList.toggle('hidden', !armed);
    }
    const hint = placing ? 'Platz antippen → Bauen ✓. Wischen verschiebt die Karte.'
      : this.attackMove ? 'Angriffsziel antippen · Abbruch beendet den Auftrag.'
      : this.touch.mode === 'box' ? 'Rahmen ziehen · zwei Finger bewegen und zoomen.'
      : this.touch.mode === 'order' ? 'Ziel antippen: gehen, arbeiten oder angreifen.'
      : 'Tippen wählt · Wischen bewegt · zwei Finger zoomen.';
    if (hint !== this.touchStatus) {
      document.getElementById('touch-hint')!.textContent = hint;
      this.touchStatus = hint;
    }
  }

  private miniTile(e: MouseEvent): [number, number] {
    const rect = this.minimap.canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * this.minimap.canvas.width;
    const sy = ((e.clientY - rect.top) / rect.height) * this.minimap.canvas.height;
    const [tx, ty] = this.minimap.fromMini(sx, sy);
    return [Math.max(0, Math.min(this.client.map.w - 0.5, tx)), Math.max(0, Math.min(this.client.map.h - 0.5, ty))];
  }
  private miniMove(e: MouseEvent): void {
    const [tx, ty] = this.miniTile(e);
    this.renderer.centerOn(tx, ty);
    this.tutorial.flag('cam');
  }

  private ownSelectedUnits(): number[] {
    return [...this.selected].filter((id) => this.client.units.get(id)?.o === this.client.me);
  }

  private place(keep: boolean): void {
    const p = this.placement!;
    const why = checkPlacement(this.client.placementView(), p.type, p.x, p.y);
    if (why) {
      this.feedback(why);
      return;
    }
    const d = this.client.bd(this.client.me, p.type);
    if (!this.hud.canAfford(d.cost)) {
      this.feedback(`${d.name}: nicht genug Rohstoffe.`);
      this.placement = null;
      return;
    }
    const workers = this.ownSelectedUnits().filter((id) => this.client.units.get(id)?.t === 'arbeiter');
    this.issue({ c: 'place', ids: workers, b: p.type, x: p.x, y: p.y });
    sound.play('build');
    if (!keep) this.placement = null;
  }

  private doAttackMove(sx: number, sy: number): void {
    const ids = this.ownSelectedUnits();
    this.attackMove = false;
    this.canvas.style.cursor = 'default';
    if (!ids.length) return;
    const target = this.renderer.pick(sx, sy, performance.now(), this.touchActive ? 12 : 0);
    const t = target ? this.client.units.get(target) ?? this.client.buildings.get(target) : undefined;
    const [tx, ty] = this.renderer.toTile(sx, sy);
    if (t && t.o !== this.client.me && t.o >= 0) this.issue({ c: 'attack', ids, t: t.i });
    else this.issue({ c: 'move', ids, x: clamp(tx, 0, this.client.map.w - 0.01), y: clamp(ty, 0, this.client.map.h - 0.01), am: true });
    this.renderer.marker(tx, ty, '#ff6040', performance.now());
    sound.play('order');
  }

  private rightClick(sx: number, sy: number): void {
    if (this.placement) {
      this.placement = null;
      return;
    }
    if (this.attackMove) {
      this.attackMove = false;
      this.canvas.style.cursor = 'default';
      return;
    }
    const c = this.client;
    const [tx0, ty0] = this.renderer.toTile(sx, sy);
    const tx = clamp(tx0, 0, c.map.w - 0.01), ty = clamp(ty0, 0, c.map.h - 0.01);
    const ids = this.ownSelectedUnits();
    const now = performance.now();
    if (ids.length) {
      const target = this.renderer.pick(sx, sy, now, this.touchActive ? 12 : 0);
      const t = target ? c.units.get(target) ?? c.buildings.get(target) : undefined;
      const tile = Math.floor(ty) * c.map.w + Math.floor(tx);
      if (!c.vis[tile]) {
        // Unerforschtes Gelände: einfach hinlaufen
        this.issue({ c: 'move', ids, x: tx, y: ty });
      } else this.issue({ c: 'smart', ids, x: tx, y: ty, t: t && !(('ghost' in t) && t.ghost) ? t.i : undefined });
      const enemy = t && t.o !== c.me && t.o >= 0;
      this.renderer.marker(tx, ty, enemy ? '#ff6040' : '#a8e070', now);
      sound.play('order');
      return;
    }
    // Sammelpunkt für ausgewähltes Gebäude
    const b = [...this.selected].map((id) => c.buildings.get(id)).find((x) => x && x.o === c.me && x.b && c.bd(c.me, x.t).trains);
    if (b) {
      this.issue({ c: 'rally', b: b.i, x: tx, y: ty });
      this.renderer.marker(tx, ty, '#e8d080', now);
      this.hud.message('Sammelpunkt gesetzt.');
    }
  }

  private finishDrag(shift: boolean, ctrl: boolean, tolerance = 0): void {
    const d = this.drag!;
    const c = this.client;
    const now = performance.now();
    const small = Math.abs(d.x1 - d.x0) < 5 && Math.abs(d.y1 - d.y0) < 5;
    if (!shift) this.selected.clear();
    if (small) {
      const id = this.renderer.pick(d.x0, d.y0, now, tolerance);
      if (!id) {
        this.hud.update(true);
        return;
      }
      const u = c.units.get(id);
      const dbl = now - this.lastClick.t < 350 && this.lastClick.id === id;
      this.lastClick = { t: now, id };
      if (u && (dbl || ctrl) && u.o === c.me) {
        // gleicher Typ auf dem Bildschirm
        for (const v of c.units.values()) if (v.o === c.me && v.t === u.t && this.onScreen(v.x, v.y)) this.selected.add(v.i);
      } else if (shift && this.selected.has(id)) this.selected.delete(id);
      else {
        // Gemischte Auswahl aus eigenen Einheiten und Fremdobjekten vermeiden
        if (shift && (!u || u.o !== c.me)) this.selected.clear();
        if (shift) for (const s of [...this.selected]) if (!c.units.has(s) || c.units.get(s)!.o !== c.me) this.selected.delete(s);
        this.selected.add(id);
      }
      sound.play('select', 100);
    } else {
      const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
      for (const u of c.units.values()) {
        if (u.o !== c.me) continue;
        const [sx, sy] = this.renderer.toScreen(u.x, u.y);
        if (sx >= x0 && sx <= x1 && sy - 10 >= y0 - 10 && sy - 10 <= y1) this.selected.add(u.i);
      }
      // nur Militär, falls auch Arbeiter im Rahmen und Strg nicht gedrückt? -> alle behalten (klassisch)
      if (this.selected.size) sound.play('select', 100);
    }
    this.hud.update(true);
  }

  private keyDown(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key;
    sound.unlock();
    if (!this.dialogEl.classList.contains('hidden')) {
      if (k === 'Escape' && this.dialogClosable) this.closeDialog();
      return;
    }
    if (k.startsWith('Arrow')) {
      this.keys.add(k);
      e.preventDefault();
      return;
    }
    if (k === 'F1') {
      e.preventDefault();
      this.showHelp();
      return;
    }
    if (k === 'F2') {
      e.preventDefault();
      this.tutorial.toggle();
      return;
    }
    if (k === 'F3') {
      e.preventDefault();
      this.showPerf = !this.showPerf;
      document.getElementById('perf')!.classList.toggle('hidden', !this.showPerf);
      return;
    }
    if (k === 'Escape') {
      if (this.placement || this.attackMove) {
        this.placement = null;
        this.attackMove = false;
        this.canvas.style.cursor = 'default';
      } else this.showMenu();
      return;
    }
    if (/^[0-9]$/.test(k)) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.groups.set(k, [...this.selected]);
        this.hud.message(`Gruppe ${k} gespeichert.`);
      } else {
        const g = (this.groups.get(k) ?? []).filter((id) => this.client.units.has(id) || this.client.buildings.has(id));
        if (g.length) {
          const again = this.selected.size === g.length && g.every((id) => this.selected.has(id));
          this.selected = new Set(g);
          if (again) {
            const u = this.client.units.get(g[0]) ?? null;
            const b = this.client.buildings.get(g[0]) ?? null;
            if (u) this.renderer.centerOn(u.x, u.y);
            else if (b) this.renderer.centerOn(b.x + 1, b.y + 1);
          }
          this.hud.update(true);
        }
      }
      return;
    }
    if (k === ' ') {
      e.preventDefault();
      if (this.lastAlert) this.renderer.centerOn(this.lastAlert.x, this.lastAlert.y);
      return;
    }
    if (k === 'h' || k === 'H' || k === 'Home') {
      const dz = [...this.client.buildings.values()].find((b) => b.o === this.client.me && b.t === 'dorfzentrum');
      if (dz) {
        this.selected = new Set([dz.i]);
        this.renderer.centerOn(dz.x + 1.5, dz.y + 1.5);
        this.hud.update(true);
      }
      return;
    }
    if (k === '.' || k === ',') {
      this.selectIdleWorker();
      return;
    }
    if (k === 'm' || k === 'M') {
      this.uiAction('mute');
      return;
    }
    if (k === '+' || k === '-') {
      this.renderer.zoomAt(this.renderer.vw / 2, this.renderer.vh / 2, k === '+' ? 1.12 : 1 / 1.12);
      return;
    }
    if (k === 'Delete') {
      const b = [...this.selected].map((id) => this.client.buildings.get(id)).find((x) => x && x.o === this.client.me);
      if (b && (!b.b || b.q?.length)) this.issue({ c: 'cancel', b: b.i });
      else if (b && b.t !== 'dorfzentrum') this.requestDemolish(b.i);
      return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.hud.hotkey(k)) e.preventDefault();
    }
  }

  // ---------------------------------------------------------------- Dialoge
  private dialogClosable = true;
  private openDialog(html: string, closable = true): HTMLElement {
    this.touch.reset();
    this.hud.hideTip();
    this.dialogClosable = closable;
    this.dialogEl.innerHTML = `<div class="panel">${html}</div>`;
    this.dialogEl.classList.remove('hidden');
    if (this.driver.kind === 'local' && closable) this.driver.paused = true;
    return this.dialogEl;
  }
  closeDialog(): void {
    this.dialogEl.classList.add('hidden');
    if (this.driver.kind === 'local' && !this.ended) this.driver.paused = false;
  }

  showHelp(): void {
    const el = this.openDialog(`<h2>Steuerung</h2>
      <h3>Smartphone & Tablet – Hoch- und Querformat</h3>
      <p>In „Wählen“: Einheit oder Gebäude antippen. Wischen verschiebt die Karte, zwei Finger verschieben und zoomen.
      „Befehl“: ausgewählte Einheiten durch Tippen auf ein Ziel bewegen, arbeiten lassen oder angreifen; bei Ausbildungsgebäuden den Sammelpunkt setzen.
      „Rahmen“: mehrere Einheiten mit einem gezogenen Rahmen wählen. Zwei Finger bewegen weiterhin die Karte.</p>
      <p>Gebäude wählen → Platz auf der Karte antippen → „Bauen ✓“ bestätigen. „Abbruch“ beendet Bau- oder Angriffsaufträge.
      „Dorf“ zeigt das Dorfzentrum; +/− zoomt. Die Minikarte reagiert auf Tippen und Ziehen. „Ansicht“ blendet die untere Spielleiste aus oder ein.
      Die Rohstoffleiste lässt sich seitlich wischen. Für Kosten und Voraussetzungen einen Befehlsknopf kurz gedrückt halten.</p>
      <h3>Maus & Tastatur</h3><table>
      <tr><td>Linksklick</td><td>Auswählen (Umschalt: hinzufügen/entfernen, Doppelklick/Strg: alle gleichen auf dem Bildschirm)</td></tr>
      <tr><td>Rahmen ziehen</td><td>Mehrere eigene Einheiten auswählen</td></tr>
      <tr><td>Rechtsklick</td><td>Bewegen · Baum: Holz schlagen · Baustelle: bauen · Hof/Lehmgrube: zuweisen · Gegner: angreifen · bei Gebäuden: Sammelpunkt</td></tr>
      <tr><td>A bzw. ⚔ dann Linksklick</td><td>Angriffsbewegung (greift unterwegs an)</td></tr>
      <tr><td>Q W E R / A S D F / Y X C V</td><td>Knöpfe der Befehlskarte (Bauen, Ausbilden, Handel)</td></tr>
      <tr><td>Pfeiltasten, Bildrand, mittlere Maustaste</td><td>Kamera bewegen · Mausrad oder +/−: Zoom</td></tr>
      <tr><td>Minikarte</td><td>Linksklick: Kamera · Rechtsklick: Einheiten dorthin schicken</td></tr>
      <tr><td>Strg+1…9 / 1…9</td><td>Gruppe speichern / wählen (doppelt: hinspringen)</td></tr>
      <tr><td>H · Punkt · Leertaste</td><td>Dorfzentrum · untätiger Arbeiter · letzter Alarm</td></tr>
      <tr><td>Entf</td><td>Baustelle bzw. letzte Ausbildung abbrechen</td></tr>
      <tr><td>Esc · F1 · F2 · F3 · M</td><td>Menü/Abbrechen · Hilfe · Lehrmeister · Leistungsanzeige · Ton</td></tr>
      </table>
      <h3 style="margin-top:10px">Wirtschaft in Kürze</h3>
      <p class="note">Holz schlagen Arbeiter im Wald. Bauernhof und Lehmgrube brauchen zugewiesene Arbeiter. Der Heringszaun fängt selbstständig Fisch.
      Mühle: Getreide → Waren. Räucherei: Fisch + Holz → Waren. Markt: Waren → Taler + Prestige. Gebäude produzieren erst nach Fertigstellung.
      Knicks (Wallhecken) versperren Weg und Sicht – Tore und Wege führen hindurch.</p>
      <div class="btns"><button class="btn" data-close>Schließen</button></div>`);
    el.querySelector('[data-close]')!.addEventListener('click', () => this.closeDialog());
  }

  /** Wechsel des Grafikpakets ohne Neustart der Partie oder der Netzwerksimulation. */
  private async changeArtStyle(next: ArtStyle): Promise<void> {
    if (this.switchingArt || next === getArtStyle()) return;
    this.switchingArt = true;
    const previous = getArtStyle();
    const camera = { ...this.renderer.cam };
    const rendererPref: RendererPref = this.renderer.kind === 'webgl' ? 'auto' : 'canvas';
    this.drag = null;
    this.pan = null;
    this.hideHint();
    for (const clean of this.inputCleanup) clean();
    this.inputCleanup = [];

    // PixiJS-Kontext erst freigeben, dann mit den Texturen des anderen Packs neu aufbauen.
    this.renderer.destroy();
    this.canvas = freshCanvas(this.canvas);
    setArtStyle(next);
    try {
      this.renderer = await createRenderer(this.canvas, this.client, rendererPref);
      const s = loadSettings();
      s.artStyle = next;
      saveSettings(s);
      this.hud.message('Grafikstil: ' + (next === 'cartoon' ? 'Cartoon' : 'Historisch'));
    } catch (e) {
      // Notfall-Fallback: Canvas 2D und vorheriges Paket, die Partie läuft weiter.
      setArtStyle(previous);
      this.canvas = freshCanvas(this.canvas);
      this.renderer = new CanvasRenderer(this.canvas, this.client);
      this.hud.message('Grafikwechsel fehlgeschlagen: ' + String(e), 'err');
    } finally {
      this.renderer.cam = camera;
      this.resize();
      this.bindInput();
      this.hud.update(true);
      this.switchingArt = false;
    }
  }

  showMenu(): void {
    const local = this.driver.kind === 'local';
    const el = this.openDialog(`<h2>Menü</h2>
      <p class="note">${local ? 'Das Spiel ist pausiert.' : 'Mehrspieler: Die Partie läuft weiter.'}</p>
      <div class="menu-col">
        <button class="btn" data-a="resume">Weiterspielen</button>
        <div class="row"><label>Grafikstil</label><select data-f="artStyle">
          <option value="realistic" ${getArtStyle() === 'realistic' ? 'selected' : ''}>Historisch · atmosphärisch</option>
          <option value="cartoon" ${getArtStyle() === 'cartoon' ? 'selected' : ''}>Cartoon · farbenfroh</option>
        </select></div>
        ${this.opts.onSave ? '<button class="btn" data-a="save">Spiel speichern</button>' : ''}
        <button class="btn" data-a="help">Steuerung</button>
        <button class="btn" data-a="tut">Lehrmeister ein/aus</button>
        <button class="btn" data-a="mute">${sound.muted ? 'Ton einschalten' : 'Ton ausschalten'}</button>
        <button class="btn" data-a="resign">Aufgeben</button>
        <button class="btn" data-a="exit">Zum Hauptmenü</button>
      </div><div class="note" data-msg></div>`);
    const artSelect = el.querySelector<HTMLSelectElement>('[data-f=artStyle]')!;
    artSelect.addEventListener('change', () => {
      artSelect.disabled = true;
      const style: ArtStyle = artSelect.value === 'cartoon' ? 'cartoon' : 'realistic';
      void this.changeArtStyle(style).finally(() => {
        if (artSelect.isConnected) artSelect.disabled = false;
        el.querySelector('[data-msg]')!.textContent = 'Grafikstil: ' + (getArtStyle() === 'cartoon' ? 'Cartoon' : 'Historisch');
      });
    });
    el.querySelectorAll<HTMLElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'resume') this.closeDialog();
        else if (a === 'help') this.showHelp();
        else if (a === 'tut') {
          this.tutorial.toggle();
          this.closeDialog();
        } else if (a === 'mute') {
          this.uiAction('mute');
          b.textContent = sound.muted ? 'Ton einschalten' : 'Ton ausschalten';
        } else if (a === 'save') {
          const err = this.opts.onSave?.();
          el.querySelector('[data-msg]')!.textContent = err ?? 'Spielstand gespeichert (in diesem Browser).';
        } else if (a === 'resign') {
          this.issue({ c: 'resign' });
          this.closeDialog();
        } else if (a === 'exit') {
          if (this.ended || confirm('Partie wirklich verlassen?')) this.opts.onExit();
        }
      }),
    );
  }

  private notice(text: string, fatal: boolean): void {
    if (!fatal) {
      this.hud.message(text, 'alert');
      sound.play('alarm');
      return;
    }
    this.ended = true;
    const el = this.openDialog(`<h2>Verbindung beendet</h2><p>${text}</p><div class="btns"><button class="btn" data-x>Zum Hauptmenü</button></div>`, false);
    el.querySelector('[data-x]')!.addEventListener('click', () => this.opts.onExit());
  }

  /** Ausgeschieden, die übrigen spielen weiter (drei oder vier Spieler): zuschauen oder gehen. */
  private showOut(): void {
    sound.play('lose');
    const host = this.driver.kind === 'host';
    const el = this.openDialog(`<h2>Ihr seid ausgeschieden</h2>
      <p>Euer Dorfzentrum ist gefallen. Die übrigen Parteien spielen weiter – ihr könnt der Partie zuschauen (die ganze Karte ist jetzt aufgedeckt).</p>
      ${host ? '<p class="note"><b>Als Host bitte die Seite offen lassen:</b> Euer Browser berechnet die Partie für alle. Verlasst ihr sie, endet sie für die anderen.</p>' : ''}
      <div class="btns"><button class="btn primary" data-a="watch">Zuschauen</button><button class="btn" data-a="exit">Zum Hauptmenü</button></div>`, false);
    el.querySelector('[data-a=watch]')!.addEventListener('click', () => this.closeDialog());
    el.querySelector('[data-a=exit]')!.addEventListener('click', () => {
      if (!host || confirm('Die Partie endet damit für alle Mitspieler. Wirklich verlassen?')) this.opts.onExit();
    });
  }

  private showEnd(): void {
    this.ended = true;
    this.opts.onFinished?.();
    const c = this.client;
    const won = c.winner === c.me;
    sound.play(won ? 'win' : 'lose');
    const rows = c.players.map((p) => `<tr><td><span class="swatch" style="background:${playerColor(c, p.id)}"></span> ${p.name}</td><td>${p.prestige} Prestige</td><td>${p.defeated ? 'besiegt' : p.id === c.winner ? 'Sieger' : ''}</td></tr>`).join('');
    const secs = Math.floor(c.tick / RULES.tickRate);
    const el = this.openDialog(`<h2>${won ? 'Sieg!' : 'Niederlage'}</h2>
      <p>${c.winReason}.</p><p class="note">Spieldauer ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} min</p>
      <table>${rows}</table>
      <div class="btns"><button class="btn" data-a="watch">Karte ansehen</button><button class="btn primary" data-a="exit">Zum Hauptmenü</button></div>`, false);
    el.querySelector('[data-a=watch]')!.addEventListener('click', () => this.dialogEl.classList.add('hidden'));
    el.querySelector('[data-a=exit]')!.addEventListener('click', () => this.opts.onExit());
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export { UNITS };
