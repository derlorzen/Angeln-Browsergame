// Klassisches Strategie-HUD (DOM): Ressourcenleiste, Auswahlfenster, Befehlskarte, Tooltips, Meldungen.
import {
  LEVEL_ROMAN, RES, RES_NAME, RULES, UPGRADES, costText, type BuildingType, type Cost, type Res, type UnitType,
} from '../data/defs';
import { FACTION_DEFS } from '../data/factions';
import { AGES, MAX_AGE, TECHS, TECH_IDS, unitAvailable, type TechId } from '../data/ages';
import type { CBuilding, CUnit } from '../game/client';
import type { Game } from '../game/game';
import { playerColor } from '../render/renderer';
import { portrait, resIcon } from '../render/sprites';

export interface CmdButton {
  key: string;
  icon?: string;
  glyph?: string;
  label: string;
  tip: () => string;
  state: () => 'ok' | 'poor' | 'na' | 'on';
  act: () => void;
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const BUILD_ORDER: [BuildingType, string][] = [
  ['wohnhaus', 'Q'], ['holzfaeller', 'W'], ['bauernhof', 'E'], ['lehmgrube', 'R'],
  ['heringszaun', 'A'], ['muehle', 'S'], ['raeucherei', 'D'], ['markt', 'F'],
  ['kaserne', 'Y'],
];
/** zweite Bauseite: Gebäude der späteren Zeitalter */
const ERA_ORDER: [BuildingType, string][] = [
  ['manufaktur', 'Q'], ['hafen', 'W'], ['schanze', 'E'], ['bahnhof', 'R'],
  ['fabrik', 'A'], ['bunker', 'S'], ['vertikalfarm', 'D'], ['gezeitenwerk', 'F'],
  ['schildturm', 'Y'],
];
const KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Y', 'X', 'C', 'V'];

export class Hud {
  private top = document.getElementById('topbar')!;
  private sel = document.getElementById('selinfo')!;
  private card = document.getElementById('cmdcard')!;
  private tip = document.getElementById('tooltip')!;
  private log = document.getElementById('msglog')!;
  buttons: CmdButton[] = [];
  /** Bauseite der Arbeiter: false = Grundbauten, true = Epochenbauten */
  buildPage = false;
  private cardKey = '';
  private selKey = '';
  private tipSrc: (() => string) | null = null;
  private resEls = new Map<string, HTMLElement>();

  constructor(private game: Game) {
    this.buildTop();
  }

  // ---------------------------------------------------------------- Ressourcenleiste
  private buildTop(): void {
    const tips: Record<string, string> = {
      holz: 'Holz: von Arbeitern im Wald geschlagen. Für fast alle Gebäude nötig.',
      getreide: 'Getreide: vom Bauernhof (Arbeiter zuweisen). Für Arbeiter, Soldaten und die Mühle.',
      fisch: 'Fisch: vom Heringszaun am Ufer (Meer, Fluss, See, Watt oder Fischteich). Für Soldaten, Späher und die Räucherei.',
      lehm: 'Lehm: aus der Lehmgrube (nur auf Lehmboden). Für Gebäude.',
      waren: 'Waren: Mehl aus der Mühle und Bückling aus der Räucherei. Am Markt verkaufen.',
      taler: 'Taler: Erlös aus dem Warenverkauf. Für Soldaten und Zukäufe am Markt.',
    };
    const parts: string[] = [];
    for (const r of RES) parts.push(`<div class="res" data-r="${r}" data-tip="${esc(tips[r])}"><img src="${resIcon(r)}" alt=""><b>0</b></div>`);
    parts.push(`<div class="res" data-r="pop" data-tip="Bevölkerung / Obergrenze. Wohnhäuser erhöhen die Grenze um 5 (max. ${RULES.maxPop})."><img src="${resIcon('pop')}" alt=""><b>0</b></div>`);
    parts.push(`<div class="res goal" data-r="prestige" data-tip=""><img src="${resIcon('prestige')}" alt=""><b>0</b><span class="bar"><i></i></span><span class="bar enemy"><i></i></span></div>`);
    parts.push(`<div class="res" data-r="brarup" data-tip="${esc(this.game.client.map.marketName)} (neutral, ⚑): Wer ihn allein mit Einheiten besetzt (Radius ${RULES.brarupRadius}), erhält bessere Preise, doppeltes Prestige je Verkauf und alle ${RULES.brarupTrickle.every} s 1 Prestige."><span>⚑</span><b style="min-width:90px">frei</b></div>`);
    parts.push(`<div class="res age" data-r="age" data-tip=""><span>⌛</span><b style="min-width:52px">17. Jh.</b></div>`);
    parts.push('<div class="spacer"></div><span id="netinfo" class="note"></span><span id="clock">00:00</span>');
    parts.push('<button class="btn" data-act="help" title="Hilfe (F1)">Hilfe</button><button class="btn" data-act="tut" title="Lehrmeister (F2)">Lehrmeister</button><button class="btn" data-act="mute" title="Ton an/aus (M)">Ton</button><button class="btn" data-act="menu" title="Menü (Esc)">Menü</button>');
    this.top.innerHTML = parts.join('');
    this.top.querySelectorAll<HTMLElement>('.res').forEach((el) => this.resEls.set(el.dataset.r!, el));
    this.top.querySelectorAll<HTMLElement>('[data-act]').forEach((el) =>
      el.addEventListener('click', () => this.game.uiAction(el.dataset.act!)),
    );
    this.top.querySelectorAll<HTMLElement>('.res').forEach((el) => {
      el.addEventListener('mouseenter', () => this.showTip(el, () => el.dataset.tip || (el.dataset.r === 'age' ? this.ageTip() : this.prestigeTip())));
      el.addEventListener('mouseleave', () => this.hideTip());
    });
  }

