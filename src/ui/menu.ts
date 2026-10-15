// Menüs: Hauptmenü, Einzelspiel, Mehrspieler (manueller Code-Austausch + Lobby), Einstellungen, Texte.
import { sound } from '../audio/sound';
import { RULES } from '../data/defs';
import { ClientState } from '../game/client';
import { GuestDriver, HostDriver, LocalDriver } from '../game/drivers';
import { Game } from '../game/game';
import { PeerLink } from '../net/peer';
import { PROTOCOL_VERSION, parseGuestMsg, parseHostMsg, seated, type HostMsg, type LobbyPlayer, type LobbyState } from '../net/protocol';
import { Room, RoomError, cleanCode, formatCode } from '../net/rooms';
import { SignalError } from '../net/signal';
import { createRenderer } from '../render/factory';
import { getArtStyle, setArtStyle } from '../render/artstyles';
import type { BaseRenderer } from '../render/view';
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, portrait } from '../render/sprites';
import { FACTIONS, FACTION_DEFS, type FactionId } from '../data/factions';
import { MAP_IDS, MAP_INFO, REAL_MAP_IDS, generateMap, type MapId } from '../sim/map';
import { World } from '../sim/world';
import { AI } from '../ai/ai';
import { clearAutosave, loadSettings, readAutosave, readSave, saveSettings, writeAutosave, writeSave, type SaveGame, type Settings } from '../storage/save';
import { BACKGROUND_HTML, GUIDE_HTML, NETWORK_HTML } from './texts';

const names4 = new Map<MapId, string[]>();
/** Namen der Startplätze; bei drei oder vier Spielern vier Plätze (Namen der großen Karte, einmal erzeugt). */
const slotNames = (m: MapId, players = 2): string[] => {
  if (m === 'random') return players > 2 ? ['Platz 1', 'Platz 2', 'Platz 3', 'Platz 4'] : ['Startplatz A', 'Startplatz B'];
  const two = [`${MAP_INFO[m].slotNames[0]} (Norden)`, `${MAP_INFO[m].slotNames[1]} (Süden)`];
  if (players <= 2) return two;
  if (!names4.has(m)) names4.set(m, generateMap(1, m, 4).slots.map((s) => s.name));
  const n = names4.get(m)!;
  return [two[0], two[1], n[2], n[3]];
};
const goalOptions = (sel: number) =>
  RULES.prestigeGoals.map((g) => `<option value="${g}" ${g === sel ? 'selected' : ''}>${g ? `${g}${g < RULES.prestigeGoalDefault ? ' (kurz)' : g > RULES.prestigeGoalDefault ? ' (lang)' : ''}` : 'aus – nur militärischer Sieg'}</option>`).join('');
