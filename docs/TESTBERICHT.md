# Testbericht – Version 0.1

**Testumgebung:** Cloud-Container ohne GPU, 4 vCPU (Intel Xeon @ 2,8 GHz), 15 GB RAM, Linux, Node 22.22,
Chromium 141 (headless, Playwright 1.55). WebGL läuft dort über **SwiftShader** (Software-Emulation der GPU).
Es stand **kein** echter Laptop, kein zweites Gerät und kein zweiter Internetanschluss zur Verfügung.

## 1. Automatisierte Tests (`npm test`, Vitest) – 28/28 bestanden

| Bereich | Geprüft |
|---|---|
| Karte | deterministisch; Kappeln ↔ Arnis ↔ Brarup-Markt ↔ Moor auf 5 Seeds verbunden; Schlei, Ufer, Knicks, Tore, Lehm vorhanden |
| Startfairness | auf 10 Seeds haben beide Startplätze Bauplätze für Lehmgrube, Heringszaun, Bauernhof, Kaserne |
| Ressourcenabbau | Holz schlagen und abliefern erhöht den Vorrat |
| Produktionskette | Hof (erst nach Fertigstellung) → Getreide → Mühle → Waren → Markt → Taler + Prestige; zu wenig Waren → Fehlermeldung |
| Räucherei | verbraucht Fisch + Holz, erzeugt Waren |
| Bevölkerung | Grenze stoppt Ausbildung mit Hinweis, Wohnhaus hebt sie an |
| Bauplätze | belegt, Wasser, unerforscht, zu weit entfernt, fehlende Voraussetzung, Lehm-/Uferpflicht, fehlende Mittel; Abbruch erstattet 75 % |
| Bewegung | Späher läuft quer über die Karte und betritt nie Knick-, Wasser- oder Gebäudekacheln; A* um Wände, Teilweg bei unerreichbarem Ziel |
| Kampf | Soldaten verteidigen automatisch, Schaden, Tod, Entfernung, Statistik; Dorfzentrum schießt selbst |
| Sieg | militärisch (Dorfzentrum zerstört) und wirtschaftlich (Prestigeziel) |
| Brarup-Markt / Moor | Kontrolle, Prestige-Zufluss, „umkämpft“; einmalige Moor-Belohnung |
| Regeltreue | fremde Einheiten/Gebäude nicht steuerbar; Müllbefehle werfen nicht und ändern nichts; „Aufgeben“ wirkt nur auf den Absender |
| Speichern/Laden | identischer Zustand, danach identischer Verlauf |
| KI | baut alle Gebäudearten, bildet > 3 Soldaten aus, verkauft Waren, greift das gegnerische Dorfzentrum an, Partie endet mit Sieger |
| Balance | KI gegen KI (4 Seeds, beide Stufen): Partien enden nach 12–15 Minuten mit Sieger |
| Codes | Rundreise, Toleranz für Zeilenumbrüche; Ablehnung bei falscher Art, Version, Beschädigung, ungültigen Zeichen, Überlänge, Alter, falscher SDP/Sitzungskennung, fremdem JSON, Dekompressionsbombe |
| Protokoll | Befehls-Whitelist, ID-/Koordinatengrenzen, Namensbereinigung, Gast darf keine Zustände senden, Ratenbegrenzung |
| Kriegsnebel | verborgene Gegner, gegnerische Ressourcen und Ereignisse werden nicht gesendet; „hid“/„gone“-Semantik; Deltas |

## 2. Browser-Ende-zu-Ende: Mehrspieler (`npm run e2e`) – 28/28 bestanden

Zwei **getrennte Chromium-Prozesse** auf demselben Rechner, ICE-Modus „ohne ICE-Dienste“, mit dem Entwicklungsserver
**und** dem Produktionsbuild (`vite preview`) jeweils bestanden, mit WebGL- und mit Canvas-Renderer:

- Einladungscode (~650–700 Zeichen) und Antwortcode (~650 Zeichen) über die echte Oberfläche erzeugt
- Ungültiger, abgeschnittener, vertauschter Code → verständliche Meldung; doppelte Antworterzeugung abgefangen
- DataChannel öffnet sich, gemeinsame Lobby, Namensaustausch, Start erst wenn beide bereit
- Gast sieht nur eigene Einheiten, keine verborgenen Gegner, keine gegnerischen Ressourcen; gleicher Takt wie der Host
- Gast wählt per Linksklick, befiehlt per Rechtsklick → Host führt aus → Gast sieht die Bewegung
- Manipulationsversuche des Gastes (fremde Einheit bewegen, erfundener Befehl, eigener „Zustand“, doppelte und
  veraltete Sequenznummern, Müll, kaputtes JSON) bleiben wirkungslos, Host läuft weiter
