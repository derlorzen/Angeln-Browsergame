// Einstiegspunkt: Hauptmenü starten.
import { AI } from './ai/ai';
import { Menu } from './ui/menu';

const menu = new Menu();
menu.start();
// Für automatisierte Tests (Playwright) zugänglich; im Spiel ohne Wirkung.
(window as unknown as { __menu: Menu; __debug: unknown }).__menu = menu;
(window as unknown as { __debug: unknown }).__debug = { AI };
