// Zwei echte, getrennte Zeichenstile mit gemeinsamer Sprite-Geometrie.
// Zusätzliche geometrische Unterschiede kommen aus draw.ts, sprites.ts und units.ts.
export type ArtStyle = 'realistic' | 'cartoon';
export type ArtCategory = 'terrain' | 'building' | 'unit' | 'foliage' | 'sprite';

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

// Beide Varianten werden nur einmal berechnet. Original-Sprites bleiben unverändert.
const sourceCategory = new WeakMap<HTMLCanvasElement, ArtCategory>();
const imageCaches = new Map<string, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();
const clamp = (n: number): number => Math.max(0, Math.min(255, n));

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
  const original = new Uint8ClampedArray(data);
  const w = output.width;
  const h = output.height;
  const isGround = material === 'terrain';
  const isFoliage = material === 'foliage';
  const steps = isGround ? 18 : isFoliage ? 25 : 28;

  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      if (original[i + 3] === 0) continue;
      const r = original[i], gr = original[i + 1], b = original[i + 2];
      const light = r * 0.299 + gr * 0.587 + b * 0.114;
      if (cartoon) {
        // Warmes, gut lesbares 3D-Cartoon-Material: saubere Farbflächen,
        // deutliche Lichter und kräftige, aber nicht zugelaufene Schatten.
        const sat = isGround ? 1.13 : 1.28;
        const surfaceLight = (1.085 - 0.06 * (y / Math.max(h, 1)));
        const quant = (v: number) => clamp(Math.round(clamp(v) / steps) * steps);
        data[i] = quant(((r - light) * sat + light + 7) * surfaceLight);
        data[i + 1] = quant(((gr - light) * sat + light + 9) * surfaceLight);
        data[i + 2] = quant(((b - light) * sat + light + 10) * surfaceLight);
        // Richtungslicht oben/links auf freigestellten Gegenständen.
        if (!isGround) {
          const left = x > 0 ? original[i - 1 * 4 + 3] : 0;
          const up = y > 0 ? original[i - w * 4 + 3] : 0;
          const right = x + 1 < w ? original[i + 4 + 3] : 0;
          const down = y + 1 < h ? original[i + w * 4 + 3] : 0;
          if (original[i + 3] > 160 && (!left || !up)) {
            data[i] = clamp(data[i] + 22);
            data[i + 1] = clamp(data[i + 1] + 16);
            data[i + 2] = clamp(data[i + 2] + 10);
          } else if (original[i + 3] > 160 && (!right || !down)) {
            data[i] *= 0.65;
            data[i + 1] *= 0.65;
            data[i + 2] *= 0.65;
          }
        }
      } else {
        // Historische Materialoberflächen: dezente Alterung, warme Lichtkante,
        // kühle Abschattung und feinere, deterministische Textur.
        const hash = (Math.imul(x + 11, 374761393) ^ Math.imul(y + 17, 668265263)) >>> 0;
        const grain = (((hash ^ (hash >>> 13)) >>> 0) % 13) - 6;
        const contrast = isGround ? 1.065 : 1.13;
        const shading = 1.065 - 0.095 * (y / Math.max(1, h));
        data[i] = clamp(((r - 120) * contrast + 120 + grain + 5) * shading);
        data[i + 1] = clamp(((gr - 120) * contrast + 120 + grain * 0.72 + 2) * shading);
        data[i + 2] = clamp(((b - 120) * contrast + 120 + grain * 0.45 - 3) * shading);
      }
    }
  }
  g.putImageData(img, 0, 0);
  cache.set(source, output);
  return output;
}