  private prestigeTip(): string {
    const c = this.game.client;
    const rows = c.players.map((p) => `${esc(p.name)}: ${p.prestige} Prestige${p.defeated ? ' (besiegt)' : ''}`).join('<br>');
    return `<h4>Prestige</h4>${c.goal ? `Wirtschaftlicher Sieg bei <b>${c.goal}</b> Prestige.` : 'Kein wirtschaftlicher Sieg in dieser Partie – nur militärisch.'}<br>Prestige gibt es für Warenverkäufe am Markt (${RULES.marketSell.prestige}, mit besetztem ${esc(c.map.marketName)} ${RULES.marketSellControlled.prestige} je ${RULES.marketSell.waren} Waren), für die Besetzung des ${esc(c.map.marketName)} und einmalig für die Erkundung der Fundstelle „${esc(c.map.site.name)}“ (${RULES.moorReward.prestige}).<br><br>${rows}`;
  }

  private ageTip(): string {
    const c = this.game.client;
    const a = c.age(c.me);
    const rows = AGES.slice(1).map((d) => `<div class="row2 ${d.n === a ? '' : 'note'}">${d.n === a ? '▶ ' : ''}<b>${d.name}</b> (${d.year}) – ${esc(d.title)}</div>`).join('');
    const next = AGES[a + 1];
    const how = next
      ? `<div class="row2"><b>Nächstes Zeitalter:</b> im Dorfzentrum (Taste A). Kosten ${this.costHtml(next.cost)}, Dauer ${next.time} s; benötigt ${next.need} von: ${next.requires.map((t) => `<span class="${c.hasBuilt(t) ? '' : 'c-bad'}">${c.bd(c.me, t).name}</span>`).join(', ')}.</div><div class="row2 note">${esc(next.desc)}</div>`
      : '<div class="row2">Das letzte Zeitalter ist erreicht.</div>';
    const enemies = c.players.filter((p) => p.id !== c.me).map((p) => `${esc(p.name)}: ${AGES[p.age ?? 1].short}`).join(' · ');
    return `<h4>Zeitalter</h4>${rows}${how}<div class="row2 note">Gegner: ${enemies}</div>`;
  }

  updateTop(): void {
    const c = this.game.client;
    const me = c.mePlayer;
    if (!me) return;
    this.resEls.get('age')!.querySelector('b')!.textContent = AGES[me.age ?? 1].short;
    for (const r of RES) {
      const el = this.resEls.get(r)!;
      const v = Math.floor(me.res?.[r] ?? 0);
      el.querySelector('b')!.textContent = String(v);
    }
    const pop = this.resEls.get('pop')!;
    pop.querySelector('b')!.textContent = `${me.pop ?? 0}/${me.popCap ?? 0}`;
    pop.classList.toggle('low', (me.pop ?? 0) >= (me.popCap ?? 0));
    const pr = this.resEls.get('prestige')!;
    pr.querySelector('b')!.textContent = c.goal ? `${me.prestige}/${c.goal}` : `${me.prestige}`;
    const bars = pr.querySelectorAll<HTMLElement>('.bar i');
    const gl = c.goal || 600;
    bars[0].style.width = `${Math.min(100, (me.prestige / gl) * 100)}%`;
    const enemy = c.players.filter((p) => p.id !== c.me).reduce((m, p) => Math.max(m, p.prestige), 0);
    bars[1].style.width = `${Math.min(100, (enemy / gl) * 100)}%`;
    const br = this.resEls.get('brarup')!;
    const ctrl = c.brarup.c;
    const b = br.querySelector('b')!;
    b.textContent = ctrl < 0 ? (c.brarup.x ? 'umkämpft' : 'frei') : ctrl === c.me ? 'in eurer Hand' : `bei ${c.players[ctrl]?.name ?? '?'}`;
    (br.querySelector('span') as HTMLElement).style.color = ctrl < 0 ? '#e8e0c8' : playerColor(c, ctrl);
    const secs = Math.floor(c.tick / RULES.tickRate);
    document.getElementById('clock')!.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const net = document.getElementById('netinfo')!;
    net.textContent = this.game.driver.kind === 'local' ? '' : `${this.game.driver.kind === 'host' ? 'Host' : 'Gast'} · ${Math.round(this.game.driver.latencyMs)} ms`;
  }

