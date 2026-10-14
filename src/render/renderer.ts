// Canvas-2D-Darstellung. Liest nur den ClientState und Oberflächenzustand; verändert keine Simulation.
import { BUILDINGS, RULES, UNITS } from '../data/defs';
import type { CBuilding, CUnit, ClientState } from '../game/client';
import { T, isBarrier } from '../sim/map';
import { barrierMask, barrierStyle, ditchMask, gateAlongX } from './terrainmask';
import { BaseRenderer, OK, UNIT_SCALE, playerColor, type Placement, type UIOverlay } from './view';
import { S, TH, TW } from './draw';
import {
  buildingSprite, drawScaffold, foundationSprite, makeGate, makeKnicks, makeTerrain,
  makeTrees, unitFrame, unitSprites, type BuildingSprite, type Sprite, type TerrainSprites,
} from './sprites';

export { playerColor };
export type { Placement, UIOverlay };

export class CanvasRenderer extends BaseRenderer {
  readonly kind = 'canvas' as const;
  readonly g: CanvasRenderingContext2D;
  private terrain: TerrainSprites;
  private trees: Sprite[];
  private knicks: Sprite[];
  private deiche: Sprite[];
  private walls: Sprite[];
  private gates: Sprite[];
  private objs: Float64Array = new Float64Array(0);
  private objCount = 0;

