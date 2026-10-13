// Wählt den Renderer: PixiJS (WebGL) bevorzugt, Canvas 2D als Rückfallebene.
import type { ClientState } from '../game/client';
import { CanvasRenderer } from './renderer';
import type { BaseRenderer } from './view';

export type RendererPref = 'auto' | 'canvas';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Ersetzt das Ziel-Canvas durch ein frisches Element (ein Canvas kann nur einen Kontexttyp haben). */
export function freshCanvas(old: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.id = old.id;
  c.className = old.className;
  old.replaceWith(c);
  return c;
}

export async function createRenderer(target: HTMLCanvasElement, client: ClientState, pref: RendererPref): Promise<BaseRenderer> {
  if (pref !== 'canvas' && webglAvailable()) {
    try {
      const { PixiRenderer } = await import('./pixi');
      return await PixiRenderer.create(target, client);
    } catch (e) {
      console.warn('WebGL-Darstellung nicht verfügbar, nutze Canvas 2D:', e);
      target = freshCanvas(target);
    }
  }
  return new CanvasRenderer(target, client);
}
