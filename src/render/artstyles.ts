// Zwei zur Laufzeit aus den Spiel-Sprites erzeugte, getrennt gecachte Grafikpakete.
// Geometrie, Fußpunkte und Animationsphasen bleiben für beide Stile identisch.
// Die Funktion verarbeitet Sprite- und Terrainbilder nur einmal pro Stil.
export type ArtStyle = 'realistic' | 'cartoon';
export type ArtCategory = 'terrain' | 'sprite';

export const ART_STYLE_NAMES: Record<ArtStyle, string> = {
  realistic: 'Historisch · atmosphärisch',
  cartoon: 'Cartoon · farbenfroh',
};

export function parseArtStyle(value: unknown): ArtStyle {
  return value === 'cartoon' ? 'cartoon' : 'realistic';
}

let currentStyle: ArtStyle = 'realistic';
export const getArtStyle = (): ArtStyle => currentStyle;
export function setArtStyle(value: ArtStyle): void {
  currentStyle = parseArtStyle(value);
}

const imageCaches = new Map<string, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();
const clamp = (n: number) => Math.max(0, Math.min(255, n));

/** Liefert ein Asset aus dem gewählten Pack. Die Quellgrafik wird niemals verändert. */
export function artCanvas(source: HTMLCanvasElement, category: ArtCategory = 'sprite'): HTMLCanvasElement {
  const key = currentStyle + ':' + category;
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
  const original = new Uint8ClampedArray(data);
  const w = output.width, h = output.height;
  const cartoon = currentStyle === 'cartoon';

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (original[i + 3] === 0) continue;
      const r = original[i], gr = original[i + 1], b = original[i + 2];
      const light = (r * 0.299 + gr * 0.587 + b * 0.114);
      if (cartoon) {
        // Klare, gesättigte Flächen mit reduzierter Farbpalette statt rauer Texturen.
        const sat = 1.25;
        const levels = 23;
        const quant = (v: number) => Math.round(clamp(v) / levels) * levels;
        data[i] = quant((r - light) * sat + light * 1.11 + 3);
        data[i + 1] = quant((gr - light) * sat + light * 1.12 + 5);
        data[i + 2] = quant((b - light) * sat + light * 1.10 + 7);
        // Saubere Kontur nur bei freigestellten Objekten, nicht an Kachelgrenzen.
        if (category === 'sprite' && original[i + 3] > 128 &&
            (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
             original[i - 4 + 3] < 90 || original[i + 4 + 3] < 90 ||
             original[i - w * 4 + 3] < 90 || original[i + w * 4 + 3] < 90)) {
          data[i] = Math.round(data[i] * 0.37);
          data[i + 1] = Math.round(data[i + 1] * 0.33);
          data[i + 2] = Math.round(data[i + 2] * 0.30);
        }
      } else {
        // Wärmere Materialfarbe, feinere Körnung und sanfte Licht-/Schattenstaffelung.
        const hash = (Math.imul(x + 11, 374761393) ^ Math.imul(y + 17, 668265263)) >>> 0;
        const grain = (((hash ^ (hash >>> 13)) >>> 0) % 15) - 7;
        const contrast = 1.11;
        const shading = 1.045 - 0.08 * (y / Math.max(1, h));
        data[i] = clamp(((r - 120) * contrast + 120 + grain + 5) * shading);
        data[i + 1] = clamp(((gr - 120) * contrast + 120 + grain * 0.65 + 2) * shading);
        data[i + 2] = clamp(((b - 120) * contrast + 120 + grain * 0.5 - 2) * shading);
      }
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(source, output);
  return output;
}