  // ---------------------------------------------------------------- Meldungen
  message(text: string, cls = ''): void {
    const d = document.createElement('div');
    d.textContent = text;
    if (cls) d.className = cls;
    this.log.appendChild(d);
    while (this.log.children.length > 6) this.log.firstChild!.remove();
    window.setTimeout(() => (d.style.opacity = '0'), 7000);
    window.setTimeout(() => d.remove(), 8200);
  }

  // ---------------------------------------------------------------- Tooltip
  showTip(anchor: HTMLElement, src: () => string): void {
    this.tipSrc = src;
    this.tip.innerHTML = src();
    this.tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const tr = this.tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2;
    x = Math.max(4, Math.min(window.innerWidth - tr.width - 4, x));
    let y = r.top - tr.height - 6;
    if (y < 4) y = r.bottom + 6;
    this.tip.style.left = x + 'px';
    this.tip.style.top = y + 'px';
  }
  hideTip(): void {
    this.tipSrc = null;
    this.tip.classList.add('hidden');
  }
  refreshTip(): void {
    if (this.tipSrc) this.tip.innerHTML = this.tipSrc();
  }

  // ---------------------------------------------------------------- Kosten-/Regeltexte
  private costHtml(c: Cost): string {
    const res = this.game.client.mePlayer?.res;
    const parts: string[] = [];
    for (const r of RES) {
      const v = c[r];
      if (!v) continue;
      const bad = res && res[r] < v;
      parts.push(`<span class="${bad ? 'c-bad' : ''}">${v} ${RES_NAME[r]}</span>`);
    }
    return parts.length ? parts.join(', ') : 'kostenlos';
  }

  canAfford(c: Cost): boolean {
    const res = this.game.client.mePlayer?.res;
    if (!res) return false;
    return RES.every((r) => (c[r] ?? 0) <= res[r]);
  }

  buildingTip(t: BuildingType): string {
    const c = this.game.client;
    const d = c.bd(c.me, t);
    const rows: string[] = [`<h4>${d.name}</h4><div>${esc(d.desc)}</div>`];
    if ((d.age ?? 1) > 1) rows.push(`<div class="row2 ${(d.age ?? 1) > c.age(c.me) ? 'c-bad' : ''}"><b>Zeitalter:</b> ab ${AGES[d.age ?? 1].name}</div>`);
    rows.push(`<div class="row2"><b>Kosten:</b> ${this.costHtml(d.cost)}</div>`);
    rows.push(`<div class="row2"><b>Bauzeit:</b> ${d.buildTime} s mit einem Arbeiter (mehrere Arbeiter bauen schneller)</div>`);
    if (d.requires?.length)
      rows.push(`<div class="row2"><b>Voraussetzung:</b> ${d.requires.map((r) => `<span class="${c.hasBuilt(r) ? '' : 'c-bad'}">${c.bd(c.me, r).name} (fertig)</span>`).join(', ')}</div>`);
    if (d.popCap) rows.push(`<div class="row2"><b>Bevölkerung:</b> +${d.popCap}</div>`);
    if (d.produce)
      rows.push(`<div class="row2"><b>Ertrag:</b> ${d.produce.amount} ${RES_NAME[d.produce.res]} alle ${fmt(d.produce.time)} s${d.produce.perWorker ? ' je zugewiesenem Arbeiter (max. ' + d.staffSlots + ')' : ' (selbstständig)'}</div>`);
    if (d.process) rows.push(`<div class="row2"><b>Verarbeitung:</b> ${costText(d.process.input)} → ${costText(d.process.output)} alle ${fmt(d.process.time)} s</div>`);
    if (d.placement === 'ufer') rows.push('<div class="row2"><b>Bauplatz:</b> direkt am Ufer (Wasser oder Watt)</div>');
    if (d.placement === 'lehm') rows.push('<div class="row2"><b>Bauplatz:</b> mindestens 2 Felder Lehmboden</div>');
    rows.push(`<div class="row2 note">Nur innerhalb von ${RULES.buildRadius} Kacheln um eigene fertige Gebäude. Linksklick setzt, Umschalt hält den Baumodus, Rechtsklick bricht ab.</div>`);
    return rows.join('');
  }

