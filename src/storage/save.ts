// Lokale Speicherung (localStorage): Einstellungen und ein Einzelspieler-Spielstand.
import type { AIState } from '../ai/ai';
import { DEFAULT_ICE, type IceSettings } from '../net/peer';

const SETTINGS_KEY = 'angeln-settings-v1';
const SAVE_KEY = 'angeln-save-v1';

export interface Settings {
  name: string;
  ice: IceSettings;
  tutorialDone: boolean;
}

export function loadSettings(): Settings {
  const def: Settings = { name: 'Spieler', ice: { ...DEFAULT_ICE }, tutorialDone: false };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return def;
    const s = JSON.parse(raw);
    return {
      name: typeof s.name === 'string' ? s.name.slice(0, 20) : def.name,
      ice: { ...DEFAULT_ICE, ...(s.ice ?? {}), mode: s.ice?.mode === 'none' ? 'none' : 'stun' },
      tutorialDone: !!s.tutorialDone,
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
