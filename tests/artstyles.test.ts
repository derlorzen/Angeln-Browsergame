import { describe, it, expect } from 'vitest';
import { ART_STYLE_NAMES, getArtStyle, parseArtStyle, setArtStyle } from '../src/render/artstyles';

describe('Grafikpakete', () => {
  it('liest alte und fehlerhafte Einstellungen kompatibel', () => {
    expect(parseArtStyle(undefined)).toBe('realistic');
    expect(parseArtStyle('unbekannt')).toBe('realistic');
    expect(parseArtStyle('cartoon')).toBe('cartoon');
  });
  it('kann umschalten, ohne den Spielzustand zu verändern', () => {
    const before = getArtStyle();
    setArtStyle('cartoon');
    expect(getArtStyle()).toBe('cartoon');
    setArtStyle('realistic');
    expect(getArtStyle()).toBe('realistic');
    setArtStyle(before);
  });
  it('hat Namen für beide auswählbaren Stile', () => {
    expect(Object.keys(ART_STYLE_NAMES)).toEqual(['realistic', 'cartoon']);
  });
});
