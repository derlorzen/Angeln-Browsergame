// Einstiegspunkt: Hauptmenü starten.
import { AI } from './ai/ai';
import { Menu } from './ui/menu';

// Stets dieselbe Version wie package.json anzeigen – ohne hardcodierte Menütexte.
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
const versionEl = document.getElementById('app-version');
if (versionEl) {
  versionEl.textContent = `Angeln v${__APP_VERSION__} · ${__APP_COMMIT__}`;
  versionEl.title = `Angeln – Fürsten der Schlei · Version ${__APP_VERSION__} · Build ${__APP_COMMIT__}`;
}

const menu = new Menu();
menu.start();
// Für automatisierte Tests (Playwright) zugänglich; im Spiel ohne Wirkung.
(window as unknown as { __menu: Menu; __debug: unknown }).__menu = menu;
(window as unknown as { __debug: unknown }).__debug = { AI };
