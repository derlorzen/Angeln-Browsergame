// Zwei echte, getrennte Zeichenstile mit gemeinsamer Sprite-Geometrie.
// Zusätzliche geometrische Unterschiede kommen aus draw.ts, sprites.ts und units.ts.
import { retroProcess } from './retro';

export type ArtStyle = 'retro' | 'realistic' | 'cartoon';
export const DEFAULT_ART_STYLE: ArtStyle = 'retro';
export type ArtCategory = 'terrain' | 'building' | 'unit' | 'foliage' | 'sprite';

export const ART_STYLE_NAMES: Record<ArtStyle, string> = {
  retro: 'Retro · Pixel-Strategie (AoE II / RA2)',
  realistic: 'Modern · historisch, atmosphärisch',
  cartoon: 'Modern · Cartoon, farbenfroh',
};

export function parseArtStyle(value: unknown): ArtStyle {
  return value === 'cartoon' || value === 'realistic' || value === 'retro' ? value : DEFAULT_ART_STYLE;
}

let currentStyle: ArtStyle = DEFAULT_ART_STYLE;
export const getArtStyle = (): ArtStyle => currentStyle;
export const isRetro = (): boolean => currentStyle === 'retro';
export function setArtStyle(value: ArtStyle): void {
  currentStyle = parseArtStyle(value);
}

// Beide Varianten werden nur einmal berechnet. Original-Sprites bleiben unverändert.
const sourceCategory = new WeakMap<HTMLCanvasElement, ArtCategory>();
const imageCaches = new Map<string, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();
const clamp = (n: number): number => Math.max(0, Math.min(255, n));

/** Retro-Pixelgröße je Spriteklasse; Gelände ist gröber, damit natürliche Mikrotextur nicht als Rauschen erscheint. */
export function retroBlockSize(category: ArtCategory): number {
  if (category === 'terrain') return 8;
  if (category === 'unit') return 4;
  return 4;
}

/** Ordnet prozeduralen Originalen einen Materialtyp zu (auch für beide Renderer). */
export function tagArtCanvas<T extends HTMLCanvasElement>(source: T, category: ArtCategory): T {
  sourceCategory.set(source, category);
  return source;
}

/** Verarbeitet Materialien und Objektsilhouetten, mit identischen Pixelmaßen und Ankern. */
export function artCanvas(source: HTMLCanvasElement, category: ArtCategory = 'sprite'): HTMLCanvasElement {
  const material = sourceCategory.get(source) ?? category;
  const cartoon = currentStyle === 'cartoon';
  const key = currentStyle + ':' + material;
  let cache = imageCaches.get(key);
  if (!cache) {
    cache = new WeakMap();
    imageCaches.set(key, cache);
  }
  const found = cache.get(source);
  if (found) return found;

  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const g = output.getContext('2d', { willReadFrequently: true });
  if (!g) return source;
  g.drawImage(source, 0, 0);
  const img = g.getImageData(0, 0, output.width, output.height);
  const data = img.data;
    if (currentStyle === 'retro') {
      // Retro: harte Kanten, blockiges Dithering, harte Alphakanten
      const processed = retroProcess(data, output.width, output.height, { block: retroBlockSize(material), category: material });
      data.set(processed);
      g.putImageData(img, 0, 0);
      cache.set(source, output);
      return output;
    }
    else if (currentStyle === 'realistic') {
      // Realistic: subtile Textur, feine Kornstruktur, warme Lichtkante
      const processed = paintRealistic(data, output.width, output.height);
      data.set(processed);
      g.putImageData(img, 0, 0);
      cache.set(source, output);
      return output;
    }
    else {
      // Cartoon: große Farbflächen, klare Licht/Schatten-Trennung, keine Körnung
      const processed = paintCartoon(data, output.width, output.height);
      data.set(processed);
      g.putImageData(img, 0, 0);
      cache.set(source, output);
      return output;
    }
}