  unitTip(t: UnitType, where: string): string {
    const c = this.game.client;
    const u = c.ud(c.me, t);
    const uniq = Object.values(FACTION_DEFS).find((f) => f.unique === t);
    return `<h4>${u.name}</h4><div>${esc(u.desc)}</div>${uniq ? `<div class="row2"><b>Spezialeinheit der ${uniq.name}</b></div>` : ''}
      <div class="row2"><b>Kosten:</b> ${this.costHtml(u.cost)} · 1 Bevölkerung</div>
      <div class="row2"><b>Ausbildung:</b> ${u.trainTime} s in ${where}</div>
      <div class="row2"><b>Werte:</b> ${u.hp} LP · Schaden ${u.dmg} · Reichweite ${u.range} · Rüstung ${u.armor} · Tempo ${u.speed}</div>`;
  }

  // ---------------------------------------------------------------- Auswahl & Befehlskarte
  update(force = false): void {
    const g = this.game;
    const c = g.client;
    const ids = [...g.selected];
    const units = ids.map((i) => c.units.get(i)).filter((u): u is CUnit => !!u);
    const blds = ids.map((i) => c.buildings.get(i)).filter((b): b is CBuilding => !!b);
    // Auswahlfenster
    let key: string;
    if (units.length === 1 && !blds.length) {
      const u = units[0];
      key = `u${u.i}:${u.h}:${u.a}:${u.c ?? 0}:${u.w ?? 0}`;
    } else if (units.length > 1) key = 'm' + units.map((u) => `${u.i}:${u.h}`).join(',');
    else if (blds.length) {
      const b = blds[0];
      key = `b${b.i}:${b.h}:${b.p}:${b.q?.join()}:${b.qp}:${b.s}:${b.st?.length}:${b.as}:${b.ac}:${c.brarup.c}`;
    } else key = 'none';
    if (force || key !== this.selKey) {
      this.selKey = key;
      this.renderSel(units, blds);
    }
    // Befehlskarte
    const res = c.mePlayer?.res;
    const ckey = `${ids.join(',')}|${blds.map((b) => `${b.b}${b.q?.length}${b.as}${b.l ?? 1}${b.u === undefined ? '' : 'u' + b.uk}`).join()}|${c.age(c.me)}|${c.mePlayer?.techs?.length ?? 0}|${this.buildPage}|${res ? RES.map((r) => Math.floor(res[r])).join(',') : ''}|${g.attackMove}|${g.placement?.type}`;
    if (force || ckey !== this.cardKey) {
      this.cardKey = ckey;
      this.buttons = this.makeButtons(units, blds);
      this.renderCard();
      this.refreshTip();
    }
  }

  private unitStatus(u: CUnit): string {
    if (u.w) return u.a === 2 ? 'Arbeitet im Betrieb' : 'Geht zur Arbeit';
    if (u.a === 3) return 'Kämpft';
    if (u.a === 2) return u.t === 'arbeiter' ? (u.c ? 'Schlägt Holz' : 'Arbeitet') : 'Kämpft';
    if (u.a === 1) return u.c ? `Unterwegs (trägt ${u.c} Holz)` : 'Unterwegs';
    return 'Bereit';
  }

  private hpBar(h: number, m: number): string {
    const f = Math.max(0, Math.min(1, h / m));
    return `<div class="hp ${f < 0.3 ? 'low' : f < 0.6 ? 'mid' : ''}"><i style="width:${f * 100}%"></i></div>`;
  }

