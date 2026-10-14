// WebGL-Darstellung mit PixiJS v8. Liest nur ClientState + Oberflächenzustand, verändert keine Simulation.
// Gleiche Sprites wie der Canvas-Renderer (prozedural erzeugt), aber GPU-gebündelt, mit Atlas für das Gelände
// und zusätzlichen Stimmungseffekten (Wolkenschatten, Möwen, Vignette, Wasserschimmer).
import { Application, Container, Graphics, Matrix, Rectangle, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { BUILDINGS, RULES, UNITS } from '../data/defs';
import type { CBuilding, CUnit, ClientState } from '../game/client';
import { T, isBarrier, isWater } from '../sim/map';
import { barrierMask, barrierStyle, ditchMask, gateAlongX } from './terrainmask';
import { S, TH, TW, canvas as mkCanvas, prng } from './draw';
import {
  buildingSprite, foundationSprite, makeGate, makeKnicks, makeTerrain, makeTrees, unitFrame, unitSprites, type BuildingSprite,
  type Sprite as CSprite,
} from './sprites';
import { BaseRenderer, UNIT_SCALE, playerColor, type UIOverlay } from './view';

const HW = TW / 2, HH = TH / 2;
const CHUNK = 8;
const isoX = (x: number, y: number) => (x - y) * HW;
const isoY = (x: number, y: number) => (x + y) * HH;

const texCache = new WeakMap<HTMLCanvasElement, Texture>();
function tex(c: HTMLCanvasElement): Texture {
  let t = texCache.get(c);
  if (!t) {
    t = Texture.from(c);
    t.source.autoGenerateMipmaps = true;
    t.source.updateMipmaps();
    texCache.set(c, t);
  }
  return t;
}

/** Einfacher Regal-Packer: viele kleine Canvas-Sprites in eine Textur (weniger Zeichenaufrufe). */
function atlas(list: HTMLCanvasElement[]): Texture[] {
  const W = 2048;
  let x = 0, y = 0, row = 0;
  const pos: [number, number][] = [];
  for (const c of list) {
    if (x + c.width > W) {
      x = 0;
      y += row + 2;
      row = 0;
    }
    pos.push([x, y]);
    x += c.width + 2;
    row = Math.max(row, c.height);
  }
  const [cv, g] = mkCanvas(W, y + row + 2);
  list.forEach((c, k) => g.drawImage(c, pos[k][0], pos[k][1]));
  const base = Texture.from(cv);
  // Mipmaps: saubere Verkleinerung beim Herauszoomen (Sprites liegen doppelt aufgelöst vor)
  base.source.autoGenerateMipmaps = true;
  base.source.updateMipmaps();
  return list.map((c, k) => new Texture({ source: base.source, frame: new Rectangle(pos[k][0], pos[k][1], c.width, c.height) }));
}

function hex(col: string): number {
  if (col.startsWith('#')) return parseInt(col.slice(1), 16);
  const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(col);
  return m ? (+m[1] << 16) | (+m[2] << 8) | +m[3] : 0xffffff;
}

interface BView {
  key: string;
  spr: Sprite;
  found: Sprite | null;
  dyn: Graphics;
  sprite: BuildingSprite;
  lastP: number;
}
interface UView {
  key: string;
  box: Container;
  spr: Sprite;
  carry: Graphics;
  carryKey: number;
}

export class PixiRenderer extends BaseRenderer {
  readonly kind = 'webgl' as const;
  private app!: Application;
  private world = new Container();
  private ground = new Container();
  private decals = new Graphics();
  private objs = new Container();
  private clouds!: TilingSprite;
  private fogSprite!: Sprite;
  private overlay = new Graphics();
  private labels = new Container();
  private screen = new Container();
  private screenG = new Graphics();
  private chunks: { c: Container; base: Container; waves: Container; ix0: number; ix1: number; iy0: number; iy1: number }[] = [];
  private groundSpr: Sprite[] = [];
  private waveSpr: { s: Sprite; v: number }[] = [];
  private tGround!: Record<'gras' | 'lehm' | 'ufer' | 'moor' | 'wasser' | 'flach' | 'feld' | 'wave' | 'road' | 'heide' | 'watt' | 'ditch', Texture[]>;
  private trees: { i: number; s: Sprite }[] = [];
  private treeTex: Texture[] = [];
  private treeSprites: CSprite[] = [];
  private statics: { i: number; s: Sprite }[] = [];
  private moorG = new Graphics();
  private bviews = new Map<number, BView>();
  private uviews = new Map<number, UView>();
  private placeSpr = new Sprite();
  private labelTexts: { t: Text; x: number; y: number }[] = [];
  private occVersion = -1;
  private cropCache = new Map<string, Texture>();
  private gulls: { cx: number; cy: number; r: number; sp: number; ph: number }[] = [];
  private fogTex!: Texture;
  private fogPad!: HTMLCanvasElement;
  private fogPadG!: CanvasRenderingContext2D;

  private copyFog(): void {
    const g = this.fogPadG;
    g.globalCompositeOperation = 'copy';
    g.fillStyle = 'rgb(11,13,8)';
    g.fillRect(0, 0, this.fogPad.width, this.fogPad.height);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(2, 2, this.fog.width, this.fog.height);
    g.drawImage(this.fog, 2, 2);
  }

  static async create(canvas: HTMLCanvasElement, c: ClientState): Promise<PixiRenderer> {
    const r = new PixiRenderer(canvas, c);
    await r.init();
    return r;
  }

  private async init(): Promise<void> {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.app = new Application();
    await this.app.init({
      canvas: this.canvas, width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight),
      resolution: this.dpr, autoDensity: true, antialias: false, background: 0x0b0d08, preference: 'webgl',
      autoStart: false, sharedTicker: false, failIfMajorPerformanceCaveat: false,
    });
    this.app.ticker?.stop();
    const c = this.c;
    // Geländetexturen in einen Atlas packen
    const t = makeTerrain();
    const groups = [t.gras, t.lehm, t.ufer, t.moor, t.wasser, t.flach, t.feld, t.wave, t.road, t.heide, t.watt, t.ditch];
    const all = atlas(groups.flat());
    let k = 0;
    const take = (n: number) => all.slice(k, (k += n));
    this.tGround = {
      gras: take(t.gras.length), lehm: take(t.lehm.length), ufer: take(t.ufer.length), moor: take(t.moor.length),
      wasser: take(t.wasser.length), flach: take(t.flach.length), feld: take(t.feld.length), wave: take(t.wave.length), road: take(t.road.length),
      heide: take(t.heide.length), watt: take(t.watt.length), ditch: take(t.ditch.length),
    };
    // Bäume, Knicks, Tore
    this.treeSprites = makeTrees();
    const knicks = makeKnicks();
    const deiche = makeKnicks('deich');
    const walls = makeKnicks('wall');
    const gates = [makeGate('x'), makeGate('y')];
    const all2 = [...this.treeSprites, ...knicks, ...deiche, ...walls, ...gates];
    const objTex = atlas(all2.map((s) => s.c));
    this.treeTex = objTex.slice(0, this.treeSprites.length);
    let o0 = this.treeSprites.length;
    const sliceOf = (n: number) => objTex.slice(o0, (o0 += n));
    const barrierTex = { knick: sliceOf(knicks.length), deich: sliceOf(deiche.length), wall: sliceOf(walls.length) };
    const barrierSpr = { knick: knicks, deich: deiche, wall: walls };
    const gateTex = sliceOf(gates.length);

    this.app.stage.addChild(this.world, this.screen);
    this.objs.sortableChildren = true;
    this.buildGround();

    // statische Objekte
    const { w: W, h: H, terrain, variant } = c.map;
    for (let i = 0; i < W * H; i++) {
      const x = i % W, y = Math.floor(i / W);
      const v = variant[i];
      if (c.trees[i]) {
        const ts = this.treeSprites[v % this.treeSprites.length];
        const s = new Sprite(this.treeTex[v % this.treeTex.length]);
        s.anchor.set((ts.ax * S) / ts.c.width, (ts.ay * S) / ts.c.height);
        const jx = ((v & 7) - 3.5) * 2, jy = (((v >> 3) & 3) - 1.5) * 2;
        s.position.set(isoX(x + 0.5, y + 0.5) + jx, isoY(x + 0.5, y + 0.5) + jy + 4);
        s.scale.set(((v & 64) !== 0 ? -1 : 1) / S, 1 / S);
        s.zIndex = x + y + 1;
        this.objs.addChild(s);
        this.trees.push({ i, s });
      } else if (isBarrier(terrain[i]) || terrain[i] === T.TOR) {
        let s: Sprite;
        const st = barrierStyle(terrain[i]);
        if (st) {
          const m = barrierMask(c.map, x, y);
          s = new Sprite(barrierTex[st][m]);
          const bs = barrierSpr[st][m];
          s.anchor.set((bs.ax * S) / bs.c.width, (bs.ay * S) / bs.c.height);
        } else {
          const alongX = gateAlongX(c.map, x, y);
          const gs = gates[alongX ? 1 : 0];
          s = new Sprite(gateTex[alongX ? 1 : 0]);
          s.anchor.set((gs.ax * S) / gs.c.width, (gs.ay * S) / gs.c.height);
        }
        s.position.set(isoX(x, y), isoY(x, y));
        s.scale.set(1 / S);
        s.zIndex = x + y + 1;
        this.objs.addChild(s);
        this.statics.push({ i, s });
      }
    }
    this.moorG.zIndex = c.map.site.x + c.map.site.y + 1;
    this.objs.addChild(this.moorG);

    // Wolkenschatten (zieht langsam über das Land)
    this.clouds = new TilingSprite({ texture: Texture.from(this.cloudCanvas()), width: (W + H) * HW + 2000, height: (W + H) * HH + 1000 });
    this.clouds.position.set(-H * HW - 1000, -500);
    this.clouds.alpha = 0.55;

    // Nebel: 1 Pixel je Kachel, per Matrix in die Iso-Ansicht gelegt, GPU-gefiltert = weiche Ränder
    // Nebel mit 2 Kacheln undurchsichtigem Rand, damit am Kartenrand nichts durchscheint
    [this.fogPad, this.fogPadG] = mkCanvas(W + 4, H + 4);
    this.refreshFog();
    this.copyFog();
    this.fogTex = Texture.from(this.fogPad);
    this.fogTex.source.scaleMode = 'linear';
    this.fogSprite = new Sprite(this.fogTex);
    this.fogSprite.setFromMatrix(new Matrix(HW, HH, -HW, HH, isoX(-2, -2), isoY(-2, -2)));

    for (const l of c.map.labels) {
      const t = new Text({ text: l.name, style: { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 30, fill: 0xf1e6c4, stroke: { color: 0x000000, width: 4, alpha: 0.7 } } });
      t.anchor.set(0.5);
      this.labels.addChild(t);
      this.labelTexts.push({ t, x: l.x + 0.5, y: l.y + 0.5 });
    }
    this.placeSpr.alpha = 0.6;
    this.placeSpr.visible = false;
    this.world.addChild(this.ground, this.decals, this.objs, this.clouds, this.fogSprite, this.overlay, this.placeSpr, this.labels);
    this.screen.addChild(this.screenG);
    const vig = new Sprite(Texture.from(this.vignetteCanvas()));
    vig.label = 'vignette';
    this.screen.addChildAt(vig, 0);
    // Möwen über der Schlei
    const r = prng(c.map.seed);
    for (let k = 0; k < 7; k++) this.gulls.push({ cx: 58 + r() * 26, cy: 6 + r() * 60, r: 2 + r() * 4, sp: 0.15 + r() * 0.2, ph: r() * 6 });
    this.gulls = this.gulls.filter((gl) => isWater(c.map.terrain[Math.floor(gl.cy) * W + Math.floor(gl.cx)] ?? 0));
  }

  private cloudCanvas(): HTMLCanvasElement {
    const [cv, g] = mkCanvas(1024, 512);
    const r = prng(99);
    for (let k = 0; k < 14; k++) {
      const x = r() * 1024, y = r() * 512, rad = 60 + r() * 120;
      for (const ox of [-1024, 0, 1024]) for (const oy of [-512, 0, 512]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, 'rgba(10,20,10,0.22)');
        gr.addColorStop(1, 'rgba(10,20,10,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x + ox, y + oy, rad * 1.6, rad, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    return cv;
  }

  private vignetteCanvas(): HTMLCanvasElement {
    const [cv, g] = mkCanvas(512, 512);
    const gr = g.createRadialGradient(256, 256, 150, 256, 256, 370);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    return cv;
  }

  private groundTex(i: number): Texture {
    const c = this.c, t = c.map.terrain[i], v = c.map.variant[i], G = this.tGround;
    if (c.fieldOcc[i]) return G.feld[v % 3];
    switch (t) {
      case T.WASSER: return G.wasser[v & 3];
      case T.FLACH: return G.flach[v & 1];
      case T.UFER: return G.ufer[v % 3];
      case T.MOOR: return G.moor[v % 3];
      case T.LEHM: return G.lehm[v & 1];
      case T.HEIDE: return G.heide[v % 3];
      case T.WATT: return G.watt[v % 3];
      default: return G.gras[v & 3];
    }
  }

  private buildGround(): void {
    const { w: W, h: H, terrain } = this.c.map;
    const road = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (terrain[y * W + x] === T.WEG || terrain[y * W + x] === T.TOR);
    for (let cy = 0; cy < H; cy += CHUNK)
      for (let cx = 0; cx < W; cx += CHUNK) {
        const cont = new Container();
        const base = new Container();
        const waves = new Container();
        cont.addChild(base, waves);
        for (let y = cy; y < Math.min(H, cy + CHUNK); y++)
          for (let x = cx; x < Math.min(W, cx + CHUNK); x++) {
            const i = y * W + x;
            const s = new Sprite(this.groundTex(i));
            s.position.set(isoX(x, y) - HW - 0.5, isoY(x, y) - 0.5);
            s.scale.set((TW + 1) / (TW * S), (TH + 1) / (TH * S));
            base.addChild(s);
            this.groundSpr[i] = s;
            const t = terrain[i];
            if (t === T.GRABEN) {
              const ds = new Sprite(this.tGround.ditch[ditchMask(this.c.map, x, y)]);
              ds.position.set(isoX(x, y) - HW, isoY(x, y));
              ds.scale.set(1 / S);
              base.addChild(ds);
            } else if (t === T.WEG || t === T.TOR) {
              let m = 0;
              if (road(x + 1, y)) m |= 1;
              if (road(x - 1, y)) m |= 2;
              if (road(x, y + 1)) m |= 4;
              if (road(x, y - 1)) m |= 8;
              const rs = new Sprite(this.tGround.road[m]);
              rs.position.set(isoX(x, y) - HW, isoY(x, y));
              rs.scale.set(1 / S);
              base.addChild(rs);
            } else if (isWater(t)) {
              const ws = new Sprite(this.tGround.wave[0]);
              ws.position.set(isoX(x, y) - HW, isoY(x, y));
              ws.scale.set(1 / S);
              ws.alpha = t === T.FLACH ? 0.5 : 0.7;
              waves.addChild(ws);
              this.waveSpr.push({ s: ws, v: this.c.map.variant[i] });
            }
          }
        this.ground.addChild(cont);
        const x1 = Math.min(W, cx + CHUNK), y1 = Math.min(H, cy + CHUNK);
        this.chunks.push({ c: cont, base, waves, ix0: isoX(cx, y1) - HW, ix1: isoX(x1, cy) + HW, iy0: isoY(cx, cy), iy1: isoY(x1, y1) + TH });
      }
  }

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    this.app.renderer.resize(w, h);
    const vig = this.screen.getChildByLabel('vignette') as Sprite | null;
    if (vig) {
      vig.width = w;
      vig.height = h;
    }
  }

  destroy(): void {
    try {
      this.app.destroy({ removeView: false }, { children: true, texture: false, textureSource: false });
    } catch {
      /* ignorieren */
    }
  }

  // ---------------------------------------------------------------- Frame
  frame(now: number, ui: UIOverlay): void {
    const t0 = performance.now();
    const c = this.c, z = this.cam.z;
    const { w: W } = c.map;
    this.world.scale.set(z);
    this.world.position.set(Math.round(this.vw / 2 - this.cam.x * z), Math.round(this.vh / 2 - this.cam.y * z));
    // sichtbarer Bereich in Kachelkoordinaten
    const corners = [this.toTile(0, 0), this.toTile(this.vw, 0), this.toTile(0, this.vh), this.toTile(this.vw, this.vh)];
    const x0 = Math.floor(Math.min(...corners.map((p) => p[0]))) - 3, x1 = Math.ceil(Math.max(...corners.map((p) => p[0]))) + 3;
    const y0 = Math.floor(Math.min(...corners.map((p) => p[1]))) - 3, y1 = Math.ceil(Math.max(...corners.map((p) => p[1]))) + 5;
    // nur Bildschirmteile prüfen: Iso-Bildschirmrechteck
    const sx0 = this.cam.x - this.vw / 2 / z - 80, sx1 = this.cam.x + this.vw / 2 / z + 80;
    const sy0 = this.cam.y - this.vh / 2 / z - 120, sy1 = this.cam.y + this.vh / 2 / z + 60;
    const onScreen = (ix: number, iy: number) => ix > sx0 && ix < sx1 && iy > sy0 && iy < sy1;
    let drawnTiles = 0;
    for (const ch of this.chunks) {
      const vis = ch.ix1 > sx0 && ch.ix0 < sx1 && ch.iy1 > sy0 - 60 && ch.iy0 < sy1 + 60;
      ch.c.visible = vis;
      if (vis) drawnTiles += CHUNK * CHUNK;
    }
    void x0;
    void x1;
    void y0;
    void y1;
    // Felder (Bauernhöfe) aktualisieren: nur geänderte Kacheln, betroffene Chunk-Texturen neu erzeugen
    if (this.occVersion !== c.occVersion) {
      this.occVersion = c.occVersion;
      const dirty = new Set<Container>();
      for (let i = 0; i < this.groundSpr.length; i++) {
        const t = this.groundTex(i);
        if (this.groundSpr[i].texture !== t) {
          this.groundSpr[i].texture = t;
          dirty.add(this.groundSpr[i].parent!);
        }
      }
      void dirty;
    }
    const wf = Math.floor(now / 450);
    for (const ws of this.waveSpr) if (ws.s.parent?.visible) ws.s.texture = this.tGround.wave[(wf + ws.v) & 3];

    // statische Objekte: nur im Bild und erkundet
    for (const tr of this.trees) {
      const amt = c.trees[tr.i];
      const v = amt > 0 && c.vis[tr.i] > 0 && onScreen(tr.s.x, tr.s.y);
      tr.s.visible = v;
      if (v) {
        const sc = amt < 15 ? 0.75 / S : 1 / S;
        if (Math.abs(tr.s.scale.y - sc) > 1e-6) tr.s.scale.set(Math.sign(tr.s.scale.x) * sc, sc);
      }
    }
    for (const st of this.statics) st.s.visible = c.vis[st.i] > 0 && onScreen(st.s.x, st.s.y);

    this.drawMoor(now);
    this.syncBuildings(now, ui);
    const alpha = Math.min(1, Math.max(0, (now - c.snapTime) / (1000 / RULES.tickRate)));
    this.syncUnits(now, alpha);

    // Auswahlringe (unter den Objekten)
    const d = this.decals;
    d.clear();
    for (const id of ui.selected) {
      const u = c.units.get(id);
      if (!u) continue;
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      const big = !!UNITS[u.t].mounted;
      d.ellipse(isoX(ux, uy), isoY(ux, uy), big ? 14 : 9, big ? 6 : 4.5).stroke({ width: 1.5 / z, color: u.o === c.me ? 0xa8e070 : 0xe05a4a });
    }

    // Wolken ziehen, Nebel aktualisieren
    this.clouds.tilePosition.set((now / 1000) * 6, (now / 1000) * 2);
    if (this.refreshFog()) {
      this.copyFog();
      this.fogTex.source.update();
    }

    this.drawOverlay(now, ui, alpha);

    // Ortsnamen: konstante Bildschirmgröße
    const ls = Math.max(0.8, z) / (2 * z);
    for (const l of this.labelTexts) {
      const xi = Math.max(0, Math.min(W - 1, Math.floor(l.x))), yi = Math.max(0, Math.min(c.map.h - 1, Math.floor(l.y)));
      l.t.visible = c.vis[yi * W + xi] > 0;
      l.t.position.set(isoX(l.x, l.y), isoY(l.x, l.y));
      l.t.scale.set(ls);
    }

    // Bildschirmraum: Auswahlrahmen
    const sg = this.screenG;
    sg.clear();
    if (ui.drag) {
      const r = ui.drag;
      const rx = Math.min(r.x0, r.x1), ry = Math.min(r.y0, r.y1), rw = Math.abs(r.x1 - r.x0), rh = Math.abs(r.y1 - r.y0);
      sg.rect(rx, ry, rw, rh).fill({ color: 0xc8f096, alpha: 0.08 }).stroke({ width: 1, color: 0xd8f0a0 });
    }
    const t1 = performance.now();
    this.app.render();
    this.stats.drawn = drawnTiles;
    this.stats.frameMs = performance.now() - t0;
    this.stats.sceneMs = t1 - t0;
    this.stats.submitMs = performance.now() - t1;
  }

  private drawMoor(now: number): void {
    const g = this.moorG, c = this.c;
    const mo = c.map.site;
    g.clear();
    if (!c.vis[mo.y * c.map.w + mo.x]) return;
    const x = isoX(mo.x + 0.5, mo.y + 0.5), y = isoY(mo.x + 0.5, mo.y + 0.5);
    g.ellipse(x, y, 22, 9).fill(0x2a2116);
    g.rect(x - 14, y - 3, 28, 4).fill(0x3d3020);
    for (const [dx, dy] of [[-20, 0], [20, 0], [0, -9], [0, 9]]) g.rect(x + dx - 1.5, y + dy - 12, 3, 12).fill(0x6b4a2c);
    const found = c.moor >= 0;
    const wave = Math.sin(now / 300) * 2;
    g.rect(x + 20, y - 20 + wave * 0.2, 9, 6).fill(found ? hex(playerColor(c, c.moor)) : 0xe8e0c8);
    if (!found) {
      // pulsierendes Fragezeichen-Symbol als Erkundungsziel
      const a = 0.6 + Math.sin(now / 250) * 0.3;
      g.circle(x, y - 26 + wave, 7).fill({ color: 0xf5e7a0, alpha: a });
      g.rect(x - 1.5, y - 30 + wave, 3, 6).fill(0x3d3020);
      g.rect(x - 1.5, y - 22 + wave, 3, 2).fill(0x3d3020);
    }
  }

  private cropTex(spr: BuildingSprite, frac: number): Texture {
    const q = Math.round(frac * 20) / 20;
    const base = tex(spr.c);
    const h = Math.max(1, Math.round(spr.c.height * q));
    const k = `${base.uid}:${q}`;
    let t = this.cropCache.get(k);
    if (!t) {
      t = new Texture({ source: base.source, frame: new Rectangle(0, spr.c.height - h, spr.c.width, h) });
      this.cropCache.set(k, t);
    }
    return t;
  }

  private syncBuildings(now: number, ui: UIOverlay): void {
    const c = this.c;
    const seen = new Set<number>();
    for (const b of c.buildings.values()) {
      seen.add(b.i);
      const d = BUILDINGS[b.t];
      const color = playerColor(c, b.o);
      const key = `${b.t}|${color}|${b.b}|${c.arch(b.o)}`;
      let v = this.bviews.get(b.i);
      if (!v || v.key !== key) {
        if (v) {
          v.spr.destroy();
          v.found?.destroy();
          v.dyn.destroy();
        }
        const sprite = buildingSprite(b.t, color, c.arch(b.o));
        const spr = new Sprite(tex(sprite.c));
        spr.scale.set(1 / S);
        const dyn = new Graphics();
        let found: Sprite | null = null;
        if (!b.b) {
          const fs = foundationSprite(d.w);
          found = new Sprite(tex(fs.c));
          found.scale.set(1 / S);
          found.position.set(isoX(b.x, b.y) - fs.ax, isoY(b.x, b.y) - fs.ay);
          this.objs.addChild(found);
        }
        this.objs.addChild(spr, dyn);
        v = { key, spr, found, dyn, sprite, lastP: -1 };
        this.bviews.set(b.i, v);
      }
      const depth = b.x + b.y + (d.w + d.h) / 2;
      const ox = isoX(b.x, b.y), oy = isoY(b.x, b.y);
      v.spr.zIndex = depth;
      v.dyn.zIndex = depth + 0.01;
      if (v.found) v.found.zIndex = depth - 0.01;
      const alpha = b.ghost ? 0.55 : 1;
      if (!b.b) {
        const prog = b.p / 100;
        if (v.lastP !== b.p) {
          v.lastP = b.p;
          const frac = 0.15 + prog * 0.85;
          v.spr.texture = this.cropTex(v.sprite, frac);
          const h = v.spr.texture.frame.height;
          v.spr.position.set(ox - v.sprite.ax, oy - v.sprite.ay + (v.sprite.c.height - h) / S);
        }
        v.spr.alpha = alpha * (0.5 + prog * 0.5);
      } else {
        v.spr.position.set(ox - v.sprite.ax, oy - v.sprite.ay);
        v.spr.alpha = alpha;
      }
      // animierte Teile
      const g = v.dyn;
      g.clear();
      g.alpha = alpha;
      if (b.t === 'heringszaun') this.drawFences(g, b);
      if (!b.b) this.drawScaffold(g, ox, oy, d.w, b.p / 100);
      else {
        const sp = v.sprite;
        if (sp.hub) this.drawSails(g, ox + sp.hub[0], oy + sp.hub[1], b.ac ? now / 900 : 0.4);
        if (sp.smoke && (b.t !== 'raeucherei' || b.ac)) for (const p of sp.smoke) this.drawSmoke(g, ox + p[0], oy + p[1], now, b.i);
        if (b.t === 'brarupmarkt' && sp.flagPt) {
          const ctrl = c.brarup.c;
          const fx = ox + sp.flagPt[0], fy = oy + sp.flagPt[1];
          g.moveTo(fx, fy).lineTo(fx, fy - 56).stroke({ width: 2.5, color: 0x3b2a1a });
          const wv = Math.sin(now / 250) * 2;
          const col = ctrl >= 0 ? hex(playerColor(c, ctrl)) : c.brarup.x ? 0xd0c090 : 0xe8e0c8;
          g.poly([fx, fy - 56, fx + 12, fy - 57 + wv, fx + 24, fy - 54, fx + 24, fy - 42, fx + 12, fy - 45 + wv, fx, fy - 44]).fill(col);
        }
      }
      void ui;
    }
    for (const [id, v] of this.bviews)
      if (!seen.has(id)) {
        v.spr.destroy();
        v.found?.destroy();
        v.dyn.destroy();
        this.bviews.delete(id);
        this.fenceCache.delete(id);
      }
  }

  private drawFences(g: Graphics, b: CBuilding): void {
    for (const [ax, ay, bx, by] of this.fences(b)) {
      const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) * 4));
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        const qx = isoX(x, y), qy = isoY(x, y);
        g.moveTo(qx, qy + 2).lineTo(qx, qy - 9);
      }
      g.stroke({ width: 1.5, color: 0x6b5434 });
      g.moveTo(isoX(ax, ay), isoY(ax, ay) - 4).lineTo(isoX(bx, by), isoY(bx, by) - 4).stroke({ width: 3, color: 0x785f3c, alpha: 0.9 });
    }
  }

  private drawScaffold(g: Graphics, sx: number, sy: number, n: number, prog: number): void {
    const H = 10 + prog * 40;
    const p = (x: number, y: number, zz = 0): [number, number] => [sx + isoX(x, y), sy + isoY(x, y) - zz];
    for (const [x, y] of [[0.2, n - 0.2], [n - 0.2, n - 0.2], [n - 0.2, 0.2]]) {
      const a = p(x, y), b = p(x, y, H);
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
    }
    for (const zz of [H * 0.45, H * 0.9]) {
      const a = p(0.2, n - 0.2, zz), b = p(n - 0.2, n - 0.2, zz), cc = p(n - 0.2, 0.2, zz);
      g.moveTo(a[0], a[1]).lineTo(b[0], b[1]).lineTo(cc[0], cc[1]);
    }
    g.stroke({ width: 2, color: 0x6b4a2c });
  }

  private drawSails(g: Graphics, x: number, y: number, ang: number): void {
    for (let k = 0; k < 4; k++) {
      const a = ang + (k * Math.PI) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ex = ca * 34 * 0.75, ey = sa * 34;
      const nx = -sa * 6 * 0.75, ny = ca * 6;
      g.moveTo(x, y).lineTo(x + ex, y + ey).stroke({ width: 2, color: 0x4a3222 });
      g.poly([x + ex * 0.25, y + ey * 0.25, x + ex, y + ey, x + ex + nx, y + ey + ny, x + ex * 0.25 + nx, y + ey * 0.25 + ny])
        .fill({ color: 0xe1d7be, alpha: 0.92 })
        .stroke({ width: 1, color: 0x503c28, alpha: 0.6 });
      // Flügelgatter (Sprossen und Längslatte)
      for (let q = 1; q < 5; q++) {
        const t = 0.25 + (q / 5) * 0.75;
        g.moveTo(x + ex * t, y + ey * t).lineTo(x + ex * t + nx, y + ey * t + ny);
      }
      g.moveTo(x + ex * 0.25 + nx * 0.5, y + ey * 0.25 + ny * 0.5).lineTo(x + ex + nx * 0.5, y + ey + ny * 0.5);
      g.stroke({ width: 0.6, color: 0x5a4430, alpha: 0.8 });
    }
    g.circle(x, y, 3).fill(0x3a2818);
  }

  private drawSmoke(g: Graphics, x: number, y: number, now: number, seed: number): void {
    for (let k = 0; k < 6; k++) {
      const age = (now / 2600 + k / 6 + (seed % 7) / 7) % 1;
      g.circle(x + age * 14 + Math.sin(now / 700 + k) * 3, y - age * 42, 3 + age * 9).fill({ color: 0xc8c8c3, alpha: 0.45 * (1 - age) });
    }
  }

  private syncUnits(now: number, alpha: number): void {
    const c = this.c;
    const seen = new Set<number>();
    for (const u of c.units.values()) {
      seen.add(u.i);
      const color = playerColor(c, u.o);
      const key = u.t + color + c.faction(u.o);
      let v = this.uviews.get(u.i);
      if (!v || v.key !== key) {
        if (v) v.box.destroy({ children: true });
        const box = new Container();
        const spr = new Sprite();
        const carry = new Graphics();
        box.addChild(spr, carry);
        this.objs.addChild(box);
        v = { key, box, spr, carry, carryKey: -1 };
        this.uviews.set(u.i, v);
      }
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      const frames = unitSprites(u.t, color, c.faction(u.o));
      const fr = frames[unitFrame(u.a, now, u.i)];
      const rr = fr.res ?? S;
      v.spr.texture = tex(fr.c);
      v.spr.anchor.set((fr.ax * rr) / fr.c.width, (fr.ay * rr) / fr.c.height);
      v.spr.scale.set((u.f < 0 ? -UNIT_SCALE : UNIT_SCALE) / rr, UNIT_SCALE / rr);
      v.box.position.set(isoX(ux, uy), isoY(ux, uy) - this.hop(u, now));
      v.box.zIndex = ux + uy;
      v.box.visible = true;
      const ck = (u.c && u.t === 'arbeiter' ? 1 : 0) * u.f + (u.hitFlash > 0 ? 10 + Math.round(u.hitFlash * 10) : 0);
      if (ck !== v.carryKey) {
        v.carryKey = ck;
        const g = v.carry;
        g.clear();
        if (u.c && u.t === 'arbeiter') {
          g.rect(u.f > 0 ? -7 : -3, -22, 10, 4).fill(0x7a5532);
          g.rect(u.f > 0 ? 1.5 : -4.5, -22, 3, 4).fill(0xc9a16a);
        }
        if (u.hitFlash > 0) g.circle(0, -14, 8).fill({ color: 0xff503c, alpha: 0.35 * u.hitFlash });
      }
      if (u.hitFlash > 0) u.hitFlash = Math.max(0, u.hitFlash - 0.08);
    }
    for (const [id, v] of this.uviews)
      if (!seen.has(id)) {
        v.box.destroy({ children: true });
        this.uviews.delete(id);
      }
  }

  private hpBar(g: Graphics, cx: number, y: number, w: number, f: number): void {
    f = Math.max(0, Math.min(1, f));
    g.rect(cx - w / 2 - 1, y - 1, w + 2, 5).fill({ color: 0, alpha: 0.7 });
    g.rect(cx - w / 2, y, w * f, 3).fill(f > 0.6 ? 0x6cc04a : f > 0.3 ? 0xd8b030 : 0xd04030);
  }

  private drawOverlay(now: number, ui: UIOverlay, alpha: number): void {
    const g = this.overlay, c = this.c, z = this.cam.z;
    g.clear();
    // Lebensbalken
    for (const u of c.units.values()) {
      const max = c.ud(u.o, u.t).hp;
      if (!(ui.selected.has(u.i) || u.h < max || ui.hover === u.i)) continue;
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      this.hpBar(g, isoX(ux, uy), isoY(ux, uy) - (UNITS[u.t].mounted ? 30 : 26) * UNIT_SCALE - 4 - this.hop(u, now), 20, u.h / max);
    }
    for (const b of c.buildings.values()) {
      const d = BUILDINGS[b.t];
      const sel = ui.selected.has(b.i);
      if (sel) {
        const pts = [[b.x, b.y], [b.x + d.w, b.y], [b.x + d.w, b.y + d.h], [b.x, b.y + d.h]].flatMap(([x, y]) => [isoX(x, y), isoY(x, y)]);
        g.poly(pts).stroke({ width: 1.5 / z, color: b.o === c.me ? 0xa8e070 : b.o < 0 ? 0xe8e0c8 : 0xe05a4a });
        if (b.r && b.o === c.me) {
          const rx = isoX(b.r[0] + 0.5, b.r[1] + 0.5), ry = isoY(b.r[0] + 0.5, b.r[1] + 0.5);
          g.moveTo(rx, ry).lineTo(rx, ry - 24).stroke({ width: 2, color: 0x3b2a1a });
          g.rect(rx, ry - 24, 12, 8).fill(hex(playerColor(c, c.me)));
        }
      }
      if (b.o >= 0 && (sel || b.h < b.m || ui.hover === b.i) && !b.ghost) {
        const spr = buildingSprite(b.t, playerColor(c, b.o), c.arch(b.o));
        this.hpBar(g, isoX(b.x + d.w / 2, b.y + d.h / 2), isoY(b.x + d.w / 2, b.y + d.h / 2) - (spr.ay * 0.7 + 4), 46, b.h / b.m);
      }
    }
    // Bauvorschau
    const p = ui.placement;
    if (p) {
      const d = BUILDINGS[p.type];
      for (let dy = 0; dy < d.h; dy++)
        for (let dx = 0; dx < d.w; dx++) {
          const x = p.x + dx, y = p.y + dy;
          g.poly([isoX(x, y), isoY(x, y), isoX(x + 1, y), isoY(x + 1, y), isoX(x + 1, y + 1), isoY(x + 1, y + 1), isoX(x, y + 1), isoY(x, y + 1)])
            .fill({ color: p.valid ? 0x78dc5a : 0xe63c28, alpha: p.valid ? 0.35 : 0.4 });
        }
      const s = buildingSprite(p.type, playerColor(c, c.me), c.arch(c.me));
      this.placeSpr.texture = tex(s.c);
      this.placeSpr.scale.set(1 / S);
      this.placeSpr.position.set(isoX(p.x, p.y) - s.ax, isoY(p.x, p.y) - s.ay);
      this.placeSpr.tint = p.valid ? 0xffffff : 0xff9080;
      this.placeSpr.visible = true;
    } else this.placeSpr.visible = false;
    // Effekte
    this.pruneEffects(now);
    for (const e of this.effects) {
      const k = (now - e.t0) / e.dur;
      if (e.k === 'shot') {
        const x = e.x + (e.tx! - e.x) * k, y = e.y + (e.ty! - e.y) * k;
        const arc = Math.sin(k * Math.PI) * (e.r === 1 ? 30 : e.r === 2 ? 2 : 12);
        const ang = Math.atan2(isoY(e.tx!, e.ty!) - isoY(e.x, e.y), isoX(e.tx!, e.ty!) - isoX(e.x, e.y));
        const sx = isoX(x, y), hy = isoY(x, y) - arc - 16;
        g.moveTo(sx - Math.cos(ang) * 6, hy - Math.sin(ang) * 6).lineTo(sx + Math.cos(ang) * 4, hy + Math.sin(ang) * 4).stroke({ width: 1.5, color: 0x2a2a2a });
      } else if (e.k === 'ring') {
        g.ellipse(isoX(e.x, e.y), isoY(e.x, e.y), 6 + k * 10, 3 + k * 5).stroke({ width: 2 / z, color: hex(e.color!), alpha: 1 - k });
      } else if (e.k === 'die') {
        const sx = isoX(e.x, e.y), sy = isoY(e.x, e.y), a = Math.min(1, (1 - k) * 2);
        g.ellipse(sx, sy, 8, 3).fill({ color: 0x4a3a2a, alpha: a });
        g.moveTo(sx, sy - 2).lineTo(sx, sy - 12).moveTo(sx - 4, sy - 9).lineTo(sx + 4, sy - 9).stroke({ width: 2, color: 0xd8d0c0, alpha: a });
      } else if (e.k === 'dust') {
        const sx = isoX(e.x, e.y), sy = isoY(e.x, e.y);
        const small = e.r === 2; // Pulverdampf der Muskete
        for (let q = 0; q < 6; q++) {
          const a = q * 1.05;
          g.circle(sx + Math.cos(a) * k * (small ? 10 : 30), sy - (small ? 16 : 0) - k * 20 + Math.sin(a) * k * (small ? 4 : 10), (small ? 3 : 8) + k * (small ? 8 : 14))
            .fill({ color: small ? 0xd8d8d2 : 0x968264, alpha: (small ? 0.7 : 0.5) * (1 - k) });
        }
      } else if (e.k === 'text') {
        // Texte sind selten: als kurzlebige Text-Objekte
        if (!(e as { obj?: Text }).obj) {
          const t = new Text({ text: e.text!, style: { fontFamily: 'Georgia, serif', fontWeight: 'bold', fontSize: 26, fill: hex(e.color!), stroke: { color: 0, width: 4 } } });
          t.anchor.set(0.5);
          this.labels.addChild(t);
          (e as { obj?: Text }).obj = t;
        }
        const t = (e as { obj?: Text }).obj!;
        t.position.set(isoX(e.x, e.y), isoY(e.x, e.y) - 30 - (k * 30) / z);
        t.scale.set(Math.max(0.8, z) / (2 * z));
        t.alpha = 1 - k;
      }
    }
    // abgelaufene Texte entfernen
    for (const ch of [...this.labels.children]) {
      if (this.labelTexts.some((l) => l.t === ch)) continue;
      if (!this.effects.some((e) => (e as { obj?: Text }).obj === ch)) ch.destroy();
    }
    // Möwen über der Schlei
    for (const gl of this.gulls) {
      const a = (now / 1000) * gl.sp + gl.ph;
      const x = gl.cx + Math.cos(a) * gl.r, y = gl.cy + Math.sin(a) * gl.r;
      if (c.vis[Math.floor(y) * c.map.w + Math.floor(x)] !== 2) continue;
      const sx = isoX(x, y), sy = isoY(x, y) - 60;
      const flap = Math.sin(now / 120 + gl.ph * 10) * 3;
      g.moveTo(sx - 7, sy - 2 - flap).quadraticCurveTo(sx - 3, sy - 4, sx, sy).quadraticCurveTo(sx + 3, sy - 4, sx + 7, sy - 2 - flap).stroke({ width: 1.6, color: 0xf4f2ea });
      g.ellipse(sx + 10, isoY(x, y) + 4, 3, 1.2).fill({ color: 0x000000, alpha: 0.15 });
    }
  }
}

export type { CUnit };
