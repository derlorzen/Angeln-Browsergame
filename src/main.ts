// Einstiegspunkt: Hauptmenü starten.
import { Menu } from './ui/menu';

const menu = new Menu();
menu.start();
(window as unknown as { __menu: Menu }).__menu = menu;