  private renderSel(units: CUnit[], blds: CBuilding[]): void {
    const c = this.game.client;
    if (units.length === 1 && !blds.length) {
      const u = units[0];
      const d = c.ud(u.o, u.t);
      const owner = c.players[u.o];
      this.sel.innerHTML = `<img class="portrait" src="${portrait('u', u.t, playerColor(c, u.o), c.faction(u.o))}" alt="">
        <div class="selmain"><div class="name">${d.name}</div>
        <div class="stat">${esc(owner?.name ?? '')} · ${FACTION_DEFS[c.faction(u.o)].name}${u.o === c.me ? '' : ' (Gegner)'}</div>
        ${this.hpBar(u.h, d.hp)}<div class="stat">${u.h} / ${d.hp} Lebenspunkte</div>
        <div class="stat">Schaden ${d.dmg} · Reichweite ${d.range} · Rüstung ${d.armor} · Sicht ${d.vision}</div>
        <div class="stat">${u.o === c.me ? this.unitStatus(u) : ''}</div></div>`;
      return;
    }
    if (units.length > 1) {
      this.sel.innerHTML = `<div class="multi">${units
        .slice(0, 40)
        .map((u) => `<div class="m" data-id="${u.i}" title="${c.ud(u.o, u.t).name}"><img src="${portrait('u', u.t, playerColor(c, u.o), c.faction(u.o))}" alt=""><div class="h"><i style="width:${(u.h / c.ud(u.o, u.t).hp) * 100}%"></i></div></div>`)
        .join('')}</div>`;
      this.sel.querySelectorAll<HTMLElement>('.m').forEach((el) =>
        el.addEventListener('click', (e) => {
          const id = Number(el.dataset.id);
          if (e.shiftKey) this.game.selected.delete(id);
          else {
            this.game.selected.clear();
            this.game.selected.add(id);
          }
          this.update(true);
        }),
      );
      return;
    }
    if (blds.length) {
      const b = blds[0];
      const d = c.bdl(b);
      const mine = b.o === c.me;
      const lines: string[] = [];
      if (!b.b) lines.push(`Im Bau: ${b.p} % – Arbeiter per Rechtsklick zum Bauen schicken`);
      else if (mine && b.u !== undefined) lines.push(this.projectText(b));
      else if (b.t === 'brarupmarkt') {
        const ctrl = c.brarup.c;
        lines.push(ctrl < 0 ? (c.brarup.x ? 'Umkämpft – niemand hat die Kontrolle' : 'Unbesetzt') : `Kontrolliert von ${esc(c.players[ctrl]?.name ?? '?')}`);
        lines.push(`Einheiten im Umkreis von ${RULES.brarupRadius} Kacheln besetzen den Markt.`);
      } else if (mine) {
        if (b.s) lines.push(esc(b.s));
        if (d.staffSlots) lines.push(`Arbeiter: ${b.st?.length ?? 0}/${d.staffSlots}${b.t === 'bauernhof' ? ` · Felder: ${b.f?.length ?? 0}` : ''}`);
        if (d.process) lines.push(`${costText(d.process.input)} → ${costText(d.process.output)} (${d.process.time} s)`);
        if (b.t === 'markt') {
          const ctrl = c.brarup.c === c.me;
          const s = ctrl ? RULES.marketSellControlled : RULES.marketSell;
          lines.push(`Verkauf: ${s.waren} Waren → ${Math.round(s.taler * (FACTION_DEFS[c.faction(c.me)].marketTalerMul ?? 1) * this.marketMul())} Taler + ${s.prestige} Prestige${ctrl ? ' (Marktbonus)' : ''}`);
          lines.push(`Automatischer Verkauf: ${b.as ? 'an' : 'aus'}`);
        }
        if (d.popCap) lines.push(`Bietet Wohnraum für ${d.popCap}`);
        if (d.dropoff) lines.push(d.dropoff.includes('all') ? 'Nimmt alle Rohstoffe an' : 'Nimmt Holz an');
      } else lines.push(`Gehört ${esc(c.players[b.o]?.name ?? '?')}${b.ghost ? ' (zuletzt gesehen)' : ''}`);
      const queue = mine && b.q?.length
        ? `<div class="queue">${b.q.map((t, k) => `<div class="q" data-k="${k}" title="${c.ud(c.me, t).name} – Klick: abbrechen"><img src="${portrait('u', t, playerColor(c, c.me), c.faction(c.me))}" alt="">${k === 0 ? `<div class="p" style="width:${b.qp ?? 0}%"></div>` : ''}</div>`).join('')}</div>`
        : '';
      this.sel.innerHTML = `<img class="portrait" src="${portrait('b', b.t, playerColor(c, b.o), b.o < 0 ? 'angeln' : c.faction(b.o), b.o < 0 ? 1 : c.age(b.o))}" alt="">
        <div class="selmain"><div class="name">${esc(c.bname(b))}${b.o >= 0 && b.t === 'dorfzentrum' ? ` <span class="note">· ${AGES[c.age(b.o)].short}</span>` : ''}</div>
        ${b.o >= 0 ? this.hpBar(b.h, b.m) + `<div class="stat">${b.h} / ${b.m} Lebenspunkte</div>` : ''}
        ${lines.map((l) => `<div class="stat">${l}</div>`).join('')}${queue}</div>`;
      this.sel.querySelectorAll<HTMLElement>('.q').forEach((el) => el.addEventListener('click', () => this.game.issue({ c: 'cancel', b: b.i })));
      return;
    }
    const me = c.mePlayer;
    this.sel.innerHTML = `<div class="selmain"><div class="name">${esc(me?.name ?? '')}</div>
      <div class="stat">Nichts ausgewählt. Linksklick wählt aus, Rahmen ziehen wählt mehrere Einheiten.</div>
      <div class="stat">Rechtsklick: bewegen, Holz schlagen, bauen, zuweisen oder angreifen.</div>
      <div class="stat">Ziel: gegnerisches Dorfzentrum zerstören${c.goal ? ` oder ${c.goal} Prestige erreichen` : ''}.</div></div>`;
  }

