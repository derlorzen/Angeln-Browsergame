// Lokale Speicherung (localStorage): Einstellungen und ein Einzelspieler-Spielstand.
import type { AIState } from '../ai/ai';
import { DEFAULT_ART_STYLE, parseArtStyle, type ArtStyle } from '../render/artstyles';
import { isFaction, type FactionId } from '../data/factions';
import { DEFAULT_ICE, type IceSettings } from '../net/peer';
import { isMapId, type MapId } from '../sim/map';

const SETTINGS_KEY = 'angeln-settings-v1';
const SAVE_KEY = 'angeln-save-v1';
const AUTO_KEY = 'angeln-autosave-v1';

export interface Settings {
  name: string;
  ice: IceSettings;
  tutorialDone: boolean;
  renderer: 'auto' | 'canvas';
  artStyle: ArtStyle;
  /** Version der Grafikauswahl: 2 = bewusst oder per Standard (Retro) gesetzt. Ältere Stände wurden einmalig auf Retro gestellt. */
  artVersion: number;
  faction: FactionId;
  map: MapId | 'zufall';
  hints: boolean;
}

export function loadSettings(): Settings {
  const def: Settings = { name: 'Spieler', ice: { ...DEFAULT_ICE }, tutorialDone: false, renderer: 'auto', artStyle: DEFAULT_ART_STYLE, artVersion: ART_VERSION, faction: 'angeln', map: 'schlei', hints: true };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return {
      name: typeof s.name === 'string' ? s.name.slice(0, 20) : def.name,
      ice: { ...DEFAULT_ICE, ...(s.ice ?? {}), mode: s.ice?.mode === 'none' ? 'none' : 'stun' },
      tutorialDone: !!s.tutorialDone,
      renderer: s.renderer === 'canvas' ? 'canvas' : 'auto',
      // Frühere Versionen kannten nur „historisch“ und „Cartoon“; der neue Standard Retro gilt einmalig auch für sie.
      artStyle: s.artVersion === ART_VERSION ? parseArtStyle(s.artStyle) : DEFAULT_ART_STYLE,
      artVersion: ART_VERSION,
      map: isMapId(s.map) || s.map === 'zufall' ? s.map : 'schlei',
      map: isMapId(s.map) || s.map === 'zufall' ? s.map : 'schlei',
      hints: s.hints !== false,
    };
  } catch {
    return def;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* Speicher nicht verfügbar */
  }
}

export interface SaveGame {
  v: 1;
  savedAt: number;
  me: number;
  world: string;
  ais: AIState[];
  tutorial: boolean;
  /** Automatische Sicherung: Beschreibung für das Hauptmenü; mp = aus einer Mehrspielerpartie (Host) */
  label?: string;
  mp?: boolean;
}

/** Automatische Sicherung der laufenden Partie (Schutz vor versehentlichem Schließen). */
export function writeAutosave(sg: SaveGame): void {
  try {
    localStorage.setItem(AUTO_KEY, JSON.stringify(sg));
  } catch {
    /* Speicher voll oder gesperrt – dann eben ohne Sicherung */
  }
}
export function readAutosave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.v !== 1 || typeof s.world !== 'string') return null;
    return s as SaveGame;
  } catch {
    return null;
  }
}
export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTO_KEY);
  } catch {
    /* egal */
  }
}

export function writeSave(sg: SaveGame): string | null {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(sg));
    return null;
  } catch {
    return 'Speichern fehlgeschlagen (Browser-Speicher voll oder gesperrt).';
  }
}

export function readSave(): SaveGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.v !== 1 || typeof s.world !== 'string') return null;
    return s as SaveGame;
  } catch {
    return null;
  }
}
