import { describe, expect, it } from 'vitest';
import { retroProcess } from '../src/render/retro';

describe('Retro-Pipeline', () => {
  it('erhält Bildgröße und transparente Bereiche bei der Pixelrasterung', () => {
    const input = new Uint8ClampedArray(4 * 4 * 4);
    // Ein 2×2-Block mit deckender Farbe; der Rest bleibt transparent.
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const i = (y * 4 + x) * 4;
      input[i] = 180; input[i + 1] = 90; input[i + 2] = 45; input[i + 3] = 255;
    }
    const out = retroProcess(input, 4, 4, { block: 2, category: 'building' });
    expect(out).toHaveLength(input.length);
    expect(out[(0 * 4 + 0) * 4 + 3]).toBe(255);
    expect(out[(0 * 4 + 1) * 4 + 3]).toBe(255);
    expect(out[(3 * 4 + 3) * 4 + 3]).toBe(0);
  });

  it('gibt bei Gelände eine deckende Pixelkachel zurück', () => {
    const input = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < input.length; i += 4) {
      input[i] = 70; input[i + 1] = 130; input[i + 2] = 60; input[i + 3] = 255;
    }
    const out = retroProcess(input, 4, 4, { block: 2, category: 'terrain' });
    expect(out).toHaveLength(input.length);
    expect(Array.from({ length: 16 }, (_, p) => out[p * 4 + 3]).every((a) => a === 255)).toBe(true);
  });
});