  private makeButtons(units: CUnit[], blds: CBuilding[]): CmdButton[] {
    const g = this.game;
    const c = g.client;
    const own = units.filter((u) => u.o === c.me);
    const out: CmdButton[] = [];
    const color = playerColor(c, c.me);
    if (own.length) {
      const workers = own.filter((u) => u.t === 'arbeiter');
      if (workers.length) {
        const myAge = c.age(c.me);
        for (const [t, key] of this.buildPage ? ERA_ORDER : BUILD_ORDER) {
          const d = c.bd(c.me, t);
          out.push({
            key, icon: portrait('b', t, color, c.faction(c.me), myAge), label: d.name,
            tip: () => this.buildingTip(t),
            state: () => ((d.age ?? 1) > myAge || d.requires?.some((r) => !c.hasBuilt(r)) ? 'na' : !this.canAfford(d.cost) ? 'poor' : g.placement?.type === t ? 'on' : 'ok'),
            act: () => g.beginPlacement(t),
          });
        }
      } else {
        out.push(...Array.from({ length: 4 }, () => null as unknown as CmdButton));
        out.push({
          key: 'A', glyph: '⚔', label: 'Angriff', tip: () => '<h4>Angriffsbewegung (A)</h4>Danach Linksklick auf ein Ziel: Die Einheiten laufen dorthin und greifen unterwegs jeden Gegner an.',
          state: () => (g.attackMove ? 'on' : 'ok'), act: () => g.armAttackMove(),
        });
      }
      while (out.length < 9) out.push(null as unknown as CmdButton);
      out.push({
        key: 'X', glyph: '✋', label: 'Halt', tip: () => '<h4>Halt (X)</h4>Einheiten brechen ihre aktuelle Aufgabe ab.',
        state: () => 'ok', act: () => g.issue({ c: 'stop', ids: own.map((u) => u.i) }),
      });
      if (workers.length && own.length > workers.length)
        out.push({
          key: 'C', glyph: '⚔', label: 'Angriff', tip: () => '<h4>Angriffsbewegung (C)</h4>Danach Linksklick auf ein Ziel.',
          state: () => (g.attackMove ? 'on' : 'ok'), act: () => g.armAttackMove(),
        });
      if (workers.length) {
        while (out.length < 11) out.push(null as unknown as CmdButton);
        const era = this.buildPage;
        out[11] = {
          key: 'V', glyph: era ? '◂' : '▸', label: era ? 'Grundbauten' : 'Epochenbauten',
          tip: () => era ? '<h4>Grundbauten (V)</h4>Zurück zu den Gebäuden des 17. Jahrhunderts.' : `<h4>Epochenbauten (V)</h4>Gebäude des 18., 20. und 22. Jahrhunderts. Freigeschaltet bis: ${AGES[c.age(c.me)].name}.`,
          state: () => 'ok',
          act: () => {
            this.buildPage = !this.buildPage;
            this.update(true);
          },
        };
      }
      return out;
    }
    if (blds.length === 1 && blds[0].o === c.me) {
      const b = blds[0];
      const d = c.bdl(b);
      if (!b.b) {
        while (out.length < 11) out.push(null as unknown as CmdButton);
        out.push({
          key: 'V', glyph: '✖', label: 'Abbrechen', tip: () => '<h4>Bau abbrechen (V)</h4>Die Baustelle wird entfernt, 75 % der Kosten werden erstattet.',
          state: () => 'ok', act: () => g.issue({ c: 'cancel', b: b.i }),
        });
        return out;
      }
      if (d.trains) {
        const avail = d.trains.filter((t) => unitAvailable(c.ud(c.me, t), c.age(c.me)));
        avail.forEach((t, k) => {
          const ud = c.ud(c.me, t);
          out.push({
            key: KEYS[k], icon: portrait('u', t, color, c.faction(c.me)), label: ud.name,
            tip: () => this.unitTip(t, d.name),
            state: () => (!this.canAfford(ud.cost) ? 'poor' : 'ok'),
            act: () => g.issue({ c: 'train', b: b.i, u: t }),
          });
        });
        while (out.length < 8) out.push(null as unknown as CmdButton);
        out.push({
          key: 'Y', glyph: '⚑', label: 'Sammelpunkt',
          tip: () => '<h4>Sammelpunkt</h4>Bei ausgewähltem Gebäude per Rechtsklick auf die Karte setzen. Neue Einheiten laufen dorthin (Arbeiter auf einem Baum schlagen sofort Holz).',
          state: () => 'ok', act: () => g.hud.message('Rechtsklick auf die Karte setzt den Sammelpunkt.'),
        });
        while (out.length < 11) out.push(null as unknown as CmdButton);
        out.push({
          key: 'V', glyph: '✖', label: 'Abbrechen', tip: () => '<h4>Ausbildung abbrechen (V)</h4>Entfernt die letzte Einheit aus der Warteschlange und erstattet die Kosten.',
          state: () => (b.q?.length ? 'ok' : 'na'), act: () => g.issue({ c: 'cancel', b: b.i }),
        });
      }
      if (b.t === 'markt') {
        const ctrl = () => c.brarup.c === c.me;
        const fd = FACTION_DEFS[c.faction(c.me)];
        const base = () => (ctrl() ? RULES.marketSellControlled : RULES.marketSell);
        const sell = () => ({ ...base(), taler: Math.round(base().taler * (fd.marketTalerMul ?? 1) * this.marketMul()), prestige: base().prestige * (fd.marketPrestigeMul ?? 1) });
        const buyPrice = Math.round(RULES.marketBuy.taler * (fd.marketBuyMul ?? 1));
        out.push({
          key: 'Q', icon: resIcon('waren'), label: 'Verkaufen',
          tip: () => `<h4>Waren verkaufen (Q)</h4>${sell().waren} Waren → ${sell().taler} Taler und ${sell().prestige} Prestige.<br>Wer den ${esc(c.map.marketName)} besetzt, erhält ${RULES.marketSellControlled.taler} Taler und ${RULES.marketSellControlled.prestige} Prestige.`,
          state: () => ((c.mePlayer?.res?.waren ?? 0) >= RULES.marketSell.waren ? 'ok' : 'poor'),
          act: () => g.issue({ c: 'sell', b: b.i }),
        });
        out.push({
          key: 'W', glyph: '↻', label: b.as ? 'Auto: an' : 'Auto: aus',
          tip: () => '<h4>Automatischer Verkauf (W)</h4>Verkauft Waren selbstständig, sobald genug vorhanden sind.',
          state: () => (b.as ? 'on' : 'ok'), act: () => g.issue({ c: 'auto', b: b.i, on: !b.as }),
        });
        out.push({
          key: 'E', icon: resIcon('holz'), label: 'Holz kaufen',
          tip: () => `<h4>Holz kaufen (E)</h4>${buyPrice} Taler → ${RULES.marketBuy.amount} Holz`,
          state: () => ((c.mePlayer?.res?.taler ?? 0) >= buyPrice ? 'ok' : 'poor'),
          act: () => g.issue({ c: 'buy', b: b.i, r: 'holz' }),
        });
        out.push({
          key: 'R', icon: resIcon('lehm'), label: 'Lehm kaufen',
          tip: () => `<h4>Lehm kaufen (R)</h4>${buyPrice} Taler → ${RULES.marketBuy.amount} Lehm`,
          state: () => ((c.mePlayer?.res?.taler ?? 0) >= buyPrice ? 'ok' : 'poor'),
          act: () => g.issue({ c: 'buy', b: b.i, r: 'lehm' }),
        });
        out.push({
          key: 'A', icon: resIcon('getreide'), label: 'Getreide kaufen',
          tip: () => `<h4>Getreide kaufen (A)</h4>${buyPrice} Taler → ${RULES.marketBuy.amount} Getreide – hilft, wenn Höfe ausgefallen sind.`,
          state: () => ((c.mePlayer?.res?.taler ?? 0) >= buyPrice ? 'ok' : 'poor'),
          act: () => g.issue({ c: 'buy', b: b.i, r: 'getreide' }),
        });
      }
      // Zeitalter (Dorfzentrum) und Technologien auf freien Plätzen der zweiten Reihe
      const free = (pref: number[]) => {
        while (out.length < 12) out.push(null as unknown as CmdButton);
        return pref.find((k) => !out[k]) ?? -1;
      };
      if (b.t === 'dorfzentrum' && b.b && c.age(c.me) < MAX_AGE && b.u === undefined) {
        const next = AGES[c.age(c.me) + 1];
        const k = free([4, 5, 6, 7]);
        if (k >= 0)
          out[k] = {
            key: KEYS[k], glyph: '⌛', label: `Ins ${next.short}`,
            tip: () => {
              const why = c.ageBlock(b);
              return `<h4>Aufstieg: ${next.name} (${next.year}, ${KEYS[k]})</h4><div><b>${esc(next.title)}.</b> ${esc(next.desc)}</div>
                <div class="row2"><b>Kosten:</b> ${this.costHtml(next.cost)}</div><div class="row2"><b>Dauer:</b> ${next.time} s · +${next.prestige} Prestige</div>
                <div class="row2"><b>Voraussetzung:</b> ${next.need} von ${next.requires.map((t) => `<span class="${c.hasBuilt(t) ? '' : 'c-bad'}">${c.bd(c.me, t).name}</span>`).join(', ')} (fertig)</div>
                ${why && !why.startsWith('Benötigt') ? `<div class="row2 c-bad">${esc(why)}</div>` : ''}`;
            },
            state: () => (c.ageBlock(b) ? 'na' : !this.canAfford(next.cost) ? 'poor' : 'ok'),
            act: () => g.issue({ c: 'age', b: b.i }),
          };
      }
      if (b.b && b.u === undefined) {
        const techs = TECH_IDS.filter((id) => TECHS[id].at === b.t && !c.hasTech(id) && TECHS[id].age <= c.age(c.me) + 1);
        for (const id of techs.slice(0, 3)) {
          const k = free([4, 5, 6, 7]);
          if (k < 0) break;
          const t = TECHS[id];
          out[k] = {
            key: KEYS[k], glyph: '✦', label: t.name,
            tip: () => {
              const why = c.techBlock(b, id as TechId);
              return `<h4>Forschung: ${esc(t.name)} (${KEYS[k]})</h4><div>${esc(t.desc)}</div>
                <div class="row2"><b>Kosten:</b> ${this.costHtml(t.cost)}</div><div class="row2"><b>Dauer:</b> ${t.time} s · gilt für die ganze Partei</div>
                ${why ? `<div class="row2 c-bad">${esc(why)}</div>` : ''}`;
            },
            state: () => (c.techBlock(b, id as TechId) ? 'na' : !this.canAfford(t.cost) ? 'poor' : 'ok'),
            act: () => g.issue({ c: 'research', b: b.i, t: id }),
          };
        }
      }
      if (b.u !== undefined) {
        while (out.length < 11) out.push(null as unknown as CmdButton);
        out[10] = {
          key: 'C', glyph: '⨯', label: 'Vorhaben stopp',
          tip: () => `<h4>Vorhaben abbrechen (C)</h4>${esc(this.projectText(b))}. Abbrechen erstattet die vollen Kosten.`,
          state: () => 'ok', act: () => g.issue({ c: 'upcancel', b: b.i }),
        };
      }
      const ups = UPGRADES[b.t];
      if (ups && b.u === undefined) {
        while (out.length < 10) out.push(null as unknown as CmdButton);
        const l = b.l ?? 1;
        if (l < ups.length + 1) {
          const up = ups[l - 1];
          out[10] = {
            key: 'C', glyph: '▲', label: `Stufe ${LEVEL_ROMAN[l + 1]}`,
            tip: () => {
              const why = c.upgradeBlock(b);
              return `<h4>Ausbau: ${esc(up.name)} (Stufe ${LEVEL_ROMAN[l + 1]}, C)</h4><div>${esc(up.desc)}</div>
                <div class="row2"><b>Kosten:</b> ${this.costHtml(up.cost)}</div><div class="row2"><b>Dauer:</b> ${up.time} s (das Gebäude arbeitet weiter)</div>
                ${why ? `<div class="row2 c-bad">${esc(why)}</div>` : ''}`;
            },
            state: () => (c.upgradeBlock(b) ? 'na' : !this.canAfford(up.cost) ? 'poor' : 'ok'),
            act: () => g.issue({ c: 'upgrade', b: b.i }),
          };
        }
      }
    }
    return out;
  }

