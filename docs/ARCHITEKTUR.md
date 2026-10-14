# Architektur

TypeScript + Vite, keine Laufzeitabhängigkeiten außer **PixiJS 8** (WebGL-Darstellung). Alle Grafiken und Klänge
werden beim Start im Browser prozedural erzeugt.

```
src/
  data/defs.ts         Spieldaten: Ressourcen, Gebäude, Einheiten, Kosten, Bauzeiten, Raten, Regeln, Ausbaustufen
  data/ages.ts         Zeitalter (Aufstieg, Voraussetzungen) und Forschungen samt Wirkung
  sim/                 Simulation (DOM-frei, auch in Node testbar)
    map.ts             Kartenkatalog (6 Karten) und Generator: geografische Maler je Karte (Länge/Breite →
                       Kachel, maßstabstreu in die Raute eingepasst), dann gemeinsame Pipeline: Ufer, Lehm, Wald,
                       Wege (A*), Knicks/Gräben, Deiche/Wall mit Toren, Fischteiche, Fairnessausgleich (BFS-Wege
                       zu Markt/Fundstelle, Holz, Acker, Lehm)
    world.ts           maßgebliche Welt: Befehlsprüfung, Wirtschaft/Produktionsketten, Einheiten, Kampf, Sieg, Speichern
    path.ts, heap.ts   A* auf dem Raster (8 Richtungen, kein Eckenschneiden, Geländekosten, Glättung)
    rules.ts           gemeinsame Regeln: Bauplatzprüfung (auch für die Vorschau), Sichtberechnung mit Knick-Sichtsperre
    snapshot.ts        je Empfänger gefilterte Zustände (Kriegsnebel), Deltas und Vollzustände
    rng.ts, types.ts
  ai/ai.ts             KI – nutzt ausschließlich normale Spielerbefehle
  net/                 Netzwerk
    rooms.ts           Spielcode-Vermittlung im Browser: Raum eröffnen/beitreten, Angebote über den Server austauschen
    signal.ts          Einladungs-/Antwortcodes: versioniert, komprimiert, streng geprüft
    peer.ts            RTCPeerConnection + DataChannel, ICE-Einstellungen, Zeitlimits, Fehlermeldungen
    protocol.ts        Nachrichtenformate, Validierung, Ratenbegrenzung
  game/
    client.ts          ClientState: Sicht eines Spielers, nur aus Snapshots gespeist (lokal wie im Netz)
    drivers.ts         LocalDriver (Einzelspiel), HostDriver (Simulation + bis zu drei Mitspieler), GuestDriver (nur Anzeige/Befehle)
    game.ts            Spielbildschirm: Eingabe, Kamera, Ereignisse, Dialoge, Spielschleife (requestAnimationFrame)
  render/
    view.ts            BaseRenderer: Kamera, Koordinaten, Picking, Effekte, Nebelbild
    pixi.ts            PixiRenderer (WebGL): Atlas, Chunks, Tiefensortierung, Nebel-Sprite, Stimmungseffekte
    renderer.ts        CanvasRenderer (Canvas 2D, Rückfallebene) und Minikarte
    factory.ts         Auswahl WebGL/Canvas
    era.ts             Gebäude der späteren Zeitalter und moderne Fassungen alter Gebäude
    terrainmask.ts     Nachbarschaftsmasken für Knicks, Deiche, Wall, Gräben und Tore
    draw.ts, sprites.ts, props.ts, units.ts   prozedurale Sprites (Gelände, Gebäude, Requisiten, Figuren, Symbole)
  ui/                  HUD (Ressourcenleiste, Auswahlfenster, Befehlskarte, Tooltips), Menüs/Lobby, Lehrmeister, Texte
  audio/sound.ts       synthetische Klänge (WebAudio)
  storage/save.ts      Einstellungen und Einzelspieler-Spielstand (localStorage)
server/
  server.mjs           Produktionsserver ohne Abhängigkeiten: liefert dist/ aus (gzip, Cache-Header), bindet rooms.mjs ein
  rooms.mjs            Spielcode-Räume: Raum/Beitritt/Nachricht/Schließen per POST, Ereignisse per Server-Sent Events,
                       Grenzen gegen Missbrauch; auch im Vite-Entwicklungs- und Vorschauserver eingebunden (vite.config.ts)
```

Kartengröße: 128 × 128 Kacheln für zwei Spieler, 160 × 160 für drei oder vier (`mapSizeFor`). Die Kartenmaler sind in
Einheiten der ursprünglichen 96er-Karte entworfen und werden über `Painter.SC` skaliert; die Ausgleichsschritte danach
arbeiten in Kacheln. Bei vier Spielern wählt der Generator die Plätze 3 und 4 auf festem Land so, dass der kleinste
Abstand aller vier möglichst groß und der Abstand zur Mitte ähnlich ist; alle Fairnessschritte laufen über alle aktiven
Startplätze.

## Datenfluss

```
 Eingabe/KI/Gast ──Befehle──► World.queueCommand ──► World.step() (10 Hz, fester Takt)
                                                         │
                                         Snapshotter (je Spieler, nebelgefiltert)
                                                         │
                     lokal: direkt ─────────────────────►│◄───── Netz: JSON über DataChannel
                                                         ▼
                                                    ClientState ──► Renderer (rAF, interpoliert) + HUD
```

- **Feste Takte:** Ein Worker-Taktgeber (nicht gedrosselt in Hintergrund-Tabs) pumpt die Simulation mit 100 ms;
  die Darstellung läuft unabhängig per `requestAnimationFrame` und interpoliert Einheitenpositionen.
- **Ein Pfad für alle:** Auch im Einzelspiel bekommt die Darstellung nur gefilterte Snapshots; dadurch ist der
  Netzwerkpfad (Nebel, Deltas) ständig mitgetestet.
- **Leistung:** Sichtbereichsbegrenzung (Chunks, Bildschirmtest je Objekt), zwischengespeicherte Sprites/Atlanten,
  räumlicher Index (4×4-Kachelzellen) für Zielsuche und Abstoßung, A*-Puffer werden wiederverwendet.
- **Erweiterbarkeit auf 4 Spieler:** Welt, Snapshots, Lobby-Format und Karte (4 Startplätze) sind mehrspielerfähig;
  der Host bräuchte nur mehrere PeerLinks.