- Host schließt die Seite → Gast: „Der Host hat die Partie beendet … keine automatische Hostmigration“
- Antwort auf eine veraltete Einladung abgelehnt; erneuter Aufbau mit neuer Einladung gelingt
- Gast schließt die Seite → Host erhält Meldung, KI übernimmt die Siedlung
- keine Skriptfehler

**STUN-Modus im Container:** Einladung entsteht nach ~11 s (Zeitlimit der ICE-Sammlung), nur Kandidaten vom Typ
`host`, weil ausgehendes UDP zum STUN-Server dort nicht möglich ist; die Oberfläche weist darauf hin.

## 3. Browser-Ende-zu-Ende: Einzelspieler (`npm run e2e:sp`) – 14/14 bestanden

Rahmenauswahl, Holz schlagen per Rechtsklick, Bauvorschau per Hotkey, ungültiger Platz rot + Begründung, gültiger Platz
→ Baustelle + Kosten, Arbeiter errichten das Gebäude, Speichern, Laden, keine Skriptfehler.

## 4. Leistung (gemessen, mit Einschränkungen)

Szenario: 105 eigene Einheiten auf Dauerpatrouille Kappeln ↔ Brarup-Markt (lange Wege durch Knicks/Tore) plus ein
Gefecht 30 gegen 30 – insgesamt **~178 aktive Einheiten** (≈ 140–170 im Bild), Fenster 1366×768.

| Messgröße | Wert |
|---|---|
| Simulation je Takt (Budget 100 ms) | **0,6–1,3 ms** |
| Szenenaufbau PixiJS (JS, je Frame) | **1,2–1,7 ms** |
| WebGL-Übergabe (SwiftShader, CPU) | 3,7–8,2 ms |
| Bildrate WebGL im Container | ~4 fps – begrenzt durch die **Software-Rasterung** von SwiftShader |
| Bildrate Canvas 2D im Container (ohne SwiftShader-Flags) | 32–55 fps (Zoom 0,5 … 1), JS 1,3–4,4 ms je Frame |

**Bewertung:** Unser JavaScript-Anteil (Simulation + Szenenaufbau) liegt bei ~3 ms pro Frame und lässt damit viel
Reserve für 60 fps. Die tatsächliche Bildrate mit WebGL auf einem gewöhnlichen Laptop (integrierte GPU) konnte hier
**nicht gemessen werden** und ist **offen**. Zur Messung: Spiel starten, **F3** drücken (zeigt Renderer, Frame-Zeit,
fps, Einheiten). Bei Problemen mit alten Grafiktreibern kann unter *Einstellungen* auf Canvas 2D umgeschaltet werden.

## 5. Offene Punkte

1. **Internet-Verbindbarkeit nicht belegt.** Getestet wurde nur zwischen zwei Prozessen auf einem Rechner.
   Ein Test mit zwei Geräten an unterschiedlichen Anschlüssen steht aus → Anleitung in [NETZWERK.md](NETZWERK.md#testanleitung-über-zwei-internetanschlüsse-noch-offen-siehe-testbericht).
2. **Leistung auf echter Laptop-GPU** nicht gemessen (siehe 4).
3. **Andere Browser** (Firefox, Safari) nicht getestet; benötigt werden WebRTC DataChannels und `CompressionStream`
   (Firefox ≥ 113, Safari ≥ 16.4).
4. **Balance:** Die KI gewinnt gegen sich selbst meist wirtschaftlich; militärische Siege kommen vor, sind aber seltener.
   Feinabstimmung mit menschlichen Testspielern steht aus.
5. **Nicht umgesetzt (bewusst nachgelagert):** Hafen mit Fischerbooten, 4-Spieler-Partien (vorbereitet), Komfortmodus
   mit Raumcode, Hostmigration, Mehrspieler-Spielstände.
6. Die Sounds sind einfache Synthesizer-Klänge; Musik fehlt.
