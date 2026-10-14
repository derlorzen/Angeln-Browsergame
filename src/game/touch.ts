// Touch-Gesten bleiben von Maus-Eingaben getrennt. Pointer-Capture beendet auch
// Gesten außerhalb der Karte; ein zweiter Finger verwirft die Einzelaktion.
export type TouchMode = 'select' | 'order' | 'box';
interface Point { x: number; y: number }
interface TouchActions {
  pan: (dx: number, dy: number) => void;
  zoom: (x: number, y: number, factor: number) => void;
  point: (x: number, y: number) => void;
  tap: (x: number, y: number, mode: TouchMode) => void;
  box: (start: Point, end: Point | null) => void;
  selectBox: (start: Point, end: Point) => void;
  enabled: () => boolean;
}

export class TouchInput {
  mode: TouchMode = 'select';
  private points = new Map<number, Point>();
  private start: Point | null = null;
  private moved = false;
  private multi = false;
  private gestureMode: TouchMode = 'select';
  private cleanup: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, private actions: TouchActions) {
    const listen = (name: string, fn: (e: PointerEvent) => void) => {
      canvas.addEventListener(name, fn as EventListener, { passive: false });
      this.cleanup.push(() => canvas.removeEventListener(name, fn as EventListener));
    };
    listen('pointerdown', (e) => this.down(e));
    listen('pointermove', (e) => this.move(e));
    listen('pointerup', (e) => this.up(e, false));
    listen('pointercancel', (e) => this.up(e, true));
    listen('lostpointercapture', (e) => this.up(e, true));
  }

  reset(): void {
    this.actions.box({ x: 0, y: 0 }, null);
    const ids = [...this.points.keys()];
    this.points.clear();
    this.start = null;
    this.multi = false;
    for (const id of ids) if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }

  destroy(): void {
    this.reset();
    this.cleanup.forEach((f) => f());
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'mouse' || !this.actions.enabled()) return;
    e.preventDefault();
    const p = { x: e.clientX, y: e.clientY };
    this.points.set(e.pointerId, p);
    this.canvas.setPointerCapture(e.pointerId);
    if (this.points.size === 1) {
      this.start = p;
      this.moved = false;
      this.multi = false;
      this.gestureMode = this.mode;
      this.actions.point(p.x, p.y);
    } else {
      this.multi = true;
      this.actions.box(p, null);
    }
  }

  private move(e: PointerEvent): void {
    const old = this.points.get(e.pointerId);
    if (!old) return;
    e.preventDefault();
    if (!this.actions.enabled()) return this.reset();
    const before = [...this.points.values()];
    const p = { x: e.clientX, y: e.clientY };
    this.points.set(e.pointerId, p);
    if (this.points.size >= 2) {
      const after = [...this.points.values()];
      const mid = (a: Point[]) => ({ x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 });
      const distance = (a: Point[]) => Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      const b = mid(before), a = mid(after);
      const d = distance(before);
      if (d > 4) this.actions.zoom(b.x, b.y, distance(after) / d);
      this.actions.pan(a.x - b.x, a.y - b.y);
      return;
    }
    // Nach einer Pinch-Geste keinen Ein-Finger-Befehl mehr auslösen.
    if (this.multi || !this.start) return;
    const wasMoved = this.moved;
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > 9) this.moved = true;
    if (this.moved) {
      if (this.gestureMode === 'box') this.actions.box(this.start, p);
      else this.actions.pan(p.x - (wasMoved ? old.x : this.start.x), p.y - (wasMoved ? old.y : this.start.y));
    }
    this.actions.point(p.x, p.y);
  }

  private up(e: PointerEvent, cancelled: boolean): void {
    if (!this.points.has(e.pointerId)) return;
    e.preventDefault();
    const allowed = this.actions.enabled();
    if (!cancelled && allowed && !this.multi && this.start) {
      if (this.moved && this.gestureMode === 'box') this.actions.selectBox(this.start, { x: e.clientX, y: e.clientY });
      else if (!this.moved) this.actions.tap(e.clientX, e.clientY, this.gestureMode);
    }
    // Der Adapter schließt den Rahmen ab, bevor dessen Anzeige entfernt wird.
    this.points.delete(e.pointerId);
    if (!this.points.size) {
      this.actions.box({ x: 0, y: 0 }, null);
      this.start = null;
      this.multi = false;
    }
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  }
}