  constructor(canvas: HTMLCanvasElement, c: ClientState) {
    super(canvas, c);
    this.g = canvas.getContext('2d', { alpha: false })!;
    this.terrain = makeTerrain();
    this.trees = makeTrees();
    this.knicks = makeKnicks();
    this.deiche = makeKnicks('deich');
    this.walls = makeKnicks('wall');
    this.gates = [makeGate('x'), makeGate('y')];
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.vw = w;
    this.vh = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  // ---------------------------------------------------------------- Frame
  frame(now: number, ui: UIOverlay): void {
    const t0 = performance.now();
    const g = this.g;
    const c = this.c;
    const z = this.cam.z;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingEnabled = true;
    g.fillStyle = '#0b0d08';
    g.fillRect(0, 0, this.vw, this.vh);

    // sichtbarer Kachelbereich
    const corners = [this.toTile(0, 0), this.toTile(this.vw, 0), this.toTile(0, this.vh), this.toTile(this.vw, this.vh)];
    const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[0]))) - 2);
    const x1 = Math.min(c.map.w - 1, Math.ceil(Math.max(...corners.map((p) => p[0]))) + 2);
    const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p[1]))) - 2);
    const y1 = Math.min(c.map.h - 1, Math.ceil(Math.max(...corners.map((p) => p[1]))) + 4);
    const { w: W, terrain, variant } = c.map;
    const vis = c.vis;
    const tw = TW * z, th = TH * z;
    const waveFrame = Math.floor(now / 450);
    const ter = this.terrain;

    // 1) Bodenkacheln
    let drawn = 0;
    this.objCount = 0;
    const need = (x1 - x0 + 1) * (y1 - y0 + 1) + c.units.size + c.buildings.size + 8;
    if (this.objs.length < need * 2) this.objs = new Float64Array(need * 2 + 512);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (!vis[i]) continue;
        const [sx, sy] = this.toScreen(x, y);
        if (sx < -tw || sx > this.vw + tw || sy < -th * 3 || sy > this.vh + th) continue;
        const t = terrain[i];
        const v = variant[i];
        let img: HTMLCanvasElement;
        switch (t) {
          case T.WASSER: img = ter.wasser[v & 3]; break;
          case T.FLACH: img = ter.flach[v & 1]; break;
          case T.UFER: img = ter.ufer[v % 3]; break;
          case T.MOOR: img = ter.moor[v % 3]; break;
          case T.LEHM: img = ter.lehm[v & 1]; break;
          case T.HEIDE: img = ter.heide[v % 3]; break;
          case T.WATT: img = ter.watt[v % 3]; break;
          default: img = ter.gras[v & 3];
        }
        if (c.fieldOcc[i]) img = ter.feld[v % 3];
        g.drawImage(img, sx - tw / 2 - 0.5, sy - 0.5, tw + 1, th + 1);
        drawn++;
        if (t === T.GRABEN) g.drawImage(ter.ditch[ditchMask(c.map, x, y)], sx - tw / 2, sy, tw, th);
        if (t === T.WASSER || t === T.FLACH) {
          g.globalAlpha = t === T.FLACH ? 0.5 : 0.7;
          g.drawImage(ter.wave[(waveFrame + v) & 3], sx - tw / 2, sy, tw, th);
          g.globalAlpha = 1;
        } else if (t === T.WEG || t === T.TOR) {
          let m = 0;
          const road = (xx: number, yy: number) => {
            if (xx < 0 || yy < 0 || xx >= W || yy >= c.map.h) return false;
            const q = terrain[yy * W + xx];
            return q === T.WEG || q === T.TOR;
          };
          if (road(x + 1, y)) m |= 1;
          if (road(x - 1, y)) m |= 2;
          if (road(x, y + 1)) m |= 4;
          if (road(x, y - 1)) m |= 8;
          g.drawImage(ter.road[m], sx - tw / 2, sy, tw, th);
        }
        if (c.trees[i]) this.pushObj(x + y + 1, OK.Tree, i);
        else if (isBarrier(t)) this.pushObj(x + y + 1, OK.Knick, i);
        else if (t === T.TOR) this.pushObj(x + y + 1, OK.Gate, i);
      }
    }
    // Moor-Fundstelle
    const mo = c.map.site;
    if (vis[mo.y * W + mo.x]) this.pushObj(mo.x + mo.y + 1, OK.MoorSite, 0);
    for (const b of c.buildings.values()) {
      const d = BUILDINGS[b.t];
      if (b.x + d.w < x0 || b.x > x1 + 2 || b.y + d.h < y0 || b.y > y1 + 2) continue;
      this.pushObj(b.x + b.y + (d.w + d.h) / 2, OK.Building, b.i);
    }
    const alpha = Math.min(1, Math.max(0, (now - c.snapTime) / (1000 / RULES.tickRate)));
    for (const u of c.units.values()) {
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      if (ux < x0 - 1 || ux > x1 + 1 || uy < y0 - 1 || uy > y1 + 1) continue;
      this.pushObj(ux + uy, OK.Unit, u.i);
    }

    // Auswahlringe unter Einheiten
    for (const id of ui.selected) {
      const u = c.units.get(id);
      if (!u) continue;
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      const [sx, sy] = this.toScreen(ux, uy);
      g.strokeStyle = u.o === c.me ? '#a8e070' : '#e05a4a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(sx, sy, (UNITS[u.t].mounted ? 14 : 9) * z, (UNITS[u.t].mounted ? 6 : 4.5) * z, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // 2) Objekte tiefensortiert
    const n = this.objCount;
    const order: number[] = new Array(n);
    for (let k = 0; k < n; k++) order[k] = k;
    const objs = this.objs;
    order.sort((a, b) => objs[a * 2] - objs[b * 2]);
    for (const k of order) {
      const code = objs[k * 2 + 1];
      const kind = code % 8, ref = Math.floor(code / 8);
      switch (kind) {
        case OK.Tree: this.drawTree(ref); break;
        case OK.Knick: this.drawKnick(ref); break;
        case OK.Gate: this.drawGate(ref); break;
        case OK.Building: this.drawBuilding(c.buildings.get(ref)!, now, ui); break;
        case OK.Unit: this.drawUnit(c.units.get(ref)!, alpha, now, ui); break;
        case OK.MoorSite: this.drawMoorSite(now); break;
      }
    }

    // 3) Effekte
    this.drawEffects(now);

    // 4) Kriegsnebel
    this.refreshFog();
    g.save();
    g.setTransform(
      (TW / 2) * z * this.dpr, (TH / 2) * z * this.dpr, -(TW / 2) * z * this.dpr, (TH / 2) * z * this.dpr,
      (-this.cam.x * z + this.vw / 2) * this.dpr, (-this.cam.y * z + this.vh / 2) * this.dpr,
    );
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog, 0, 0);
    g.restore();

    // 5) Ortsnamen
    g.font = `italic ${Math.round(15 * Math.max(0.8, z))}px Georgia, 'Times New Roman', serif`;
    g.textAlign = 'center';
    for (const l of c.map.labels) {
      if (!vis[Math.max(0, Math.min(c.map.h - 1, l.y)) * W + Math.max(0, Math.min(W - 1, l.x))]) continue;
      const [sx, sy] = this.toScreen(l.x + 0.5, l.y + 0.5);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(l.name, sx + 1, sy + 1);
      g.fillStyle = '#f1e6c4';
      g.fillText(l.name, sx, sy);
    }

    // 6) Bauvorschau, Sammelpunkt, Auswahlrahmen
    if (ui.placement) this.drawPlacement(ui.placement);
    for (const id of ui.selected) {
      const b = c.buildings.get(id);
      if (b?.r && b.o === c.me) {
        const [sx, sy] = this.toScreen(b.r[0] + 0.5, b.r[1] + 0.5);
        g.strokeStyle = '#3b2a1a';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx, sy - 24 * z);
        g.stroke();
        g.fillStyle = playerColor(c, c.me);
        g.fillRect(sx, sy - 24 * z, 12 * z, 8 * z);
      }
    }
    if (ui.drag) {
      const d = ui.drag;
      g.strokeStyle = '#d8f0a0';
      g.lineWidth = 1;
      g.fillStyle = 'rgba(200,240,150,0.08)';
      g.fillRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      g.strokeRect(Math.min(d.x0, d.x1) + 0.5, Math.min(d.y0, d.y1) + 0.5, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
    }
    this.stats.drawn = drawn;
    this.stats.frameMs = performance.now() - t0;
  }

  private pushObj(depth: number, kind: OK, ref: number): void {
    const k = this.objCount++;
    this.objs[k * 2] = depth;
    this.objs[k * 2 + 1] = ref * 8 + kind;
  }

  private drawSprite(s: Sprite, sx: number, sy: number, scale = 1, flip = false): void {
    const z = this.cam.z * scale;
    const r = s.res ?? S;
    const w = (s.c.width / r) * z, h = (s.c.height / r) * z;
    if (sx + w < -50 || sx - w > this.vw + 50 || sy + h < -50 || sy - h > this.vh + 200) return;
    if (flip) {
      this.g.save();
      this.g.translate(sx, sy);
      this.g.scale(-1, 1);
      this.g.drawImage(s.c, -s.ax * z, -s.ay * z, w, h);
      this.g.restore();
    } else this.g.drawImage(s.c, sx - s.ax * z, sy - s.ay * z, w, h);
  }

  private drawTree(i: number): void {
    const W = this.c.map.w;
    const x = i % W, y = Math.floor(i / W);
    const v = this.c.map.variant[i];
    const [sx, sy] = this.toScreen(x + 0.5, y + 0.5);
    const amt = this.c.trees[i];
    const sc = amt < 15 ? 0.75 : 1;
    const jx = ((v & 7) - 3.5) * 2 * this.cam.z, jy = (((v >> 3) & 3) - 1.5) * 2 * this.cam.z;
    this.drawSprite(this.trees[v % this.trees.length], sx + jx, sy + jy + 4 * this.cam.z, sc, (v & 64) !== 0);
  }

  private drawKnick(i: number): void {
    const m = this.c.map;
    const x = i % m.w, y = Math.floor(i / m.w);
    const st = barrierStyle(m.terrain[i]);
    const set = st === 'deich' ? this.deiche : st === 'wall' ? this.walls : this.knicks;
    const [sx, sy] = this.toScreen(x, y);
    this.drawSprite(set[barrierMask(m, x, y)], sx, sy);
  }

  private drawGate(i: number): void {
    const m = this.c.map;
    const x = i % m.w, y = Math.floor(i / m.w);
    const [sx, sy] = this.toScreen(x, y);
    this.drawSprite(this.gates[gateAlongX(m, x, y) ? 1 : 0], sx, sy);
  }

  private drawMoorSite(now: number): void {
    const g = this.g, z = this.cam.z;
    const mo = this.c.map.site;
    const [sx, sy] = this.toScreen(mo.x + 0.5, mo.y + 0.5);
    // Torfstich mit Pflöcken und Markierung
    g.fillStyle = '#2a2116';
    g.beginPath();
    g.ellipse(sx, sy, 22 * z, 9 * z, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3d3020';
    g.fillRect(sx - 14 * z, sy - 3 * z, 28 * z, 4 * z);
    for (const [dx, dy] of [[-20, 0], [20, 0], [0, -9], [0, 9]]) {
      g.fillStyle = '#6b4a2c';
      g.fillRect(sx + dx * z - 1.5 * z, sy + dy * z - 12 * z, 3 * z, 12 * z);
    }
    const found = this.c.moor >= 0;
    const col = found ? playerColor(this.c, this.c.moor) : '#e8e0c8';
    const wave = Math.sin(now / 300) * 2;
    g.fillStyle = col;
    g.fillRect(sx + 20 * z, sy - 20 * z + wave * 0.2, 9 * z, 6 * z);
    if (!found) {
      g.font = `bold ${Math.round(14 * z)}px Georgia, serif`;
      g.textAlign = 'center';
      g.fillStyle = '#f5e7a0';
      g.fillText('?', sx, sy - 22 * z + wave);
    }
  }

  private drawBuilding(b: CBuilding, now: number, ui: UIOverlay): void {
    const g = this.g, z = this.cam.z;
    const d = BUILDINGS[b.t];
    const color = playerColor(this.c, b.o);
    const [sx, sy] = this.toScreen(b.x, b.y);
    const spr: BuildingSprite = buildingSprite(b.t, color, this.c.arch(b.o));
    if (b.ghost) g.globalAlpha = 0.55;
    if (b.t === 'heringszaun') this.drawFences(b, sx, sy);
    if (!b.b) {
      this.drawSprite(foundationSprite(d.w), sx, sy);
      const prog = b.p / 100;
      // wachsendes Gebäude: von unten nach oben freigelegt
      const top = sy - spr.ay * z, full = (spr.c.height / S) * z;
      const visibleH = full * (0.15 + prog * 0.85);
      g.save();
      g.beginPath();
      g.rect(sx - spr.ax * z - 5, top + full - visibleH, (spr.c.width / S) * z + 10, visibleH);
      g.clip();
      g.globalAlpha = (b.ghost ? 0.55 : 1) * (0.5 + prog * 0.5);
      this.drawSprite(spr, sx, sy);
      g.restore();
      drawScaffold(g, sx, sy, d.w, z, prog);
    } else {
      this.drawSprite(spr, sx, sy);
      if (b.u !== undefined) drawScaffold(g, sx, sy, d.w, z, 1 - b.u / 200);
      if ((b.l ?? 1) > 1) {
        const [lx, ly] = this.toScreen(b.x + d.w, b.y);
        const x = lx - 4 * z, y = ly - 20 * z;
        g.fillStyle = color;
        g.strokeStyle = '#e8c86a';
        g.lineWidth = 1.2 * z;
        g.beginPath();
        g.moveTo(x - 5 * z, y - 6 * z);
        g.lineTo(x + 5 * z, y - 6 * z);
        g.lineTo(x + 5 * z, y + z);
        g.lineTo(x, y + 6 * z);
        g.lineTo(x - 5 * z, y + z);
        g.closePath();
        g.fill();
        g.stroke();
        g.strokeStyle = '#f5e7a0';
        g.lineWidth = 1.3 * z;
        for (let k = 0; k < b.l!; k++) {
          const bx = x + (k - (b.l! - 1) / 2) * 2.6 * z;
          g.beginPath();
          g.moveTo(bx, y - 3.5 * z);
          g.lineTo(bx, y + 1.5 * z);
          g.stroke();
        }
      }
      // animierte Teile
      if (spr.hub) this.drawSails(sx + spr.hub[0] * z, sy + spr.hub[1] * z, b.ac ? now / 900 : 0.4);
      if (spr.smoke && (b.t !== 'raeucherei' || b.ac)) for (const p of spr.smoke) this.drawSmoke(sx + p[0] * z, sy + p[1] * z, now, b.i);
      if (b.t === 'brarupmarkt' && spr.flagPt) {
        const ctrl = this.c.brarup.c;
        const fx = sx + spr.flagPt[0] * z, fy = sy + spr.flagPt[1] * z;
        g.strokeStyle = '#3b2a1a';
        g.lineWidth = 2.5 * z;
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(fx, fy - 56 * z);
        g.stroke();
        const wv = Math.sin(now / 250) * 2 * z;
        g.fillStyle = ctrl >= 0 ? playerColor(this.c, ctrl) : this.c.brarup.x ? '#d0c090' : '#e8e0c8';
        g.beginPath();
        g.moveTo(fx, fy - 56 * z);
        g.quadraticCurveTo(fx + 12 * z, fy - 58 * z + wv, fx + 24 * z, fy - 54 * z);
        g.lineTo(fx + 24 * z, fy - 42 * z);
        g.quadraticCurveTo(fx + 12 * z, fy - 46 * z + wv, fx, fy - 44 * z);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    const sel = ui.selected.has(b.i);
    if (sel) {
      const pts = [this.toScreen(b.x, b.y), this.toScreen(b.x + d.w, b.y), this.toScreen(b.x + d.w, b.y + d.h), this.toScreen(b.x, b.y + d.h)];
      g.strokeStyle = b.o === this.c.me ? '#a8e070' : b.o < 0 ? '#e8e0c8' : '#e05a4a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
      g.closePath();
      g.stroke();
    }
    if (b.o >= 0 && (sel || b.h < b.m || ui.hover === b.i) && !b.ghost) {
      const [cx, cy] = this.toScreen(b.x + d.w / 2, b.y + d.h / 2);
      this.hpBar(cx, cy - (spr.ay * 0.7 + 4) * z, 46 * z, b.h / b.m);
    }
  }

  private drawFences(b: CBuilding, sx: number, sy: number): void {
    const fences = this.fences(b);
    const g = this.g, z = this.cam.z;
    for (const [ax, ay, bx, by] of fences) {
      const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) * 4));
      g.strokeStyle = '#6b5434';
      g.lineWidth = 1.5 * z;
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        const [qx, qy] = this.toScreen(x, y);
        g.beginPath();
        g.moveTo(qx, qy + 2 * z);
        g.lineTo(qx, qy - 9 * z);
        g.stroke();
      }
      const [p0x, p0y] = this.toScreen(ax, ay), [p1x, p1y] = this.toScreen(bx, by);
      g.strokeStyle = 'rgba(120,95,60,0.9)';
      g.lineWidth = 3 * z;
      g.beginPath();
      g.moveTo(p0x, p0y - 4 * z);
      g.lineTo(p1x, p1y - 4 * z);
      g.stroke();
    }
  }

  private drawSails(x: number, y: number, ang: number): void {
    const g = this.g, z = this.cam.z;
    g.save();
    g.translate(x, y);
    for (let k = 0; k < 4; k++) {
      const a = ang + (k * Math.PI) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Flügel leicht perspektivisch gestaucht
      const ex = ca * 34 * z * 0.75, ey = sa * 34 * z;
      g.strokeStyle = '#4a3222';
      g.lineWidth = 2 * z;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(ex, ey);
      g.stroke();
      const nx = -sa * 6 * z * 0.75, ny = ca * 6 * z;
      g.fillStyle = 'rgba(225,215,190,0.92)';
      g.beginPath();
      g.moveTo(ex * 0.25, ey * 0.25);
      g.lineTo(ex, ey);
      g.lineTo(ex + nx, ey + ny);
      g.lineTo(ex * 0.25 + nx, ey * 0.25 + ny);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(80,60,40,0.6)';
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      for (let q = 1; q < 5; q++) {
        const t = 0.25 + (q / 5) * 0.75;
        g.moveTo(ex * t, ey * t);
        g.lineTo(ex * t + nx, ey * t + ny);
      }
      g.moveTo(ex * 0.25 + nx * 0.5, ey * 0.25 + ny * 0.5);
      g.lineTo(ex + nx * 0.5, ey + ny * 0.5);
      g.lineWidth = 0.6;
      g.stroke();
    }
    g.fillStyle = '#3a2818';
    g.beginPath();
    g.arc(0, 0, 3 * z, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawSmoke(x: number, y: number, now: number, seed: number): void {
    const g = this.g, z = this.cam.z;
    for (let k = 0; k < 5; k++) {
      const age = (now / 2600 + k / 5 + (seed % 7) / 7) % 1;
      const px = x + (age * 14 + Math.sin(now / 700 + k) * 3) * z;
      const py = y - age * 42 * z;
      g.fillStyle = `rgba(200,200,195,${0.45 * (1 - age)})`;
      g.beginPath();
      g.arc(px, py, (3 + age * 9) * z, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawUnit(u: CUnit, alpha: number, now: number, ui: UIOverlay): void {
    const z = this.cam.z;
    const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
    const [sx, sy] = this.toScreen(ux, uy);
    const frames = unitSprites(u.t, playerColor(this.c, u.o), this.c.faction(u.o));
    const f = unitFrame(u.a, now, u.i);
    this.drawSprite(frames[f], sx, sy - this.hop(u, now) * z, UNIT_SCALE, u.f < 0);
    const g = this.g;
    if (u.c && u.t === 'arbeiter') {
      // Holzbündel auf der Schulter
      g.fillStyle = '#7a5532';
      g.fillRect(sx - 7 * z * u.f, sy - 22 * z, 10 * z * u.f, 4 * z);
      g.fillStyle = '#c9a16a';
      g.fillRect(sx + 3 * z * u.f - 1.5 * z, sy - 22 * z, 3 * z, 4 * z);
    }
    if (u.hitFlash > 0) {
      g.fillStyle = 'rgba(255,80,60,0.35)';
      g.beginPath();
      g.arc(sx, sy - 14 * z, 8 * z, 0, Math.PI * 2);
      g.fill();
      u.hitFlash = Math.max(0, u.hitFlash - 0.08);
    }
    const max = this.c.ud(u.o, u.t).hp;
    if (ui.selected.has(u.i) || u.h < max || ui.hover === u.i) this.hpBar(sx, sy - ((UNITS[u.t].mounted ? 30 : 26) * UNIT_SCALE + 4 + this.hop(u, now)) * z, 20 * z, u.h / max);
  }

  private hpBar(cx: number, y: number, w: number, f: number): void {
    const g = this.g;
    f = Math.max(0, Math.min(1, f));
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(cx - w / 2 - 1, y - 1, w + 2, 5);
    g.fillStyle = f > 0.6 ? '#6cc04a' : f > 0.3 ? '#d8b030' : '#d04030';
    g.fillRect(cx - w / 2, y, w * f, 3);
  }

  private drawPlacement(p: Placement): void {
    const g = this.g;
    const d = BUILDINGS[p.type];
    for (let dy = 0; dy < d.h; dy++)
      for (let dx = 0; dx < d.w; dx++) {
        const pts = [this.toScreen(p.x + dx, p.y + dy), this.toScreen(p.x + dx + 1, p.y + dy), this.toScreen(p.x + dx + 1, p.y + dy + 1), this.toScreen(p.x + dx, p.y + dy + 1)];
        g.fillStyle = p.valid ? 'rgba(120,220,90,0.35)' : 'rgba(230,60,40,0.4)';
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (const q of pts.slice(1)) g.lineTo(q[0], q[1]);
        g.closePath();
        g.fill();
      }
    const [sx, sy] = this.toScreen(p.x, p.y);
    g.globalAlpha = 0.6;
    this.drawSprite(buildingSprite(p.type, playerColor(this.c, this.c.me), this.c.arch(this.c.me)), sx, sy);
    g.globalAlpha = 1;
  }

  private drawEffects(now: number): void {
    const g = this.g, z = this.cam.z;
    this.pruneEffects(now);
    for (const e of this.effects) {
      const k = (now - e.t0) / e.dur;
      if (e.k === 'shot') {
        const x = e.x + (e.tx! - e.x) * k, y = e.y + (e.ty! - e.y) * k;
        const [sx, sy] = this.toScreen(x, y);
        const arc = Math.sin(k * Math.PI) * (e.r === 1 ? 30 : e.r === 2 ? 2 : 12) * z;
        const [tx, ty] = this.toScreen(e.tx!, e.ty!);
        const [ox, oy] = this.toScreen(e.x, e.y);
        const ang = Math.atan2(ty - oy, tx - ox);
        const hy = sy - arc - 16 * z;
        g.strokeStyle = e.r ? '#3a2a1a' : '#2a2a2a';
        g.lineWidth = 1.5 * z;
        g.beginPath();
        g.moveTo(sx - Math.cos(ang) * 6 * z, hy - Math.sin(ang) * 6 * z);
        g.lineTo(sx + Math.cos(ang) * 4 * z, hy + Math.sin(ang) * 4 * z);
        g.stroke();
      } else if (e.k === 'ring') {
        const [sx, sy] = this.toScreen(e.x, e.y);
        g.strokeStyle = e.color!;
        g.globalAlpha = 1 - k;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(sx, sy, (6 + k * 10) * z, (3 + k * 5) * z, 0, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      } else if (e.k === 'die') {
        const [sx, sy] = this.toScreen(e.x, e.y);
        g.globalAlpha = Math.min(1, (1 - k) * 2);
        g.fillStyle = '#4a3a2a';
        g.beginPath();
        g.ellipse(sx, sy, 8 * z, 3 * z, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#d8d0c0';
        g.lineWidth = 2 * z;
        g.beginPath();
        g.moveTo(sx, sy - 2 * z);
        g.lineTo(sx, sy - 12 * z);
        g.moveTo(sx - 4 * z, sy - 9 * z);
        g.lineTo(sx + 4 * z, sy - 9 * z);
        g.stroke();
        g.globalAlpha = 1;
      } else if (e.k === 'dust') {
        const [sx, sy] = this.toScreen(e.x, e.y);
        const small = e.r === 2;
        for (let q = 0; q < 6; q++) {
          const a = q * 1.05;
          g.fillStyle = small ? `rgba(216,216,210,${0.7 * (1 - k)})` : `rgba(150,130,100,${0.5 * (1 - k)})`;
          g.beginPath();
          g.arc(sx + Math.cos(a) * k * (small ? 10 : 30) * z, sy - ((small ? 16 : 0) + k * 20) * z + Math.sin(a) * k * (small ? 4 : 10) * z, ((small ? 3 : 8) + k * (small ? 8 : 14)) * z, 0, Math.PI * 2);
          g.fill();
        }
      } else if (e.k === 'text') {
        const [sx, sy] = this.toScreen(e.x, e.y);
        g.globalAlpha = 1 - k;
        g.font = `bold ${Math.round(13 * Math.max(0.8, z))}px Georgia, serif`;
        g.textAlign = 'center';
        g.fillStyle = '#000';
        g.fillText(e.text!, sx + 1, sy - 30 * z - k * 30 + 1);
        g.fillStyle = e.color!;
        g.fillText(e.text!, sx, sy - 30 * z - k * 30);
        g.globalAlpha = 1;
      }
    }
  }

}

// ------------------------------------------------------------------ Minikarte
export class Minimap {
  private base: HTMLCanvasElement;
  private fog: HTMLCanvasElement;
  private fogVersion = -1;
  readonly s: number;
  constructor(readonly canvas: HTMLCanvasElement, readonly c: ClientState) {
    const { w, h, terrain } = c.map;
    this.s = canvas.width / (w + h);
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    const g = this.base.getContext('2d')!;
    const img = g.createImageData(w, h);
    const col: Record<number, [number, number, number]> = {
      [T.GRAS]: [104, 132, 62], [T.WASSER]: [58, 92, 118], [T.FLACH]: [78, 120, 138], [T.UFER]: [166, 152, 104],
      [T.MOOR]: [78, 74, 46], [T.WEG]: [156, 132, 88], [T.KNICK]: [62, 88, 40], [T.LEHM]: [138, 106, 66], [T.TOR]: [156, 132, 88],
      [T.HEIDE]: [122, 100, 90], [T.WATT]: [138, 130, 112], [T.GRABEN]: [70, 110, 122], [T.DEICH]: [104, 148, 72], [T.WALL]: [112, 96, 58],
    };
    for (let i = 0; i < w * h; i++) {
      const cc = c.trees[i] ? [52, 88, 40] : col[terrain[i]];
      img.data[i * 4] = cc[0];
      img.data[i * 4 + 1] = cc[1];
      img.data[i * 4 + 2] = cc[2];
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.fog = document.createElement('canvas');
    this.fog.width = w;
    this.fog.height = h;
  }

  toMini(tx: number, ty: number): [number, number] {
    return [(tx - ty + this.c.map.h) * this.s, ((tx + ty) * this.s) / 2];
  }
  fromMini(mx: number, my: number): [number, number] {
    const a = mx / this.s - this.c.map.h, b = (my * 2) / this.s;
    return [(a + b) / 2, (b - a) / 2];
  }

  draw(r: BaseRenderer): void {
    const g = this.canvas.getContext('2d')!;
    const c = this.c;
    const { w, h } = c.map;
    const s = this.s;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#14120c';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Bäume aktualisieren sich selten – die Basis zeigt Startbäume, Lichtungen bleiben vernachlässigbar
    g.setTransform(s, s / 2, -s, s / 2, h * s, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0);
    // Felder
    for (const b of c.buildings.values()) {
      const d = BUILDINGS[b.t];
      g.fillStyle = b.o < 0 ? '#e8e0c8' : playerColor(c, b.o);
      g.fillRect(b.x, b.y, d.w, d.h);
      g.fillStyle = '#c8ad5a';
      for (const f of b.f ?? []) g.fillRect(f % w, Math.floor(f / w), 1, 1);
    }
    for (const u of c.units.values()) {
      g.fillStyle = playerColor(c, u.o);
      g.fillRect(u.x - 0.8, u.y - 0.8, 1.6, 1.6);
    }
    if (this.fogVersion !== c.visVersion) {
      const fg = this.fog.getContext('2d')!;
      const img = fg.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        img.data[i * 4 + 3] = c.vis[i] === 0 ? 255 : c.vis[i] === 1 ? 110 : 0;
      }
      fg.putImageData(img, 0, 0);
      this.fogVersion = c.visVersion;
    }
    g.drawImage(this.fog, 0, 0);
    // Sichtfenster
    g.setTransform(1, 0, 0, 1, 0, 0);
    const pts = [r.toTile(0, 0), r.toTile(r.vw, 0), r.toTile(r.vw, r.vh), r.toTile(0, r.vh)].map((p) => this.toMini(p[0], p[1]));
    g.strokeStyle = '#f1e6c4';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
    g.closePath();
    g.stroke();
    // Kompass
    g.fillStyle = '#f1e6c4';
    g.font = 'bold 10px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('N', this.canvas.width / 2, 10);
  }
}