const autoLabel = (w: World) => {
  const secs = Math.floor(w.tick / RULES.tickRate);
  const me = w.players[0];
  return `${MAP_INFO[w.opts.mapId ?? 'schlei'].name} · ${FACTION_DEFS[me.faction].name} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} min`;
};
const randomMap = (): MapId => REAL_MAP_IDS[Math.floor(Math.random() * REAL_MAP_IDS.length)];
// erfundene Namen der KI-Anführer
const AI_NAMES: Record<FactionId, string> = {
  angeln: 'Bauernvogt Hinrich Petersen',
  schwansen: 'Junker von Schwansenhorst',
  friesen: 'Ratmann Boy Ketelsen',
  daenen: 'Amtmann Jens Kongsholm',
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Menu {
  private root = document.getElementById('screen-menu')!;
  private settings: Settings = loadSettings();
  private game: Game | null = null;
  private link: PeerLink | null = null;
  /** Lobby sauber verlassen (Verbindungen schließen, Spielcode freigeben) */
  private lobbyCleanup: (() => void) | null = null;
  private bg: { r: BaseRenderer | null; raf: number; alive: boolean } | null = null;

  start(): void {
    setArtStyle(this.settings.artStyle);
    // Einladungslink: ?spiel=CODE öffnet direkt „Mit Spielcode beitreten“
    const code = new URLSearchParams(location.search).get('spiel');
    if (code) {
      history.replaceState(null, '', location.pathname);
      this.joinScreen(formatCode(cleanCode(code)));
    } else this.main();
  }

  // ---------------------------------------------------------------- Hintergrundbild aus echten Spielgrafiken
  private startBackdrop(): void {
    if (this.bg) return;
    const cv = document.createElement('canvas');
    cv.id = 'menu-bg';
    this.root.prepend(cv);
    const c = new ClientState(4711, 0, randomMap());
    c.vis.fill(2);
    c.visVersion++;
    const sl = c.map.slots[0];
    const fake = (i: number, t: Parameters<typeof c.buildings.set>[1]['t'], x: number, y: number, o = 0) =>
      c.buildings.set(i, { i, k: 1, t, o, x, y, h: 1, m: 1, b: 1, p: 100, ac: 1 });
    const fac = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
    c.players = [{ id: 0, name: '', color: FACTIONS.indexOf(fac), faction: fac, prestige: 0, defeated: false, age: 1 }];
    fake(1, 'dorfzentrum', sl.x, sl.y);
    fake(2, 'muehle', sl.x - 4, sl.y + 1);
    fake(3, 'wohnhaus', sl.x + 4, sl.y - 1);
    fake(4, 'wohnhaus', sl.x + 1, sl.y - 4);
    fake(5, 'bauernhof', sl.x - 4, sl.y + 5);
    fake(6, 'raeucherei', sl.x + 4, sl.y + 3);
    const bg: { r: BaseRenderer | null; raf: number; alive: boolean } = { r: null, raf: 0, alive: true };
    this.bg = bg;
    void createRenderer(cv, c, this.settings.renderer).then((r) => {
      if (!bg.alive) return r.destroy();
      bg.r = r;
      const resize = () => bg.alive && r.resize(window.innerWidth, window.innerHeight);
      resize();
      window.addEventListener('resize', resize);
      r.cam.z = 1.2;
      const t0 = performance.now();
      let last = 0;
      const loop = (t: number) => {
        if (!bg.alive) return;
        bg.raf = requestAnimationFrame(loop);
        // langsamer Schwenk: 12 Bilder/s genügen und lassen Rechenzeit für Verbindungsaufbau und Lobby
        if (t - last < 80) return;
        last = t;
        const k = (t - t0) / 1000;
        r.centerOn(sl.x + 1.5 + Math.sin(k * 0.05) * 4, sl.y + 2.5 + Math.cos(k * 0.04) * 3);
        r.frame(t, { selected: new Set(), placement: null, drag: null, hover: 0 });
      };
      bg.raf = requestAnimationFrame(loop);
    });
  }
  private stopBackdrop(): void {
    if (!this.bg) return;
    cancelAnimationFrame(this.bg.raf);
    this.bg.alive = false;
    this.bg.r?.destroy();
    this.bg = null;
    document.getElementById('menu-bg')?.remove();
  }

  private show(html: string, wide = false): HTMLElement {
    this.root.classList.remove('hidden');
    this.startBackdrop();
    let box = this.root.querySelector<HTMLElement>('.menu-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'menu-box panel';
      this.root.appendChild(box);
    }
    box.classList.toggle('wide', wide);
    box.innerHTML = html;
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sound.unlock()));
    return box;
  }

  private bind(box: HTMLElement, map: Record<string, () => void>): void {
    for (const [k, fn] of Object.entries(map)) box.querySelector(`[data-a="${k}"]`)?.addEventListener('click', fn);
  }

  // ---------------------------------------------------------------- Hauptmenü
  main(): void {
    this.settings = loadSettings();
    setArtStyle(this.settings.artStyle);
    this.closeLink();
    const save = readSave();
    const auto = readAutosave();
    const box = this.show(`
      <h1>Angeln</h1><div class="sub">Fürsten der Schlei · Echtzeit-Strategie um 1600</div>
      <div class="menu-col">
        ${auto ? `<button class="btn primary" data-a="resume">Letzte Partie fortsetzen</button>
        <div class="note" style="text-align:center;margin:-2px 0 4px">${esc(auto.label ?? '')} · gesichert ${new Date(auto.savedAt).toLocaleString('de-DE')}${auto.mp ? '<br>Mehrspieler: wird gegen die KI fortgesetzt' : ''}</div>` : ''}
        <button class="btn ${auto ? '' : 'primary'}" data-a="sp">Einzelspiel gegen die KI</button>
        <button class="btn" data-a="load" ${save ? '' : 'disabled'}>Spielstand laden${save ? ` (${new Date(save.savedAt).toLocaleString('de-DE')})` : ''}</button>
        <button class="btn" data-a="host">Mehrspieler: Spiel erstellen</button>
        <button class="btn" data-a="join">Mehrspieler: Mit Spielcode beitreten</button>
        <button class="btn" data-a="guide">Spielanleitung</button>
        <button class="btn" data-a="bg">Hintergrund &amp; Quellen</button>
        <button class="btn" data-a="settings">Einstellungen &amp; Netzwerk</button>
      </div>
      <p class="note" style="text-align:center;margin-top:12px">Alle Grafiken und Klänge werden im Browser erzeugt · bis zu vier Spieler</p>`);
    this.bind(box, {
      resume: () => this.resumeAuto(),
      sp: () => this.singleSetup(),
      load: () => this.loadGame(),
      host: () => this.hostScreen(),
      join: () => this.joinScreen(),
      guide: () => this.textScreen(GUIDE_HTML),
      bg: () => this.textScreen(BACKGROUND_HTML),
      settings: () => this.settingsScreen(),
    });
  }

  private textScreen(html: string): void {
    const box = this.show(`${html}<div class="row"><button class="btn" data-a="back">Zurück</button></div>`);
    this.bind(box, { back: () => this.main() });
  }

  private factionOptions(sel: FactionId | null, short = false): string {
    return FACTIONS.map((x) => `<option value="${x}" ${x === sel ? 'selected' : ''}>${FACTION_DEFS[x].name}${short ? '' : ` – ${FACTION_DEFS[x].focus}`}</option>`).join('');
  }

  /** Infotafel: Dorfzentrum, Spezialeinheit, Motto, Boni. */
  factionInfo(fac: FactionId, color: number): string {
    const d = FACTION_DEFS[fac];
    const col = PLAYER_COLORS[color % PLAYER_COLORS.length];
    return `<div class="faction-card"><img src="${portrait('b', 'dorfzentrum', col, fac)}" alt=""><img src="${portrait('u', d.unique, col, fac)}" alt="">
      <div><b>${d.name}</b> <i>${esc(d.motto)}</i><br><span class="note">${esc(d.desc)}</span>
      <ul>${d.bonuses.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></div></div>`;
  }

  private mapOptions(sel: MapId | 'zufall', allowRandom: boolean): string {
    const opts = MAP_IDS.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${MAP_INFO[m].name} (${MAP_INFO[m].region})</option>`).join('');
    return (allowRandom ? `<option value="zufall" ${sel === 'zufall' ? 'selected' : ''}>eine der festen Karten (zufällig)</option>` : '') + opts;
  }

  /** Kurzbeschreibung einer Karte samt gekennzeichneter Freiheiten. */
  mapInfo(m: MapId | 'zufall'): string {
    if (m === 'zufall') return '<div class="map-card note">Eine der sechs Karten zwischen Rendsburg und Esbjerg wird zufällig gewählt.</div>';
    const d = MAP_INFO[m];
    return `<div class="map-card"><b>${d.name}</b> – ${esc(d.region)}<br><span class="note">${esc(d.desc)}</span>
      <br><span class="note"><i>Freiheiten:</i> ${esc(d.liberties)}</span></div>`;
  }

  private colorOptions(sel: number): string {
    return PLAYER_COLORS.map((c, i) => `<option value="${i}" ${i === sel ? 'selected' : ''} style="background:${c}">${PLAYER_COLOR_NAMES[i]}</option>`).join('');
  }

  // ---------------------------------------------------------------- Einzelspiel
  private singleSetup(): void {
    const s = this.settings;
    const box = this.show(`<h2>Einzelspiel</h2>
      <div class="row"><label>Euer Name</label><input type="text" data-f="name" maxlength="20" value="${esc(s.name)}"></div>
      <div class="row"><label>Eure Partei</label><select data-f="fac">${this.factionOptions(s.faction)}</select></div>
      <div data-info></div>
      <div class="row"><label>Farbe</label><select data-f="color">${this.colorOptions(0)}</select></div>
      <div class="row"><label>Karte</label><select data-f="map">${this.mapOptions(s.map, true)}</select></div>
      <div data-mapinfo></div>
      <div class="row"><label>Startort</label><select data-f="slot"></select></div>
      <div class="row"><label>KI-Gegner</label><select data-f="n"><option value="1" selected>1 Gegner</option><option value="2">2 Gegner (große Karte)</option><option value="3">3 Gegner (große Karte)</option></select>
        <select data-f="ai"><option value="leicht">leicht (zum Kennenlernen)</option><option value="normal" selected>normal</option></select>
        <select data-f="aifac"><option value="zufall">zufällige Partei</option>${this.factionOptions(null)}</select></div>
      <div class="row"><label>Prestigeziel</label><select data-f="goal">${goalOptions(RULES.prestigeGoalDefault)}</select></div>
      <div class="row"><label>Startrohstoffe</label><select data-f="rich"><option value="0">normal</option><option value="1">reichlich</option></select></div>
      <div class="row"><label>Lehrmeister</label><select data-f="tut"><option value="1" ${s.tutorialDone ? '' : 'selected'}>an</option><option value="0" ${s.tutorialDone ? 'selected' : ''}>aus</option></select></div>
      <div class="row"><button class="btn primary" data-a="go">Partie beginnen</button><button class="btn" data-a="back">Zurück</button></div>`);
    const f = (k: string) => box.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-f="${k}"]`)!.value;
    const info = () => (box.querySelector('[data-info]')!.innerHTML = this.factionInfo(f('fac') as FactionId, Number(f('color'))));
    box.querySelector('[data-f=fac]')!.addEventListener('change', info);
    box.querySelector('[data-f=color]')!.addEventListener('change', info);
    info();
    const mapInfo = () => {
      const m = f('map') as MapId | 'zufall';
      box.querySelector('[data-mapinfo]')!.innerHTML = this.mapInfo(m);
      const sel = box.querySelector<HTMLSelectElement>('[data-f=slot]')!;
      const cur = sel.value || '0';
      const n = Number(f('n')) + 1;
      const names = m === 'zufall' ? (n > 2 ? ['Platz 1', 'Platz 2', 'Platz 3', 'Platz 4'] : ['Norden', 'Süden']) : slotNames(m, n);
      sel.innerHTML = names.map((n, k) => `<option value="${k}" ${String(k) === cur ? 'selected' : ''}>${n}</option>`).join('');
    };
    box.querySelector('[data-f=map]')!.addEventListener('change', mapInfo);
    box.querySelector('[data-f=n]')!.addEventListener('change', mapInfo);
    mapInfo();
    this.bind(box, {
      back: () => this.main(),
      go: () => {
        const name = f('name').trim().slice(0, 20) || 'Spieler';
        this.settings.name = name;
        this.settings.tutorialDone = true;
        saveSettings(this.settings);
        const color = Number(f('color'));
        const slot = Number(f('slot'));
        const nAI = Number(f('n'));
        const faction = f('fac') as FactionId;
        this.settings.faction = faction;
        const mapSel = f('map') as MapId | 'zufall';
        this.settings.map = mapSel;
        saveSettings(this.settings);
        const mapId = mapSel === 'zufall' ? randomMap() : mapSel;
        // Gegner: Parteien dürfen sich wiederholen; Farben und Startplätze werden reihum vergeben
        const nSlots = nAI > 1 ? 4 : 2;
        const freeColors = [0, 1, 2, 3].filter((c) => c !== color);
        const freeSlots = Array.from({ length: nSlots }, (_, k) => k).filter((k) => k !== slot);
        // bei drei Spielern: den gegenüberliegenden Platz zuerst vergeben
        freeSlots.sort((a, b) => Number(a !== (slot ^ 1)) - Number(b !== (slot ^ 1)));
        const others = FACTIONS.filter((x) => x !== faction);
        const used: FactionId[] = [];
        const ais = Array.from({ length: nAI }, (_, k) => {
          const pool = k === 0 ? others : FACTIONS;
          const aiFac: FactionId = f('aifac') === 'zufall' ? pool[Math.floor(Math.random() * pool.length)] : (f('aifac') as FactionId);
          const dup = used.filter((x) => x === aiFac).length;
          used.push(aiFac);
          return { name: AI_NAMES[aiFac] + (dup ? ` der ${['Jüngere', 'Dritte', 'Vierte'][dup - 1] ?? ''}` : ''), color: freeColors[k], slot: freeSlots[k], isAI: true, aiLevel: f('ai') as 'leicht' | 'normal', faction: aiFac };
        });
        const world = new World({
          seed: (Math.random() * 2 ** 31) | 0,
          mapId,
          players: [{ name, color, slot, isAI: false, faction }, ...ais],
          prestigeGoal: Number(f('goal')),
          richStart: f('rich') === '1',
        });
        this.launchLocal(world, f('tut') === '1');
      },
    });
  }

  private launchLocal(world: World, tutorial: boolean, aiStates?: import('../ai/ai').AIState[]): void {
    const driver = new LocalDriver(world, 0, aiStates);
    const snap = (): SaveGame => ({ v: 1, savedAt: Date.now(), me: 0, world: world.serialize(), ais: driver.ais.map((a) => a.s), tutorial });
    this.enterGame(
      () => Game.create(driver, {
        tutorial,
        hints: this.settings.hints,
        onExit: () => this.exitGame(),
        onSave: () => writeSave(snap()),
        autosave: () => writeAutosave({ ...snap(), label: autoLabel(world) }),
        onFinished: () => clearAutosave(),
      }, this.settings.renderer),
    );
  }

  /** Automatisch gesicherte Partie fortsetzen; eine Mehrspielerpartie läuft gegen die KI weiter. */
  private resumeAuto(): void {
    const s = readAutosave();
    if (!s) return this.main();
    try {
      const w = World.deserialize(s.world);
      let ais = s.ais;
      if (s.mp) {
        ais = [...ais];
        for (const p of w.players)
          if (p.id !== 0 && !p.isAI) {
            p.isAI = true;
            p.aiLevel = 'normal';
            p.name = `${p.name} (KI)`;
            if (!ais.some((a) => a.p === p.id)) ais.push(new AI(p.id, 'normal').s);
          }
      }
      this.launchLocal(w, s.tutorial, ais);
    } catch (e) {
      clearAutosave();
      alert('Die gesicherte Partie konnte nicht geladen werden: ' + (e as Error).message);
      this.main();
    }
  }

  private loadGame(): void {
    const s = readSave();
    if (!s) return;
    try {
      const w = World.deserialize(s.world);
      this.launchLocal(w, s.tutorial, s.ais);
    } catch (e) {
      alert('Spielstand konnte nicht geladen werden: ' + (e as Error).message);
    }
  }

  private enterGame(make: () => Promise<Game>): void {
    this.stopBackdrop();
    this.root.classList.add('hidden');
    void make().then(
      (g) => {
        this.game = g;
        (window as unknown as { __game: Game }).__game = g;
      },
      (e) => {
        alert('Die Partie konnte nicht gestartet werden: ' + (e as Error).message);
        this.main();
      },
    );
  }

  private exitGame(): void {
    this.game?.destroy();
    this.game = null;
    this.link = null;
    this.main();
  }

  // ---------------------------------------------------------------- Einstellungen
  private artPreview(): string {
    const original = getArtStyle();
    try {
      return (['realistic', 'cartoon'] as const).map((style) => {
        setArtStyle(style);
        const building = portrait('b', 'wohnhaus', PLAYER_COLORS[0], 'angeln');
        const worker = portrait('u', 'arbeiter', PLAYER_COLORS[0], 'angeln');
        const name = style === 'realistic' ? 'Historisch' : 'Cartoon';
        const hint = style === 'realistic' ? 'Feine Materialien & natürliche Proportionen' : 'Runde Formen & klare Farbakzente';
        return '<button class="art-preview" type="button" data-art="' + style + '" aria-pressed="' +
          (this.settings.artStyle === style) + '"><span class="art-images"><img src="' + building + '" alt="Wohnhaus ' +
          name + '"><img src="' + worker + '" alt="Dorfbewohner ' + name + '"></span><strong>' +
          name + '</strong><small>' + hint + '</small></button>';
      }).join('');
    } finally {
      setArtStyle(original);
    }
  }

  private settingsScreen(): void {
    const ice = this.settings.ice;
    const previews = this.artPreview();
    const box = this.show(`<h2>Einstellungen &amp; Netzwerk</h2>
      <div class="row"><label>Spielername</label><input type="text" data-f="name" maxlength="20" value="${esc(this.settings.name)}"></div>
      <div class="row"><label>Grafikstil</label><select data-f="artStyle"><option value="realistic" ${this.settings.artStyle === 'realistic' ? 'selected' : ''}>Historisch · atmosphärisch</option><option value="cartoon" ${this.settings.artStyle === 'cartoon' ? 'selected' : ''}>Cartoon · farbenfroh</option></select></div>
      <div class="art-preview-grid" aria-label="Grafikvorschau">${previews}</div>
      <p class="note">Die Vorschau zeigt dieselben Einheiten und Gebäude mit unterschiedlichen Materialien und Formen. Die Spielregeln bleiben gleich.</p>
      <div class="row"><label>Grafiktechnik</label><select data-f="renderer"><option value="auto" ${this.settings.renderer === 'auto' ? 'selected' : ''}>WebGL (PixiJS) – empfohlen</option><option value="canvas" ${this.settings.renderer === 'canvas' ? 'selected' : ''}>Canvas 2D (Rückfall für alte Grafiktreiber)</option></select></div>
      <div class="row"><label>Geländehinweise</label><label style="min-width:0"><input type="checkbox" data-f="hints" ${this.settings.hints ? 'checked' : ''}> kurzer Text beim Verweilen mit der Maus</label></div>
      <h3>Verbindungshilfen (ICE)</h3>
      <div class="row"><label><input type="radio" name="ice" value="stun" ${ice.mode === 'stun' ? 'checked' : ''}> STUN verwenden</label>
        <input type="text" data-f="stun" size="34" value="${esc(ice.stunUrl)}"></div>
      <div class="row"><label><input type="radio" name="ice" value="none" ${ice.mode === 'none' ? 'checked' : ''}> ohne ICE-Dienste</label>
        <span class="note">nur gleiches Gerät / gleiches lokales Netz</span></div>
      <div class="row"><label>Eigener TURN (optional)</label><input type="text" data-f="turn" size="34" placeholder="turn:mein-server.example:3478" value="${esc(ice.turnUrl)}"></div>
      <div class="row"><label>TURN Benutzer/Passwort</label><input type="text" data-f="tu" size="14" value="${esc(ice.turnUser)}"><input type="text" data-f="tp" size="14" value="${esc(ice.turnPass)}"></div>
      ${NETWORK_HTML}
      <div class="row"><button class="btn primary" data-a="save">Speichern</button><button class="btn" data-a="back">Zurück</button><span data-msg class="ok"></span></div>`);
    const artSelect = box.querySelector<HTMLSelectElement>('[data-f=artStyle]')!;
    const refreshArt = () => box.querySelectorAll<HTMLButtonElement>('[data-art]').forEach((btn) =>
      btn.setAttribute('aria-pressed', String(btn.dataset.art === artSelect.value)));
    box.querySelectorAll<HTMLButtonElement>('[data-art]').forEach((btn) => btn.addEventListener('click', () => {
      artSelect.value = btn.dataset.art!;
      refreshArt();
    }));
    artSelect.addEventListener('change', refreshArt);
    const v = (k: string) => box.querySelector<HTMLInputElement>(`[data-f="${k}"]`)!.value.trim();
    this.bind(box, {
      back: () => this.main(),
      save: () => {
        const mode = (box.querySelector<HTMLInputElement>('input[name=ice]:checked')?.value ?? 'stun') as 'stun' | 'none';
        const stun = v('stun');
        const turn = v('turn');
        const msg = box.querySelector('[data-msg]')!;
        if (mode === 'stun' && !/^stuns?:\S+$/.test(stun)) {
          msg.className = 'err';
          msg.textContent = 'STUN-Adresse muss mit „stun:“ beginnen.';
          return;
        }
        if (turn && !/^turns?:\S+$/.test(turn)) {
          msg.className = 'err';
          msg.textContent = 'TURN-Adresse muss mit „turn:“ beginnen.';
          return;
        }
        this.settings.name = v('name').slice(0, 20) || 'Spieler';
        this.settings.renderer = box.querySelector<HTMLSelectElement>('[data-f=renderer]')!.value === 'canvas' ? 'canvas' : 'auto';
        this.settings.artStyle = box.querySelector<HTMLSelectElement>('[data-f=artStyle]')!.value === 'cartoon' ? 'cartoon' : 'realistic';
        this.settings.hints = box.querySelector<HTMLInputElement>('[data-f=hints]')!.checked;
        this.settings.ice = { mode, stunUrl: stun, turnUrl: turn, turnUser: v('tu'), turnPass: v('tp') };
        saveSettings(this.settings);
        if (getArtStyle() !== this.settings.artStyle) {
          setArtStyle(this.settings.artStyle);
          this.stopBackdrop();
          this.startBackdrop();
        }
        msg.className = 'ok';
        msg.textContent = 'Gespeichert. Der gewählte Grafikstil ist aktiv.';
      },
    });
  }

  private iceSummary(): string {
    const i = this.settings.ice;
    return i.mode === 'stun' ? `STUN: ${esc(i.stunUrl)}${i.turnUrl ? ' · eigener TURN' : ' · kein TURN'}` : `ohne ICE-Dienste (nur lokales Netz)${i.turnUrl ? ' · eigener TURN' : ''}`;
  }

  /** Hinweis, wenn nur lokale Verbindungswege gefunden wurden. */
  private reachNote(link: PeerLink): string {
    const t = link.candidateTypes;
    if (t.has('srflx') || t.has('relay')) return '';
    return this.settings.ice.mode === 'stun'
      ? ' Hinweis: Der STUN-Dienst war nicht erreichbar – vermutlich klappt die Verbindung nur im selben lokalen Netz.'
      : ' Hinweis: ohne ICE-Dienste – nur im selben lokalen Netz bzw. auf demselben Gerät.';
  }

  private closeLink(): void {
    if (this.link) {
      this.link.send({ t: 'bye', reason: 'Der Mitspieler hat abgebrochen.' });
      const l = this.link;
      window.setTimeout(() => l.close(), 200);
      this.link = null;
    }
  }

  // ---------------------------------------------------------------- Mehrspieler: Spiel erstellen (Spielcode)
  private hostScreen(): void {
    this.closeLink();
    const box = this.show(`<h2>Mehrspieler: Spiel erstellen</h2>
      <p class="note">Ihr erhaltet einen kurzen <b>Spielcode</b>. Eure Mitspieler (bis zu drei) wählen „Mit Spielcode beitreten“
      und geben ihn ein – mehr ist nicht nötig. Freie Plätze könnt ihr mit der KI besetzen.</p>
      <div class="row"><label>Euer Name</label><input type="text" data-f="name" maxlength="20" value="${esc(this.settings.name)}"></div>
      <div class="row"><button class="btn primary" data-a="make">Spiel eröffnen</button><span data-st class="note"></span></div>
      <div class="row"><span data-msg></span></div>
      <div class="row"><button class="btn" data-a="back">Zurück</button><button class="btn" data-a="manual">Ohne Server: Codes manuell austauschen</button></div>`);
    const msg = box.querySelector<HTMLElement>('[data-msg]')!;
    this.bind(box, {
      back: () => this.main(),
      manual: () => this.hostManualScreen(),
      make: async () => {
        const name = this.saveName(box);
        msg.className = 'note';
        msg.textContent = 'Eröffne das Spiel …';
        try {
          const room = await Room.create(name);
          this.hostLobby({ room, name });
        } catch (e) {
          msg.className = 'err';
          msg.textContent = `${(e as Error).message} Alternativ: „Ohne Server: Codes manuell austauschen“.`;
        }
      },
    });
  }

  private saveName(box: HTMLElement): string {
    const name = box.querySelector<HTMLInputElement>('[data-f=name]')!.value.trim().slice(0, 20) || 'Spieler';
    this.settings.name = name;
    saveSettings(this.settings);
    return name;
  }

  // ---------------------------------------------------------------- Mehrspieler: Beitreten (Spielcode)
  private joinScreen(prefill = ''): void {
    this.closeLink();
    const box = this.show(`<h2>Mehrspieler: Mit Spielcode beitreten</h2>
      <p class="note">Gebt den Spielcode ein, den der Host euch genannt hat (z. B. <b>K7M-2QX</b>).</p>
      <div class="row"><label>Euer Name</label><input type="text" data-f="name" maxlength="20" value="${esc(this.settings.name)}"></div>
      <div class="row"><label>Spielcode</label><input type="text" data-f="code" class="code-input" maxlength="9" autocomplete="off" spellcheck="false" placeholder="ABC-123" value="${esc(prefill)}"></div>
      <div class="row"><button class="btn primary" data-a="join">Beitreten</button><span data-st class="note"></span></div>
      <div class="row"><span data-msg></span></div>
      <div class="row"><button class="btn" data-a="back">Zurück</button><button class="btn" data-a="manual">Ohne Server: Einladungscode einfügen</button></div>`);
    const st = box.querySelector<HTMLElement>('[data-st]')!;
    const msg = box.querySelector<HTMLElement>('[data-msg]')!;
    const setMsg = (t: string, cls = 'err') => {
      msg.className = cls;
      msg.textContent = t;
    };
    const codeEl = box.querySelector<HTMLInputElement>('[data-f=code]')!;
    codeEl.addEventListener('input', () => {
      const c = cleanCode(codeEl.value);
      const f = c.length > 3 ? `${c.slice(0, 3)}-${c.slice(3, 6)}` : c;
      if (f !== codeEl.value) codeEl.value = f;
    });
    codeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') box.querySelector<HTMLButtonElement>('[data-a=join]')!.click();
    });
    let busy = false;
    let room: Room | null = null;
    this.bind(box, {
      back: () => {
        room?.close();
        this.main();
      },
      manual: () => {
        room?.close();
        this.joinManualScreen();
      },
      join: async () => {
        if (busy) return;
        busy = true;
        setMsg('');
        const name = this.saveName(box);
        let done = false;
        /** Ein Verbindungsversuch. Kein automatischer zweiter Versuch: Der Host könnte ihn nicht vom ersten unterscheiden. */
        const attempt = async (): Promise<void> => {
          room?.close();
          this.closeLink();
          st.textContent = 'Suche das Spiel …';
          const r = await Room.join(codeEl.value, name);
          room = r;
          st.textContent = `Spiel von „${r.hostName || 'Host'}“ gefunden – baue die Verbindung auf …`;
          // Geduld bei langsamen Rechnern/Netzen: nach 20 s ein Hinweis, nach 60 s eine Fehlermeldung (erneut „Beitreten“ möglich)
          let timer = 0;
          const slow = window.setTimeout(() => {
            if (!done && room === r) setMsg('Der Aufbau dauert ungewöhnlich lange – bitte noch einen Moment warten …', 'note');
          }, 20000);
          const arm = (ms: number) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
              if (done || room !== r) return;
              window.clearTimeout(slow);
              st.textContent = '';
              setMsg('Die Verbindung zum Host kam nicht zustande. Ist sein Spiel noch geöffnet? Mit „Beitreten“ erneut versuchen; bei strengen Firewalls hilft ein TURN-Server (Einstellungen).');
              r.close();
              this.closeLink();
            }, ms);
          };
          arm(60000);
          r.onEvent = async (ev) => {
            if (room !== r) return;
            if (ev.t === 'closed') {
              window.clearTimeout(timer);
              st.textContent = '';
              setMsg(ev.reason);
            } else if (ev.t === 'msg' && ev.from === 0) {
              if (ev.data.startsWith('{')) {
                // Fehlermeldung des Hosts (z. B. Spiel voll)
                window.clearTimeout(timer);
                try {
                  setMsg(String((JSON.parse(ev.data) as { err?: string }).err ?? 'Abgelehnt.'));
                } catch {
                  setMsg('Abgelehnt.');
                }
                r.close();
                return;
              }
              try {
                st.textContent = 'Verbindungsangebot erhalten – antworte …';
                const { link, code } = await PeerLink.join(this.settings.ice, ev.data, name);
                if (room !== r) return link.close();
                this.link = link;
                // Ereignisse vor dem Absenden der Antwort festlegen: die Verbindung kann sofort aufgehen
                link.onClose = (reason) => {
                  if (this.link === link && !done) setMsg(reason);
                };
                link.onOpen = () => {
                  window.clearTimeout(timer);
                  window.clearTimeout(slow);
                  r.stopListening();
                  done = true;
                  if (this.link === link) this.guestLobby(link, name);
                };
                await r.send(0, code);
                if (link.state !== 'open') st.textContent = 'Antwort gesendet – warte auf die direkte Verbindung …';
              } catch (e) {
                setMsg(e instanceof SignalError || e instanceof RoomError ? e.message : `Verbindungsfehler: ${(e as Error).message}`);
              }
            }
          };
          r.listen();
        };
        try {
          await attempt();
        } catch (e) {
          st.textContent = '';
          setMsg((e as Error).message);
        } finally {
          busy = false;
        }
      },
    });
    if (prefill) codeEl.focus();
  }

  // ---------------------------------------------------------------- Mehrspieler: manueller Code-Austausch (ohne Server)
  private hostManualScreen(): void {
    this.closeLink();
    const box = this.show(`<h2>Spiel erstellen (manueller Code-Austausch)</h2>
      <p class="note">Für Server ohne Spielcode-Vermittlung, für einen Mitspieler. Schritt 1: Einladung erzeugen und den Code
      (z. B. per Messenger) schicken. Schritt 2: Seinen Antwortcode hier einfügen. Netzwerk: ${this.iceSummary()} – <a href="#" data-a="settings">ändern</a></p>
      <div class="row"><label>Euer Name</label><input type="text" data-f="name" maxlength="20" value="${esc(this.settings.name)}"></div>
      <div class="row"><button class="btn primary" data-a="make">Einladung erzeugen</button><span data-st class="note"></span></div>
      <div data-step2 class="hidden">
        <div class="row"><label>Einladungscode</label><button class="btn" data-a="copy">Kopieren</button></div>
        <textarea class="code-box" data-f="offer" readonly></textarea>
        <div class="row"><label>Antwortcode einfügen</label></div>
        <textarea class="code-box" data-f="answer" placeholder="ANGELN-ANTWORT-…"></textarea>
        <div class="row"><button class="btn primary" data-a="connect">Verbinden</button><button class="btn" data-a="make2">Neue Einladung</button></div>
      </div>
      <div class="row"><span data-msg></span></div>
      <div class="row"><button class="btn" data-a="back">Abbrechen</button></div>
      ${NETWORK_HTML}`);
    const st = box.querySelector<HTMLElement>('[data-st]')!;
    const msg = box.querySelector<HTMLElement>('[data-msg]')!;
    const setMsg = (t: string, cls = 'err') => {
      msg.className = cls;
      msg.textContent = t;
    };
    const make = async () => {
      this.closeLink();
      setMsg('');
      const name = this.saveName(box);
      st.textContent = 'Sammle Verbindungswege (ICE) … das dauert einige Sekunden.';
      box.querySelector('[data-step2]')!.classList.add('hidden');
      try {
        const { link, code } = await PeerLink.host(this.settings.ice, name);
        this.link = link;
        box.querySelector<HTMLTextAreaElement>('[data-f=offer]')!.value = code;
        box.querySelector('[data-step2]')!.classList.remove('hidden');
        st.textContent = `Einladung bereit (${code.length} Zeichen, Wege: ${[...link.candidateTypes].join(', ') || '–'}). Wartet auf Antwortcode …${this.reachNote(link)}`;
        link.onClose = (reason) => {
          if (this.link === link) setMsg(reason);
        };
        link.onOpen = () => {
          if (this.link === link) this.hostLobby({ name, manualLink: link });
        };
      } catch (e) {
        st.textContent = '';
        setMsg(e instanceof SignalError ? e.message : `WebRTC konnte nicht gestartet werden: ${(e as Error).message}`);
      }
    };
    this.bind(box, {
      back: () => this.main(),
      settings: () => this.settingsScreen(),
      make: () => void make(),
      make2: () => void make(),
      copy: () => {
        const ta = box.querySelector<HTMLTextAreaElement>('[data-f=offer]')!;
        ta.select();
        void navigator.clipboard?.writeText(ta.value).then(
          () => setMsg('Einladungscode kopiert.', 'ok'),
          () => setMsg('Bitte den markierten Code manuell kopieren (Strg+C).', 'note'),
        );
      },
      connect: async () => {
        if (!this.link) return setMsg('Bitte zuerst eine Einladung erzeugen.');
        const code = box.querySelector<HTMLTextAreaElement>('[data-f=answer]')!.value;
        try {
          const ans = await this.link.acceptAnswer(code);
          setMsg(`Antwort von „${esc(ans.name ?? 'Gast')}“ angenommen – baue Verbindung auf …`, 'ok');
        } catch (e) {
          setMsg(e instanceof SignalError ? e.message : `Fehler: ${(e as Error).message}`);
        }
      },
    });
    box.querySelector('[data-a=settings]')?.addEventListener('click', (e) => e.preventDefault());
  }

  private joinManualScreen(): void {
    this.closeLink();
    const box = this.show(`<h2>Spiel beitreten (manueller Code-Austausch)</h2>
      <p class="note">Schritt 1: Den Einladungscode des Erstellers einfügen. Schritt 2: Den erzeugten Antwortcode zurückschicken.
      Netzwerk: ${this.iceSummary()} – <a href="#" data-a="settings">ändern</a></p>
      <div class="row"><label>Euer Name</label><input type="text" data-f="name" maxlength="20" value="${esc(this.settings.name)}"></div>
      <textarea class="code-box" data-f="offer" placeholder="ANGELN-EINLADUNG-…"></textarea>
      <div class="row"><button class="btn primary" data-a="answer">Antwortcode erzeugen</button><span data-st class="note"></span></div>
      <div data-step2 class="hidden">
        <div class="row"><label>Antwortcode</label><button class="btn" data-a="copy">Kopieren</button></div>
        <textarea class="code-box" data-f="ans" readonly></textarea>
        <p class="note">Schickt diesen Code an den Ersteller. Sobald er ihn eingefügt hat, öffnet sich die Lobby.</p>
      </div>
      <div class="row"><span data-msg></span></div>
      <div class="row"><button class="btn" data-a="back">Abbrechen</button></div>`);
    const st = box.querySelector<HTMLElement>('[data-st]')!;
    const msg = box.querySelector<HTMLElement>('[data-msg]')!;
    const setMsg = (t: string, cls = 'err') => {
      msg.className = cls;
      msg.textContent = t;
    };
    let busy = false;
    let lastOffer = '';
    this.bind(box, {
      back: () => this.main(),
      settings: () => this.settingsScreen(),
      copy: () => {
        const ta = box.querySelector<HTMLTextAreaElement>('[data-f=ans]')!;
        ta.select();
        void navigator.clipboard?.writeText(ta.value).then(
          () => setMsg('Antwortcode kopiert.', 'ok'),
          () => setMsg('Bitte den markierten Code manuell kopieren (Strg+C).', 'note'),
        );
      },
      answer: async () => {
        if (busy) return;
        const offer = box.querySelector<HTMLTextAreaElement>('[data-f=offer]')!.value.replace(/\s+/g, '');
        if (offer && offer === lastOffer && this.link && this.link.state !== 'failed' && this.link.state !== 'closed') {
          return setMsg('Für diese Einladung wurde bereits ein Antwortcode erzeugt (siehe unten).', 'note');
        }
        busy = true;
        this.closeLink();
        setMsg('');
        const name = this.saveName(box);
        st.textContent = 'Prüfe Einladung und sammle Verbindungswege …';
        try {
          const { link, code, offer: o } = await PeerLink.join(this.settings.ice, offer, name);
          this.link = link;
          lastOffer = offer;
          box.querySelector<HTMLTextAreaElement>('[data-f=ans]')!.value = code;
          box.querySelector('[data-step2]')!.classList.remove('hidden');
          st.textContent = `Einladung von „${o.name ?? 'Host'}“ gültig. Antwortcode bereit (${code.length} Zeichen). Warte auf Verbindung …${this.reachNote(link)}`;
          link.onClose = (reason) => {
            if (this.link === link) {
              setMsg(reason);
              st.textContent = '';
            }
          };
          link.onOpen = () => {
            if (this.link === link) this.guestLobby(link, name);
          };
        } catch (e) {
          st.textContent = '';
          setMsg(e instanceof SignalError ? e.message : `WebRTC-Fehler: ${(e as Error).message}`);
        } finally {
          busy = false;
        }
      },
    });
  }

  // ---------------------------------------------------------------- Lobby
  private seatLabel(st: LobbyState, k: number): string {
    const names = slotNames(st.map, seated(st).length);
    return names[k] ?? `Platz ${k + 1}`;
  }

  private lobbyHtml(st: LobbyState, me: number, isHost: boolean, code = ''): string {
    const n = seated(st).length;
    const nSlots = n > 2 ? 4 : 2;
    const slotSel = (p: LobbyPlayer, attr: string) =>
      `<select ${attr}>${Array.from({ length: nSlots }, (_, k) => `<option value="${k}" ${k === p.slot ? 'selected' : ''}>${esc(this.seatLabel(st, k))}</option>`).join('')}</select>`;
    const rows = st.players
      .map((p, i) => {
        const kind = p.kind ?? (i === 0 ? 'host' : 'human');
        const mine = i === me;
        const hostEdits = isHost && kind === 'ai';
        const who = kind === 'host' ? 'Host' : kind === 'human' ? 'Mitspieler' : kind === 'ai' ? 'KI' : '';
        if (kind === 'open' || kind === 'closed') {
          const sel = isHost && i > 0
            ? `<select data-seat="${i}" data-k="kind"><option value="open" ${kind === 'open' ? 'selected' : ''}>offen für Mitspieler</option><option value="ai:normal">KI (normal)</option><option value="ai:leicht">KI (leicht)</option><option value="closed" ${kind === 'closed' ? 'selected' : ''}>geschlossen</option></select>`
            : kind === 'open' ? 'offen' : 'geschlossen';
          return `<tr class="seat-${kind}"><td>Platz ${i + 1}</td><td colspan="4">${kind === 'open' ? '<span class="note">wartet auf Mitspieler …</span>' : '<span class="note">–</span>'}</td><td>${sel}</td></tr>`;
        }
        const nameCell = mine ? `<input type="text" data-f="name" maxlength="20" value="${esc(p.name)}">` : esc(p.name);
        const facCell = mine ? `<select data-f="fac">${this.factionOptions(p.faction, true)}</select>` : hostEdits ? `<select data-seat="${i}" data-k="fac">${this.factionOptions(p.faction, true)}</select>` : FACTION_DEFS[p.faction].name;
        const colCell = mine ? `<select data-f="color">${this.colorOptions(p.color)}</select>` : hostEdits ? `<select data-seat="${i}" data-k="color">${this.colorOptions(p.color)}</select>` : `<span class="swatch" style="background:${PLAYER_COLORS[p.color]}"></span> ${PLAYER_COLOR_NAMES[p.color]}`;
        const slotCell = mine ? slotSel(p, 'data-f="slot"') : hostEdits ? slotSel(p, `data-seat="${i}" data-k="slot"`) : esc(this.seatLabel(st, p.slot));
        const readyCell = kind === 'ai'
          ? isHost ? `<select data-seat="${i}" data-k="kind"><option value="ai:normal" ${p.ai !== 'leicht' ? 'selected' : ''}>KI (normal)</option><option value="ai:leicht" ${p.ai === 'leicht' ? 'selected' : ''}>KI (leicht)</option><option value="open">Platz öffnen</option><option value="closed">schließen</option></select>` : `<span class="note">KI (${p.ai ?? 'normal'})</span>`
          : mine ? `<label><input type="checkbox" data-f="ready" ${p.ready ? 'checked' : ''}> bereit</label>` : p.ready ? '<span class="ok">bereit</span>' : 'wählt …';
        const kick = isHost && kind === 'human' ? ` <button class="btn small" data-kick="${i}" title="Mitspieler entfernen">✕</button>` : '';
        return `<tr><td>${who}</td><td>${nameCell}</td><td>${facCell}</td><td>${colCell}</td><td>${slotCell}</td><td>${readyCell}${kick}</td></tr>`;
      })
      .join('');
    const codeBox = code
      ? `<div class="code-panel"><div class="note">Spielcode für eure Mitspieler</div><div class="game-code" data-code>${esc(formatCode(code))}</div>
        <div><button class="btn" data-a="copycode">Code kopieren</button> <button class="btn" data-a="copylink">Einladungslink kopieren</button></div>
        <div class="note">Mitspieler wählen „Mit Spielcode beitreten“ und geben den Code ein – oder öffnen den Link.</div></div>`
      : '';
    return `<h2>Lobby</h2>${codeBox}
      <table class="lobby-table"><tr><th></th><th>Name</th><th>Partei</th><th>Farbe</th><th>Startort</th><th></th></tr>${rows}</table>
      <p class="note">Jede Partei darf mehrfach gewählt werden; Farbe und Startort müssen sich unterscheiden. ${n > 2 ? 'Mit drei oder vier Spielern wird die Karte größer (160 × 160 Kacheln) – jeder gegen jeden.' : ''}</p>
      ${st.players[me] ? this.factionInfo(st.players[me].faction, st.players[me].color) : ''}
      <div class="row"><label>Karte</label>${isHost ? `<select data-f="map">${this.mapOptions(st.map, false)}</select>` : `<b>${MAP_INFO[st.map].name}</b>`}</div>
      ${this.mapInfo(st.map)}
      <div class="row"><label>Prestigeziel</label>${isHost ? `<select data-f="goal">${goalOptions(st.goal)}</select>` : st.goal || 'aus (nur militärisch)'}
        <label style="min-width:0;margin-left:16px">Startrohstoffe</label>${isHost ? `<select data-f="rich"><option value="0" ${st.rich ? '' : 'selected'}>normal</option><option value="1" ${st.rich ? 'selected' : ''}>reichlich</option></select>` : st.rich ? 'reichlich' : 'normal'}</div>
      <div class="row">${isHost ? '<button class="btn primary" data-a="start">Partie starten</button>' : '<span class="note">Der Host startet die Partie, sobald alle bereit sind.</span>'}
      <button class="btn" data-a="leave">Lobby verlassen</button></div><div class="row"><span data-msg class="err"></span></div>
      <p class="note">Hinweis: Der Browser des Hosts berechnet die Partie. Schließt der Host die Seite, endet die Sitzung.</p>`;
  }

  /** Farben und Startorte eindeutig halten (der Host gleicht nach jeder Änderung an). */
  private normalizeSeats(st: LobbyState): void {
    const list = seated(st);
    const nSlots = list.length > 2 ? 4 : 2;
    const usedC = new Set<number>(), usedS = new Set<number>();
    for (const p of list) {
      if (usedC.has(p.color)) p.color = [0, 1, 2, 3].find((c) => !usedC.has(c)) ?? p.color;
      usedC.add(p.color);
      if (p.slot >= nSlots || usedS.has(p.slot)) p.slot = Array.from({ length: nSlots }, (_, k) => k).find((k) => !usedS.has(k)) ?? 0;
      usedS.add(p.slot);
    }
  }

  /**
   * Lobby des Hosts. Mitspieler kommen über den Spielcode-Raum (room) oder über eine manuell aufgebaute Verbindung.
   */
  private hostLobby(o: { name: string; room?: Room; manualLink?: PeerLink }): void {
    const map0 = this.settings.map === 'zufall' ? randomMap() : this.settings.map;
    const open = (k: number): LobbyPlayer => ({ name: '', color: k, slot: k, ready: false, faction: 'angeln', kind: o.manualLink ? (k === 1 ? 'open' : 'closed') : 'open' });
    const st: LobbyState = {
      players: [{ name: o.name, color: 0, slot: 0, ready: false, faction: this.settings.faction, kind: 'host' }, open(1), open(2), open(3)],
      goal: RULES.prestigeGoalDefault, rich: false, map: map0,
    };
    const room = o.room;
    /** verbundene Mitspieler: Platz → Verbindung */
    const seats = new Map<number, PeerLink>();
    /** im Aufbau befindliche Verbindungen: Raum-ID → Verbindung */
    const pending = new Map<number, PeerLink>();
    let started = false;
    let note = '';
    // für Ende-zu-Ende-Tests und Fehlersuche: Zustand der Host-Lobby
    (window as unknown as { __lobby: unknown }).__lobby = { st, seats, pending };
    const broadcast = () => {
      this.normalizeSeats(st);
      for (const l of seats.values()) l.send({ t: 'lobby', st } satisfies HostMsg);
    };
    const freeSeat = () => st.players.findIndex((p, k) => k > 0 && p.kind === 'open');
    const leaveLobby = () => {
      if (started) return;
      for (const l of [...seats.values(), ...pending.values()]) {
        l.send({ t: 'bye', reason: 'Der Host hat die Lobby geschlossen.' } satisfies HostMsg);
        window.setTimeout(() => l.close(), 200);
      }
      room?.close(false, 'Der Host hat das Spiel geschlossen.');
      this.lobbyCleanup = null;
      this.main();
    };
    this.lobbyCleanup = leaveLobby;

    const attach = (link: PeerLink) => {
      let seat = -1;
      link.onMessage = (raw) => {
        const m = parseGuestMsg(raw);
        if (!m || started) return;
        if (m.t === 'hello') {
          if (seat >= 0 && seats.get(seat) === link) {
            // wiederholte Begrüßung (der Gast hat noch keine Antwort gesehen): nur erneut antworten
            link.send({ t: 'welcome', v: PROTOCOL_VERSION, seat } satisfies HostMsg);
            link.send({ t: 'lobby', st } satisfies HostMsg);
            return;
          }
          if (m.v !== PROTOCOL_VERSION) {
            link.send({ t: 'reject', reason: `Andere Spielversion (Host v${PROTOCOL_VERSION}, ihr v${m.v}). Bitte beide die Seite neu laden.` } satisfies HostMsg);
            return;
          }
          seat = freeSeat();
          if (seat < 0) {
            link.send({ t: 'reject', reason: 'Das Spiel ist bereits voll.' } satisfies HostMsg);
            window.setTimeout(() => link.close(), 300);
            return;
          }
          seats.set(seat, link);
          st.players[seat] = { name: m.name, color: seat, slot: seat, ready: false, faction: m.faction, kind: 'human' };
          link.send({ t: 'welcome', v: PROTOCOL_VERSION, seat } satisfies HostMsg);
          note = `${m.name} ist beigetreten.`;
          sound.play('built');
          broadcast();
          render();
        } else if (m.t === 'lset' && seat > 0 && st.players[seat]?.kind === 'human') {
          st.players[seat] = { ...st.players[seat], name: m.name, color: m.color, slot: m.slot, ready: m.ready, faction: m.faction };
          broadcast();
          render();
        } else if (m.t === 'ping') link.send({ t: 'pong', n: m.n } satisfies HostMsg);
        else if (m.t === 'bye') gone(`${st.players[seat]?.name ?? 'Ein Mitspieler'} hat die Lobby verlassen.`);
      };
      const gone = (text: string) => {
        if (started || seat < 0 || seats.get(seat) !== link) return;
        seats.delete(seat);
        st.players[seat] = open(seat);
        if (st.players[seat].kind === 'closed') st.players[seat].kind = 'open';
        note = text;
        broadcast();
        render();
      };
      link.onClose = (reason) => gone(`Verbindung zu einem Mitspieler getrennt: ${reason}`);
    };

    if (o.manualLink) {
      attach(o.manualLink);
    }
    if (room) {
      room.onEvent = async (ev) => {
        if (started) return;
        if (ev.t === 'join') {
          if (freeSeat() < 0) {
            void room.send(ev.id, JSON.stringify({ err: 'Das Spiel ist bereits voll.' })).catch(() => undefined);
            return;
          }
          try {
            const { link, code } = await PeerLink.host(this.settings.ice, o.name);
            pending.set(ev.id, link);
            attach(link);
            link.onOpen = () => pending.delete(ev.id);
            await room.send(ev.id, code);
            note = `${ev.name} verbindet sich …`;
            render();
          } catch (e) {
            note = `Verbindung zu ${ev.name} fehlgeschlagen: ${(e as Error).message}`;
            render();
          }
        } else if (ev.t === 'msg') {
          const link = pending.get(ev.from);
          if (!link) return;
          try {
            await link.acceptAnswer(ev.data);
          } catch (e) {
            note = `Antwort eines Mitspielers ungültig: ${(e as Error).message}`;
            render();
          }
        } else if (ev.t === 'leave') {
          const link = pending.get(ev.id);
          if (link && link.state !== 'open') link.close();
          pending.delete(ev.id);
        } else if (ev.t === 'closed') {
          note = `Spielcode nicht mehr gültig: ${ev.reason}`;
          render();
        }
      };
      room.listen();
    }

    const render = () => {
      if (started) return;
      const box = this.show(this.lobbyHtml(st, 0, true, room?.code), true);
      if (note) box.querySelector<HTMLElement>('[data-msg]')!.textContent = note;
      const f = (k: string) => box.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
      const update = () => {
        const me = st.players[0];
        me.name = f('name')!.value.trim().slice(0, 20) || 'Host';
        me.color = Number(f('color')!.value);
        me.slot = Number(f('slot')!.value);
        me.ready = f('ready')!.checked;
        me.faction = f('fac')!.value as FactionId;
        this.settings.faction = me.faction;
        st.goal = Number(f('goal')!.value);
        st.rich = f('rich')!.value === '1';
        const nm = f('map')!.value as MapId;
        if (nm !== st.map) {
          st.map = nm;
          this.settings.map = nm;
          // Kartenwechsel: Bereitschaft zurücksetzen, damit alle die neue Karte bestätigen
          for (const p of st.players) p.ready = false;
        }
        saveSettings(this.settings);
        note = '';
        broadcast();
        render();
      };
      ['fac', 'color', 'slot', 'ready', 'goal', 'rich', 'map', 'name'].forEach((k) => f(k)?.addEventListener('change', update));
      // Plätze 2–4: KI, offen, geschlossen
      box.querySelectorAll<HTMLSelectElement>('[data-seat]').forEach((el) =>
        el.addEventListener('change', () => {
          const k = Number(el.dataset.seat);
          const p = st.players[k];
          const v = el.value;
          if (el.dataset.k === 'kind') {
            if (v.startsWith('ai:')) {
              const fac = FACTIONS[Math.floor(Math.random() * FACTIONS.length)];
              st.players[k] = { name: AI_NAMES[fac], color: k, slot: k, ready: true, faction: fac, kind: 'ai', ai: v === 'ai:leicht' ? 'leicht' : 'normal' };
            } else st.players[k] = { ...open(k), kind: v === 'closed' ? 'closed' : 'open' };
          } else if (el.dataset.k === 'fac') {
            p.faction = v as FactionId;
            if (p.kind === 'ai') p.name = AI_NAMES[p.faction];
          } else if (el.dataset.k === 'color') p.color = Number(v);
          else if (el.dataset.k === 'slot') p.slot = Number(v);
          note = '';
          broadcast();
          render();
        }),
      );
      box.querySelectorAll<HTMLButtonElement>('[data-kick]').forEach((b) =>
        b.addEventListener('click', () => {
          const k = Number(b.dataset.kick);
          const l = seats.get(k);
          if (l) {
            l.send({ t: 'bye', reason: 'Der Host hat euch aus der Lobby entfernt.' } satisfies HostMsg);
            window.setTimeout(() => l.close(), 200);
          }
          seats.delete(k);
          st.players[k] = open(k);
          st.players[k].kind = 'open';
          broadcast();
          render();
        }),
      );
      const copy = (text: string, ok: string) =>
        void navigator.clipboard?.writeText(text).then(
          () => (box.querySelector<HTMLElement>('[data-msg]')!.textContent = ok),
          () => (box.querySelector<HTMLElement>('[data-msg]')!.textContent = `Bitte manuell kopieren: ${text}`),
        );
      this.bind(box, {
        leave: leaveLobby,
        copycode: () => room && copy(formatCode(room.code), 'Spielcode kopiert.'),
        copylink: () => room && copy(`${location.origin}${location.pathname}?spiel=${room.code}`, 'Einladungslink kopiert.'),
        start: () => {
          const m = box.querySelector<HTMLElement>('[data-msg]')!;
          const list = seated(st);
          if (list.length < 2) return void (m.textContent = 'Es fehlt noch ein Gegner – wartet auf einen Mitspieler oder setzt eine KI auf einen Platz.');
          if (!list.every((p) => p.kind === 'ai' || p.ready)) return void (m.textContent = 'Alle Spieler müssen „bereit“ sein.');
          this.normalizeSeats(st);
          started = true;
          this.lobbyCleanup = null;
          room?.close(true);
          for (const l of pending.values()) if (l.state !== 'open') l.close();
          const seed = (Math.random() * 2 ** 31) | 0;
          const links = new Map<number, PeerLink>();
          list.forEach((p, id) => {
            const seatIdx = st.players.indexOf(p);
            const l = seats.get(seatIdx);
            if (l) links.set(id, l);
          });
          for (const [id, l] of links) l.send({ t: 'start', seed, goal: st.goal, rich: st.rich, me: id, players: list, map: st.map } satisfies HostMsg);
          const world = new World({
            seed,
            mapId: st.map,
            players: list.map((p) => ({ name: p.name, color: p.color, slot: p.slot, isAI: p.kind === 'ai', aiLevel: p.ai ?? 'normal', faction: p.faction })),
            prestigeGoal: st.goal,
            richStart: st.rich,
          });
          const driver = new HostDriver(world, links);
          this.link = null; // Verbindungen gehören jetzt dem Treiber
          this.enterGame(() => Game.create(driver, {
            tutorial: false,
            hints: this.settings.hints,
            onExit: () => this.exitGame(),
            autosave: () => writeAutosave({ v: 1, savedAt: Date.now(), me: 0, world: world.serialize(), ais: driver.ais.map((a) => a.s), tutorial: false, mp: true, label: autoLabel(world) }),
            onFinished: () => clearAutosave(),
          }, this.settings.renderer));
        },
      });
    };
    render();
  }

  private guestLobby(link: PeerLink, name: string): void {
    let st: LobbyState | null = null;
    let started = false;
    let mySeat = 1;
    const myPrefs = { name, color: 1, slot: 1, ready: false, faction: this.settings.faction };
    const hello = () => link.send({ t: 'hello', v: PROTOCOL_VERSION, name, faction: this.settings.faction });
    hello();
    // bis der Host antwortet, die Begrüßung wiederholen (falls sie beim Verbindungsaufbau verloren ging)
    const helloTimer = window.setInterval(() => {
      if (st || started || link.state !== 'open') window.clearInterval(helloTimer);
      else hello();
    }, 2000);
    const sendPrefs = () => link.send({ t: 'lset', ...myPrefs });
    this.lobbyCleanup = () => {
      link.send({ t: 'bye' });
      window.setTimeout(() => link.close(), 200);
      this.lobbyCleanup = null;
      this.main();
    };
    const render = (note = '') => {
      if (started) return;
      if (!st) {
        const box = this.show(`<h2>Lobby</h2><p class="note">Verbunden – warte auf den Host …</p><div class="row"><span data-msg class="err">${esc(note)}</span></div><div class="row"><button class="btn" data-a="leave">Verlassen</button></div>`);
        this.bind(box, { leave: () => this.lobbyCleanup?.() });
        return;
      }
      const box = this.show(this.lobbyHtml(st, mySeat, false), true);
      if (note) box.querySelector('[data-msg]')!.textContent = note;
      const f = (k: string) => box.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
      const update = () => {
        myPrefs.name = f('name')!.value.trim().slice(0, 20) || 'Gast';
        myPrefs.color = Number(f('color')!.value);
        myPrefs.slot = Number(f('slot')!.value);
        myPrefs.ready = f('ready')!.checked;
        myPrefs.faction = f('fac')!.value as FactionId;
        this.settings.faction = myPrefs.faction;
        saveSettings(this.settings);
        sendPrefs();
      };
      ['fac', 'color', 'slot', 'ready', 'name'].forEach((k) => f(k)?.addEventListener('change', update));
      this.bind(box, { leave: () => this.lobbyCleanup?.() });
    };
    link.onMessage = (raw) => {
      const m = parseHostMsg(raw);
      if (!m || started) return;
      if (m.t === 'welcome') {
        if (m.seat !== undefined) mySeat = m.seat;
      } else if (m.t === 'lobby') {
        st = m.st;
        const mine = st.players[mySeat];
        if (mine) Object.assign(myPrefs, { color: mine.color, slot: mine.slot, ready: mine.ready, name: mine.name, faction: mine.faction });
        render();
      } else if (m.t === 'reject') {
        window.clearInterval(helloTimer);
        render(m.reason);
      } else if (m.t === 'ping') link.send({ t: 'pong', n: m.n });
      else if (m.t === 'start') {
        started = true;
        this.lobbyCleanup = null;
        const driver = new GuestDriver(m.seed, m.me, link, m.map, m.players.length);
        this.link = null;
        this.enterGame(() => Game.create(driver, { tutorial: false, hints: this.settings.hints, onExit: () => this.exitGame() }, this.settings.renderer));
      } else if (m.t === 'bye') {
        started = true;
        this.lobbyCleanup = null;
        const box = this.show(`<h2>Lobby geschlossen</h2><p>${esc(m.reason)}</p><div class="row"><button class="btn" data-a="back">Zum Hauptmenü</button></div>`);
        this.bind(box, { back: () => this.main() });
      }
    };
    link.onClose = (reason) => {
      if (started) return;
      this.lobbyCleanup = null;
      const box = this.show(`<h2>Verbindung getrennt</h2><p>${esc(reason)}</p><div class="row"><button class="btn" data-a="back">Zum Hauptmenü</button></div>`);
      this.bind(box, { back: () => this.main() });
    };
    render();
  }
}