  /** Beschreibung des laufenden Vorhabens eines Gebäudes. */
  projectText(b: CBuilding): string {
    const c = this.game.client;
    if (b.uk === 'age') return `Aufstieg ins ${AGES[Math.min(MAX_AGE, c.age(c.me) + 1)].name}: ${b.u ?? 0} %`;
    if (b.uk && b.uk !== 'lvl') return `Forschung „${TECHS[b.uk].name}“: ${b.u ?? 0} %`;
    return `Ausbau zu „${UPGRADES[b.t]?.[(b.l ?? 1) - 1]?.name ?? ''}“: ${b.u ?? 0} %`;
  }

  /** Talerfaktor des besten eigenen Markts (Ausbaustufe). */
  private marketMul(): number {
    const l = this.game.client.bestLevel('markt');
    return l > 1 ? (UPGRADES.markt?.[l - 2]?.fx.taler ?? 1) : 1;
  }

  private renderCard(): void {
    const html: string[] = [];
    for (let k = 0; k < 12; k++) {
      const b = this.buttons[k];
      if (!b) {
        html.push('<div></div>');
        continue;
      }
      const st = b.state();
      html.push(`<div class="cmd ${st === 'ok' ? '' : st}" data-k="${k}">${b.icon ? `<img src="${b.icon}" alt="">` : `<div class="glyph">${b.glyph ?? ''}</div>`}<span class="k">${b.key}</span><span class="lbl">${esc(b.label)}</span></div>`);
    }
    this.card.innerHTML = html.join('');
    this.card.querySelectorAll<HTMLElement>('.cmd').forEach((el) => {
      const b = this.buttons[Number(el.dataset.k)];
      el.addEventListener('click', () => this.press(b));
      el.addEventListener('mouseenter', () => this.showTip(el, b.tip));
      el.addEventListener('mouseleave', () => this.hideTip());
    });
  }

  press(b: CmdButton | undefined): void {
    if (!b) return;
    const st = b.state();
    if (st === 'na') {
      this.game.feedback('Voraussetzung fehlt – siehe Tooltip.');
      return;
    }
    b.act();
  }

  hotkey(key: string): boolean {
    const k = key.toUpperCase() === 'Z' ? 'Y' : key.toUpperCase();
    const b = this.buttons.find((x) => x && x.key === k);
    if (!b) return false;
    this.press(b);
    return true;
  }

  resName(r: Res): string {
    return RES_NAME[r];
  }
}
