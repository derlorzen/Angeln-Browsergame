// Menüs: Hauptmenü, Einzelspiel, Mehrspieler (manueller Code-Austausch + Lobby), Einstellungen, Texte.
import { sound } from '../audio/sound';
import { RULES } from '../data/defs';
import { ClientState } from '../game/client';
import { GuestDriver, HostDriver, LocalDriver } from '../game/drivers';
import { Game } from '../game/game';
import { PeerLink } from '../net/peer';
import { PROTOCOL_VERSION, parseGuestMsg, parseHostMsg, type HostMsg, type LobbyState } from '../net/protocol';
import { SignalError } from '../net/signal';
import { createRenderer } from '../render/factory';
import type { BaseRenderer } from '../render/view';
import { PLAYER_COLORS, PLAYER_COLOR_NAMES, portrait } from '../render/sprites';
import { FACTIONS, FACTION_DEFS, type FactionId } from '../data/factions';
import { MAP_IDS, MAP_INFO, type MapId } from '../sim/map';
import { World } from '../sim/world';
import { loadSettings, readSave, saveSettings, writeSave, type Settings } from '../storage/save';
import { BACKGROUND_HTML, GUIDE_HTML, NETWORK_HTML } from './texts';

const slotNames = (m: MapId) => [`${MAP_INFO[m].slotNames[0]} (Norden)`, `${MAP_INFO[m].slotNames[1]} (Süden)`];
const randomMap = (): MapId => MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)];
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
  private bg: { r: BaseRenderer | null; raf: number; alive: boolean } | null = null;

  start(): void {
    this.main();
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
    c.players = [{ id: 0, name: '', color: FACTIONS.indexOf(fac), faction: fac, prestige: 0, defeated: false }];
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
      const loop = (t: number) => {
        if (!bg.alive) return;
        bg.raf = requestAnimationFrame(loop);
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

  private show(html: string): HTMLElement {
    this.root.classList.remove('hidden');
    this.startBackdrop();
    let box = this.root.querySelector<HTMLElement>('.menu-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'menu-box panel';
      this.root.appendChild(box);
    }
    box.innerHTML = html;
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => sound.unlock()));
    return box;
  }

  private bind(box: HTMLElement, map: Record<string, () => void>): void {
    for (const [k, fn] of Object.entries(map)) box.querySelector(`[data-a="${k}"]`)?.addEventListener('click', fn);
  }

  // ---------------------------------------------------------------- Hauptmenü
  main(): void {
    this.closeLink();
    const save = readSave();
    const box = this.show(`
      <h1>Angeln</h1><div class="sub">Fürsten der Schlei · Echtzeit-Strategie um 1600</div>
      <div class="menu-col">
        <button class="btn primary" data-a="sp">Einzelspiel gegen die KI</button>
        <button class="btn" data-a="load" ${save ? '' : 'disabled'}>Spielstand laden${save ? ` (${new Date(save.savedAt).toLocaleString('de-DE')})` : ''}</button>
        <button class="btn" data-a="host">Mehrspieler: Spiel erstellen</button>
        <button class="btn" data-a="join">Mehrspieler: Spiel beitreten</button>
        <button class="btn" data-a="guide">Spielanleitung</button>
        <button class="btn" data-a="bg">Hintergrund &amp; Quellen</button>
        <button class="btn" data-a="settings">Einstellungen &amp; Netzwerk</button>
      </div>
      <p class="note" style="text-align:center;margin-top:12px">Version 0.1 · Alle Grafiken und Klänge werden im Browser erzeugt · Kein Server nötig</p>`);
    this.bind(box, {
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

  private factionOptions(sel: FactionId | null): string {
    return FACTIONS.map((x) => `<option value="${x}" ${x === sel ? 'selected' : ''}>${FACTION_DEFS[x].name} – ${FACTION_DEFS[x].focus}</option>`).join('');
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
    return (allowRandom ? `<option value="zufall" ${sel === 'zufall' ? 'selected' : ''}>zufällige Karte</option>` : '') + opts;
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
      <div class="row"><label>KI-Gegner</label><select data-f="ai"><option value="leicht">leicht (zum Kennenlernen)</option><option value="normal" selected>normal</option></select>
        <select data-f="aifac"><option value="zufall">zufällige Partei</option>${this.factionOptions(null)}</select></div>
      <div class="row"><label>Prestigeziel</label><select data-f="goal"><option value="150">150 (kurz)</option><option value="250" selected>250</option><option value="400">400 (lang)</option></select></div>
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
      const names = m === 'zufall' ? ['Norden', 'Süden'] : slotNames(m);
      sel.innerHTML = names.map((n, k) => `<option value="${k}" ${String(k) === cur ? 'selected' : ''}>${n}</option>`).join('');
    };
    box.querySelector('[data-f=map]')!.addEventListener('change', mapInfo);
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
        const aiColor = color === 1 ? 0 : 1;
        const faction = f('fac') as FactionId;
        this.settings.faction = faction;
        const mapSel = f('map') as MapId | 'zufall';
        this.settings.map = mapSel;
        saveSettings(this.settings);
        const mapId = mapSel === 'zufall' ? randomMap() : mapSel;
        const others = FACTIONS.filter((x) => x !== faction);
        const aiFac: FactionId = f('aifac') === 'zufall' ? others[Math.floor(Math.random() * others.length)] : (f('aifac') as FactionId);
        const world = new World({
          seed: (Math.random() * 2 ** 31) | 0,
          mapId,
          players: [
            { name, color, slot, isAI: false, faction },
            { name: AI_NAMES[aiFac], color: aiColor, slot: 1 - slot, isAI: true, aiLevel: f('ai') as 'leicht' | 'normal', faction: aiFac },
          ],
          prestigeGoal: Number(f('goal')),
          richStart: f('rich') === '1',
        });
        this.launchLocal(world, f('tut') === '1');
      },
    });
  }

  private launchLocal(world: World, tutorial: boolean, aiStates?: import('../ai/ai').AIState[]): void {
    const driver = new LocalDriver(world, 0, aiStates);
    this.enterGame(
      () => Game.create(driver, {
        tutorial,
        onExit: () => this.exitGame(),
        onSave: () => writeSave({ v: 1, savedAt: Date.now(), me: 0, world: world.serialize(), ais: driver.ais.map((a) => a.s), tutorial }),
      }, this.settings.renderer),
    );
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
  private settingsScreen(): void {
    const ice = this.settings.ice;
    const box = this.show(`<h2>Einstellungen &amp; Netzwerk</h2>
      <div class="row"><label>Spielername</label><input type="text" data-f="name" maxlength="20" value="${esc(this.settings.name)}"></div>
      <div class="row"><label>Grafik</label><select data-f="renderer"><option value="auto" ${this.settings.renderer === 'auto' ? 'selected' : ''}>WebGL (PixiJS) – empfohlen</option><option value="canvas" ${this.settings.renderer === 'canvas' ? 'selected' : ''}>Canvas 2D (Rückfall für alte Grafiktreiber)</option></select></div>
      <h3>Verbindungshilfen (ICE)</h3>
      <div class="row"><label><input type="radio" name="ice" value="stun" ${ice.mode === 'stun' ? 'checked' : ''}> STUN verwenden</label>
        <input type="text" data-f="stun" size="34" value="${esc(ice.stunUrl)}"></div>
      <div class="row"><label><input type="radio" name="ice" value="none" ${ice.mode === 'none' ? 'checked' : ''}> ohne ICE-Dienste</label>
        <span class="note">nur gleiches Gerät / gleiches lokales Netz</span></div>
      <div class="row"><label>Eigener TURN (optional)</label><input type="text" data-f="turn" size="34" placeholder="turn:mein-server.example:3478" value="${esc(ice.turnUrl)}"></div>
      <div class="row"><label>TURN Benutzer/Passwort</label><input type="text" data-f="tu" size="14" value="${esc(ice.turnUser)}"><input type="text" data-f="tp" size="14" value="${esc(ice.turnPass)}"></div>
      ${NETWORK_HTML}
      <div class="row"><button class="btn primary" data-a="save">Speichern</button><button class="btn" data-a="back">Zurück</button><span data-msg class="ok"></span></div>`);
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
        this.settings.ice = { mode, stunUrl: stun, turnUrl: turn, turnUser: v('tu'), turnPass: v('tp') };
        saveSettings(this.settings);
        msg.className = 'ok';
        msg.textContent = 'Gespeichert.';
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

  // ---------------------------------------------------------------- Mehrspieler: Erstellen (Spieler A)
  private hostScreen(): void {
    this.closeLink();
    const box = this.show(`<h2>Spiel erstellen</h2>
      <p class="note">Schritt 1: Einladung erzeugen und den Code (z. B. per Messenger) an den Mitspieler schicken.
      Schritt 2: Seinen Antwortcode hier einfügen. Netzwerk: ${this.iceSummary()} – <a href="#" data-a="settings">ändern</a></p>
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
      const name = box.querySelector<HTMLInputElement>('[data-f=name]')!.value.trim().slice(0, 20) || 'Spieler';
      this.settings.name = name;
      saveSettings(this.settings);
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
          if (this.link === link) this.hostLobby(link, name);
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

  // ---------------------------------------------------------------- Mehrspieler: Beitreten (Spieler B)
  private joinScreen(): void {
    this.closeLink();
    const box = this.show(`<h2>Spiel beitreten</h2>
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
        const name = box.querySelector<HTMLInputElement>('[data-f=name]')!.value.trim().slice(0, 20) || 'Spieler';
        this.settings.name = name;
        saveSettings(this.settings);
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
  private lobbyHtml(st: LobbyState, me: number, isHost: boolean): string {
    const SLOT_NAMES = slotNames(st.map);
    const rows = st.players
      .map((p, i) => {
        const mine = i === me;
        return `<tr><td>${i === 0 ? 'Host' : 'Gast'}</td><td>${mine ? `<input type="text" data-f="name" maxlength="20" value="${esc(p.name)}">` : esc(p.name)}</td>
        <td>${mine ? `<select data-f="fac">${this.factionOptions(p.faction)}</select>` : FACTION_DEFS[p.faction].name}</td>
        <td>${mine ? `<select data-f="color">${this.colorOptions(p.color)}</select>` : `<span class="swatch" style="background:${PLAYER_COLORS[p.color]}"></span> ${PLAYER_COLOR_NAMES[p.color]}`}</td>
        <td>${mine ? `<select data-f="slot">${SLOT_NAMES.map((n, k) => `<option value="${k}" ${k === p.slot ? 'selected' : ''}>${n}</option>`).join('')}</select>` : SLOT_NAMES[p.slot]}</td>
        <td>${mine ? `<label><input type="checkbox" data-f="ready" ${p.ready ? 'checked' : ''}> bereit</label>` : p.ready ? '<span class="ok">bereit</span>' : 'wählt …'}</td></tr>`;
      })
      .join('');
    const conflicts: string[] = [];
    if (st.players.length === 2) {
      if (st.players[0].color === st.players[1].color) conflicts.push('Beide haben dieselbe Farbe gewählt.');
      if (st.players[0].slot === st.players[1].slot) conflicts.push('Beide haben denselben Startort gewählt.');
    }
    return `<h2>Lobby</h2><p class="note ok">Direkte Verbindung steht.</p>
      <table class="lobby-table"><tr><th></th><th>Name</th><th>Partei</th><th>Farbe</th><th>Startort</th><th></th></tr>${rows}</table>
      ${st.players[me] ? this.factionInfo(st.players[me].faction, st.players[me].color) : ''}
      <div class="row"><label>Karte</label>${isHost ? `<select data-f="map">${this.mapOptions(st.map, false)}</select>` : `<b>${MAP_INFO[st.map].name}</b>`}</div>
      ${this.mapInfo(st.map)}
      <div class="row"><label>Prestigeziel</label>${isHost ? `<select data-f="goal">${[150, 250, 400].map((g) => `<option value="${g}" ${g === st.goal ? 'selected' : ''}>${g}</option>`).join('')}</select>` : st.goal}
        <label style="min-width:0;margin-left:16px">Startrohstoffe</label>${isHost ? `<select data-f="rich"><option value="0" ${st.rich ? '' : 'selected'}>normal</option><option value="1" ${st.rich ? 'selected' : ''}>reichlich</option></select>` : st.rich ? 'reichlich' : 'normal'}</div>
      <div class="row err">${conflicts.join(' ')}</div>
      <div class="row">${isHost ? '<button class="btn primary" data-a="start">Partie starten</button>' : '<span class="note">Der Host startet die Partie, sobald beide bereit sind.</span>'}
      <button class="btn" data-a="leave">Lobby verlassen</button></div><div class="row"><span data-msg class="err"></span></div>
      <p class="note">Hinweis: Der Browser des Hosts berechnet die Partie. Schließt der Host die Seite, endet die Sitzung.</p>`;
  }

  private hostLobby(link: PeerLink, name: string): void {
    const map0 = this.settings.map === 'zufall' ? randomMap() : this.settings.map;
    const st: LobbyState = { players: [{ name, color: 0, slot: 0, ready: false, faction: this.settings.faction }], goal: RULES.prestigeGoalDefault, rich: false, map: map0 };
    let started = false;
    const broadcast = () => link.send({ t: 'lobby', st } satisfies HostMsg);
    const render = () => {
      if (started) return;
      const box = this.show(this.lobbyHtml(st, 0, true));
      const f = (k: string) => box.querySelector<HTMLInputElement>(`[data-f="${k}"]`);
      const update = () => {
        const me = st.players[0];
        me.name = f('name')!.value.trim().slice(0, 20) || 'Host';
        me.color = Number(f('color')!.value);
        me.slot = Number(f('slot')!.value);
        me.ready = f('ready')!.checked;
        me.faction = f('fac')!.value as FactionId;
        this.settings.faction = me.faction;
        saveSettings(this.settings);
        st.goal = Number(f('goal')!.value);
        st.rich = f('rich')!.value === '1';
        const nm = f('map')!.value as MapId;
        if (nm !== st.map) {
          st.map = nm;
          this.settings.map = nm;
          saveSettings(this.settings);
          // Kartenwechsel: Bereitschaft zurücksetzen, damit beide die neue Karte bestätigen
          for (const p of st.players) p.ready = false;
        }
        broadcast();
        render();
      };
      ['fac', 'color', 'slot', 'ready', 'goal', 'rich', 'map'].forEach((k) => f(k)?.addEventListener('change', update));
      f('name')?.addEventListener('change', update);
      this.bind(box, {
        leave: () => this.main(),
        start: () => {
          const m = box.querySelector<HTMLElement>('[data-msg]')!;
          if (st.players.length < 2) return void (m.textContent = 'Der Mitspieler ist noch nicht in der Lobby.');
          if (!st.players.every((p) => p.ready)) return void (m.textContent = 'Beide Spieler müssen „bereit“ sein.');
          if (st.players[0].color === st.players[1].color || st.players[0].slot === st.players[1].slot)
            return void (m.textContent = 'Farbe und Startort müssen sich unterscheiden.');
          started = true;
          const seed = (Math.random() * 2 ** 31) | 0;
          link.send({ t: 'start', seed, goal: st.goal, rich: st.rich, me: 1, players: st.players, map: st.map } satisfies HostMsg);
          const world = new World({
            seed,
            mapId: st.map,
            players: st.players.map((p) => ({ name: p.name, color: p.color, slot: p.slot, isAI: false, faction: p.faction })),
            prestigeGoal: st.goal,
            richStart: st.rich,
          });
          const driver = new HostDriver(world, link);
          this.link = null; // gehört jetzt dem Treiber
          this.enterGame(() => Game.create(driver, { tutorial: false, onExit: () => this.exitGame() }, this.settings.renderer));
        },
      });
    };
    link.onMessage = (raw) => {
      const m = parseGuestMsg(raw);
      if (!m || started) return;
      if (m.t === 'hello') {
        if (m.v !== PROTOCOL_VERSION) {
          link.send({ t: 'reject', reason: `Andere Protokollversion (Host v${PROTOCOL_VERSION}, Gast v${m.v}).` } satisfies HostMsg);
          return;
        }
        link.send({ t: 'welcome', v: PROTOCOL_VERSION } satisfies HostMsg);
        st.players[1] = { name: m.name, color: st.players[0].color === 1 ? 0 : 1, slot: st.players[0].slot === 0 ? 1 : 0, ready: false, faction: m.faction };
        broadcast();
        render();
      } else if (m.t === 'lset' && st.players[1]) {
        st.players[1] = { name: m.name, color: m.color, slot: m.slot, ready: m.ready, faction: m.faction };
        broadcast();
        render();
      } else if (m.t === 'ping') link.send({ t: 'pong', n: m.n });
      else if (m.t === 'bye') {
        st.players.length = 1;
        render();
        const box = this.root.querySelector('[data-msg]');
        if (box) box.textContent = 'Der Mitspieler hat die Lobby verlassen.';
      }
    };
    link.onClose = (reason) => {
      if (started) return;
      st.players.length = 1;
      render();
      const box = this.root.querySelector('[data-msg]');
      if (box) box.textContent = `Verbindung getrennt: ${reason}`;
    };
    render();
  }

  private guestLobby(link: PeerLink, name: string): void {
    let st: LobbyState | null = null;
    let started = false;
    const myPrefs = { name, color: 1, slot: 1, ready: false, faction: this.settings.faction };
    link.send({ t: 'hello', v: PROTOCOL_VERSION, name, faction: this.settings.faction });
    const sendPrefs = () => link.send({ t: 'lset', ...myPrefs });
    const render = (note = '') => {
      if (started) return;
      if (!st) {
        const box = this.show(`<h2>Lobby</h2><p class="note">Verbunden – warte auf den Host …</p><div class="row"><button class="btn" data-a="leave">Verlassen</button></div>`);
        this.bind(box, { leave: () => this.main() });
        return;
      }
      const box = this.show(this.lobbyHtml(st, 1, false));
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
      this.bind(box, { leave: () => this.main() });
    };
    link.onMessage = (raw) => {
      const m = parseHostMsg(raw);
      if (!m || started) return;
      if (m.t === 'lobby') {
        st = m.st;
        const mine = st.players[1];
        if (mine) Object.assign(myPrefs, { color: mine.color, slot: mine.slot, ready: mine.ready, name: mine.name, faction: mine.faction });
        render();
      } else if (m.t === 'reject') {
        render(m.reason);
      } else if (m.t === 'ping') link.send({ t: 'pong', n: m.n });
      else if (m.t === 'start') {
        started = true;
        const driver = new GuestDriver(m.seed, m.me, link, m.map);
        this.link = null;
        this.enterGame(() => Game.create(driver, { tutorial: false, onExit: () => this.exitGame() }, this.settings.renderer));
      } else if (m.t === 'bye') {
        const box = this.show(`<h2>Lobby geschlossen</h2><p>${esc(m.reason)}</p><div class="row"><button class="btn" data-a="back">Zum Hauptmenü</button></div>`);
        this.bind(box, { back: () => this.main() });
      }
    };
    link.onClose = (reason) => {
      if (started) return;
      const box = this.show(`<h2>Verbindung getrennt</h2><p>${esc(reason)}</p><div class="row"><button class="btn" data-a="back">Zum Hauptmenü</button></div>`);
      this.bind(box, { back: () => this.main() });
    };
    render();
  }
}
